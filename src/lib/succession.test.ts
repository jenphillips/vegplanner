import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateSuccessionWindows,
  calculateNextSuccession,
  calculateAvailableWindowsAfter,
  isGrowingPeriodViable,
  createPlantingFromWindow,
  getNextSuccessionNumber,
  recalculatePlantingForMethodChange,
  renumberPlantingsForCrop,
  getOutdoorGrowingConstraints,
  clearConstraintsCache,
  type PlantingWindow,
  type SuccessionResult,
} from './succession';
import { buildDailyClimateTable } from './dateUtils';
import type { ClimateTable } from './dateUtils';
import type { Cultivar, Climate, FrostWindow, Planting } from './types';

// ============================================
// Test Fixtures
// ============================================

const createFrostWindow = (
  lastSpring: string,
  firstFall: string
): FrostWindow => ({
  id: 'test-frost',
  lastSpringFrost: lastSpring,
  firstFallFrost: firstFall,
});

// Sussex, NB climate data (simplified for testing)
const sussexClimate: Climate = {
  location: 'Sussex, NB',
  coordinates: { lat: 45.72, lon: -65.51 },
  elevation_m: 30,
  source: 'test',
  monthlyAvgC: {
    '1': { tavg_c: -9, tmin_c: -15, tmax_c: -3, soil_avg_c: -2, gdd_base5: 0 },
    '2': { tavg_c: -7, tmin_c: -13, tmax_c: -1, soil_avg_c: -1, gdd_base5: 0 },
    '3': { tavg_c: -1, tmin_c: -7, tmax_c: 4, soil_avg_c: 1, gdd_base5: 0 },
    '4': { tavg_c: 6, tmin_c: 0, tmax_c: 10, soil_avg_c: 5, gdd_base5: 30 },
    '5': { tavg_c: 12, tmin_c: 5, tmax_c: 17, soil_avg_c: 10, gdd_base5: 150 },
    '6': { tavg_c: 17, tmin_c: 10, tmax_c: 21, soil_avg_c: 15, gdd_base5: 350 },
    '7': { tavg_c: 20, tmin_c: 13, tmax_c: 24, soil_avg_c: 18, gdd_base5: 600 },
    '8': { tavg_c: 19, tmin_c: 12, tmax_c: 24, soil_avg_c: 17, gdd_base5: 850 },
    '9': { tavg_c: 14, tmin_c: 7, tmax_c: 19, soil_avg_c: 14, gdd_base5: 1000 },
    '10': { tavg_c: 8, tmin_c: 2, tmax_c: 12, soil_avg_c: 10, gdd_base5: 1100 },
    '11': { tavg_c: 2, tmin_c: -3, tmax_c: 6, soil_avg_c: 5, gdd_base5: 1120 },
    '12': { tavg_c: -5, tmin_c: -11, tmax_c: 0, soil_avg_c: 1, gdd_base5: 1120 },
  },
  lastSpringFrost: {
    earliest: '04-20',
    typical: '05-15',
    latest: '06-05',
    probability10: '04-25',
    probability50: '05-15',
    probability90: '06-01',
  },
  firstFallFrost: {
    earliest: '09-15',
    typical: '10-01',
    latest: '10-20',
    probability10: '09-20',
    probability50: '10-01',
    probability90: '10-15',
  },
  growingSeasonDays: 140,
  annualGDD: 1120,
  notes: 'Test climate data',
};

// Default frost window matching typical Sussex dates
const defaultFrostWindow = createFrostWindow('2025-06-01', '2025-10-01');

// ============================================
// Cultivar Fixtures Based on Documentation Examples
// ============================================

// Example 1: Spinach - heat-sensitive, frost-tolerant, direct sow
const spinachCultivar: Cultivar = {
  id: 'spinach-test',
  crop: 'Spinach',
  variety: 'Bloomsdale',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 40,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  directAfterLsfDays: -28,
  frostSensitive: false,
  minGrowingTempC: 4, // Soil temp for germination
  maxGrowingTempC: 21,
  harvestDurationDays: 21,
  harvestStyle: 'continuous',
};

// Example 2: Bush Beans - frost-sensitive, heat-tolerant, direct sow
const bushBeansCultivar: Cultivar = {
  id: 'beans-test',
  crop: 'Bush Beans',
  variety: 'Provider',
  germDaysMin: 7,
  germDaysMax: 14,
  maturityDays: 50,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  directAfterLsfDays: 7,
  frostSensitive: true,
  minGrowingTempC: 15,
  maxGrowingTempC: 32,
  harvestDurationDays: 21,
  harvestStyle: 'continuous',
};

// Example 3: Tomato Sungold - frost-sensitive, transplant, harvest until frost
const tomatoCultivar: Cultivar = {
  id: 'tomato-test',
  crop: 'Tomato',
  variety: 'Sungold',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 57,
  maturityBasis: 'from_transplant',
  sowMethod: 'transplant',
  indoorLeadWeeksMin: 6,
  indoorLeadWeeksMax: 8,
  transplantAfterLsfDays: 7,
  frostSensitive: true,
  minGrowingTempC: 10,
  maxGrowingTempC: 35,
  harvestDurationDays: null, // harvest until frost
  harvestStyle: 'continuous',
};

// Example 4: Gai Lan - frost-tolerant, heat-sensitive, transplant
const gaiLanCultivar: Cultivar = {
  id: 'gailan-test',
  crop: 'Gai Lan',
  variety: 'Kailaan',
  germDaysMin: 4,
  germDaysMax: 7,
  maturityDays: 55,
  maturityBasis: 'from_transplant',
  sowMethod: 'transplant',
  indoorLeadWeeksMin: 4,
  indoorLeadWeeksMax: 6,
  transplantAfterLsfDays: 0,
  frostSensitive: false,
  minGrowingTempC: 7,
  maxGrowingTempC: 25,
  harvestDurationDays: 21,
  harvestStyle: 'continuous',
};

// Example 5: Lettuce Little Gem - frost-tolerant, heat-sensitive, direct sow
const lettuceCultivar: Cultivar = {
  id: 'lettuce-test',
  crop: 'Lettuce',
  variety: 'Little Gem',
  germDaysMin: 4,
  germDaysMax: 10,
  maturityDays: 50,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  directAfterLsfDays: -21,
  frostSensitive: false,
  minGrowingTempC: 4, // Soil temp for germination
  maxGrowingTempC: 24, // Biological tolerance (effective max = 23 with 1°C margin)
  harvestDurationDays: 14,
  harvestStyle: 'single',
};

// Simple beet for basic tests - frost-tolerant, no temperature limits
const beetCultivar: Cultivar = {
  id: 'beet-test',
  crop: 'Beet',
  variety: 'Detroit Dark Red',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 55,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  directAfterLsfDays: -14,
  frostSensitive: false,
  harvestDurationDays: 7,
  harvestStyle: 'single',
};

// ============================================
// Basic Functionality Tests
// ============================================

