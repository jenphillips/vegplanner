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
 * Color coding for plant families (for crop rotation planning).
 * Each family has a base color with shades for visual distinction between crops.
 */
const FAMILY_COLORS: Record<string, { base: string; shades: string[] }> = {
  Solanaceae: { base: '#e74c3c', shades: ['#c0392b', '#e74c3c', '#ec7063'] }, // Reds - tomatoes, peppers, potatoes
  Brassicaceae: { base: '#3498db', shades: ['#2980b9', '#3498db', '#5dade2'] }, // Blues - broccoli, bok choy, arugula
  Fabaceae: { base: '#f1c40f', shades: ['#d4ac0d', '#f1c40f', '#f4d03f'] }, // Yellows - beans, peas
  Cucurbitaceae: { base: '#1abc9c', shades: ['#16a085', '#1abc9c', '#48c9b0'] }, // Teals - squash, cucumber
  Amaranthaceae: { base: '#9b59b6', shades: ['#8e44ad', '#9b59b6', '#af7ac5'] }, // Purples - beet, spinach
  Asteraceae: { base: '#27ae60', shades: ['#229954', '#27ae60', '#52be80'] }, // Greens - lettuce
  Apiaceae: { base: '#e67e22', shades: ['#d35400', '#e67e22', '#eb984e'] }, // Oranges - carrots
  Amaryllidaceae: { base: '#f39c12', shades: ['#d68910', '#f39c12', '#f5b041'] }, // Gold - onions, leeks, shallots
  default: { base: '#95a5a6', shades: ['#7f8c8d', '#95a5a6', '#bdc3c7'] }, // Grays - unknown
};

/**
 * Simple string hash for consistent shade selection.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get the color for a crop based on its plant family.
 * Different crops within the same family get different shades for visual distinction.
 */
export function getCropColor(
  family: string | undefined,
  cropName: string
): string {
  const familyEntry = FAMILY_COLORS[family ?? ''] ?? FAMILY_COLORS.default;
  // Use cropName hash to pick consistent shade within family
  const shadeIndex = hashString(cropName) % familyEntry.shades.length;
  return familyEntry.shades[shadeIndex];
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

/**
 * Calculate growth factor (0.0 to 1.0) based on days since planting vs maturity.
 * 0.0 = just planted or not yet in ground, 1.0 = mature
 *
 * @param planting - The planting object
 * @param cultivar - The cultivar with maturityDays
 * @param currentDate - ISO date string (YYYY-MM-DD)
 * @returns Growth factor clamped to [0, 1]
 */
export function calculateGrowthFactor(
  planting: Planting,
  cultivar: Cultivar | undefined,
  currentDate: string
): number {
  // Default maturity if cultivar not found
  const maturityDays = cultivar?.maturityDays ?? 60;

  // Reuse getInGroundDateRange to determine when the plant starts growing
  const inGroundStart = getInGroundDateRange(planting).start;

  // Parse dates
  const startMs = new Date(`${inGroundStart}T00:00:00Z`).getTime();
  const currentMs = new Date(`${currentDate}T00:00:00Z`).getTime();

  // Days since planting was put in ground
  const daysSincePlanting = (currentMs - startMs) / (1000 * 60 * 60 * 24);

  if (daysSincePlanting <= 0) {
    return 0.0; // Not yet planted
  }

  // Clamp to 0-1 range
  return Math.min(1.0, daysSincePlanting / maturityDays);
}

/**
 * Calculate plant dot radius based on growth stage.
 * At 0% growth: minRadiusFraction of mature size (default 15%)
 * At 100% growth: full mature radius (45% of spacing, so diameter is 90% of spacing)
 *
 * @param spacingCm - Plant spacing in cm
 * @param scale - Pixels per cm
 * @param growthFactor - 0.0 to 1.0
 * @param minRadiusFraction - Minimum radius as fraction of mature size (default 0.15)
 * @returns Radius in pixels
 */
export function calculatePlantDotRadius(
  spacingCm: number,
  scale: number,
  growthFactor: number,
  minRadiusFraction: number = 0.15
): number {
  // Mature radius: 45% of spacing (so diameter is 90% of spacing at maturity)
  // This means mature plants nearly fill their allocated space
  const matureRadius = spacingCm * scale * 0.45;

  // Scale based on growth: starts at minRadiusFraction, grows to 1.0
  const scaleFactor = minRadiusFraction + (1 - minRadiusFraction) * growthFactor;

  return matureRadius * scaleFactor;
}

/**
 * Check if two date ranges overlap.
 * Two ranges overlap if a.start <= b.end AND b.start <= a.end
 */
export function dateRangesOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string }
): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Check if a placement collides with existing placements, considering temporal overlap.
 * Two plantings only collide if they overlap both spatially AND temporally.
 *
 * @param newPlacement - Candidate placement with dimensions
 * @param newDateRange - Date range when new planting needs space
 * @param existingPlacements - Array of existing placements with dimensions
 * @param existingDateRanges - Map of placement ID to date range
 * @param excludeId - Optional placement ID to exclude from collision check
 * @param options - { ignoreCollisions?: boolean } to disable detection entirely
 */
export function checkCollisionsWithTiming(
  newPlacement: { xCm: number; yCm: number; widthCm: number; heightCm: number },
  newDateRange: { start: string; end: string } | null,
  existingPlacements: Array<{
    id: string;
    xCm: number;
    yCm: number;
    widthCm: number;
    heightCm: number;
  }>,
  existingDateRanges: Map<string, { start: string; end: string }>,
  excludeId?: string,
  options?: { ignoreCollisions?: boolean }
): CollisionResult {
  // If collisions are disabled, return no collision
  if (options?.ignoreCollisions) {
    return { hasCollision: false, overlappingPlacements: [] };
  }

  const overlapping: string[] = [];

  for (const existing of existingPlacements) {
    if (excludeId && existing.id === excludeId) continue;

    // First check spatial overlap
    const spatialOverlap = rectanglesOverlap(
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
    );

    if (!spatialOverlap) continue;

    // If no date ranges provided, fall back to always-overlapping behavior
    if (!newDateRange) {
      overlapping.push(existing.id);
      continue;
    }

    // Check temporal overlap
    const existingRange = existingDateRanges.get(existing.id);
    if (!existingRange) {
      // No date range info - assume always present (backward compatible)
      overlapping.push(existing.id);
      continue;
    }

    if (dateRangesOverlap(newDateRange, existingRange)) {
      overlapping.push(existing.id);
    }
  }

  return {
    hasCollision: overlapping.length > 0,
    overlappingPlacements: overlapping,
  };
}
