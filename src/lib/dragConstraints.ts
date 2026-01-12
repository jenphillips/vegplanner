import type { Cultivar, Climate, FrostWindow, Planting } from './types';
import { addDays } from './dateUtils';

export type ShiftBounds = {
  minShift: number; // Maximum days earlier (negative means can't go earlier)
  maxShift: number; // Maximum days later
};

export type ShiftBoundsInput = {
  planting: Planting;
  cultivar: Cultivar | undefined;
  frost: FrostWindow;
  climate?: Climate;
  previousHarvestEnd?: string;
  isTransplantMode: boolean; // true for transplant "either" crops, false for direct sow
};

/**
 * Calculate the bounds for how far a planting can be shifted earlier or later.
 *
 * Constraints applied:
 * 1. Can't shift earlier than previous planting's harvest end (succession continuity)
 * 2. Can't shift earlier than season start (March 1) for first plantings
 * 3. For frost-SENSITIVE crops only: can't shift earlier than frost-based limits
 *    - Transplant mode: transplant date >= lastSpringFrost + transplantAfterLsfDays
 *    - Direct sow mode: sow date >= lastSpringFrost + directAfterLsfDays
 * 4. Can't shift later than frost deadline minus maturity days
 */
export function calculateShiftBounds(input: ShiftBoundsInput): ShiftBounds {
  const { planting, cultivar, frost, climate, previousHarvestEnd, isTransplantMode } = input;

  const harvestStart = new Date(`${planting.harvestStart}T00:00:00Z`);
  const sowDate = new Date(`${planting.sowDate}T00:00:00Z`);
  const year = new Date(`${frost.lastSpringFrost}T00:00:00Z`).getUTCFullYear();

  // === Calculate maxShiftEarlier ===

  let maxShiftEarlier: number;
  if (previousHarvestEnd) {
    // Succession constraint: harvest start can go back to previous harvest end
    const prevEnd = new Date(`${previousHarvestEnd}T00:00:00Z`);
    maxShiftEarlier = Math.floor(
      (harvestStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24)
    );
  } else {
    // First planting: constrain to season start
    const seasonStart = new Date(`${year}-03-01T00:00:00Z`);
    maxShiftEarlier = Math.floor(
      (sowDate.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Apply frost-based constraints for frost-SENSITIVE crops only
  // Frost-tolerant crops (beets, gai lan, etc.) can be planted before last frost
  if (cultivar?.frostSensitive) {
    const lastFrost = new Date(`${frost.lastSpringFrost}T00:00:00Z`);

    if (isTransplantMode && planting.transplantDate) {
      // Transplant mode: constrain transplant date based on transplantAfterLsfDays
      const transplantAfterDays = cultivar.transplantAfterLsfDays ?? 0;
      const earliestTransplant = new Date(
        lastFrost.getTime() + transplantAfterDays * 24 * 60 * 60 * 1000
      );
      const currentTransplant = new Date(`${planting.transplantDate}T00:00:00Z`);
      const maxShiftForFrost = Math.floor(
        (currentTransplant.getTime() - earliestTransplant.getTime()) / (1000 * 60 * 60 * 24)
      );
      maxShiftEarlier = Math.min(maxShiftEarlier, maxShiftForFrost);
    } else {
      // Direct sow mode: constrain sow date based on directAfterLsfDays
      const directAfterDays = cultivar.directAfterLsfDays ?? 0;
      const earliestSow = new Date(
        lastFrost.getTime() + directAfterDays * 24 * 60 * 60 * 1000
      );
      const maxShiftForFrost = Math.floor(
        (sowDate.getTime() - earliestSow.getTime()) / (1000 * 60 * 60 * 24)
      );
      maxShiftEarlier = Math.min(maxShiftEarlier, maxShiftForFrost);
    }
  }

  // === Calculate maxShiftLater ===

  const FROST_BUFFER_DAYS = 4;
  let frostDeadline: Date;

  if (cultivar?.frostSensitive) {
    const earliestFrost = climate?.firstFallFrost?.earliest
      ? `${year}-${climate.firstFallFrost.earliest}`
      : frost.firstFallFrost;
    frostDeadline = new Date(`${addDays(earliestFrost, -FROST_BUFFER_DAYS)}T00:00:00Z`);
  } else {
    const typicalFrost = climate?.firstFallFrost?.typical
      ? `${year}-${climate.firstFallFrost.typical}`
      : frost.firstFallFrost;
    frostDeadline = new Date(`${addDays(typicalFrost, 21)}T00:00:00Z`);
  }

  const maturityDays = cultivar?.maturityDays ?? 60;
  const latestSowDate = new Date(
    frostDeadline.getTime() - maturityDays * 24 * 60 * 60 * 1000
  );
  const maxShiftLater = Math.floor(
    (latestSowDate.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    minShift: -maxShiftEarlier,
    maxShift: Math.max(0, maxShiftLater),
  };
}
