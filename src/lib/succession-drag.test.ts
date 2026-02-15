import { describe, it, expect } from 'vitest';
import {
  calculateSuccessionWindows,
  calculateNextSuccession,
  calculateAvailableWindowsAfter,
  renumberPlantingsForCrop,
} from './succession';
import type { Cultivar, Planting } from './types';
import {
  sussexClimate,
  defaultFrostWindow,
  spinachCultivar,
  bushBeansCultivar,
  lettuceCultivar,
  beetCultivar,
  addDays,
  daysBetween,
} from './succession.test-fixtures';

// ============================================
// Drag-Related Edge Case Tests
// ============================================

describe('drag-related edge cases', () => {
  describe('harvest overlap prevention', () => {
    it('calculateNextSuccession prevents overlapping with existing plantings', () => {
      // Create a planting that was manually dragged to a later date
      const manuallyAdjustedPlanting: Planting = {
        id: 'p1',
        cultivarId: lettuceCultivar.id,
        label: 'Lettuce #1',
        quantity: 10,
        sowDate: '2025-04-15', // Dragged later than original
        harvestStart: '2025-06-04',
        harvestEnd: '2025-06-18',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const result = calculateNextSuccession(
        lettuceCultivar,
        defaultFrostWindow,
        sussexClimate,
        [manuallyAdjustedPlanting]
      );

      // Next window should not overlap with existing planting
      if (result) {
        const resultStart = new Date(`${result.harvestStart}T00:00:00Z`).getTime();
        const existingEnd = new Date('2025-06-18T00:00:00Z').getTime();
        // Result harvest should start at or after existing harvest end
        expect(resultStart >= existingEnd || result.harvestEnd <= '2025-06-04').toBe(true);
      }
    });

    it('handles multiple existing plantings with gaps', () => {
      // Create plantings with a gap between them
      const plantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: lettuceCultivar.id,
          label: 'Lettuce #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-21',
          harvestEnd: '2025-06-04',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
        {
          id: 'p2',
          cultivarId: lettuceCultivar.id,
          label: 'Lettuce #2',
          quantity: 10,
          sowDate: '2025-09-02', // Fall planting - gap in summer
          harvestStart: '2025-10-22',
          harvestEnd: '2025-11-05',
          method: 'direct',
          status: 'planned',
          successionNumber: 2,
          createdAt: '2025-01-01',
        },
      ];

      const result = calculateAvailableWindowsAfter(
        lettuceCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-06-04',
        plantings
      );

      // Should find windows between the two plantings (if temperature allows)
      // and not overlap with the fall planting
      result.forEach((w) => {
        const windowStart = new Date(`${w.harvestStart}T00:00:00Z`).getTime();
        const windowEnd = new Date(`${w.harvestEnd}T00:00:00Z`).getTime();
        const fallStart = new Date('2025-10-22T00:00:00Z').getTime();
        const fallEnd = new Date('2025-11-05T00:00:00Z').getTime();

        const overlaps = windowStart < fallEnd && fallStart < windowEnd;
        expect(overlaps).toBe(false);
      });
    });
  });

  describe('frost deadline truncation for late-season plantings', () => {
    it('truncates harvest end to frost deadline for last viable window', () => {
      // Get windows late in the season for frost-sensitive crop
      const result = calculateAvailableWindowsAfter(
        bushBeansCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-08-15',
        []
      );

      // All harvest ends should be at or before frost deadline (Sept 11)
      result.forEach((w) => {
        expect(w.harvestEnd <= '2025-09-11').toBe(true);
      });
    });

    it('may produce single-day harvest windows near frost deadline', () => {
      // For crops sown very late, harvestEnd might equal harvestStart
      // This is a valid edge case when frost deadline falls during harvest window
      const lateSeason = calculateAvailableWindowsAfter(
        bushBeansCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-09-01',
        []
      );

      // If there are any windows, check that single-day harvests are handled
      lateSeason.forEach((w) => {
        // harvestEnd should be >= harvestStart
        expect(w.harvestEnd >= w.harvestStart).toBe(true);
      });
    });
  });

  describe('first planting constraints (no previousHarvestEnd)', () => {
    it('allows first planting from season start', () => {
      const result = calculateAvailableWindowsAfter(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-03-01', // Very early - before typical season
        []
      );

      expect(result.length).toBeGreaterThan(0);
      // First window should start from earliest viable date
    });

    it('respects temperature constraints even for first planting', () => {
      // Frost-sensitive crop (bush beans) should not have windows where
      // growing period is too cold (avg temp < minGrowingTempC of 15°C)
      // April avg temp is 6°C, May is 12°C - both too cold
      // June avg temp is 17°C - viable
      const result = calculateAvailableWindowsAfter(
        bushBeansCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-03-01',
        []
      );

      if (result.length > 0) {
        // First window should be in June when temps are warm enough
        // (June avg temp 17°C >= min 15°C)
        const firstSowMonth = parseInt(result[0].sowDate.slice(5, 7));
        expect(firstSowMonth).toBeGreaterThanOrEqual(6);
      }
    });
  });

  describe('temperature range jumping (spring to fall)', () => {
    it('finds both spring and fall ranges for heat-sensitive crops', () => {
      const allWindows = calculateSuccessionWindows(
        lettuceCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      const springWindows = allWindows.windows.filter(
        (w) => w.sowDate.startsWith('2025-04') || w.sowDate.startsWith('2025-05')
      );
      // With interpolation, fall windows start in late August when heat clears
      const fallWindows = allWindows.windows.filter(
        (w) =>
          w.sowDate.startsWith('2025-08') ||
          w.sowDate.startsWith('2025-09') ||
          w.sowDate.startsWith('2025-10')
      );

      expect(springWindows.length).toBeGreaterThan(0);
      expect(fallWindows.length).toBeGreaterThan(0);
    });

    it('correctly skips summer for heat-sensitive crops', () => {
      const result = calculateAvailableWindowsAfter(
        spinachCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-06-15', // After spring season
        []
      );

      // Should jump to fall, not include summer
      result.forEach((w) => {
        // Sow dates should be either before summer heat or after it
        const inSummer = w.sowDate >= '2025-06-01' && w.sowDate <= '2025-08-20';
        expect(inSummer).toBe(false);
      });
    });

    it('provides continuous windows within viable temperature ranges', () => {
      const result = calculateSuccessionWindows(
        lettuceCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Within spring, windows should be roughly contiguous
      const springWindows = result.windows.filter((w) =>
        w.sowDate.startsWith('2025-04') || w.sowDate.startsWith('2025-05')
      );

      for (let i = 1; i < springWindows.length; i++) {
        const prev = springWindows[i - 1];
        const curr = springWindows[i];

        // Current harvest should start around when previous ends
        const prevEnd = new Date(`${prev.harvestEnd}T00:00:00Z`).getTime();
        const currStart = new Date(`${curr.harvestStart}T00:00:00Z`).getTime();
        const gapDays = (currStart - prevEnd) / (1000 * 60 * 60 * 24);

        // Gap should be minimal within same temperature range
        expect(gapDays).toBeLessThanOrEqual(7);
      }
    });
  });

  describe('large temperature gaps (90+ days)', () => {
    it('handles large gap between spring and fall viable periods', () => {
      // Spinach has a large gap - spring viable (April-May), summer too hot, fall viable (Sept+)
      const result = calculateSuccessionWindows(
        spinachCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Should have skipped periods covering the summer
      expect(result.skippedPeriods.length).toBeGreaterThan(0);

      // Find the gap duration
      const summerGap = result.skippedPeriods.find(
        (p) => p.startDate >= '2025-05-01' && p.endDate <= '2025-10-01'
      );

      if (summerGap) {
        const gapDays = Math.round(
          (new Date(`${summerGap.endDate}T00:00:00Z`).getTime() -
            new Date(`${summerGap.startDate}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        // Gap should be substantial (at least a month)
        expect(gapDays).toBeGreaterThan(30);
      }
    });
  });
});

// ============================================
// preferredMethod Tests
// ============================================

describe('preferredMethod support', () => {
  it('uses preferredMethod when sowMethod is "either"', () => {
    const eitherWithPreference: Cultivar = {
      ...beetCultivar,
      id: 'either-prefer-transplant',
      sowMethod: 'either',
      preferredMethod: 'transplant',
      indoorLeadWeeksMin: 4,
      indoorLeadWeeksMax: 6,
      transplantAfterLsfDays: -7,
    };

    const result = calculateSuccessionWindows(
      eitherWithPreference,
      defaultFrostWindow,
      sussexClimate
    );

    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0].method).toBe('transplant');
    expect(result.windows[0].transplantDate).toBeDefined();
  });

  it('defaults to direct when preferredMethod is not set', () => {
    const eitherNoPreference: Cultivar = {
      ...beetCultivar,
      id: 'either-no-pref',
      sowMethod: 'either',
      // No preferredMethod set
    };

    const result = calculateSuccessionWindows(
      eitherNoPreference,
      defaultFrostWindow,
      sussexClimate
    );

    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0].method).toBe('direct');
    expect(result.windows[0].transplantDate).toBeUndefined();
  });

  it('uses preferredMethod in calculateNextSuccession', () => {
    const eitherWithPreference: Cultivar = {
      ...beetCultivar,
      id: 'either-prefer-transplant',
      sowMethod: 'either',
      preferredMethod: 'transplant',
      indoorLeadWeeksMin: 4,
      indoorLeadWeeksMax: 6,
      transplantAfterLsfDays: -7,
    };

    const result = calculateNextSuccession(
      eitherWithPreference,
      defaultFrostWindow,
      sussexClimate,
      []
    );

    expect(result).not.toBeNull();
    expect(result?.method).toBe('transplant');
  });

  it('uses preferredMethod in calculateAvailableWindowsAfter', () => {
    const eitherWithPreference: Cultivar = {
      ...beetCultivar,
      id: 'either-prefer-transplant',
      sowMethod: 'either',
      preferredMethod: 'transplant',
      indoorLeadWeeksMin: 4,
      indoorLeadWeeksMax: 6,
      transplantAfterLsfDays: -7,
    };

    const result = calculateAvailableWindowsAfter(
      eitherWithPreference,
      defaultFrostWindow,
      sussexClimate,
      '2025-06-01',
      []
    );

    expect(result.length).toBeGreaterThan(0);
    result.forEach((w) => {
      expect(w.method).toBe('transplant');
    });
  });
});

// ============================================
// Planting Shift Tests (Drag-to-Reschedule)
// ============================================

describe('planting shift calculations', () => {
  // These tests verify the date calculations used when dragging
  // plantings to new dates. A bug in this logic would cause
  // plantings to snap back to their original position.

  describe('direct sow shift', () => {
    it('shifts all dates by the same number of days', () => {
      const planting: Planting = {
        id: 'p1',
        cultivarId: beetCultivar.id,
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-26',
        harvestEnd: '2025-06-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const shiftDays = 7;
      const newSowDate = addDays(planting.sowDate, shiftDays);
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);
      const newHarvestEnd = addDays(planting.harvestEnd, shiftDays);

      expect(newSowDate).toBe('2025-04-08');
      expect(newHarvestStart).toBe('2025-06-02');
      expect(newHarvestEnd).toBe('2025-06-09');
    });

    it('maintains relative dates when shifting backward', () => {
      const planting: Planting = {
        id: 'p1',
        cultivarId: beetCultivar.id,
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-04-15',
        harvestStart: '2025-06-09',
        harvestEnd: '2025-06-16',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const shiftDays = -7;
      const newSowDate = addDays(planting.sowDate, shiftDays);
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);
      const newHarvestEnd = addDays(planting.harvestEnd, shiftDays);

      expect(newSowDate).toBe('2025-04-08');
      expect(newHarvestStart).toBe('2025-06-02');
      expect(newHarvestEnd).toBe('2025-06-09');
    });

    it('preserves maturity period (harvestStart - sowDate) when shifting', () => {
      const planting: Planting = {
        id: 'p1',
        cultivarId: beetCultivar.id,
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-26', // 55 days after sow
        harvestEnd: '2025-06-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const originalMaturityDays = daysBetween(planting.sowDate, planting.harvestStart);
      expect(originalMaturityDays).toBe(55);

      const shiftDays = 14;
      const newSowDate = addDays(planting.sowDate, shiftDays);
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);

      const shiftedMaturityDays = daysBetween(newSowDate, newHarvestStart);
      expect(shiftedMaturityDays).toBe(55);
    });
  });

  describe('transplant shift for "either" crops', () => {
    it('shifts sow date, transplant date, and harvest dates together', () => {
      const planting: Planting = {
        id: 'p1',
        cultivarId: 'spinach-either',
        label: 'Spinach #1',
        quantity: 10,
        sowDate: '2025-04-01',
        transplantDate: '2025-04-22', // 21 days after sow
        harvestStart: '2025-05-16',
        harvestEnd: '2025-06-06',
        method: 'transplant',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const shiftDays = 7;
      const newSowDate = addDays(planting.sowDate, shiftDays);
      const newTransplantDate = planting.transplantDate
        ? addDays(planting.transplantDate, shiftDays)
        : undefined;
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);
      const newHarvestEnd = addDays(planting.harvestEnd, shiftDays);

      expect(newSowDate).toBe('2025-04-08');
      expect(newTransplantDate).toBe('2025-04-29');
      expect(newHarvestStart).toBe('2025-05-23');
      expect(newHarvestEnd).toBe('2025-06-13');

      // Verify lead weeks preserved
      const originalLeadDays = daysBetween(planting.sowDate, planting.transplantDate!);
      const shiftedLeadDays = daysBetween(newSowDate, newTransplantDate!);
      expect(shiftedLeadDays).toBe(originalLeadDays);
    });
  });

  describe('shift with frost deadline capping', () => {
    it('caps harvest end at frost deadline for frost-sensitive crops', () => {
      // Late-season planting for frost-sensitive bush beans
      const planting: Planting = {
        id: 'p1',
        cultivarId: bushBeansCultivar.id,
        label: 'Bush Beans #1',
        quantity: 10,
        sowDate: '2025-07-10',
        harvestStart: '2025-08-29',
        harvestEnd: '2025-09-11', // Already at frost deadline
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      // Shift 7 days later
      const shiftDays = 7;
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);
      let newHarvestEnd = addDays(planting.harvestEnd, shiftDays);

      // Frost deadline for frost-sensitive: Sept 15 - 4 days = Sept 11
      const frostDeadline = '2025-09-11';

      // Cap at frost deadline
      if (newHarvestEnd > frostDeadline) {
        newHarvestEnd = frostDeadline;
      }

      expect(newHarvestStart).toBe('2025-09-05');
      expect(newHarvestEnd).toBe('2025-09-11'); // Capped at frost deadline
    });

    it('recalculates harvest end with duration when shifting', () => {
      const planting: Planting = {
        id: 'p1',
        cultivarId: beetCultivar.id, // harvestDurationDays: 7
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-08-01',
        harvestStart: '2025-09-25',
        harvestEnd: '2025-10-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const shiftDays = 14;
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);

      // For crops with explicit harvestDurationDays, recalculate from harvestStart
      const harvestDuration = beetCultivar.harvestDurationDays!;
      const durationEnd = addDays(newHarvestStart, harvestDuration);

      // Frost-tolerant crops extend to Oct 22 (Oct 1 + 21 days)
      const frostDeadline = '2025-10-22';
      const newHarvestEnd = durationEnd > frostDeadline ? frostDeadline : durationEnd;

      expect(newHarvestStart).toBe('2025-10-09');
      expect(newHarvestEnd).toBe('2025-10-16'); // 7 days after start
    });
  });

  describe('shift maintains data integrity', () => {
    it('shift of 0 days results in identical dates', () => {
      const planting: Planting = {
        id: 'p1',
        cultivarId: beetCultivar.id,
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-26',
        harvestEnd: '2025-06-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const shiftDays = 0;
      const newSowDate = addDays(planting.sowDate, shiftDays);
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);
      const newHarvestEnd = addDays(planting.harvestEnd, shiftDays);

      expect(newSowDate).toBe(planting.sowDate);
      expect(newHarvestStart).toBe(planting.harvestStart);
      expect(newHarvestEnd).toBe(planting.harvestEnd);
    });

    it('shifted planting still satisfies original cultivar maturity', () => {
      const planting: Planting = {
        id: 'p1',
        cultivarId: beetCultivar.id, // maturityDays: 55
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-26',
        harvestEnd: '2025-06-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const shiftDays = 21;
      const newSowDate = addDays(planting.sowDate, shiftDays);
      const newHarvestStart = addDays(planting.harvestStart, shiftDays);

      const maturityPeriod = daysBetween(newSowDate, newHarvestStart);

      // Maturity period should still match cultivar
      expect(maturityPeriod).toBe(beetCultivar.maturityDays);
    });
  });
});

// ============================================
// Integration Tests: Full Drag-to-Reschedule Flow
// ============================================

describe('drag-to-reschedule integration', () => {
  // These tests simulate the complete flow from drag to persisted state,
  // matching the actual code path in PlantingCard.handleShiftPlanting
  // and usePlantings.updateAndRenumber

  /**
   * Simulates PlantingCard.handleShiftPlanting
   * This is a pure function version of the handler in PlantingCard.tsx
   */
  function simulateShiftPlanting(
    planting: Planting,
    shiftDays: number,
    cultivar: Cultivar,
    frostDeadline: string
  ): Partial<Planting> {
    const newSowDate = addDays(planting.sowDate, shiftDays);
    const newHarvestStart = addDays(planting.harvestStart, shiftDays);
    let newHarvestEnd = addDays(planting.harvestEnd, shiftDays);

    const newTransplantDate = planting.transplantDate
      ? addDays(planting.transplantDate, shiftDays)
      : undefined;

    // Recalculate harvest end (matches PlantingCard logic)
    if (cultivar.harvestDurationDays != null) {
      const durationEnd = addDays(newHarvestStart, cultivar.harvestDurationDays);
      newHarvestEnd = durationEnd > frostDeadline ? frostDeadline : durationEnd;
    } else if (cultivar.harvestStyle === 'continuous') {
      newHarvestEnd = frostDeadline;
    } else {
      if (newHarvestEnd > frostDeadline) {
        newHarvestEnd = frostDeadline;
      }
    }

    return {
      sowDate: newSowDate,
      transplantDate: newTransplantDate,
      harvestStart: newHarvestStart,
      harvestEnd: newHarvestEnd,
    };
  }

  /**
   * Simulates usePlantings.updateAndRenumber
   * This is a pure function version of the hook method
   */
  function simulateUpdateAndRenumber(
    allPlantings: Planting[],
    id: string,
    updates: Partial<Planting>,
    cropName: string,
    cultivarId: string
  ): Planting[] {
    // Apply update first
    const updated = allPlantings.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    // Then renumber
    return renumberPlantingsForCrop(updated, cropName, cultivarId);
  }

  /**
   * Simulates the full flow: drag → shift → update → renumber → save
   */
  function simulateFullDragFlow(
    allPlantings: Planting[],
    plantingId: string,
    shiftDays: number,
    cultivar: Cultivar,
    frostDeadline: string
  ): Planting[] {
    const planting = allPlantings.find((p) => p.id === plantingId);
    if (!planting) throw new Error(`Planting ${plantingId} not found`);

    // Step 1: Calculate new dates (PlantingCard.handleShiftPlanting)
    const updates = simulateShiftPlanting(planting, shiftDays, cultivar, frostDeadline);

    // Step 2: Apply update and renumber (usePlantings.updateAndRenumber)
    return simulateUpdateAndRenumber(
      allPlantings,
      plantingId,
      updates,
      cultivar.crop,
      cultivar.id
    );
  }

  // Frost deadline for beet (frost-tolerant): Oct 1 + 21 days = Oct 22
  const beetFrostDeadline = '2025-10-22';

  describe('single planting drag', () => {
    it('successfully shifts a planting forward by 7 days', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
      ];

      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        7, // shift 7 days later
        beetCultivar,
        beetFrostDeadline
      );

      expect(result).toHaveLength(1);
      expect(result[0].sowDate).toBe('2025-04-08');
      expect(result[0].harvestStart).toBe('2025-06-02');
      expect(result[0].harvestEnd).toBe('2025-06-09');
      expect(result[0].successionNumber).toBe(1);
      expect(result[0].label).toBe('Beet #1');
    });

    it('successfully shifts a planting backward by 7 days', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-15',
          harvestStart: '2025-06-09',
          harvestEnd: '2025-06-16',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
      ];

      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        -7, // shift 7 days earlier
        beetCultivar,
        beetFrostDeadline
      );

      expect(result).toHaveLength(1);
      expect(result[0].sowDate).toBe('2025-04-08');
      expect(result[0].harvestStart).toBe('2025-06-02');
      expect(result[0].harvestEnd).toBe('2025-06-09');
    });

    it('preserves planting id and other metadata after shift', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'original-id-123',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 25,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01T12:00:00Z',
          notes: 'Test notes',
        },
      ];

      const result = simulateFullDragFlow(
        initialPlantings,
        'original-id-123',
        14,
        beetCultivar,
        beetFrostDeadline
      );

      expect(result[0].id).toBe('original-id-123');
      expect(result[0].quantity).toBe(25);
      expect(result[0].createdAt).toBe('2025-01-01T12:00:00Z');
      expect(result[0].notes).toBe('Test notes');
      expect(result[0].status).toBe('planned');
    });
  });

  describe('multiple plantings with reordering', () => {
    it('reorders succession numbers when planting is dragged past another', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
        {
          id: 'p2',
          cultivarId: beetCultivar.id,
          label: 'Beet #2',
          quantity: 10,
          sowDate: '2025-04-15',
          harvestStart: '2025-06-09',
          harvestEnd: '2025-06-16',
          method: 'direct',
          status: 'planned',
          successionNumber: 2,
          createdAt: '2025-01-02',
        },
      ];

      // Drag p1 from April 1 to April 22 (past p2)
      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        21, // shift 21 days later (April 1 → April 22)
        beetCultivar,
        beetFrostDeadline
      );

      // p2 should now be #1 (earlier sow date)
      const p2 = result.find((p) => p.id === 'p2');
      expect(p2?.successionNumber).toBe(1);
      expect(p2?.label).toBe('Beet #1');
      expect(p2?.sowDate).toBe('2025-04-15'); // Unchanged

      // p1 should now be #2 (later sow date)
      const p1 = result.find((p) => p.id === 'p1');
      expect(p1?.successionNumber).toBe(2);
      expect(p1?.label).toBe('Beet #2');
      expect(p1?.sowDate).toBe('2025-04-22'); // Shifted
    });

    it('handles dragging middle planting to end position', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
        {
          id: 'p2',
          cultivarId: beetCultivar.id,
          label: 'Beet #2',
          quantity: 10,
          sowDate: '2025-04-08',
          harvestStart: '2025-06-02',
          harvestEnd: '2025-06-09',
          method: 'direct',
          status: 'planned',
          successionNumber: 2,
          createdAt: '2025-01-02',
        },
        {
          id: 'p3',
          cultivarId: beetCultivar.id,
          label: 'Beet #3',
          quantity: 10,
          sowDate: '2025-04-15',
          harvestStart: '2025-06-09',
          harvestEnd: '2025-06-16',
          method: 'direct',
          status: 'planned',
          successionNumber: 3,
          createdAt: '2025-01-03',
        },
      ];

      // Drag p2 from April 8 to May 1 (past p3)
      const result = simulateFullDragFlow(
        initialPlantings,
        'p2',
        23, // shift 23 days (April 8 → May 1)
        beetCultivar,
        beetFrostDeadline
      );

      // Verify new order: p1, p3, p2
      const sorted = [...result].sort((a, b) => a.sowDate.localeCompare(b.sowDate));

      expect(sorted[0].id).toBe('p1');
      expect(sorted[0].successionNumber).toBe(1);
      expect(sorted[0].sowDate).toBe('2025-04-01');

      expect(sorted[1].id).toBe('p3');
      expect(sorted[1].successionNumber).toBe(2);
      expect(sorted[1].sowDate).toBe('2025-04-15');

      expect(sorted[2].id).toBe('p2');
      expect(sorted[2].successionNumber).toBe(3);
      expect(sorted[2].sowDate).toBe('2025-05-01');
    });

    it('does not affect plantings of other cultivars', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'beet1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
        {
          id: 'carrot1',
          cultivarId: 'carrot-test',
          label: 'Carrot #1',
          quantity: 20,
          sowDate: '2025-04-10',
          harvestStart: '2025-07-10',
          harvestEnd: '2025-07-17',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-05',
        },
      ];

      const result = simulateFullDragFlow(
        initialPlantings,
        'beet1',
        14,
        beetCultivar,
        beetFrostDeadline
      );

      // Carrot should be completely unchanged
      const carrot = result.find((p) => p.id === 'carrot1');
      expect(carrot?.sowDate).toBe('2025-04-10');
      expect(carrot?.harvestStart).toBe('2025-07-10');
      expect(carrot?.harvestEnd).toBe('2025-07-17');
      expect(carrot?.successionNumber).toBe(1);
      expect(carrot?.label).toBe('Carrot #1');
    });
  });

  describe('frost deadline handling during drag', () => {
    it('caps harvest end at frost deadline when shifting late in season', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-08-15',
          harvestStart: '2025-10-09',
          harvestEnd: '2025-10-16',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
      ];

      // Shift 14 days later - would push harvest end past frost deadline
      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        14,
        beetCultivar,
        beetFrostDeadline // Oct 22
      );

      expect(result[0].sowDate).toBe('2025-08-29');
      expect(result[0].harvestStart).toBe('2025-10-23');
      // harvestEnd should be capped at frost deadline, not 10-30
      expect(result[0].harvestEnd).toBe('2025-10-22');
    });

    it('uses full duration when not near frost deadline', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id, // harvestDurationDays: 7
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
      ];

      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        7,
        beetCultivar,
        beetFrostDeadline
      );

      // Full 7-day harvest duration should be preserved
      const harvestDays = daysBetween(result[0].harvestStart, result[0].harvestEnd);
      expect(harvestDays).toBe(7);
    });
  });

  describe('transplant planting shifts', () => {
    // Cultivar that supports both methods
    const eitherCultivar: Cultivar = {
      id: 'spinach-either',
      crop: 'Spinach',
      variety: 'Test',
      germDaysMin: 5,
      germDaysMax: 10,
      maturityDays: 45,
      maturityBasis: 'from_sow',
      sowMethod: 'either',
      preferredMethod: 'direct',
      directAfterLsfDays: -28,
      transplantAfterLsfDays: -14,
      indoorLeadWeeksMin: 3,
      indoorLeadWeeksMax: 4,
      frostSensitive: false,
      maxGrowingTempC: 21,
      harvestDurationDays: 21,
      harvestStyle: 'continuous',
    };

    it('shifts transplant date along with sow date', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: eitherCultivar.id,
          label: 'Spinach #1',
          quantity: 10,
          sowDate: '2025-04-01',
          transplantDate: '2025-04-22',
          harvestStart: '2025-05-16',
          harvestEnd: '2025-06-06',
          method: 'transplant',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
      ];

      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        7,
        eitherCultivar,
        beetFrostDeadline
      );

      expect(result[0].sowDate).toBe('2025-04-08');
      expect(result[0].transplantDate).toBe('2025-04-29');
      expect(result[0].harvestStart).toBe('2025-05-23');

      // Lead time should be preserved
      const leadDays = daysBetween(result[0].sowDate, result[0].transplantDate!);
      expect(leadDays).toBe(21); // 3 weeks
    });
  });

  describe('edge cases', () => {
    it('handles shift of 0 days (no-op drag)', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
      ];

      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        0, // No shift
        beetCultivar,
        beetFrostDeadline
      );

      expect(result[0].sowDate).toBe('2025-04-01');
      expect(result[0].harvestStart).toBe('2025-05-26');
      expect(result[0].harvestEnd).toBe('2025-06-02');
    });

    it('handles large shift that spans multiple months', () => {
      const initialPlantings: Planting[] = [
        {
          id: 'p1',
          cultivarId: beetCultivar.id,
          label: 'Beet #1',
          quantity: 10,
          sowDate: '2025-04-01',
          harvestStart: '2025-05-26',
          harvestEnd: '2025-06-02',
          method: 'direct',
          status: 'planned',
          successionNumber: 1,
          createdAt: '2025-01-01',
        },
      ];

      // Shift 90 days (April 1 → June 30)
      const result = simulateFullDragFlow(
        initialPlantings,
        'p1',
        90,
        beetCultivar,
        beetFrostDeadline
      );

      expect(result[0].sowDate).toBe('2025-06-30');
      expect(result[0].harvestStart).toBe('2025-08-24');
      expect(result[0].harvestEnd).toBe('2025-08-31');
    });
  });
});

// ============================================
// renumberPlantingsForCrop after shift
// ============================================

describe('renumberPlantingsForCrop after shift', () => {
  // These tests verify that renumbering preserves shifted dates.
  // A bug where renumbering resets dates would cause "snap back" behavior.

  it('preserves shifted dates when renumbering after drag', () => {
    // Simulate: planting was at April 1, user drags to April 15
    const shiftedPlanting: Planting = {
      id: 'p1',
      cultivarId: 'beet',
      label: 'Beet #1',
      quantity: 10,
      sowDate: '2025-04-15', // SHIFTED from April 1
      harvestStart: '2025-06-09',
      harvestEnd: '2025-06-16',
      method: 'direct',
      status: 'planned',
      successionNumber: 1,
      createdAt: '2025-01-01',
    };

    const result = renumberPlantingsForCrop([shiftedPlanting], 'Beet', 'beet');

    // The shifted sow date should be preserved
    expect(result[0].sowDate).toBe('2025-04-15');
    expect(result[0].harvestStart).toBe('2025-06-09');
    expect(result[0].harvestEnd).toBe('2025-06-16');
  });

  it('correctly orders plantings after one is shifted past another', () => {
    // Two plantings: #1 at April 1, #2 at April 15
    // User drags #1 to April 22 (past #2)
    const plantings: Planting[] = [
      {
        id: 'p1',
        cultivarId: 'beet',
        label: 'Beet #1', // Was first, now should be second
        quantity: 10,
        sowDate: '2025-04-22', // SHIFTED from April 1 to after p2
        harvestStart: '2025-06-16',
        harvestEnd: '2025-06-23',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      },
      {
        id: 'p2',
        cultivarId: 'beet',
        label: 'Beet #2',
        quantity: 10,
        sowDate: '2025-04-15',
        harvestStart: '2025-06-09',
        harvestEnd: '2025-06-16',
        method: 'direct',
        status: 'planned',
        successionNumber: 2,
        createdAt: '2025-01-02',
      },
    ];

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet');

    // p2 should now be #1 (earlier sow date)
    const p2 = result.find((p) => p.id === 'p2');
    expect(p2?.successionNumber).toBe(1);
    expect(p2?.label).toBe('Beet #1');
    expect(p2?.sowDate).toBe('2025-04-15'); // Date preserved

    // p1 should now be #2 (later sow date after shift)
    const p1 = result.find((p) => p.id === 'p1');
    expect(p1?.successionNumber).toBe(2);
    expect(p1?.label).toBe('Beet #2');
    expect(p1?.sowDate).toBe('2025-04-22'); // Shifted date preserved
  });

  it('handles shift that moves planting to completely different position', () => {
    // Three plantings, user drags middle one to the end
    const plantings: Planting[] = [
      {
        id: 'p1',
        cultivarId: 'beet',
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-26',
        harvestEnd: '2025-06-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      },
      {
        id: 'p2',
        cultivarId: 'beet',
        label: 'Beet #2', // Was middle, shifted to end
        quantity: 10,
        sowDate: '2025-05-01', // SHIFTED from April 8 to May 1
        harvestStart: '2025-06-25',
        harvestEnd: '2025-07-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 2,
        createdAt: '2025-01-02',
      },
      {
        id: 'p3',
        cultivarId: 'beet',
        label: 'Beet #3',
        quantity: 10,
        sowDate: '2025-04-15',
        harvestStart: '2025-06-09',
        harvestEnd: '2025-06-16',
        method: 'direct',
        status: 'planned',
        successionNumber: 3,
        createdAt: '2025-01-03',
      },
    ];

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet');

    // Order should now be: p1, p3, p2 (by sow date)
    const sorted = result
      .filter((p) => p.cultivarId === 'beet')
      .sort((a, b) => a.sowDate.localeCompare(b.sowDate));

    expect(sorted[0].id).toBe('p1');
    expect(sorted[0].successionNumber).toBe(1);

    expect(sorted[1].id).toBe('p3');
    expect(sorted[1].successionNumber).toBe(2);

    expect(sorted[2].id).toBe('p2');
    expect(sorted[2].successionNumber).toBe(3);
    expect(sorted[2].sowDate).toBe('2025-05-01'); // Shifted date preserved
  });
});
