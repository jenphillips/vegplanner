import type { Cultivar, Climate, FrostWindow, SowMethod, Planting, HarvestStyle } from './types';
import { toDate, addDays, ensureNumber, getInterpolatedClimate } from './dateUtils';

// ============================================
// Harvest Duration Helpers
// ============================================

/**
 * Get the default harvest duration based on harvest style.
 * - continuous: 21 days (typical for cut-and-come-again crops)
 * - single: 7 days (typical for root vegetables, heads)
 */
function getDefaultHarvestDuration(harvestStyle?: HarvestStyle): number {
  return harvestStyle === 'continuous' ? 21 : 7;
}

// ============================================
// Temperature Check
// ============================================

// Safety margin for temperature checks (°C)
// Applied to both heat and cold thresholds to be conservative.
// Future: replace with user-configurable conservatism level that interpolates
// between optimalTemp and minGrowing/maxGrowing ranges.
const DEFAULT_TEMP_MARGIN_C = 1;

// Buffer before earliest probable frost for frost-sensitive crops (days)
const FROST_BUFFER_DAYS = 4;

/**
 * Classify a temperature viability reason as 'hot', 'cold', or 'unknown'.
 * Used to split gaps when the failure type transitions (e.g., summer heat → fall cold).
 */
function getReasonType(reason: string | undefined): 'hot' | 'cold' | 'unknown' {
  if (!reason) return 'unknown';
  if (/Too hot/i.test(reason)) return 'hot';
  if (/too cold|Soil too cold/i.test(reason)) return 'cold';
  return 'unknown';
}

/**
 * Check if the entire growing period is temperature-viable.
 * Checks each month the plant will be growing.
 *
 * Temperature check strategy:
 * - Heat check: Uses tmax_c (avg daily high) vs maxGrowingTempC directly.
 *   Only applies during active growth (sow to harvestStart).
 * - Cold check for frost-tolerant crops: Uses soil_avg_c vs minGrowingTempC.
 *   Soil temp better represents ground-level growing conditions for hardy crops.
 * - Cold check for frost-sensitive crops: Uses tavg_c vs minGrowingTempC.
 *   This is more realistic since minGrowingTempC is about growing conditions,
 *   not about surviving nighttime lows.
 */
function isGrowingPeriodViable(
  startDate: string,
  endDate: string,
  cultivar: Cultivar,
  climate: Climate,
  options?: { checkHeatOnly?: boolean }
): { viable: boolean; reason?: string } {
  const minGrowing = cultivar.minGrowingTempC;
  const maxGrowing = cultivar.maxGrowingTempC;

  let date = startDate;
  while (date <= endDate) {
    const interpolated = getInterpolatedClimate(date, climate);

    // Heat check - always applies (even frost-tolerant crops bolt in heat)
    if (maxGrowing != null && interpolated.tmax_c != null) {
      const effectiveMax = maxGrowing - DEFAULT_TEMP_MARGIN_C;
      if (interpolated.tmax_c > effectiveMax) {
        return {
          viable: false,
          reason: `Too hot (${interpolated.tmax_c.toFixed(1)}°C avg high > ${effectiveMax}°C effective max)`,
        };
      }
    }

    // Cold check for frost-TOLERANT crops: use soil temperature
    if (!options?.checkHeatOnly && !cultivar.frostSensitive && minGrowing != null) {
      const effectiveMin = minGrowing + DEFAULT_TEMP_MARGIN_C;
      const soilTemp = interpolated.soil_avg_c ?? (interpolated.tavg_c != null ? interpolated.tavg_c - 2 : null);
      if (soilTemp != null && soilTemp < effectiveMin) {
        return {
          viable: false,
          reason: `Soil too cold (${soilTemp.toFixed(1)}°C < ${effectiveMin}°C effective min)`,
        };
      }
    }

    // Cold check for frost-SENSITIVE crops: use air temperature
    if (!options?.checkHeatOnly && cultivar.frostSensitive && minGrowing != null) {
      const effectiveMin = minGrowing + DEFAULT_TEMP_MARGIN_C;
      if (interpolated.tavg_c != null && interpolated.tavg_c < effectiveMin) {
        return {
          viable: false,
          reason: `Too cold (${interpolated.tavg_c.toFixed(1)}°C avg < ${effectiveMin}°C effective min)`,
        };
      }
    }

    date = addDays(date, 1);
  }

  return { viable: true };
}

