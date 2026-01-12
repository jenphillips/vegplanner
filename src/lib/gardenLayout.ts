import type {
  Planting,
  GardenBed,
  PlantingPlacement,
  PlantingFootprintData,
  CollisionResult,
  PlacementSuggestion,
  Cultivar,
} from './types';

/**
 * Calculate the footprint (dimensions) of a planting based on quantity and spacing.
 * Uses a square-ish grid arrangement.
 *
 * Example: 10 plants at 30cm spacing
 * - cols = ceil(sqrt(10)) = 4
 * - rows = ceil(10/4) = 3
 * - width = 4 * 30 = 120cm
 * - height = 3 * 30 = 90cm
 */
export function calculateFootprint(
  quantity: number,
  spacingCm: number
): { widthCm: number; heightCm: number; rows: number; cols: number } {
  if (quantity <= 0 || spacingCm <= 0) {
    return { widthCm: 0, heightCm: 0, rows: 0, cols: 0 };
  }

  // Aim for square-ish arrangement
  const cols = Math.ceil(Math.sqrt(quantity));
  const rows = Math.ceil(quantity / cols);

  const widthCm = cols * spacingCm;
  const heightCm = rows * spacingCm;

  return { widthCm, heightCm, rows, cols };
}

/**
 * Calculate footprint with specific rows/cols arrangement.
 */
export function calculateFootprintWithLayout(
  quantity: number,
  spacingCm: number,
  cols: number
): { widthCm: number; heightCm: number; rows: number; cols: number } {
  if (quantity <= 0 || spacingCm <= 0 || cols <= 0) {
    return { widthCm: 0, heightCm: 0, rows: 0, cols: 0 };
  }

  const rows = Math.ceil(quantity / cols);
  const widthCm = cols * spacingCm;
  const heightCm = rows * spacingCm;

  return { widthCm, heightCm, rows, cols };
}

/**
 * Get all valid rectangle configurations for a given quantity.
 * Returns all possible (cols, rows) arrangements that can fit the plants.
 */
export function getValidRectangleConfigs(
  quantity: number,
  spacingCm: number
): Array<{ cols: number; rows: number; widthCm: number; heightCm: number }> {
  if (quantity <= 0 || spacingCm <= 0) {
    return [];
  }

  const configs: Array<{ cols: number; rows: number; widthCm: number; heightCm: number }> = [];

  // For each possible number of columns from 1 to quantity
  for (let cols = 1; cols <= quantity; cols++) {
    const rows = Math.ceil(quantity / cols);
    // Only include if this arrangement actually fits all plants
    // (cols * rows >= quantity)
    configs.push({
      cols,
      rows,
      widthCm: cols * spacingCm,
      heightCm: rows * spacingCm,
    });
  }

  return configs;
}

/**
 * Find the closest valid rectangle configuration to a target size.
 * Used when resizing a placement to snap to a valid arrangement.
 */
export function findClosestRectangleConfig(
  quantity: number,
  spacingCm: number,
  targetWidthCm: number,
  targetHeightCm: number
): { cols: number; rows: number; widthCm: number; heightCm: number } {
  const configs = getValidRectangleConfigs(quantity, spacingCm);

  if (configs.length === 0) {
    return { cols: 1, rows: 1, widthCm: spacingCm, heightCm: spacingCm };
  }

  // Find config closest to target aspect ratio
  const targetAspect = targetWidthCm / targetHeightCm;

  let bestConfig = configs[0];
  let bestDiff = Infinity;

  for (const config of configs) {
    const configAspect = config.widthCm / config.heightCm;
    const diff = Math.abs(configAspect - targetAspect);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestConfig = config;
    }
  }

  return bestConfig;
}

/**
 * Calculate quantity from footprint dimensions.
 * This is the inverse of calculateFootprint - given a target size,
 * determine how many plants fit.
 *
 * Ensures minimum of 1 plant.
 */
