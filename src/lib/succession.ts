import type { Cultivar, Climate, FrostWindow, SowMethod, Planting } from './types';

// ============================================
// Date Utilities
// ============================================

const toDate = (iso: string) => new Date(iso + 'T00:00:00Z');

const addDays = (iso: string, days: number): string => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (start: string, end: string): number => {
  const s = toDate(start);
  const e = toDate(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
};

const getMonth = (iso: string): number => {
  return toDate(iso).getUTCMonth() + 1; // 1-12
};

const ensureNumber = (value: number | null | undefined, fallback = 0): number =>
  typeof value === 'number' ? value : fallback;

// ============================================
// Temperature Check
// ============================================

// Safety margin for temperature checks (°C)
// Since we use monthly averages, actual daily temps will often exceed these,
// so we add a buffer to be conservative
const TEMP_MARGIN_C = 2;

// Buffer before earliest probable frost for frost-sensitive crops (days)
const FROST_BUFFER_DAYS = 4;

/**
 * Check if a date falls within acceptable temperature range for the cultivar.
 * Uses monthly average HIGH temps to check max tolerance (heat-sensitive crops)
 * and monthly average LOW temps to check min tolerance (cold-sensitive crops).
 * Applies a 2°C safety margin to be conservative.
 */
function isTemperatureViable(
  date: string,
  cultivar: Cultivar,
  climate: Climate
): { viable: boolean; reason?: string } {
  const month = getMonth(date);
  const monthData = climate.monthlyAvgC[String(month)];

  if (!monthData) {
    return { viable: true }; // No data, assume viable
  }

  const avgHigh = monthData.tmax_c;
  const avgLow = monthData.tmin_c;
  const minGrowing = cultivar.minGrowingTempC;
  const maxGrowing = cultivar.maxGrowingTempC;

  // For cold check: compare avg low against cultivar's minimum tolerance
  // Apply margin to be conservative (effective min is slightly higher)
  if (minGrowing != null && avgLow != null) {
    const effectiveMin = minGrowing + TEMP_MARGIN_C;
    if (avgLow < effectiveMin) {
      return {
        viable: false,
        reason: `Too cold (avg low ${avgLow}°C < min ${minGrowing}°C + ${TEMP_MARGIN_C}° margin)`,
      };
    }
  }

  // For heat check: compare avg high against cultivar's maximum tolerance
  // Apply margin to be conservative (effective max is slightly lower)
  if (maxGrowing != null && avgHigh != null) {
    const effectiveMax = maxGrowing - TEMP_MARGIN_C;
    if (avgHigh > effectiveMax) {
      return {
        viable: false,
        reason: `Too hot (avg high ${avgHigh}°C > max ${maxGrowing}°C - ${TEMP_MARGIN_C}° margin)`,
      };
    }
  }

  return { viable: true };
}

/**
 * Check if the entire growing period is temperature-viable.
 * Checks each month the plant will be growing.
 * For frost-tolerant crops, we skip cold checks since they can handle frost.
 */
function isGrowingPeriodViable(
  sowDate: string,
  harvestEnd: string,
  cultivar: Cultivar,
  climate: Climate
): { viable: boolean; reason?: string } {
  let currentDate = sowDate;

  while (currentDate <= harvestEnd) {
    const month = getMonth(currentDate);
    const monthData = climate.monthlyAvgC[String(month)];

    if (monthData) {
      const avgHigh = monthData.tmax_c;
      const avgLow = monthData.tmin_c;
      const minGrowing = cultivar.minGrowingTempC;
      const maxGrowing = cultivar.maxGrowingTempC;

      // Heat check - always applies (even frost-tolerant crops bolt in heat)
      if (maxGrowing != null && avgHigh != null) {
        const effectiveMax = maxGrowing - TEMP_MARGIN_C;
        if (avgHigh > effectiveMax) {
          return {
            viable: false,
            reason: `Too hot (avg high ${avgHigh}°C > max ${maxGrowing}°C - ${TEMP_MARGIN_C}° margin)`,
          };
        }
      }

      // Cold check - skip for frost-tolerant crops
      if (cultivar.frostSensitive && minGrowing != null && avgLow != null) {
        const effectiveMin = minGrowing + TEMP_MARGIN_C;
        if (avgLow < effectiveMin) {
          return {
            viable: false,
            reason: `Too cold (avg low ${avgLow}°C < min ${minGrowing}°C + ${TEMP_MARGIN_C}° margin)`,
          };
        }
      }
    }

    // Move to next month
    currentDate = addDays(currentDate, 30);
  }

  return { viable: true };
}

// ============================================
// Planting Window Calculation
// ============================================

export type PlantingWindow = {
  sowDate: string;
  transplantDate?: string;
  harvestStart: string;
  harvestEnd: string;
  method: SowMethod;
  successionNumber: number;
  skippedReason?: string; // If this window was skipped due to temperature
};

export type SuccessionResult = {
  windows: PlantingWindow[];
  skippedPeriods: Array<{
    startDate: string;
    endDate: string;
    reason: string;
  }>;
};

/**
 * Calculate all viable planting windows for a cultivar within a growing season.
 *
 * Algorithm:
 * 1. Start from earliest viable sow date (after last spring frost + offset)
 * 2. Calculate harvest window for that planting
 * 3. Find next sow date where harvest begins as previous ends
 * 4. If temperature is unsuitable, skip to next viable window
 * 5. Continue until first fall frost (minus maturity buffer)
 */
export function calculateSuccessionWindows(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate: Climate,
  options?: {
    maxSuccessions?: number;
    targetQuantity?: number;
  }
): SuccessionResult {
  const maxSuccessions = options?.maxSuccessions ?? 10;
  const windows: PlantingWindow[] = [];
  const skippedPeriods: SuccessionResult['skippedPeriods'] = [];

  const method: SowMethod =
    cultivar.sowMethod === 'either' ? 'direct' : cultivar.sowMethod;

  // Calculate earliest sow date
  const earliestSowDate = calculateEarliestSowDate(cultivar, frostWindow, method);

  // Calculate latest possible sow date (must harvest before first fall frost)
  // Use earliest probable frost from climate data if available
  const year = new Date(`${frostWindow.firstFallFrost}T00:00:00Z`).getUTCFullYear();
  const earliestFallFrost = climate?.firstFallFrost?.earliest
    ? `${year}-${climate.firstFallFrost.earliest}`
    : frostWindow.firstFallFrost;
  const typicalFallFrost = climate?.firstFallFrost?.typical
    ? `${year}-${climate.firstFallFrost.typical}`
    : frostWindow.firstFallFrost;

  // Frost-tolerant crops can grow past frost; frost-sensitive need buffer before earliest frost
  const fallDeadline = cultivar.frostSensitive
    ? addDays(earliestFallFrost, -FROST_BUFFER_DAYS)
    : addDays(typicalFallFrost, 21); // ~3 weeks past typical frost

  // For latest sow, we just need to reach maturity before deadline
  // (don't subtract full harvest duration - partial harvest is still valuable)
  const latestSowDate = addDays(fallDeadline, -cultivar.maturityDays);

  let currentSowDate = earliestSowDate;
  let successionNumber = 1;
  let previousHarvestEnd: string | null = null;
  let skipStartDate: string | null = null;

  while (currentSowDate <= latestSowDate && successionNumber <= maxSuccessions) {
    // Calculate dates for this potential planting
    const plantingDates = calculatePlantingDates(
      currentSowDate,
      cultivar,
      frostWindow,
      method,
      climate
    );

    // Check if temperature is viable for the outdoor growing period
    // For transplants, start from transplant date (plants are indoors until then)
    // For direct sow, start from sow date
    // We only check until harvest begins - once mature, the plant can tolerate
    // more temperature variation during harvest
    const outdoorStartDate = plantingDates.transplantDate ?? currentSowDate;
    const tempCheck = isGrowingPeriodViable(
      outdoorStartDate,
      plantingDates.harvestStart,
      cultivar,
      climate
    );

    if (!tempCheck.viable) {
      // Track skipped period
      if (!skipStartDate) {
        skipStartDate = currentSowDate;
      }

      // Try next week
      currentSowDate = addDays(currentSowDate, 7);
      continue;
    }

    // Temperature is viable - close any skipped period
    if (skipStartDate) {
      skippedPeriods.push({
        startDate: skipStartDate,
        endDate: addDays(currentSowDate, -1),
        reason: tempCheck.reason ?? 'Temperature outside viable range',
      });
      skipStartDate = null;
    }

    // Add this window
    windows.push({
      sowDate: currentSowDate,
      transplantDate: plantingDates.transplantDate,
      harvestStart: plantingDates.harvestStart,
      harvestEnd: plantingDates.harvestEnd,
      method,
      successionNumber,
    });

    previousHarvestEnd = plantingDates.harvestEnd;
    successionNumber++;

    // For continuous harvest crops that harvest until frost (like indeterminate tomatoes),
    // there's no benefit to additional successions - one planting covers the whole season.
    // Only generate multiple windows for crops with limited harvest duration.
    if (cultivar.harvestStyle === 'continuous' && cultivar.harvestDurationDays == null) {
      break;
    }

    // Calculate next sow date for continuous harvest
    // Aim to start harvesting as previous harvest ends
    currentSowDate = calculateNextSowDateForContinuousHarvest(
      plantingDates.harvestEnd,
      cultivar,
      method
    );
  }

  // Close any remaining skipped period
  if (skipStartDate) {
    skippedPeriods.push({
      startDate: skipStartDate,
      endDate: latestSowDate,
      reason: 'Temperature outside viable range until end of season',
    });
  }

  return { windows, skippedPeriods };
}

/**
 * Calculate the earliest viable sow date based on frost window and cultivar requirements.
 * Frost-tolerant crops can be sown much earlier (as soon as soil is workable).
 */
function calculateEarliestSowDate(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  method: SowMethod
): string {
  const springFrost = frostWindow.lastSpringFrost;
  const year = new Date(`${springFrost}T00:00:00Z`).getUTCFullYear();

  // For frost-tolerant direct sow crops, allow sowing from early April
  // (as soon as ground is workable in most northern climates)
  if (method === 'direct' && !cultivar.frostSensitive) {
    const earlyStart = `${year}-04-01`;
    const frostBasedStart = addDays(springFrost, ensureNumber(cultivar.directAfterLsfDays, 0));
    // Use whichever is earlier
    return earlyStart < frostBasedStart ? earlyStart : frostBasedStart;
  }

  if (method === 'direct') {
    const offset = ensureNumber(cultivar.directAfterLsfDays, 0);
    return addDays(springFrost, offset);
  }

  if (method === 'transplant') {
    // For transplants, calculate when to start seeds indoors
    const transplantAfter = ensureNumber(cultivar.transplantAfterLsfDays, 0);
    const transplantDate = addDays(springFrost, transplantAfter);
    const leadWeeks = ensureNumber(cultivar.indoorLeadWeeksMax, 6);
    return addDays(transplantDate, -leadWeeks * 7);
  }

  return springFrost;
}

/**
 * Calculate all dates for a planting given a sow date.
 */
function calculatePlantingDates(
  sowDate: string,
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  method: SowMethod,
  climate?: Climate
): {
  sowDate: string;
  transplantDate?: string;
  harvestStart: string;
  harvestEnd: string;
} {
  let transplantDate: string | undefined;
  let harvestStart: string;

  if (method === 'transplant') {
    const leadWeeks = ensureNumber(cultivar.indoorLeadWeeksMin, 6);
    transplantDate = addDays(sowDate, leadWeeks * 7);

    if (cultivar.maturityBasis === 'from_transplant') {
      harvestStart = addDays(transplantDate, cultivar.maturityDays);
    } else {
      harvestStart = addDays(sowDate, cultivar.maturityDays);
    }
  } else {
    harvestStart = addDays(sowDate, cultivar.maturityDays);
  }

  // Calculate harvest end
  let harvestEnd: string;

  // Determine the fall frost deadline
  // Use earliest probable frost from climate data if available, otherwise use frostWindow
  const year = new Date(`${frostWindow.firstFallFrost}T00:00:00Z`).getUTCFullYear();
  const earliestFallFrost = climate?.firstFallFrost?.earliest
    ? `${year}-${climate.firstFallFrost.earliest}`
    : frostWindow.firstFallFrost;

  if (cultivar.harvestStyle === 'continuous' && cultivar.frostSensitive) {
    // Frost-sensitive continuous harvest ends before earliest probable frost
    harvestEnd = addDays(earliestFallFrost, -FROST_BUFFER_DAYS);
  } else if (cultivar.harvestStyle === 'continuous' && !cultivar.frostSensitive) {
    // Frost-tolerant continuous harvest can extend past frost
    // Use typical frost date as baseline for extension
    const typicalFrost = climate?.firstFallFrost?.typical
      ? `${year}-${climate.firstFallFrost.typical}`
      : frostWindow.firstFallFrost;
    harvestEnd = addDays(typicalFrost, 21); // ~3 weeks past typical frost
  } else {
    // Single harvest or explicit duration
    const harvestDuration = ensureNumber(cultivar.harvestDurationDays, 7);
    harvestEnd = addDays(harvestStart, harvestDuration);
  }

  return {
    sowDate,
    transplantDate,
    harvestStart,
    harvestEnd,
  };
}

/**
 * Calculate the next sow date to achieve continuous harvest.
 * Aims to start harvesting around when previous harvest ends.
 */
function calculateNextSowDateForContinuousHarvest(
  previousHarvestEnd: string,
  cultivar: Cultivar,
  method: SowMethod
): string {
  // Work backwards from target harvest start
  const targetHarvestStart = previousHarvestEnd;

  if (method === 'transplant') {
    const leadWeeks = ensureNumber(cultivar.indoorLeadWeeksMin, 6);
    if (cultivar.maturityBasis === 'from_transplant') {
      // Harvest = transplant + maturity
      // Transplant = sow + lead weeks
      // So sow = harvest - maturity - lead weeks
      return addDays(
        targetHarvestStart,
        -cultivar.maturityDays - leadWeeks * 7
      );
    } else {
      // Harvest = sow + maturity
      return addDays(targetHarvestStart, -cultivar.maturityDays);
    }
  }

  // Direct sow: harvest = sow + maturity
  return addDays(targetHarvestStart, -cultivar.maturityDays);
}

// ============================================
// Planting Creation Helpers
// ============================================

/**
 * Create a Planting object from a PlantingWindow.
 */
export function createPlantingFromWindow(
  window: PlantingWindow,
  cultivar: Cultivar,
  quantity: number = 1
): Omit<Planting, 'id' | 'createdAt'> {
  return {
    cultivarId: cultivar.id,
    label: `${cultivar.crop} #${window.successionNumber}`,
    quantity,
    sowDate: window.sowDate,
    transplantDate: window.transplantDate,
    harvestStart: window.harvestStart,
    harvestEnd: window.harvestEnd,
    method: window.method,
    status: 'planned',
    successionNumber: window.successionNumber,
  };
}

/**
 * Get the next available succession number for a cultivar.
 */
export function getNextSuccessionNumber(
  existingPlantings: Planting[],
  cultivarId: string
): number {
  const cultivarPlantings = existingPlantings.filter(
    (p) => p.cultivarId === cultivarId
  );

  if (cultivarPlantings.length === 0) {
    return 1;
  }

  return Math.max(...cultivarPlantings.map((p) => p.successionNumber)) + 1;
}

/**
 * Calculate the next succession planting window based on existing plantings.
 */
export function calculateNextSuccession(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate: Climate,
  existingPlantings: Planting[]
): PlantingWindow | null {
  const cultivarPlantings = existingPlantings
    .filter((p) => p.cultivarId === cultivar.id)
    .sort((a, b) => a.harvestEnd.localeCompare(b.harvestEnd));

  const result = calculateSuccessionWindows(cultivar, frostWindow, climate);

  if (cultivarPlantings.length === 0) {
    // Return first window
    return result.windows[0] ?? null;
  }

  // Find the window after the last existing planting's harvest
  const lastPlanting = cultivarPlantings[cultivarPlantings.length - 1];
  const nextWindow = result.windows.find(
    (w) => w.sowDate > lastPlanting.sowDate
  );

  if (nextWindow) {
    // Update succession number
    return {
      ...nextWindow,
      successionNumber: getNextSuccessionNumber(existingPlantings, cultivar.id),
    };
  }

  return null;
}