// ============================================
// Perennial Handling
// ============================================

/**
 * Calculate a planting window for a perennial crop.
 * Perennials don't use maturityDays for harvest calculation - instead, their
 * harvest window is relative to frost dates (they come back every year).
 */
export function calculatePerennialWindow(
  cultivar: Cultivar,
  frostWindow: FrostWindow
): PlantingWindow | null {
  if (!cultivar.isPerennial) return null;

  const springFrost = frostWindow.lastSpringFrost;

  // Calculate harvest start relative to last spring frost
  const harvestStartOffset = cultivar.perennialHarvestStartDaysAfterLSF ?? 14;
  const harvestStart = addDays(springFrost, harvestStartOffset);

  // Calculate harvest end using harvestDurationDays (default 42 days / 6 weeks)
  const harvestDuration = cultivar.harvestDurationDays ?? 42;
  const harvestEnd = addDays(harvestStart, harvestDuration);

  return {
    sowDate: harvestStart, // Nominal - perennials are already established
    transplantDate: undefined,
    harvestStart,
    harvestEnd,
    method: 'direct', // Perennials don't have a traditional planting method
    successionNumber: 1,
  };
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
  /** Diagnostic info when no windows found */
  diagnostic?: {
    earliestSowDate: string;
    latestSowDate: string;
    noWindowsReason?: string;
  };
};

// ============================================
// Outdoor Growing Constraints (day-level)
// ============================================

export type GrowingConstraint = {
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string;   // ISO date (YYYY-MM-DD)
  type: 'hot' | 'cold';
  reason: string;    // Human-readable detail for tooltip
};

/**
 * Determine which days of the year are outside a cultivar's temperature range.
 * Iterates day-by-day, checking each day's month's climate data against the
 * cultivar's temperature tolerances, and groups consecutive non-viable days
 * into date ranges with hot/cold labels.
 *
 * This is a simple temperature comparison — no maturity, sow method, or succession logic.
 * Uses the same temperature metrics as isGrowingPeriodViable():
 * - Heat: tmax_c vs maxGrowingTempC
 * - Cold (frost-tolerant): soil_avg_c vs minGrowingTempC
 * - Cold (frost-sensitive): tavg_c vs minGrowingTempC
 */
export function getOutdoorGrowingConstraints(
  cultivar: Cultivar,
  climate: Climate,
  year: number
): GrowingConstraint[] {
  const minGrowing = cultivar.minGrowingTempC;
  const maxGrowing = cultivar.maxGrowingTempC;
  const constraints: GrowingConstraint[] = [];
  let current: { startDate: string; type: 'hot' | 'cold'; reason: string } | null = null;

  const yearEnd = `${year}-12-31`;
  let date = `${year}-01-01`;

  while (date <= yearEnd) {
    const interpolated = getInterpolatedClimate(date, climate);

    let dayType: 'hot' | 'cold' | null = null;
    let reason = '';

    // Heat check (same logic as isGrowingPeriodViable)
    if (maxGrowing != null && interpolated.tmax_c != null) {
      const effectiveMax = maxGrowing - DEFAULT_TEMP_MARGIN_C;
      if (interpolated.tmax_c > effectiveMax) {
        dayType = 'hot';
        reason = `Avg high ${interpolated.tmax_c.toFixed(1)}°C exceeds ${effectiveMax}°C effective max`;
      }
    }

    // Cold check (only if not already hot — matches isGrowingPeriodViable order)
    if (!dayType && minGrowing != null) {
      const effectiveMin = minGrowing + DEFAULT_TEMP_MARGIN_C;
      if (!cultivar.frostSensitive) {
        const soilTemp = interpolated.soil_avg_c ?? (interpolated.tavg_c != null ? interpolated.tavg_c - 2 : null);
        if (soilTemp != null && soilTemp < effectiveMin) {
          dayType = 'cold';
          reason = `Soil temp ${soilTemp.toFixed(1)}°C below ${effectiveMin}°C effective min`;
        }
      } else if (interpolated.tavg_c != null && interpolated.tavg_c < effectiveMin) {
        dayType = 'cold';
        reason = `Avg temp ${interpolated.tavg_c.toFixed(1)}°C below ${effectiveMin}°C effective min`;
      }
    }

    if (!dayType) {
      // Viable day — close any open constraint
      if (current) {
        constraints.push({
          startDate: current.startDate,
          endDate: addDays(date, -1),
          type: current.type,
          reason: current.reason,
        });
        current = null;
      }
    } else if (current && current.type === dayType) {
      // Same type — extend, update reason to latest month's values
      current.reason = reason;
    } else {
      // New constraint or type changed (hot↔cold) — close previous, start new
      if (current) {
        constraints.push({
          startDate: current.startDate,
          endDate: addDays(date, -1),
          type: current.type,
          reason: current.reason,
        });
      }
      current = { startDate: date, type: dayType, reason };
    }

    date = addDays(date, 1);
  }

  // Close final open constraint
  if (current) {
    constraints.push({
      startDate: current.startDate,
      endDate: yearEnd,
      type: current.type,
      reason: current.reason,
    });
  }

  return constraints;
}

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
export { isGrowingPeriodViable };