export function calculateQuantityFromDimensions(
  widthCm: number,
  heightCm: number,
  spacingCm: number
): { quantity: number; rows: number; cols: number } {
  if (spacingCm <= 0 || widthCm <= 0 || heightCm <= 0) {
    return { quantity: 1, rows: 1, cols: 1 };
  }

  const cols = Math.max(1, Math.floor(widthCm / spacingCm));
  const rows = Math.max(1, Math.floor(heightCm / spacingCm));
  const quantity = cols * rows;

  return { quantity, rows, cols };
}

/**
 * Get the full footprint data for a placement, including calculated dimensions.
 * If placement has a cols override, use that layout instead of default square-ish.
 */
export function getFootprintData(
  placement: PlantingPlacement,
  quantity: number
): PlantingFootprintData {
  // Use custom cols if specified, otherwise calculate default
  const { widthCm, heightCm, rows, cols } = placement.cols
    ? calculateFootprintWithLayout(quantity, placement.spacingCm, placement.cols)
    : calculateFootprint(quantity, placement.spacingCm);

  return {
    plantingId: placement.plantingId,
    bedId: placement.bedId,
    xCm: placement.xCm,
    yCm: placement.yCm,
    widthCm,
    heightCm,
    rows,
    cols,
  };
}

/**
 * Determine if a planting is "in ground" on a given date.
 * - For transplants: in ground from transplantDate to harvestEnd
 * - For direct sow: in ground from sowDate to harvestEnd
 */
export function isPlantingInGround(planting: Planting, date: string): boolean {
  const checkDate = new Date(`${date}T00:00:00Z`).getTime();

  // Start date depends on method
  const startDate =
    planting.method === 'transplant' && planting.transplantDate
      ? new Date(`${planting.transplantDate}T00:00:00Z`).getTime()
      : new Date(`${planting.sowDate}T00:00:00Z`).getTime();

  const endDate = new Date(`${planting.harvestEnd}T00:00:00Z`).getTime();

  return checkDate >= startDate && checkDate <= endDate;
}

/**
 * Filter plantings to only those in ground on the selected date.
 */
export function filterPlantingsInGround(
  plantings: Planting[],
  date: string
): Planting[] {
  return plantings.filter((p) => isPlantingInGround(p, date));
}

/**
 * Get the date range for when a planting is in ground.
 */
export function getInGroundDateRange(planting: Planting): {
  start: string;
  end: string;
} {
  const start =
    planting.method === 'transplant' && planting.transplantDate
      ? planting.transplantDate
      : planting.sowDate;

  return { start, end: planting.harvestEnd };
}

/**
 * Determine if a planting is currently in its harvest window on a given date.
 */
export function isPlantingInHarvest(planting: Planting, date: string): boolean {
  const checkDate = new Date(`${date}T00:00:00Z`).getTime();
  const harvestStart = new Date(`${planting.harvestStart}T00:00:00Z`).getTime();
  const harvestEnd = new Date(`${planting.harvestEnd}T00:00:00Z`).getTime();

  return checkDate >= harvestStart && checkDate <= harvestEnd;
}

/**
 * Check if two rectangles overlap (AABB collision).
 */
function rectanglesOverlap(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    r1.x + r1.width <= r2.x ||
    r2.x + r2.width <= r1.x ||
    r1.y + r1.height <= r2.y ||
    r2.y + r2.height <= r1.y
  );
}

/**
 * Check if a placement collides with existing placements in a bed.
 */
export function checkCollisions(
  newPlacement: { xCm: number; yCm: number; widthCm: number; heightCm: number },
  existingPlacements: Array<{
    id: string;
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
  }>,
  excludeId?: string
): CollisionResult {
  const overlapping: string[] = [];

  for (const existing of existingPlacements) {
    if (excludeId && existing.id === excludeId) continue;

    if (
      rectanglesOverlap(
        {
          x: newPlacement.xCm,
          y: newPlacement.yCm,
          width: newPlacement.widthCm,
          height: newPlacement.heightCm,
        },
        {
          x: existing.xCm,
          y: existing.yCm,
          width: existing.widthCm,
          height: existing.heightCm,
        }
      )
    ) {
      overlapping.push(existing.id);
    }
  }

  return {
    hasCollision: overlapping.length > 0,
    overlappingPlacements: overlapping,
  };
}