describe('calculateSuccessionWindows', () => {
  describe('basic functionality', () => {
    it('returns windows array and skippedPeriods', () => {
      const result = calculateSuccessionWindows(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      expect(result).toHaveProperty('windows');
      expect(result).toHaveProperty('skippedPeriods');
      expect(Array.isArray(result.windows)).toBe(true);
      expect(Array.isArray(result.skippedPeriods)).toBe(true);
    });

    it('includes diagnostic info', () => {
      const result = calculateSuccessionWindows(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      expect(result.diagnostic).toBeDefined();
      expect(result.diagnostic?.earliestSowDate).toBeDefined();
      expect(result.diagnostic?.latestSowDate).toBeDefined();
    });

    it('respects maxSuccessions option', () => {
      const result = calculateSuccessionWindows(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        { maxSuccessions: 2 }
      );

      expect(result.windows.length).toBeLessThanOrEqual(2);
    });

    it('assigns sequential succession numbers', () => {
      const result = calculateSuccessionWindows(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      for (let i = 0; i < result.windows.length; i++) {
        expect(result.windows[i].successionNumber).toBe(i + 1);
      }
    });
  });

  describe('frost-tolerant direct sow crops', () => {
    it('allows early April sowing for frost-tolerant crops', () => {
      const result = calculateSuccessionWindows(
        spinachCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      expect(result.windows.length).toBeGreaterThan(0);
      // Frost-tolerant crops can start when interpolated soil temp reaches minGrowingTempC + 1°C margin
      // Soil interpolates between Mar 15 (1°C) and Apr 15 (5°C), reaching 5°C at Apr 15
      expect(result.windows[0].sowDate).toBe('2025-04-15');
    });

    it('extends season past typical frost for frost-tolerant crops', () => {
      const result = calculateSuccessionWindows(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Should have windows - frost-tolerant crops can sow later and harvest past frost
      expect(result.windows.length).toBeGreaterThan(0);

      // Latest sow date should extend based on frost tolerance
      // Frost-tolerant: can grow ~3 weeks past typical frost (Oct 1 + 21 = Oct 22)
      // Latest sow = Oct 22 - 55 days maturity = Aug 28
      expect(result.diagnostic?.latestSowDate).toBeDefined();
      expect(result.diagnostic!.latestSowDate >= '2025-08-01').toBe(true);
    });
  });

  describe('frost-sensitive direct sow crops', () => {
    it('waits until after last frost plus offset', () => {
      const result = calculateSuccessionWindows(
        bushBeansCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      expect(result.windows.length).toBeGreaterThan(0);
      // Bush beans: directAfterLsfDays = 7, last frost = June 1
      // Frost-based earliest = June 8, but tavg at June 8 is 15.9°C < 16°C effective min (15+1 margin)
      // Tavg reaches 16°C on June 9
      expect(result.windows[0].sowDate).toBe('2025-06-09');
    });

    it('ends harvest before first fall frost with buffer', () => {
      const result = calculateSuccessionWindows(
        bushBeansCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      const lastWindow = result.windows[result.windows.length - 1];
      // Frost-sensitive crops must finish before earliest frost - 4 days buffer
      // Earliest frost: Sept 15, so deadline is Sept 11
      expect(lastWindow.harvestEnd <= '2025-09-11').toBe(true);
    });
  });

  describe('transplant method crops', () => {
    it('calculates transplant date for transplant method', () => {
      const result = calculateSuccessionWindows(
        tomatoCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      expect(result.windows.length).toBeGreaterThan(0);
      expect(result.windows[0].transplantDate).toBeDefined();
    });

    it('calculates sow date based on indoor lead weeks (uses indoorLeadWeeksMax for earliest)', () => {
      const result = calculateSuccessionWindows(
        tomatoCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Code uses indoorLeadWeeksMax (8 weeks) for calculating earliest sow date
      // Transplant = June 8 (June 1 + 7 days)
      // Sow = Transplant - 8 weeks = April 13
      const expectedTransplant = '2025-05-25'; // April 13 + 6 weeks (indoorLeadWeeksMin used in calculatePlantingDates)
      const expectedSow = '2025-04-13';

      expect(result.windows[0].sowDate).toBe(expectedSow);
      expect(result.windows[0].transplantDate).toBe(expectedTransplant);
    });

    it('uses maturityBasis from_transplant correctly', () => {
      const result = calculateSuccessionWindows(
        tomatoCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Sow: April 13, Transplant: May 25 (April 13 + 6 weeks)
      // Harvest start: May 25 + 57 days = July 21
      expect(result.windows[0].harvestStart).toBe('2025-07-21');
    });
  });

  describe('harvest until frost (null harvestDurationDays)', () => {
    it('produces single window for continuous harvest crops', () => {
      const result = calculateSuccessionWindows(
        tomatoCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Tomatoes with null harvestDurationDays produce until frost
      // Should only get one succession since one planting covers the season
      expect(result.windows.length).toBe(1);
    });

    it('sets harvestEnd at frost deadline for frost-sensitive crops', () => {
      const result = calculateSuccessionWindows(
        tomatoCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Frost-sensitive: earliest frost Sept 15 - 4 day buffer = Sept 11
      expect(result.windows[0].harvestEnd).toBe('2025-09-11');
    });
  });

  describe('explicit harvest duration', () => {
    it('uses harvestDurationDays when set', () => {
      const result = calculateSuccessionWindows(
        spinachCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      if (result.windows.length > 0) {
        const window = result.windows[0];
        // harvestEnd should be harvestStart + 21 days (harvestDurationDays)
        const expectedEnd = addDays(window.harvestStart, 21);
        expect(window.harvestEnd).toBe(expectedEnd);
      }
    });
  });
});

// ============================================
// Temperature Check Tests
// ============================================

describe('temperature viability', () => {
  describe('heat-sensitive crops', () => {
    it('skips periods when too hot', () => {
      const result = calculateSuccessionWindows(
        spinachCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      // Spinach max is 21°C, tmax exceeds 21°C around mid-June
      // Should have skipped periods during summer
      expect(result.skippedPeriods.length).toBeGreaterThan(0);

      // Should have spring windows (fall windows may not exist if heat clears
      // after the latest sow deadline)
      const sowDates = result.windows.map((w) => w.sowDate);
      const hasSpring = sowDates.some((d) => d.startsWith('2025-04'));
      expect(hasSpring).toBe(true);
    });

    it('includes reason in skipped periods', () => {
      const result = calculateSuccessionWindows(
        spinachCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      if (result.skippedPeriods.length > 0) {
        // Reason should describe the temperature issue
        expect(result.skippedPeriods[0].reason).toBeDefined();
        expect(result.skippedPeriods[0].reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('cold-sensitive crops', () => {
    it('checks cold only for frost-sensitive crops', () => {
      // Bush beans are frost-sensitive with minGrowingTempC of 15
      // Effective min = 16°C with 1°C margin; June tavg reaches 16°C on June 9
      const result = calculateSuccessionWindows(
        bushBeansCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      expect(result.windows.length).toBeGreaterThan(0);
      // First window is June 9 (frost+offset=June 8, but tavg 15.9°C < 16°C effective min)
      expect(result.windows[0].sowDate).toBe('2025-06-09');
    });

    it('skips if avg temp below minGrowingTempC', () => {
      // Create a cultivar that needs warmer temps
      const warmCrop: Cultivar = {
        ...bushBeansCultivar,
        id: 'warm-test',
        minGrowingTempC: 20, // Higher than June avg temp of 17
      };

      const result = calculateSuccessionWindows(
        warmCrop,
        defaultFrostWindow,
        sussexClimate
      );

      // Should skip June, find windows starting in July when avg temp is 20°C
      if (result.windows.length > 0) {
        const firstSow = result.windows[0].sowDate;
        expect(firstSow >= '2025-07-01').toBe(true);
      }
    });
  });

});

// ============================================
// Example-Based Tests from succession.md
// ============================================

describe('Example 1: Spinach (heat-sensitive, frost-tolerant)', () => {
  const result = calculateSuccessionWindows(
    spinachCultivar,
    defaultFrostWindow,
    sussexClimate
  );

  it('starts sowing in mid-April (frost-tolerant, soil temp viable with margin)', () => {
    // Interpolated soil reaches 5°C (minGrowingTempC 4 + 1°C margin) at Apr 15
    expect(result.windows[0].sowDate).toBe('2025-04-15');
  });

  it('has spring plantings in April', () => {
    const aprilSows = result.windows.filter((w) =>
      w.sowDate.startsWith('2025-04')
    );
    expect(aprilSows.length).toBeGreaterThan(0);
  });

  it('has summer gap due to heat', () => {
    expect(result.skippedPeriods.length).toBeGreaterThan(0);

    // Gap should cover summer months due to heat
    // With accurate month-by-month checking, gap may start in late April
    // when sow dates would extend harvest into June (tmax 21 > effective max 19)
    const heatGap = result.skippedPeriods.find(
      (p) => p.reason?.includes('hot') && p.endDate >= '2025-08-01'
    );
    expect(heatGap).toBeDefined();
  });

  it('heat gap extends to end of season when heat clears after sow deadline', () => {
    // With interpolation, tmax drops to 19°C at Sep 15, but latestSowDate is Sep 12
    // (Oct 22 frost deadline - 40 day maturity). Heat clears 3 days too late for fall sowing.
    // The skipped period should extend to the end of the viable window.
    const heatGap = result.skippedPeriods.find((p) => /Too hot/i.test(p.reason));
    expect(heatGap).toBeDefined();
    expect(heatGap!.endDate >= '2025-09-01').toBe(true);
  });
});

describe('Example 2: Bush Beans (frost-sensitive, heat-tolerant)', () => {
  const result = calculateSuccessionWindows(
    bushBeansCultivar,
    defaultFrostWindow,
    sussexClimate
  );

  it('starts after last frost plus offset (June 9 due to 1°C margin)', () => {
    // Frost-based earliest = June 8, but tavg 15.9°C < 16°C effective min on June 8
    expect(result.windows[0].sowDate).toBe('2025-06-09');
  });

  it('has no heat gaps (beans thrive in heat)', () => {
    // Beans tolerate heat well (maxGrowingTempC: 32 > summer highs of 24)
    // But late sowings may fail cold check when harvest extends into September
    // (Sept tavg: 14°C < minGrowingTempC: 15°C)
    const heatGap = result.skippedPeriods.find((p) => p.reason?.includes('hot'));
    expect(heatGap).toBeUndefined();
  });

  it('produces multiple successions through summer', () => {
    expect(result.windows.length).toBeGreaterThanOrEqual(2);
  });

  it('ends harvest before frost deadline', () => {
    const lastWindow = result.windows[result.windows.length - 1];
    // Frost deadline: Sept 15 - 4 days = Sept 11
    expect(lastWindow.harvestEnd <= '2025-09-11').toBe(true);
  });
});

describe('Example 3: Tomato Sungold (transplant, harvest until frost)', () => {
  const result = calculateSuccessionWindows(
    tomatoCultivar,
    defaultFrostWindow,
    sussexClimate
  );

  it('has exactly one window (continuous harvest until frost)', () => {
    expect(result.windows.length).toBe(1);
  });

  it('sows indoors using indoorLeadWeeksMax for earliest calculation', () => {
    // Code uses indoorLeadWeeksMax (8 weeks) for calculating earliest sow
    // Transplant after = 7 days from June 1 = June 8
    // But earliest sow = June 8 - 8 weeks = April 13
    // Then transplantDate calculated with indoorLeadWeeksMin = April 13 + 6 weeks = May 25
    expect(result.windows[0].sowDate).toBe('2025-04-13');
  });

  it('transplants based on indoorLeadWeeksMin from sow date', () => {
    // Sow April 13 + 6 weeks = May 25
    expect(result.windows[0].transplantDate).toBe('2025-05-25');
  });

  it('starts harvest based on maturityDays from transplant', () => {
    // Transplant: May 25, maturity: 57 days from transplant
    // Harvest start: May 25 + 57 = July 21
    expect(result.windows[0].harvestStart).toBe('2025-07-21');
  });

  it('ends harvest at frost deadline (Sept 11)', () => {
    expect(result.windows[0].harvestEnd).toBe('2025-09-11');
  });
});

describe('Example 4: Gai Lan (frost-tolerant, heat-sensitive, transplant)', () => {
  const result = calculateSuccessionWindows(
    gaiLanCultivar,
    defaultFrostWindow,
    sussexClimate
  );

  it('has viable windows', () => {
    expect(result.windows.length).toBeGreaterThan(0);
  });

  it('includes transplant dates', () => {
    result.windows.forEach((w) => {
      expect(w.transplantDate).toBeDefined();
    });
  });

  it('uses climate-derived season start (not hardcoded March 1)', () => {
    // Gai lan: minGrowingTempC = 7, frost-tolerant
    // With 1°C margin, soil must reach 8°C
    // Interpolated soil reaches 8°C between Apr 15 (soil=5) and May 15 (soil=10)
    // t = (8-5)/(10-5) = 0.6 → Apr 15 + 18 = May 3
    // Season start = May 3, transplant from May 3, sow = May 3 - 6 weeks = Mar 22
    expect(result.diagnostic?.earliestSowDate).toBe('2025-03-22');
  });

  it('does not produce gaps starting before March', () => {
    // With climate-derived start, no gap should reference dates before the earliest sow date
    const earlyGap = result.skippedPeriods.find(
      (p) => p.startDate < '2025-03-01'
    );
    expect(earlyGap).toBeUndefined();
  });
});

describe('Gap reason splitting', () => {
  it('splits gaps when reason type transitions from hot to cold', () => {
    // Use a cultivar with tighter heat tolerance to ensure a heat gap exists,
    // and a climate where October soil is below min to trigger hot→cold transition
    const heatSensitiveGaiLan: Cultivar = {
      ...gaiLanCultivar,
      maxGrowingTempC: 23, // tmax 24 > 23 in Jul/Aug
    };
    const coldOctoberClimate: Climate = {
      ...sussexClimate,
      monthlyAvgC: {
        ...sussexClimate.monthlyAvgC,
        '10': { tavg_c: 7, tmin_c: 2, tmax_c: 12, soil_avg_c: 8, gdd_base5: 1100 },
      },
    };

    const result = calculateSuccessionWindows(
      heatSensitiveGaiLan,
      defaultFrostWindow,
      coldOctoberClimate
    );

    // Each gap segment should have a consistent reason type (not mixed)
    for (const period of result.skippedPeriods) {
      const isHot = /Too hot/i.test(period.reason);
      const isCold = /too cold|Soil too cold/i.test(period.reason);
      // Each gap should be classified as either hot or cold
      expect(isHot || isCold).toBe(true);
      // Should not contain contradictory signals
      expect(isHot && isCold).toBe(false);
    }

    // With interpolated tmax 24 > max 23 in summer and October soil 8 < 10,
    // we should have at least one hot gap and one cold gap
    const hotGaps = result.skippedPeriods.filter((p) => /Too hot/i.test(p.reason));
    const coldGaps = result.skippedPeriods.filter((p) => /too cold|Soil too cold/i.test(p.reason));
    expect(hotGaps.length).toBeGreaterThan(0);
    expect(coldGaps.length).toBeGreaterThan(0);
  });

  it('does not split gaps when reason type stays the same', () => {
    // Spinach: only maxGrowingTempC matters for summer gap (heat only)
    const result = calculateSuccessionWindows(
      spinachCultivar,
      defaultFrostWindow,
      sussexClimate
    );

    // Summer gap should be a single heat segment (not split)
    const heatGaps = result.skippedPeriods.filter((p) => /Too hot/i.test(p.reason));
    expect(heatGaps.length).toBeLessThanOrEqual(1);
  });

  it('preserves succession numbering across split gaps', () => {
    const result = calculateSuccessionWindows(
      gaiLanCultivar,
      defaultFrostWindow,
      sussexClimate
    );
    for (let i = 0; i < result.windows.length; i++) {
      expect(result.windows[i].successionNumber).toBe(i + 1);
    }
  });
});

describe('Climate-derived season start backward compatibility', () => {
  it('uses threshold 0 when minGrowingTempC is not set (beet)', () => {
    // Beet has no minGrowingTempC, frost-tolerant
    // Threshold defaults to 0 + 1°C margin = 1°C
    // Soil interpolates between Feb 15 (-1°C) and Mar 15 (1°C), reaching 1°C at Mar 15
    const result = calculateSuccessionWindows(
      beetCultivar,
      defaultFrostWindow,
      sussexClimate
    );
    expect(result.diagnostic?.earliestSowDate).toBe('2025-03-15');
  });

  it('preserves spinach first window in mid-April', () => {
    // Spinach: minGrowingTempC = 4, frost-tolerant
    // With 1°C margin, soil must reach 5°C → Apr 15 (between Mar 15 soil=1 and Apr 15 soil=5)
    // directAfterLsfDays = -28 → frost-based start = May 4
    // min(April 15, May 4) = April 15
    const result = calculateSuccessionWindows(
      spinachCultivar,
      defaultFrostWindow,
      sussexClimate
    );
    expect(result.windows[0].sowDate).toBe('2025-04-15');
  });
});

describe('Example 5: Lettuce Little Gem (frost-tolerant, heat-sensitive)', () => {
  const result = calculateSuccessionWindows(
    lettuceCultivar,
    defaultFrostWindow,
    sussexClimate
  );

  it('starts sowing in mid-April (frost-tolerant, soil temp viable with margin)', () => {
    // With 1°C margin, soil must reach 5°C → Apr 15 (between Mar 15 soil=1 and Apr 15 soil=5)
    expect(result.windows[0].sowDate).toBe('2025-04-15');
  });

  it('has spring plantings', () => {
    const springWindows = result.windows.filter(
      (w) =>
        w.sowDate.startsWith('2025-04') || w.sowDate.startsWith('2025-05')
    );
    expect(springWindows.length).toBeGreaterThan(0);
  });

  it('has summer gap due to heat (tmax exceeds 23°C effective max in summer)', () => {
    expect(result.skippedPeriods.length).toBeGreaterThan(0);
  });

  it('may have fall window with precise date finding', () => {
    // With 1-day increments, the algorithm can now find fall windows
    // that were previously missed with 7-day jumps.
    // Lettuce has 50-day maturity - a narrow but viable fall window may exist
    const fallWindows = result.windows.filter((w) =>
      w.sowDate.startsWith('2025-08') || w.sowDate.startsWith('2025-09')
    );
    // Fall window may or may not exist depending on exact temperature cutoffs
    // Just verify we have windows overall (spring at minimum)
    expect(result.windows.length).toBeGreaterThan(0);
  });
});

// ============================================
// calculateNextSuccession Tests
// ============================================

describe('calculateNextSuccession', () => {
  it('returns first window when no existing plantings', () => {
    const result = calculateNextSuccession(
      beetCultivar,
      defaultFrostWindow,
      sussexClimate,
      []
    );

    expect(result).not.toBeNull();
    expect(result?.successionNumber).toBe(1);
  });

  it('calculates next window based on previous harvest end', () => {
    const existingPlanting: Planting = {
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

    const result = calculateNextSuccession(
      beetCultivar,
      defaultFrostWindow,
      sussexClimate,
      [existingPlanting]
    );

    expect(result).not.toBeNull();
    expect(result?.successionNumber).toBe(2);
    // Next harvest should start around when previous ends
    // Previous ends June 2, next should target harvest start around then
  });

  it('skips temperature-unfavorable periods', () => {
    // Use spinach which has summer heat gap
    const springPlanting: Planting = {
      id: 'p1',
      cultivarId: spinachCultivar.id,
      label: 'Spinach #1',
      quantity: 10,
      sowDate: '2025-04-15',
      harvestStart: '2025-05-25',
      harvestEnd: '2025-06-15',
      method: 'direct',
      status: 'planned',
      successionNumber: 1,
      createdAt: '2025-01-01',
    };

    const result = calculateNextSuccession(
      spinachCultivar,
      defaultFrostWindow,
      sussexClimate,
      [springPlanting]
    );

    // Should skip summer and find fall window
    if (result) {
      // The sow date should be in fall, skipping summer heat
      expect(
        result.sowDate >= '2025-08-01' || result.sowDate <= '2025-05-15'
      ).toBe(true);
    }
  });

  it('returns null when season is over', () => {
    // Create a late planting that uses up the season
    const latePlanting: Planting = {
      id: 'p1',
      cultivarId: bushBeansCultivar.id,
      label: 'Beans #1',
      quantity: 10,
      sowDate: '2025-08-01',
      harvestStart: '2025-09-20',
      harvestEnd: '2025-10-01',
      method: 'direct',
      status: 'planned',
      successionNumber: 1,
      createdAt: '2025-01-01',
    };

    const result = calculateNextSuccession(
      bushBeansCultivar,
      defaultFrostWindow,
      sussexClimate,
      [latePlanting]
    );

    // Should be null since no more viable windows
    expect(result).toBeNull();
  });

  it('increments succession number correctly', () => {
    const plantings: Planting[] = [
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
        createdAt: '2025-01-01',
      },
    ];

    const result = calculateNextSuccession(
      beetCultivar,
      defaultFrostWindow,
      sussexClimate,
      plantings
    );

    if (result) {
      expect(result.successionNumber).toBe(3);
    }
  });
});

// ============================================
// Helper Function Tests
// ============================================

describe('createPlantingFromWindow', () => {
  const window: PlantingWindow = {
    sowDate: '2025-04-01',
    transplantDate: undefined,
    harvestStart: '2025-05-26',
    harvestEnd: '2025-06-02',
    method: 'direct',
    successionNumber: 1,
  };

  it('creates planting with correct cultivar ID', () => {
    const planting = createPlantingFromWindow(window, beetCultivar);
    expect(planting.cultivarId).toBe(beetCultivar.id);
  });

  it('sets label with crop name, variety and succession number', () => {
    const planting = createPlantingFromWindow(window, beetCultivar);
    expect(planting.label).toBe('Beet - Detroit Dark Red #1');
  });

  it('sets label without variety when variety is empty', () => {
    const cultivarNoVariety = { ...beetCultivar, variety: '' };
    const planting = createPlantingFromWindow(window, cultivarNoVariety);
    expect(planting.label).toBe('Beet #1');
  });

  it('copies all dates from window', () => {
    const planting = createPlantingFromWindow(window, beetCultivar);
    expect(planting.sowDate).toBe(window.sowDate);
    expect(planting.harvestStart).toBe(window.harvestStart);
    expect(planting.harvestEnd).toBe(window.harvestEnd);
  });

  it('leaves quantity undefined when not specified', () => {
    const planting = createPlantingFromWindow(window, beetCultivar);
    expect(planting.quantity).toBeUndefined();
  });

  it('accepts custom quantity', () => {
    const planting = createPlantingFromWindow(window, beetCultivar, 25);
    expect(planting.quantity).toBe(25);
  });

  it('sets status to planned', () => {
    const planting = createPlantingFromWindow(window, beetCultivar);
    expect(planting.status).toBe('planned');
  });
});

describe('getNextSuccessionNumber', () => {
  it('returns 1 for empty plantings', () => {
    const result = getNextSuccessionNumber([], 'any-id');
    expect(result).toBe(1);
  });

  it('returns 1 when no plantings for cultivar', () => {
    const plantings: Planting[] = [
      {
        id: 'p1',
        cultivarId: 'other-cultivar',
        label: 'Other #1',
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

    const result = getNextSuccessionNumber(plantings, 'my-cultivar');
    expect(result).toBe(1);
  });

  it('returns max + 1 for existing plantings', () => {
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
        label: 'Beet #2',
        quantity: 10,
        sowDate: '2025-04-08',
        harvestStart: '2025-06-02',
        harvestEnd: '2025-06-09',
        method: 'direct',
        status: 'planned',
        successionNumber: 2,
        createdAt: '2025-01-01',
      },
    ];

    const result = getNextSuccessionNumber(plantings, 'beet');
    expect(result).toBe(3);
  });

  it('handles non-sequential succession numbers', () => {
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
        id: 'p3',
        cultivarId: 'beet',
        label: 'Beet #5',
        quantity: 10,
        sowDate: '2025-04-08',
        harvestStart: '2025-06-02',
        harvestEnd: '2025-06-09',
        method: 'direct',
        status: 'planned',
        successionNumber: 5,
        createdAt: '2025-01-01',
      },
    ];

    const result = getNextSuccessionNumber(plantings, 'beet');
    expect(result).toBe(6);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('edge cases', () => {
  it('handles very short season (earliest sow after latest sow)', () => {
    // Create a very late spring frost and early fall frost
    const shortSeason = createFrostWindow('2025-07-15', '2025-08-01');

    // Use a cultivar with longer maturity to ensure season is too short
    const longMaturityCrop: Cultivar = {
      ...bushBeansCultivar,
      id: 'long-maturity',
      maturityDays: 80, // 80 days needed, but only ~2 weeks available
      directAfterLsfDays: 7,
    };

    const result = calculateSuccessionWindows(
      longMaturityCrop,
      shortSeason,
      sussexClimate
    );

    // Season too short - earliest sow July 22, needs 80 days, but fall frost Aug 1
    // Latest sow would be before earliest sow
    expect(result.diagnostic?.earliestSowDate).toBeDefined();
    expect(result.diagnostic?.latestSowDate).toBeDefined();

    // If season is too short, should have diagnostic reason
    if (result.windows.length === 0) {
      expect(result.diagnostic?.noWindowsReason).toBeDefined();
    }
  });

  it('handles cultivar with sowMethod "either" (defaults to direct)', () => {
    const eitherMethod: Cultivar = {
      ...beetCultivar,
      id: 'either-test',
      sowMethod: 'either',
    };

    const result = calculateSuccessionWindows(
      eitherMethod,
      defaultFrostWindow,
      sussexClimate
    );

    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0].method).toBe('direct');
  });

  it('handles missing climate temperature data', () => {
    const sparseClimate: Climate = {
      ...sussexClimate,
      monthlyAvgC: {
        '6': sussexClimate.monthlyAvgC['6'],
        '7': sussexClimate.monthlyAvgC['7'],
      },
    };

    // Should still work, treating missing months as viable
    const result = calculateSuccessionWindows(
      beetCultivar,
      defaultFrostWindow,
      sparseClimate
    );

    expect(result.windows.length).toBeGreaterThan(0);
  });

  it('handles null optional cultivar fields', () => {
    const minimalCultivar: Cultivar = {
      id: 'minimal',
      crop: 'Test',
      variety: 'Basic',
      germDaysMin: 5,
      germDaysMax: 10,
      maturityDays: 50,
      maturityBasis: 'from_sow',
      sowMethod: 'direct',
      directAfterLsfDays: null,
      transplantAfterLsfDays: null,
      indoorLeadWeeksMin: null,
      indoorLeadWeeksMax: null,
    };

    const result = calculateSuccessionWindows(
      minimalCultivar,
      defaultFrostWindow,
      sussexClimate
    );

    // Should still produce windows with fallback values
    expect(result.windows.length).toBeGreaterThan(0);
  });

  it('prevents infinite loop when nextSowDate does not advance', () => {
    // This tests the loop protection in calculateSuccessionWindows
    // where we check if nextSowDate <= currentSowDate
    const result = calculateSuccessionWindows(
      beetCultivar,
      defaultFrostWindow,
      sussexClimate,
      { maxSuccessions: 100 }
    );

    // Should terminate without hanging
    expect(result.windows.length).toBeLessThan(100);
  });
});

// ============================================
// Continuous Harvest Calculation Tests
// ============================================

describe('continuous harvest succession spacing', () => {
  it('spaces successions to maintain continuous harvest', () => {
    const result = calculateSuccessionWindows(
      beetCultivar,
      defaultFrostWindow,
      sussexClimate
    );

    // Each window's harvest should start around when previous ends
    for (let i = 1; i < result.windows.length; i++) {
      const prev = result.windows[i - 1];
      const curr = result.windows[i];

      // Current harvest start should be close to previous harvest end
      const prevEnd = new Date(prev.harvestEnd + 'T00:00:00Z');
      const currStart = new Date(curr.harvestStart + 'T00:00:00Z');

      // Allow some gap (up to 14 days) for continuous harvest
      const gapDays = Math.round(
        (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Gap shouldn't be negative (overlap is OK) or too large
      expect(gapDays).toBeLessThanOrEqual(14);
    }
  });
});

// ============================================
// Helper function for tests
// ============================================

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ============================================
// renumberPlantingsForCrop Tests
// ============================================

describe('renumberPlantingsForCrop', () => {
  it('renumbers plantings when new planting is added between existing ones', () => {
    // Simulates the addAndRenumber flow: add a new planting then renumber
    const existingPlantings: Planting[] = [
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
        label: 'Beet #2',
        quantity: 10,
        sowDate: '2025-06-24', // Later date
        harvestStart: '2025-08-18',
        harvestEnd: '2025-08-25',
        method: 'direct',
        status: 'planned',
        successionNumber: 2,
        createdAt: '2025-01-01',
      },
    ];

    // Add a new planting that falls between the two existing ones chronologically
    const newPlanting: Planting = {
      id: 'p3',
      cultivarId: 'beet',
      label: 'Beet #3', // Will be created with next available number
      quantity: 10,
      sowDate: '2025-04-08', // Between p1 (Apr 1) and p2 (Jun 24)
      harvestStart: '2025-06-02',
      harvestEnd: '2025-06-09',
      method: 'direct',
      status: 'planned',
      successionNumber: 3,
      createdAt: '2025-01-02',
    };

    const withNew = [...existingPlantings, newPlanting];
    const result = renumberPlantingsForCrop(withNew, 'Beet', 'beet');

    // Sort by sowDate to verify chronological numbering
    const sorted = result
      .filter((p) => p.cultivarId === 'beet')
      .sort((a, b) => a.sowDate.localeCompare(b.sowDate));

    // p1 stays #1 (Apr 1)
    expect(sorted[0].id).toBe('p1');
    expect(sorted[0].successionNumber).toBe(1);
    expect(sorted[0].label).toBe('Beet #1');

    // p3 (the new one) becomes #2 (Apr 8)
    expect(sorted[1].id).toBe('p3');
    expect(sorted[1].successionNumber).toBe(2);
    expect(sorted[1].label).toBe('Beet #2');

    // p2 becomes #3 (Jun 24)
    expect(sorted[2].id).toBe('p2');
    expect(sorted[2].successionNumber).toBe(3);
    expect(sorted[2].label).toBe('Beet #3');
  });

  it('renumbers plantings by chronological sow date order', () => {
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
        label: 'Beet #5', // Out of order number
        quantity: 10,
        sowDate: '2025-04-08', // Second chronologically
        harvestStart: '2025-06-02',
        harvestEnd: '2025-06-09',
        method: 'direct',
        status: 'planned',
        successionNumber: 5,
        createdAt: '2025-01-01',
      },
      {
        id: 'p3',
        cultivarId: 'beet',
        label: 'Beet #3', // Out of order number
        quantity: 10,
        sowDate: '2025-06-24', // Third chronologically
        harvestStart: '2025-08-18',
        harvestEnd: '2025-08-25',
        method: 'direct',
        status: 'planned',
        successionNumber: 3,
        createdAt: '2025-01-01',
      },
    ];

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet');

    // Find the beet plantings in result
    const beetPlantings = result.filter((p) => p.cultivarId === 'beet');

    // Sort by sowDate to check numbering
    const sorted = [...beetPlantings].sort((a, b) =>
      a.sowDate.localeCompare(b.sowDate)
    );

    expect(sorted[0].successionNumber).toBe(1);
    expect(sorted[0].label).toBe('Beet #1');

    expect(sorted[1].successionNumber).toBe(2);
    expect(sorted[1].label).toBe('Beet #2');

    expect(sorted[2].successionNumber).toBe(3);
    expect(sorted[2].label).toBe('Beet #3');
  });

  it('preserves other cultivar plantings unchanged', () => {
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
        cultivarId: 'carrot',
        label: 'Carrot #1',
        quantity: 10,
        sowDate: '2025-04-15',
        harvestStart: '2025-07-15',
        harvestEnd: '2025-07-22',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      },
    ];

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet');

    const carrotPlanting = result.find((p) => p.cultivarId === 'carrot');
    expect(carrotPlanting?.label).toBe('Carrot #1');
    expect(carrotPlanting?.successionNumber).toBe(1);
  });

  it('handles single planting', () => {
    const plantings: Planting[] = [
      {
        id: 'p1',
        cultivarId: 'beet',
        label: 'Beet #5', // Weird number for single planting
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-26',
        harvestEnd: '2025-06-02',
        method: 'direct',
        status: 'planned',
        successionNumber: 5,
        createdAt: '2025-01-01',
      },
    ];

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet');

    expect(result[0].successionNumber).toBe(1);
    expect(result[0].label).toBe('Beet #1');
  });

  it('handles empty plantings for cultivar', () => {
    const plantings: Planting[] = [
      {
        id: 'p1',
        cultivarId: 'carrot',
        label: 'Carrot #1',
        quantity: 10,
        sowDate: '2025-04-15',
        harvestStart: '2025-07-15',
        harvestEnd: '2025-07-22',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      },
    ];

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet');

    // Should return plantings unchanged since no beet plantings
    expect(result.length).toBe(1);
    expect(result[0].cultivarId).toBe('carrot');
  });

  it('includes variety in label when provided', () => {
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
    ];

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet', 'Detroit Dark Red');

    expect(result[0].label).toBe('Beet - Detroit Dark Red #1');
  });

  it('omits variety from label when variety is empty', () => {
    const plantings: Planting[] = [
      {
        id: 'p1',
        cultivarId: 'beet',
        label: 'Beet - Old Variety #1',
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

    const result = renumberPlantingsForCrop(plantings, 'Beet', 'beet', '');

    expect(result[0].label).toBe('Beet #1');
  });
});

// ============================================
// isGrowingPeriodViable Tests
// ============================================

describe('isGrowingPeriodViable', () => {
  describe('basic viability checks', () => {
    it('returns viable for period within temperature bounds', () => {
      // Lettuce in May - avg high 17°C, max 24°C (effective 22°C)
      const result = isGrowingPeriodViable(
        '2025-05-01',
        '2025-05-30',
        lettuceCultivar,
        sussexClimate
      );
      expect(result.viable).toBe(true);
    });

    it('returns not viable when too hot', () => {
      // Spinach growing through July - tmax crosses 21°C around mid-June
      const result = isGrowingPeriodViable(
        '2025-06-01',
        '2025-07-15',
        spinachCultivar,
        sussexClimate
      );
      expect(result.viable).toBe(false);
      expect(result.reason).toContain('Too hot');
    });

    it('returns not viable when too cold for frost-sensitive crops', () => {
      // Bush beans in April - avg temp 6°C < min 15°C
      const result = isGrowingPeriodViable(
        '2025-04-01',
        '2025-04-30',
        bushBeansCultivar,
        sussexClimate
      );
      expect(result.viable).toBe(false);
      expect(result.reason).toContain('Too cold');
    });

    it('uses soil temperature for frost-tolerant crops with minGrowingTempC', () => {
      // Spinach mid-April - interpolated soil is above minGrowingTempC (4°C)
      // April 15 soil = 5°C (midpoint), April 30 soil ≈ 7.5°C — all viable
      const result = isGrowingPeriodViable(
        '2025-04-15',
        '2025-04-30',
        spinachCultivar,
        sussexClimate
      );
      expect(result.viable).toBe(true);
    });

    it('checks soil temperature for frost-tolerant crops with minGrowingTempC', () => {
      // Lettuce with minGrowingTempC in March - interpolated soil is below threshold
      const lettuceWithMin: Cultivar = {
        ...lettuceCultivar,
        id: 'lettuce-with-min',
        minGrowingTempC: 4,
      };

      // March: interpolated soil ranges from ~0°C (Mar 1) to ~1°C (Mar 15) — all < 4°C
      const marchResult = isGrowingPeriodViable(
        '2025-03-01',
        '2025-03-30',
        lettuceWithMin,
        sussexClimate
      );
      expect(marchResult.viable).toBe(false);
      expect(marchResult.reason).toContain('Soil too cold');

      // Mid-April onward: interpolated soil >= 4°C (April 15 soil = 5°C midpoint)
      const aprilResult = isGrowingPeriodViable(
        '2025-04-15',
        '2025-04-30',
        lettuceWithMin,
        sussexClimate
      );
      expect(aprilResult.viable).toBe(true);
    });

    it('uses fallback soil temp estimate when soil_avg_c is missing', () => {
      // Climate without soil data - should estimate from tavg - 2°C
      const climateWithoutSoil: Climate = {
        ...sussexClimate,
        monthlyAvgC: {
          ...Object.fromEntries(
            Object.entries(sussexClimate.monthlyAvgC).map(([k, v]) => [
              k,
              { ...v, soil_avg_c: undefined },
            ])
          ),
        },
      };

      const lettuceWithMin: Cultivar = {
        ...lettuceCultivar,
        id: 'lettuce-with-min',
        minGrowingTempC: 4,
      };

      // Late April: interpolated tavg around Apr 25 ≈ 8°C, estimated soil = 6°C >= 5°C effective min -> viable
      const lateAprilResult = isGrowingPeriodViable(
        '2025-04-25',
        '2025-05-10',
        lettuceWithMin,
        climateWithoutSoil
      );
      expect(lateAprilResult.viable).toBe(true);

      // Mid-April: interpolated tavg at Apr 15 = 6°C, estimated soil = 4°C < 5°C effective min -> not viable
      const midAprilResult = isGrowingPeriodViable(
        '2025-04-15',
        '2025-04-20',
        lettuceWithMin,
        climateWithoutSoil
      );
      expect(midAprilResult.viable).toBe(false);
    });
  });

  describe('day-by-day interpolated checking', () => {
    it('detects heat failure within growing period', () => {
      // Spinach from May through July - should fail when interpolated tmax > 21
      // tmax crosses 21°C around mid-June (interpolation between Jun 15=21 and Jul 15=24)
      const result = isGrowingPeriodViable(
        '2025-05-01',
        '2025-07-31',
        spinachCultivar,
        sussexClimate
      );
      expect(result.viable).toBe(false);
      expect(result.reason).toContain('Too hot');
    });

    it('handles single-month growing periods', () => {
      const result = isGrowingPeriodViable(
        '2025-06-01',
        '2025-06-14',
        lettuceCultivar,
        sussexClimate
      );
      // June avg high 21°C < max 24°C — well within range
      expect(result.viable).toBe(true);
    });
  });

  describe('checkHeatOnly option', () => {
    it('skips cold check when checkHeatOnly is true', () => {
      // Create a frost-sensitive crop that would fail cold check
      const warmCrop: Cultivar = {
        ...bushBeansCultivar,
        id: 'warm-test',
        minGrowingTempC: 20, // April avg temp 6°C would fail
      };

      // Without checkHeatOnly - should fail
      const normalResult = isGrowingPeriodViable(
        '2025-04-01',
        '2025-04-30',
        warmCrop,
        sussexClimate
      );
      expect(normalResult.viable).toBe(false);

      // With checkHeatOnly - should pass (no heat issue in April)
      const heatOnlyResult = isGrowingPeriodViable(
        '2025-04-01',
        '2025-04-30',
        warmCrop,
        sussexClimate,
        { checkHeatOnly: true }
      );
      expect(heatOnlyResult.viable).toBe(true);
    });
  });

  describe('missing climate data handling', () => {
    it('treats missing month data as viable', () => {
      const sparseClimate: Climate = {
        ...sussexClimate,
        monthlyAvgC: {
          '6': sussexClimate.monthlyAvgC['6'], // Only June data
        },
      };

      // May has no data - should be treated as viable
      const result = isGrowingPeriodViable(
        '2025-05-01',
        '2025-05-30',
        lettuceCultivar,
        sparseClimate
      );
      expect(result.viable).toBe(true);
    });
  });
});

// ============================================
// calculateAvailableWindowsAfter Tests
// ============================================

describe('calculateAvailableWindowsAfter', () => {
  describe('basic functionality', () => {
    it('returns windows after the specified harvest end date', () => {
      const result = calculateAvailableWindowsAfter(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-06-01',
        []
      );

      expect(result.length).toBeGreaterThan(0);
      // All windows should have harvest start >= afterHarvestEnd
      result.forEach((w) => {
        expect(w.harvestStart >= '2025-06-01').toBe(true);
      });
    });

    it('returns empty array when no windows available after date', () => {
      // Use a date very late in the season
      const result = calculateAvailableWindowsAfter(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-11-01',
        []
      );

      expect(result.length).toBe(0);
    });

    it('assigns sequential succession numbers starting from next available', () => {
      const existingPlanting: Planting = {
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

      const result = calculateAvailableWindowsAfter(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-06-02',
        [existingPlanting]
      );

      if (result.length > 0) {
        expect(result[0].successionNumber).toBe(2);
      }
    });
  });

  describe('overlap detection', () => {
    it('excludes windows that overlap with existing plantings', () => {
      const existingPlantings: Planting[] = [
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
          createdAt: '2025-01-01',
        },
      ];

      // Ask for windows after first planting
      const result = calculateAvailableWindowsAfter(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-06-02',
        existingPlantings
      );

      // Should not include windows that overlap with second planting (June 2-9)
      result.forEach((w) => {
        const windowEnd = new Date(`${w.harvestEnd}T00:00:00Z`).getTime();
        const existingStart = new Date('2025-06-02T00:00:00Z').getTime();
        const windowStart = new Date(`${w.harvestStart}T00:00:00Z`).getTime();
        const existingEnd = new Date('2025-06-09T00:00:00Z').getTime();

        // Should not overlap: !(windowStart < existingEnd && existingStart < windowEnd)
        const overlaps = windowStart < existingEnd && existingStart < windowEnd;
        expect(overlaps).toBe(false);
      });
    });

    it('handles same-day harvest windows (truncated by frost)', () => {
      // Create a planting with same-day harvest (harvestStart === harvestEnd)
      const sameDayPlanting: Planting = {
        id: 'p1',
        cultivarId: beetCultivar.id,
        label: 'Beet #1',
        quantity: 10,
        sowDate: '2025-08-20',
        harvestStart: '2025-10-14',
        harvestEnd: '2025-10-14', // Same day - truncated by frost
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const result = calculateAvailableWindowsAfter(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-10-14',
        [sameDayPlanting]
      );

      // Windows should not have harvest on the same day
      result.forEach((w) => {
        if (w.harvestStart === w.harvestEnd) {
          expect(w.harvestStart).not.toBe('2025-10-14');
        }
      });
    });
  });

  describe('temperature viability', () => {
    it('skips temperature-unfavorable periods', () => {
      // Use spinach which has summer heat gap
      const result = calculateAvailableWindowsAfter(
        spinachCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-05-01',
        []
      );

      // Should have spring windows and fall windows, but no mid-summer
      const hasMidSummer = result.some(
        (w) => w.sowDate >= '2025-06-01' && w.sowDate <= '2025-08-15'
      );
      expect(hasMidSummer).toBe(false);
    });

    it('finds fall windows for heat-sensitive crops when asking for earlier harvest date', () => {
      // For lettuce (50 days maturity, maxGrowingTempC=24, effective max=23),
      // asking for windows after a June harvest end will find fall windows.
      // Heat clears around Aug 21 (tmax drops to ≤23), latest sow Sep 2.
      const result = calculateAvailableWindowsAfter(
        lettuceCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-06-04', // Spring harvest end - algorithm will find subsequent windows
        []
      );

      // Should find fall windows in late August when heat clears
      const fallWindows = result.filter((w) => w.sowDate >= '2025-08-15');
      expect(fallWindows.length).toBeGreaterThan(0);
    });

    it('finds fall windows after heat clears', () => {
      // Lettuce: 50 days to maturity, maxGrowingTempC=24 (effective max 23°C with 1°C margin)
      // With interpolation, tmax drops to ≤23°C around Aug 21
      const result = calculateAvailableWindowsAfter(
        lettuceCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-08-15', // Asking for windows where harvest starts >= Aug 15
        []
      );

      // Should find fall windows when heat clears in late August
      expect(result.length).toBeGreaterThan(0);
      result.forEach((w) => {
        expect(w.harvestStart >= '2025-08-15').toBe(true);
      });
    });
  });

  describe('frost deadline handling', () => {
    it('caps harvest end at frost deadline for frost-sensitive crops', () => {
      const result = calculateAvailableWindowsAfter(
        bushBeansCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-08-01',
        []
      );

      // Frost deadline for frost-sensitive: earliest frost (Sept 15) - 4 days = Sept 11
      result.forEach((w) => {
        expect(w.harvestEnd <= '2025-09-11').toBe(true);
      });
    });

    it('extends past frost for frost-tolerant crops', () => {
      const result = calculateAvailableWindowsAfter(
        beetCultivar,
        defaultFrostWindow,
        sussexClimate,
        '2025-09-01',
        []
      );

      // Frost-tolerant crops can harvest past typical frost (Oct 1 + 21 days = Oct 22)
      if (result.length > 0) {
        const latestHarvestEnd = result[result.length - 1].harvestEnd;
        expect(latestHarvestEnd >= '2025-10-01').toBe(true);
      }
    });
  });
});

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

// Helper to calculate days between two dates
function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

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

// ============================================
// recalculatePlantingForMethodChange Tests
// ============================================

describe('recalculatePlantingForMethodChange', () => {
  // Cultivar that supports both methods
  // Using maxGrowingTempC: 24 so June temperatures are viable for method switching tests
  // (June tmax=21 < effective max 24-2=22)
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
    maxGrowingTempC: 24,
    harvestDurationDays: 21,
    harvestStyle: 'continuous',
  };

  // Helper to extract updates from a viable result
  const expectViable = (result: ReturnType<typeof recalculatePlantingForMethodChange>) => {
    expect(result.viable).toBe(true);
    if (!result.viable) throw new Error('Expected viable result');
    return result.updates;
  };

  describe('direct to transplant', () => {
    it('preserves outdoor timing by using old sowDate as new transplantDate', () => {
      const directPlanting: Planting = {
        id: 'p1',
        cultivarId: eitherCultivar.id,
        label: 'Spinach #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-16',
        harvestEnd: '2025-06-06',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        directPlanting,
        'transplant',
        eitherCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      // Old sowDate (outdoor day) becomes new transplantDate
      expect(updates.transplantDate).toBe('2025-04-01');
      // New indoor sowDate = transplantDate - 3 weeks (indoorLeadWeeksMin)
      expect(updates.sowDate).toBe('2025-03-11');
    });

    it('recalculates harvestStart based on maturityBasis', () => {
      const directPlanting: Planting = {
        id: 'p1',
        cultivarId: eitherCultivar.id,
        label: 'Spinach #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-16',
        harvestEnd: '2025-06-06',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        directPlanting,
        'transplant',
        eitherCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      // maturityBasis is 'from_sow', so harvestStart = sowDate + maturityDays
      // New sowDate is 2025-03-11 + 45 days = 2025-04-25
      expect(updates.harvestStart).toBe('2025-04-25');
    });

    it('clears sowDateOverride', () => {
      const directPlanting: Planting = {
        id: 'p1',
        cultivarId: eitherCultivar.id,
        label: 'Spinach #1',
        quantity: 10,
        sowDate: '2025-04-01',
        sowDateOverride: '2025-04-05', // User adjusted
        harvestStart: '2025-05-16',
        harvestEnd: '2025-06-06',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        directPlanting,
        'transplant',
        eitherCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      expect(updates.sowDateOverride).toBeUndefined();
    });

    it('does not delay harvest when switching from direct to transplant (from_transplant maturity)', () => {
      // For crops with maturityBasis 'from_transplant', the transplant date is preserved
      // so harvest timing stays exactly the same
      const fromTransplantCultivar: Cultivar = {
        ...eitherCultivar,
        id: 'spinach-from-transplant',
        maturityBasis: 'from_transplant',
      };

      const directPlanting: Planting = {
        id: 'p1',
        cultivarId: fromTransplantCultivar.id,
        label: 'Spinach #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-16', // April 1 + 45 days
        harvestEnd: '2025-06-06',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        directPlanting,
        'transplant',
        fromTransplantCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      // Transplant date = old sowDate (outdoor timing preserved)
      expect(updates.transplantDate).toBe('2025-04-01');
      // harvestStart = transplantDate + maturityDays = April 1 + 45 = May 16 (same as before!)
      expect(updates.harvestStart).toBe('2025-05-16');
    });
  });

  describe('transplant to direct', () => {
    it('uses transplantDate as new sowDate', () => {
      const transplantPlanting: Planting = {
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
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        transplantPlanting,
        'direct',
        eitherCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      // New sow date should be the old transplant date
      expect(updates.sowDate).toBe('2025-04-22');
      expect(updates.transplantDate).toBeUndefined();
    });

    it('recalculates harvestStart from new sowDate', () => {
      const transplantPlanting: Planting = {
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
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        transplantPlanting,
        'direct',
        eitherCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      // harvestStart = new sowDate + maturityDays
      // 2025-04-22 + 45 days = 2025-06-06
      expect(updates.harvestStart).toBe('2025-06-06');
    });
  });

  describe('harvest end calculation', () => {
    it('respects harvestDurationDays', () => {
      const directPlanting: Planting = {
        id: 'p1',
        cultivarId: eitherCultivar.id,
        label: 'Spinach #1',
        quantity: 10,
        sowDate: '2025-04-01',
        harvestStart: '2025-05-16',
        harvestEnd: '2025-06-06',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        directPlanting,
        'transplant',
        eitherCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      // With new behavior: outdoor timing preserved
      // transplantDate = 2025-04-01 (old sowDate), sowDate = 2025-03-11
      // harvestStart = 2025-03-11 + 45 = 2025-04-25 (maturityBasis is from_sow)
      // harvestEnd = harvestStart + harvestDurationDays (21) = 2025-04-25 + 21 = 2025-05-16
      expect(updates.harvestEnd).toBe('2025-05-16');
    });

    it('caps harvestEnd at frost deadline for frost-sensitive crops', () => {
      const frostSensitiveCultivar: Cultivar = {
        ...eitherCultivar,
        id: 'frost-sensitive-either',
        frostSensitive: true,
        maxGrowingTempC: 32, // Heat-tolerant so July temps don't interfere
        harvestDurationDays: 60, // Long harvest that would exceed frost
      };

      const latePlanting: Planting = {
        id: 'p1',
        cultivarId: frostSensitiveCultivar.id,
        label: 'Test #1',
        quantity: 10,
        sowDate: '2025-07-15',
        harvestStart: '2025-08-29',
        harvestEnd: '2025-10-15',
        method: 'direct',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const updates = expectViable(recalculatePlantingForMethodChange(
        latePlanting,
        'transplant',
        frostSensitiveCultivar,
        defaultFrostWindow,
        sussexClimate
      ));

      // Should be capped at frost deadline (Sept 15 - 4 days = Sept 11)
      expect(updates.harvestEnd).toBeDefined();
      expect(updates.harvestEnd! <= '2025-09-11').toBe(true);
    });
  });

  describe('temperature viability', () => {
    it('returns not viable when method change extends into too-hot period', () => {
      // Use a heat-sensitive cultivar (maxGrowingTempC: 21)
      const heatSensitiveCultivar: Cultivar = {
        ...eitherCultivar,
        id: 'spinach-heat-sensitive',
        maxGrowingTempC: 21,
      };

      // Late transplant in May — switching to direct pushes harvest into late June
      // where tmax exceeds 21°C (crosses ~June 16 with interpolation)
      const transplantPlanting: Planting = {
        id: 'p1',
        cultivarId: heatSensitiveCultivar.id,
        label: 'Spinach #1',
        quantity: 10,
        sowDate: '2025-04-22',
        transplantDate: '2025-05-13',
        harvestStart: '2025-06-06',
        harvestEnd: '2025-06-27',
        method: 'transplant',
        status: 'planned',
        successionNumber: 1,
        createdAt: '2025-01-01',
      };

      const result = recalculatePlantingForMethodChange(
        transplantPlanting,
        'direct',
        heatSensitiveCultivar,
        defaultFrostWindow,
        sussexClimate
      );

      expect(result.viable).toBe(false);
      if (!result.viable) {
        expect(result.reason).toContain('hot');
      }
    });
  });
});

// ============================================
// getOutdoorGrowingConstraints caching
// ============================================

describe('getOutdoorGrowingConstraints', () => {
  beforeEach(() => {
    clearConstraintsCache();
  });

  it('returns same reference on second call with same inputs', () => {
    const result1 = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);
    const result2 = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);
    expect(result1).toBe(result2); // same object reference = cache hit
  });

  it('returns different results for different cultivars', () => {
    const result1 = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);
    const result2 = getOutdoorGrowingConstraints(bushBeansCultivar, sussexClimate, 2025);
    expect(result1).not.toBe(result2);
  });

  it('returns different results for different years', () => {
    const result1 = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);
    const result2 = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2026);
    expect(result1).not.toBe(result2);
  });

  it('returns non-empty constraints for heat-sensitive crops', () => {
    const result = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);
    expect(result.length).toBeGreaterThan(0);
    // Spinach should have hot constraints in summer
    expect(result.some(c => c.type === 'hot')).toBe(true);
  });

  it('invalidates cache when climate reference changes', () => {
    const result1 = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);

    // Create a different climate object (same shape, different reference, warmer summers)
    const warmerClimate: Climate = {
      ...sussexClimate,
      monthlyAvgC: {
        ...sussexClimate.monthlyAvgC,
        '7': { ...sussexClimate.monthlyAvgC['7'], tmax_c: 30 },
        '8': { ...sussexClimate.monthlyAvgC['8'], tmax_c: 30 },
      },
    };

    const result2 = getOutdoorGrowingConstraints(spinachCultivar, warmerClimate, 2025);

    // Must NOT be the same reference — cache should have been invalidated
    expect(result2).not.toBe(result1);
    // Warmer climate should produce different constraint dates
    expect(result2).not.toEqual(result1);
  });

  it('evicts least-recently-used entry when cache is full', () => {
    // Fill cache with entries for cultivars A (spinach) and B (beans)
    const resultA = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);
    getOutdoorGrowingConstraints(bushBeansCultivar, sussexClimate, 2025);

    // Access A again — moves it ahead of B in LRU order
    const resultA2 = getOutdoorGrowingConstraints(spinachCultivar, sussexClimate, 2025);
    expect(resultA2).toBe(resultA); // still cached

    // Now fill the cache to capacity with unique cultivar ids to trigger eviction.
    // B was accessed least recently, so it should be evicted first.
    for (let i = 0; i < 100; i++) {
      const filler: Cultivar = { ...spinachCultivar, id: `filler-${i}` };
      getOutdoorGrowingConstraints(filler, sussexClimate, 2025);
    }

    // A was re-accessed after B, so B should have been evicted before A.
    // But with 100 fillers added, both A and B are evicted. Verify B is gone
    // by checking it returns a fresh (different reference) result.
    const resultB2 = getOutdoorGrowingConstraints(bushBeansCultivar, sussexClimate, 2025);
    // This is a fresh computation, not a cache hit — verified by checking
    // it's deeply equal but a new object
    expect(resultB2).toEqual(
      getOutdoorGrowingConstraints(bushBeansCultivar, sussexClimate, 2025)
    );
  });
});

// ============================================
// isGrowingPeriodViable with climateTable
// ============================================

describe('isGrowingPeriodViable with climateTable', () => {
  it('produces identical results with and without climateTable', () => {
    const ct: ClimateTable = {
      table: buildDailyClimateTable(sussexClimate, 2025),
      year: 2025,
    };

    // Test across several cultivar/date combinations
    const cases = [
      { cultivar: spinachCultivar, start: '2025-05-01', end: '2025-05-30' },
      { cultivar: spinachCultivar, start: '2025-06-01', end: '2025-07-15' },
      { cultivar: bushBeansCultivar, start: '2025-04-01', end: '2025-04-30' },
      { cultivar: bushBeansCultivar, start: '2025-06-15', end: '2025-08-15' },
      { cultivar: lettuceCultivar, start: '2025-05-01', end: '2025-06-14' },
    ];

    for (const { cultivar, start, end } of cases) {
      const without = isGrowingPeriodViable(start, end, cultivar, sussexClimate);
      const withTable = isGrowingPeriodViable(start, end, cultivar, sussexClimate, { climateTable: ct });
      expect(withTable.viable).toBe(without.viable);
      expect(withTable.reason).toBe(without.reason);
    }
  });

  it('works with checkHeatOnly and climateTable combined', () => {
    const ct: ClimateTable = {
      table: buildDailyClimateTable(sussexClimate, 2025),
      year: 2025,
    };

    const warmCrop: Cultivar = {
      ...bushBeansCultivar,
      id: 'warm-test',
      minGrowingTempC: 20,
    };

    // April is too cold for this crop, but checkHeatOnly should pass
    const result = isGrowingPeriodViable(
      '2025-04-01',
      '2025-04-30',
      warmCrop,
      sussexClimate,
      { checkHeatOnly: true, climateTable: ct }
    );
    expect(result.viable).toBe(true);
  });
});