export function calculateSuccessionWindows(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate: Climate,
  options?: {
    maxSuccessions?: number;
    targetQuantity?: number;
  }
): SuccessionResult {
  // Early exit for perennials - they don't have succession windows
  if (cultivar.isPerennial) {
    const perennialWindow = calculatePerennialWindow(cultivar, frostWindow);
    return {
      windows: perennialWindow ? [perennialWindow] : [],
      skippedPeriods: [],
      diagnostic: perennialWindow
        ? undefined
        : {
            earliestSowDate: '',
            latestSowDate: '',
            noWindowsReason: 'Could not calculate perennial harvest window',
          },
    };
  }

  const maxSuccessions = options?.maxSuccessions ?? 10;
  const windows: PlantingWindow[] = [];
  const skippedPeriods: SuccessionResult['skippedPeriods'] = [];

  const method: SowMethod =
    cultivar.sowMethod === 'either'
      ? (cultivar.preferredMethod ?? 'direct')
      : cultivar.sowMethod;

  // Calculate earliest sow date
  const earliestSowDate = calculateEarliestSowDate(cultivar, frostWindow, method, climate);

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

  let lastFailureReason: string | undefined;

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
    //
    // Temperature checking strategy:
    // - Check heat from outdoor start through harvestStart (not harvestEnd)
    //   Mature plants can tolerate more heat during harvest than during active growth
    // - For heat-sensitive crops, we still track this in skippedPeriods but don't
    //   extend the check into harvest time when the plant is already mature
    const outdoorStartDate = plantingDates.transplantDate ?? currentSowDate;
    const tempCheck = isGrowingPeriodViable(
      outdoorStartDate,
      plantingDates.harvestStart,
      cultivar,
      climate
    );

    if (!tempCheck.viable) {
      // Track skipped period, splitting when reason type changes (hot↔cold)
      if (!skipStartDate) {
        // Starting a new gap
        skipStartDate = currentSowDate;
        lastFailureReason = tempCheck.reason;
      } else {
        // Already in a gap — check if reason type changed
        const prevType = getReasonType(lastFailureReason);
        const newType = getReasonType(tempCheck.reason);
        if (prevType !== newType && prevType !== 'unknown' && newType !== 'unknown') {
          // Reason type changed: close current gap segment, start new one
          skippedPeriods.push({
            startDate: skipStartDate,
            endDate: addDays(currentSowDate, -1),
            reason: lastFailureReason ?? 'Temperature outside viable range',
          });
          skipStartDate = currentSowDate;
          // Do NOT reset previousHarvestEnd — only reset when gap fully closes
        }
        lastFailureReason = tempCheck.reason;
      }

      // Try next day (1-day increments find the exact first viable date)
      currentSowDate = addDays(currentSowDate, 1);
      continue;
    }

    // Temperature is viable - close any skipped period
    if (skipStartDate) {
      skippedPeriods.push({
        startDate: skipStartDate,
        endDate: addDays(currentSowDate, -1),
        reason: lastFailureReason ?? 'Temperature outside viable range',
      });
      skipStartDate = null;
      // Reset harvest tracking when resuming after a gap (e.g., fall after summer heat)
      // This ensures fall windows aren't incorrectly compared to spring windows
      previousHarvestEnd = null;
    }

    // Check if this window's harvest overlaps significantly with the previous window
    // This happens when harvests get truncated to the same frost deadline
    if (previousHarvestEnd) {
      const prevEndTime = toDate(previousHarvestEnd).getTime();
      const newStartTime = toDate(plantingDates.harvestStart).getTime();
      const newEndTime = toDate(plantingDates.harvestEnd).getTime();

      // If new harvest starts before previous ends and they share the same end date,
      // this window doesn't provide meaningful additional harvest time
      if (newStartTime < prevEndTime && newEndTime <= prevEndTime) {
        break;
      }

      // Also skip if the unique harvest time (after previous ends) is very short (< 1 week)
      const uniqueHarvestMs = newEndTime - Math.max(newStartTime, prevEndTime);
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      if (uniqueHarvestMs < oneWeekMs) {
        break;
      }
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
    const nextSowDate = calculateNextSowDateForContinuousHarvest(
      plantingDates.harvestEnd,
      cultivar,
      method
    );

    // If the next sow date isn't advancing (can happen when harvestEnd gets capped
    // at frost deadline), we've exhausted viable windows - exit the loop
    if (nextSowDate <= currentSowDate) {
      break;
    }

    currentSowDate = nextSowDate;
  }

  // Close any remaining skipped period
  if (skipStartDate) {
    skippedPeriods.push({
      startDate: skipStartDate,
      endDate: latestSowDate,
      reason: lastFailureReason ?? 'Temperature outside viable range until end of season',
    });
  }

  // Build diagnostic info
  const diagnostic: SuccessionResult['diagnostic'] = {
    earliestSowDate,
    latestSowDate,
  };

  if (windows.length === 0) {
    if (earliestSowDate > latestSowDate) {
      diagnostic.noWindowsReason = `Season too short: earliest sow ${earliestSowDate} is after latest sow ${latestSowDate}`;
    } else if (lastFailureReason) {
      diagnostic.noWindowsReason = lastFailureReason;
    } else {
      diagnostic.noWindowsReason = 'No viable temperature windows found';
    }
  }

  return { windows, skippedPeriods, diagnostic };
}