/**
 * Check if a placement fits within bed boundaries.
 */
export function fitsInBed(
  placement: { xCm: number; yCm: number; widthCm: number; heightCm: number },
  bed: { widthCm: number; lengthCm: number }
): boolean {
  return (
    placement.xCm >= 0 &&
    placement.yCm >= 0 &&
    placement.xCm + placement.widthCm <= bed.widthCm &&
    placement.yCm + placement.heightCm <= bed.lengthCm
  );
}

/**
 * Find first valid position in a bed using grid scan.
 * Scans left-to-right, top-to-bottom with specified step.
 */
function findFirstValidPosition(
  footprint: { widthCm: number; heightCm: number },
  bed: GardenBed,
  existingFootprints: Array<{
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
  }>,
  step: number = 5
): { xCm: number; yCm: number } | null {
  for (let y = 0; y <= bed.lengthCm - footprint.heightCm; y += step) {
    for (let x = 0; x <= bed.widthCm - footprint.widthCm; x += step) {
      const candidate = {
        xCm: x,
        yCm: y,
        widthCm: footprint.widthCm,
        heightCm: footprint.heightCm,
      };

      // Check against existing footprints (no id needed for collision check)
      const existingWithIds = existingFootprints.map((f, i) => ({
        ...f,
        id: `existing-${i}`,
      }));

      if (!checkCollisions(candidate, existingWithIds).hasCollision) {
        return { xCm: x, yCm: y };
      }
    }
  }

  return null;
}

/**
 * Score how well a cultivar matches a bed's sun exposure.
 */
function scoreSunMatch(
  cultivar: Cultivar | undefined,
  sunExposure: GardenBed['sunExposure']
): number {
  if (!cultivar) return 0.5;

  // Simple heuristic based on crop type
  const fullSunCrops = ['Tomato', 'Pepper', 'Squash', 'Cucumber', 'Bean'];
  const partialCrops = ['Lettuce', 'Spinach', 'Beet', 'Carrot', 'Gai Lan'];

  const needsFullSun = fullSunCrops.some((c) => cultivar.crop.includes(c));
  const prefersPartial = partialCrops.some((c) => cultivar.crop.includes(c));

  if (sunExposure === 'full') {
    return needsFullSun ? 1.0 : prefersPartial ? 0.6 : 0.8;
  } else if (sunExposure === 'partial') {
    return prefersPartial ? 1.0 : needsFullSun ? 0.5 : 0.7;
  } else {
    // shade
    return needsFullSun ? 0.2 : prefersPartial ? 0.6 : 0.5;
  }
}

/**
 * Suggest optimal placements for unplaced plantings.
 * Uses a simple greedy bin-packing approach.
 */