/**
 * Find the climate-derived season start: the first month where outdoor conditions
 * meet the crop's minimum temperature requirements.
 *
 * Uses the same temperature metrics as isGrowingPeriodViable():
 * - Frost-tolerant: soil_avg_c (fallback tavg_c - 2) >= threshold
 * - Frost-sensitive: tavg_c >= threshold
 * - No minGrowingTempC set: threshold defaults to 0°C (ground not frozen)
 */
function getClimateSeasonStart(
  cultivar: Cultivar,
  climate: Climate,
  year: number
): string {
  const threshold = (cultivar.minGrowingTempC ?? 0) + DEFAULT_TEMP_MARGIN_C;
  const yearEnd = `${year}-12-31`;
  let date = `${year}-01-01`;

  while (date <= yearEnd) {
    const interpolated = getInterpolatedClimate(date, climate);

    if (cultivar.frostSensitive) {
      if (interpolated.tavg_c != null && interpolated.tavg_c >= threshold) {
        return date;
      }
    } else {
      const soilTemp = interpolated.soil_avg_c ?? (interpolated.tavg_c != null ? interpolated.tavg_c - 2 : null);
      if (soilTemp != null && soilTemp >= threshold) {
        return date;
      }
    }

    date = addDays(date, 1);
  }

  // No date meets threshold - return late date so frost-based calculation wins
  return `${year}-12-31`;
}

/**
 * Calculate the earliest viable sow date based on frost window and cultivar requirements.
 * Frost-tolerant crops can start from the climate-derived season start (first month
 * where soil/air temp meets the crop's minimum). The temperature check in
 * isGrowingPeriodViable() provides further day-level filtering.
 */
function calculateEarliestSowDate(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  method: SowMethod,
  climate: Climate
): string {
  const springFrost = frostWindow.lastSpringFrost;
  const year = new Date(`${springFrost}T00:00:00Z`).getUTCFullYear();
  const seasonStart = getClimateSeasonStart(cultivar, climate, year);

  if (method === 'direct') {
    const frostBasedStart = addDays(springFrost, ensureNumber(cultivar.directAfterLsfDays, 0));
    // Frost-tolerant crops can start from climate-derived season start
    if (!cultivar.frostSensitive) {
      return seasonStart < frostBasedStart ? seasonStart : frostBasedStart;
    }
    return frostBasedStart;
  }

  if (method === 'transplant') {
    const transplantAfter = ensureNumber(cultivar.transplantAfterLsfDays, 0);
    let transplantDate = addDays(springFrost, transplantAfter);

    // Frost-tolerant transplants can go out at climate-derived season start
    if (!cultivar.frostSensitive && seasonStart < transplantDate) {
      transplantDate = seasonStart;
    }

    // Calculate when to start seeds indoors (before transplant date)
    const leadWeeks = ensureNumber(cultivar.indoorLeadWeeksMax, 6);
    return addDays(transplantDate, -leadWeeks * 7);
  }

  return springFrost;
}