export function autoLayout(
  unplacedPlantings: Planting[],
  beds: GardenBed[],
  existingPlacements: PlantingPlacement[],
  cultivars: Cultivar[],
  plantingQuantities: Map<string, number>,
  defaultSpacingCm: number = 30
): PlacementSuggestion[] {
  const suggestions: PlacementSuggestion[] = [];
  const cultivarMap = new Map(cultivars.map((c) => [c.id, c]));

  // Sort by footprint area (largest first for better packing)
  const sorted = [...unplacedPlantings].sort((a, b) => {
    const aQty = plantingQuantities.get(a.id) ?? a.quantity ?? 1;
    const bQty = plantingQuantities.get(b.id) ?? b.quantity ?? 1;
    const aCultivar = cultivarMap.get(a.cultivarId);
    const bCultivar = cultivarMap.get(b.cultivarId);
    const aSpacing = aCultivar?.spacingCm ?? defaultSpacingCm;
    const bSpacing = bCultivar?.spacingCm ?? defaultSpacingCm;

    const aFoot = calculateFootprint(aQty, aSpacing);
    const bFoot = calculateFootprint(bQty, bSpacing);
    return bFoot.widthCm * bFoot.heightCm - aFoot.widthCm * aFoot.heightCm;
  });

  // Track used space as we add suggestions
  const usedSpaceByBed = new Map<string, Array<{
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
  }>>();

  // Initialize with existing placements
  for (const bed of beds) {
    const bedPlacements = existingPlacements.filter((p) => p.bedId === bed.id);
    const footprints = bedPlacements.map((p) => {
      const qty = plantingQuantities.get(p.plantingId) ?? 1;
      // Use custom cols if specified, otherwise calculate default layout
      const fp = p.cols
        ? calculateFootprintWithLayout(qty, p.spacingCm, p.cols)
        : calculateFootprint(qty, p.spacingCm);
      return {
        xCm: p.xCm,
        yCm: p.yCm,
        widthCm: fp.widthCm,
        heightCm: fp.heightCm,
      };
    });
    usedSpaceByBed.set(bed.id, footprints);
  }

  for (const planting of sorted) {
    const cultivar = cultivarMap.get(planting.cultivarId);
    const spacingCm = cultivar?.spacingCm ?? defaultSpacingCm;
    const quantity = plantingQuantities.get(planting.id) ?? planting.quantity ?? 1;
    const footprint = calculateFootprint(quantity, spacingCm);

    let bestSuggestion: PlacementSuggestion | null = null;
    let bestScore = -1;

    // Try each bed
    for (const bed of beds) {
      const sunScore = scoreSunMatch(cultivar, bed.sunExposure);
      const usedSpace = usedSpaceByBed.get(bed.id) ?? [];

      const position = findFirstValidPosition(footprint, bed, usedSpace);

      if (position) {
        // Score: sun match * 100 + prefer top-left
        const score =
          sunScore * 100 + 1 / (position.yCm + position.xCm + 1);
        if (score > bestScore) {
          bestScore = score;
          bestSuggestion = {
            plantingId: planting.id,
            bedId: bed.id,
            xCm: position.xCm,
            yCm: position.yCm,
            spacingCm,
            score,
          };
        }
      }
    }

    if (bestSuggestion) {
      suggestions.push(bestSuggestion);
      // Add to used space for next iteration
      const usedSpace = usedSpaceByBed.get(bestSuggestion.bedId) ?? [];
      usedSpace.push({
        xCm: bestSuggestion.xCm,
        yCm: bestSuggestion.yCm,
        widthCm: footprint.widthCm,
        heightCm: footprint.heightCm,
      });
      usedSpaceByBed.set(bestSuggestion.bedId, usedSpace);
    }
  }

  return suggestions;
}

/**
 * Color coding for crops.
 */
const CROP_COLORS: Record<string, string> = {
  Tomato: '#e74c3c',
  Pepper: '#e67e22',
  Lettuce: '#27ae60',
  Spinach: '#2ecc71',
  Beet: '#8e44ad',
  Bean: '#f1c40f',
  Carrot: '#d35400',
  Squash: '#f39c12',
  Cucumber: '#1abc9c',
  'Gai Lan': '#3498db',
  default: '#95a5a6',
};

/**
 * Get the color for a crop type.
 */
export function getCropColor(cropName: string): string {
  // Check for partial matches
  for (const [crop, color] of Object.entries(CROP_COLORS)) {
    if (crop !== 'default' && cropName.includes(crop)) {
      return color;
    }
  }
  return CROP_COLORS.default;
}

/**
 * Get the earliest and latest dates across all plantings for the date scrubber range.
 */
export function getSeasonDateRange(plantings: Planting[]): {
  start: string;
  end: string;
} | null {
  if (plantings.length === 0) return null;

  let earliest = plantings[0].sowDate;
  let latest = plantings[0].harvestEnd;

  for (const planting of plantings) {
    if (planting.sowDate < earliest) earliest = planting.sowDate;
    if (planting.harvestEnd > latest) latest = planting.harvestEnd;
  }

  return { start: earliest, end: latest };
}