/**
 * Calculate the latest viable sow date based on frost window and cultivar requirements.
 * Must be early enough to reach maturity before fall frost deadline.
 */
function calculateLatestSowDate(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate?: Climate
): string {
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
    : addDays(typicalFallFrost, 21);

  return addDays(fallDeadline, -cultivar.maturityDays);
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

  // Get harvest duration - only use default if not explicitly set
  // A null harvestDurationDays means "harvest until frost" (e.g., indeterminate tomatoes)
  // An explicit value means the plant has a finite harvest window (e.g., spinach, lettuce)
  const harvestDuration = cultivar.harvestDurationDays;
  const hasExplicitDuration = harvestDuration != null;

  if (hasExplicitDuration) {
    // Explicit duration set - use it, but cap at frost deadline for frost-sensitive crops
    const durationEnd = addDays(harvestStart, harvestDuration);
    if (cultivar.frostSensitive) {
      const frostDeadline = addDays(earliestFallFrost, -FROST_BUFFER_DAYS);
      harvestEnd = frostDeadline < durationEnd ? frostDeadline : durationEnd;
    } else {
      // Frost-tolerant with explicit duration: can extend slightly past frost if needed
      const typicalFrost = climate?.firstFallFrost?.typical
        ? `${year}-${climate.firstFallFrost.typical}`
        : frostWindow.firstFallFrost;
      const frostExtension = addDays(typicalFrost, 21);
      harvestEnd = frostExtension < durationEnd ? frostExtension : durationEnd;
    }
  } else if (cultivar.harvestStyle === 'continuous') {
    // No explicit duration + continuous harvest = harvest until frost
    // (e.g., indeterminate tomatoes, peppers)
    if (cultivar.frostSensitive) {
      harvestEnd = addDays(earliestFallFrost, -FROST_BUFFER_DAYS);
    } else {
      const typicalFrost = climate?.firstFallFrost?.typical
        ? `${year}-${climate.firstFallFrost.typical}`
        : frostWindow.firstFallFrost;
      harvestEnd = addDays(typicalFrost, 21);
    }
  } else {
    // Single harvest with no explicit duration: use style-based default
    const defaultDuration = getDefaultHarvestDuration(cultivar.harvestStyle);
    harvestEnd = addDays(harvestStart, defaultDuration);
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
  quantity?: number
): Omit<Planting, 'id' | 'createdAt'> {
  return {
    cultivarId: cultivar.id,
    label: cultivar.variety
      ? `${cultivar.crop} - ${cultivar.variety} #${window.successionNumber}`
      : `${cultivar.crop} #${window.successionNumber}`,
    quantity, // Optional - will be set when placed in garden bed
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
 * Renumber plantings for a crop so succession numbers match chronological order.
 * Returns updated plantings with corrected successionNumber and label fields.
 */
export function renumberPlantingsForCrop(
  allPlantings: Planting[],
  cropName: string,
  cultivarId: string,
  variety?: string
): Planting[] {
  const cultivarPlantings = allPlantings.filter(
    (p) => p.cultivarId === cultivarId
  );
  const otherPlantings = allPlantings.filter(
    (p) => p.cultivarId !== cultivarId
  );

  // Sort by sow date chronologically
  const sorted = [...cultivarPlantings].sort((a, b) =>
    a.sowDate.localeCompare(b.sowDate)
  );

  // Renumber based on chronological position
  const renumbered = sorted.map((planting, index) => {
    const newNumber = index + 1;
    const label = variety
      ? `${cropName} - ${variety} #${newNumber}`
      : `${cropName} #${newNumber}`;
    return {
      ...planting,
      successionNumber: newNumber,
      label,
    };
  });

  return [...otherPlantings, ...renumbered];
}

/**
 * Calculate the next succession planting window based on existing plantings.
 * Targets harvest continuity: new harvest should start when previous ends.
 * Skips temperature-unfavorable periods and finds the next viable window.
 */
export function calculateNextSuccession(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate: Climate,
  existingPlantings: Planting[]
): PlantingWindow | null {
  // Perennials don't have succession plantings
  if (cultivar.isPerennial) {
    return null;
  }

  const cultivarPlantings = existingPlantings
    .filter((p) => p.cultivarId === cultivar.id)
    .sort((a, b) => a.harvestEnd.localeCompare(b.harvestEnd));

  // If no existing plantings, return first viable window
  if (cultivarPlantings.length === 0) {
    const result = calculateSuccessionWindows(cultivar, frostWindow, climate);
    return result.windows[0] ?? null;
  }

  const lastPlanting = cultivarPlantings[cultivarPlantings.length - 1];
  const method: SowMethod =
    cultivar.sowMethod === 'either'
      ? (cultivar.preferredMethod ?? 'direct')
      : cultivar.sowMethod;

  // Helper to check if a proposed window overlaps with any existing planting
  const overlapsExistingPlanting = (harvestStart: string, harvestEnd: string): boolean => {
    const windowStart = toDate(harvestStart).getTime();
    const windowEnd = toDate(harvestEnd).getTime();

    return cultivarPlantings.some((p) => {
      const plantingStart = toDate(p.harvestStart).getTime();
      const plantingEnd = toDate(p.harvestEnd).getTime();

      // For same-day windows/plantings (start == end), use exact match
      // This handles the case where a window is truncated to a single day at frost deadline
      const windowIsSameDay = windowStart === windowEnd;
      const plantingIsSameDay = plantingStart === plantingEnd;

      if (windowIsSameDay && plantingIsSameDay) {
        // Both are same-day: overlap if they're the same day
        return windowStart === plantingStart;
      } else if (windowIsSameDay) {
        // Window is same-day: overlaps if it falls within planting's range (inclusive)
        return windowStart >= plantingStart && windowStart <= plantingEnd;
      } else if (plantingIsSameDay) {
        // Planting is same-day: overlaps if it falls within window's range (inclusive)
        return plantingStart >= windowStart && plantingStart <= windowEnd;
      } else {
        // Normal case: overlap if windowStart < plantingEnd AND plantingStart < windowEnd
        return windowStart < plantingEnd && plantingStart < windowEnd;
      }
    });
  };

  // Calculate ideal next sow date targeting harvest start = previous harvest end
  let proposedSowDate = calculateNextSowDateForContinuousHarvest(
    lastPlanting.harvestEnd,
    cultivar,
    method
  );

  // Get the latest viable sow date for this cultivar
  const latestSowDate = calculateLatestSowDate(cultivar, frostWindow, climate);

  // Iterate forward to find the next viable window (may need to skip hot periods)
  // With 1-day increments, we need ~365 iterations to search a full year
  const maxIterations = 365;
  let iterations = 0;

  while (iterations < maxIterations && proposedSowDate <= latestSowDate) {
    const plantingDates = calculatePlantingDates(
      proposedSowDate,
      cultivar,
      frostWindow,
      method,
      climate
    );

    // Check temperature viability (through harvestStart, not harvestEnd)
    const outdoorStartDate = plantingDates.transplantDate ?? proposedSowDate;
    const tempCheck = isGrowingPeriodViable(
      outdoorStartDate,
      plantingDates.harvestStart,
      cultivar,
      climate
    );

    // Also check that this window doesn't overlap with existing plantings
    // This prevents suggesting duplicate windows when user has manually adjusted dates
    const hasOverlap = overlapsExistingPlanting(
      plantingDates.harvestStart,
      plantingDates.harvestEnd
    );

    if (tempCheck.viable && !hasOverlap) {
      return {
        sowDate: proposedSowDate,
        transplantDate: plantingDates.transplantDate,
        harvestStart: plantingDates.harvestStart,
        harvestEnd: plantingDates.harvestEnd,
        method,
        successionNumber: getNextSuccessionNumber(existingPlantings, cultivar.id),
      };
    }

    // Temperature not viable or overlaps - skip forward one day and try again
    proposedSowDate = addDays(proposedSowDate, 1);
    iterations++;
  }

  // No viable window found within constraints
  return null;
}

/**
 * Calculate all available succession windows after a given harvest end date.
 * This is useful when the user has manually adjusted planting dates and wants
 * to see what windows are still available after a specific planting.
 *
 * Returns windows that:
 * 1. Are temperature-viable
 * 2. Have harvest start >= the given afterHarvestEnd date
 * 3. Don't overlap with any existing planting's harvest period
 */
export function calculateAvailableWindowsAfter(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate: Climate,
  afterHarvestEnd: string,
  existingPlantings: Planting[]
): PlantingWindow[] {
  const cultivarPlantings = existingPlantings.filter(
    (p) => p.cultivarId === cultivar.id
  );

  const method: SowMethod =
    cultivar.sowMethod === 'either'
      ? (cultivar.preferredMethod ?? 'direct')
      : cultivar.sowMethod;

  // Get the latest viable sow date
  const latestSowDate = calculateLatestSowDate(cultivar, frostWindow, climate);

  // Calculate the sow date that would result in harvest starting at afterHarvestEnd
  let currentSowDate = calculateNextSowDateForContinuousHarvest(
    afterHarvestEnd,
    cultivar,
    method
  );

  const availableWindows: PlantingWindow[] = [];
  const maxIterations = 365; // ~1 year of daily checks
  let iterations = 0;
  let successionNumber = getNextSuccessionNumber(existingPlantings, cultivar.id);

  // Helper to check if a window overlaps with any existing planting
  const overlapsExistingPlanting = (harvestStart: string, harvestEnd: string): boolean => {
    const windowStart = toDate(harvestStart).getTime();
    const windowEnd = toDate(harvestEnd).getTime();

    return cultivarPlantings.some((p) => {
      const plantingStart = toDate(p.harvestStart).getTime();
      const plantingEnd = toDate(p.harvestEnd).getTime();

      // For same-day windows/plantings (start == end), use exact match
      const windowIsSameDay = windowStart === windowEnd;
      const plantingIsSameDay = plantingStart === plantingEnd;

      if (windowIsSameDay && plantingIsSameDay) {
        return windowStart === plantingStart;
      } else if (windowIsSameDay) {
        return windowStart >= plantingStart && windowStart <= plantingEnd;
      } else if (plantingIsSameDay) {
        return plantingStart >= windowStart && plantingStart <= windowEnd;
      } else {
        return windowStart < plantingEnd && plantingStart < windowEnd;
      }
    });
  };

  // Track the previous window's harvest end to chain non-overlapping windows.
  // Each window's harvest should start when the previous one ends.
  let previousWindowHarvestEnd: string | null = null;

  while (iterations < maxIterations && currentSowDate <= latestSowDate) {
    const plantingDates = calculatePlantingDates(
      currentSowDate,
      cultivar,
      frostWindow,
      method,
      climate
    );

    // Check temperature viability
    const outdoorStartDate = plantingDates.transplantDate ?? currentSowDate;
    const tempCheck = isGrowingPeriodViable(
      outdoorStartDate,
      plantingDates.harvestStart,
      cultivar,
      climate
    );

    // Check that harvest starts after the reference date
    const harvestStartsAfter = plantingDates.harvestStart >= afterHarvestEnd;

    // Check that harvest starts at or after the previous window's harvest end
    // (succession windows should not have overlapping harvest periods)
    const harvestAfterPrevious = !previousWindowHarvestEnd ||
      plantingDates.harvestStart >= previousWindowHarvestEnd;

    // Check for overlap with existing plantings
    const hasOverlap = overlapsExistingPlanting(
      plantingDates.harvestStart,
      plantingDates.harvestEnd
    );

    if (tempCheck.viable && harvestStartsAfter && harvestAfterPrevious && !hasOverlap) {
      availableWindows.push({
        sowDate: currentSowDate,
        transplantDate: plantingDates.transplantDate,
        harvestStart: plantingDates.harvestStart,
        harvestEnd: plantingDates.harvestEnd,
        method,
        successionNumber: successionNumber++,
      });

      previousWindowHarvestEnd = plantingDates.harvestEnd;

      // Jump to the sow date targeting harvest start = this window's harvest end.
      // This chains windows for continuous harvest coverage, matching the logic
      // in calculateSuccessionWindows.
      const nextSowDate = calculateNextSowDateForContinuousHarvest(
        plantingDates.harvestEnd,
        cultivar,
        method
      );

      // If the next sow date doesn't advance, we've exhausted viable windows
      if (nextSowDate <= currentSowDate) {
        break;
      }

      currentSowDate = nextSowDate;
      iterations++;
      continue;
    }

    // Not viable — advance by 1 day to find the exact first viable date
    currentSowDate = addDays(currentSowDate, 1);
    iterations++;
  }

  return availableWindows;
}

export type MethodChangeResult =
  | { viable: true; updates: Partial<Planting> }
  | { viable: false; reason: string };

/**
 * Recalculate planting dates when switching between direct sow and transplant methods.
 *
 * When switching Direct → Transplant:
 * - Preserve outdoor timing: old sowDate becomes new transplantDate
 * - Calculate indoor sowDate backwards: transplantDate - indoorLeadWeeksMin weeks
 * - Recalculate harvestStart based on maturityBasis
 * - Recalculate harvestEnd based on duration/frost
 *
 * When switching Transplant → Direct:
 * - Use transplantDate as new sowDate
 * - Remove transplantDate
 * - Recalculate harvestStart = sowDate + maturityDays
 * - Recalculate harvestEnd
 *
 * Returns { viable: false, reason } if the converted dates are not temperature-viable,
 * so the caller can show a notice instead of silently changing to a different date.
 */
export function recalculatePlantingForMethodChange(
  planting: Planting,
  newMethod: 'direct' | 'transplant',
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate?: Climate,
  previousHarvestEnd?: string
): MethodChangeResult {
  const leadWeeks = ensureNumber(cultivar.indoorLeadWeeksMin, 4);
  let newSowDate: string;
  let transplantDate: string | undefined;
  let harvestStart: string;

  if (planting.method === 'direct' && newMethod === 'transplant') {
    // Direct → Transplant: preserve outdoor timing
    // The old sowDate (outdoor planting day) becomes the new transplantDate
    // Calculate indoor sowDate backwards from that
    transplantDate = planting.sowDate;
    newSowDate = addDays(planting.sowDate, -leadWeeks * 7);
    if (cultivar.maturityBasis === 'from_transplant') {
      harvestStart = addDays(transplantDate, cultivar.maturityDays);
    } else {
      harvestStart = addDays(newSowDate, cultivar.maturityDays);
    }
  } else if (planting.method === 'transplant' && newMethod === 'direct') {
    // Transplant → Direct: use transplant date as new sow date
    newSowDate = planting.transplantDate ?? planting.sowDate;
    transplantDate = undefined;
    harvestStart = addDays(newSowDate, cultivar.maturityDays);
  } else {
    // Same method or fallback
    newSowDate = planting.sowDate;
    if (newMethod === 'transplant') {
      transplantDate = addDays(newSowDate, leadWeeks * 7);
      if (cultivar.maturityBasis === 'from_transplant') {
        harvestStart = addDays(transplantDate, cultivar.maturityDays);
      } else {
        harvestStart = addDays(newSowDate, cultivar.maturityDays);
      }
    } else {
      transplantDate = undefined;
      harvestStart = addDays(newSowDate, cultivar.maturityDays);
    }
  }

  // Calculate harvest end
  const year = new Date(`${frostWindow.firstFallFrost}T00:00:00Z`).getUTCFullYear();
  const earliestFallFrost = climate?.firstFallFrost?.earliest
    ? `${year}-${climate.firstFallFrost.earliest}`
    : frostWindow.firstFallFrost;
  const typicalFallFrost = climate?.firstFallFrost?.typical
    ? `${year}-${climate.firstFallFrost.typical}`
    : frostWindow.firstFallFrost;

  const frostDeadline = cultivar.frostSensitive
    ? addDays(earliestFallFrost, -FROST_BUFFER_DAYS)
    : addDays(typicalFallFrost, 21);

  let harvestEnd: string;
  if (cultivar.harvestDurationDays != null) {
    const durationEnd = addDays(harvestStart, cultivar.harvestDurationDays);
    harvestEnd = durationEnd > frostDeadline ? frostDeadline : durationEnd;
  } else if (cultivar.harvestStyle === 'continuous') {
    harvestEnd = frostDeadline;
  } else {
    // Single harvest with no explicit duration: use style-based default
    const defaultDuration = 7;
    harvestEnd = addDays(harvestStart, defaultDuration);
  }

  // Check if the new dates are temperature-viable
  const outdoorStart = transplantDate ?? newSowDate;

  if (climate) {
    const tempCheck = isGrowingPeriodViable(outdoorStart, harvestStart, cultivar, climate);

    if (!tempCheck.viable) {
      return {
        viable: false,
        reason: tempCheck.reason ?? 'Temperature outside viable range for this method',
      };
    }
  }

  return {
    viable: true,
    updates: {
      sowDate: newSowDate,
      sowDateOverride: undefined, // Clear override since timing context changed
      transplantDate,
      harvestStart,
      harvestEnd,
    },
  };
}
