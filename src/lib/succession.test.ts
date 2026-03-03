import { describe, it, expect } from 'vitest';
import {
  calculateSuccessionWindows,
  calculateNextSuccession,
  calculateAvailableWindowsAfter,
  isGrowingPeriodViable,
  createPlantingFromWindow,
  getNextSuccessionNumber,
  renumberPlantingsForCrop,
  calculateFrostDeadline,
  calculateHarvestEnd,
  FROST_BUFFER_DAYS,
  type PlantingWindow,
} from './succession';
import type { Cultivar, Climate, Planting } from './types';
import {
  createFrostWindow,
  sussexClimate,
  defaultFrostWindow,
  spinachCultivar,
  bushBeansCultivar,
  tomatoCultivar,
  gaiLanCultivar,
  lettuceCultivar,
  beetCultivar,
  addDays,
} from './succession.test-fixtures';

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

      // Should have both spring and fall windows (cold-hardy crops get
      // temperature-aware frost deadlines that extend past summer heat gap)
      const sowDates = result.windows.map((w) => w.sowDate);
      const hasSpring = sowDates.some((d) => d.startsWith('2025-04'));
      const hasFall = sowDates.some((d) => d >= '2025-09-01');
      expect(hasSpring).toBe(true);
      expect(hasFall).toBe(true);
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

  it('heat gap ends before season end when cold-hardy crop can still grow in fall', () => {
    // Spinach minGrowingTempC=4 → frost deadline extends to Nov 15 (soil above 5°C).
    // latestSowDate = Nov 15 - 40 = Oct 6. Heat clears ~Sep 9, well before Oct 6.
    // So the heat gap should close and fall windows should follow.
    const heatGap = result.skippedPeriods.find((p) => /Too hot/i.test(p.reason));
    expect(heatGap).toBeDefined();
    // Heat gap ends around Sep 8 (the day before tmax drops below 20°C)
    expect(heatGap!.endDate >= '2025-08-01').toBe(true);
    expect(heatGap!.endDate <= '2025-09-15').toBe(true);
  });

  it('produces fall succession windows after summer heat gap', () => {
    // With temperature-aware frost deadline, spinach can be sown in fall
    const fallWindows = result.windows.filter((w) => w.sowDate >= '2025-09-01');
    expect(fallWindows.length).toBeGreaterThan(0);
    // Fall sow should be in September (after heat clears)
    expect(fallWindows[0].sowDate >= '2025-09-01').toBe(true);
    expect(fallWindows[0].sowDate <= '2025-09-15').toBe(true);
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

    // Should skip summer and find fall window (cold-hardy crops get
    // extended frost deadlines, so fall sowing is viable)
    expect(result).not.toBeNull();
    expect(result!.sowDate >= '2025-08-01').toBe(true);
    expect(result!.sowDate <= '2025-10-01').toBe(true);
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

  describe('phased temperature check (established growth)', () => {
    // Squash-like cultivar: germination needs 15°C, established growth at 10°C
    const squashCultivar: Cultivar = {
      id: 'squash-test',
      crop: 'Squash (Summer)',
      variety: 'Test Zucchini',
      germDaysMin: 4,
      germDaysMax: 8,
      maturityDays: 50,
      maturityBasis: 'from_sow',
      sowMethod: 'direct',
      directAfterLsfDays: 14,
      frostSensitive: true,
      minGrowingTempC: 15,
      minEstablishedGrowthTempC: 10,
      harvestDurationDays: 42,
      harvestStyle: 'continuous',
    };

    it('uses lower threshold after establishment phase', () => {
      // Direct sow June 15, establishment = germDaysMax(8) + 14 = 22 days
      // Establishment phase: June 15 - July 7 (needs tavg >= 16°C with margin)
      // June 15 tavg ≈ 17°C -> passes
      // Established phase: July 8 onwards (needs tavg >= 11°C with margin)
      // Sept tavg = 14°C -> passes with established threshold
      const result = isGrowingPeriodViable(
        '2025-06-15',
        '2025-09-10',
        squashCultivar,
        sussexClimate,
        {
          method: 'direct',
          establishmentDays: 22,
          minEstablishedGrowthTempC: 10,
        }
      );
      expect(result.viable).toBe(true);
    });

    it('fails without phased check when late-season temps drop below germination threshold', () => {
      // Same period but without established growth temp — should fail
      // because September tavg (~14°C) < 15+1=16°C effective min
      const result = isGrowingPeriodViable(
        '2025-06-15',
        '2025-09-10',
        squashCultivar,
        sussexClimate,
        { method: 'direct' }
      );
      expect(result.viable).toBe(false);
      expect(result.reason).toContain('Too cold');
    });

    it('still enforces establishment threshold during early phase', () => {
      // Start in May when tavg is only 12°C - below 15+1=16°C establishment threshold
      const result = isGrowingPeriodViable(
        '2025-05-01',
        '2025-07-15',
        squashCultivar,
        sussexClimate,
        {
          method: 'direct',
          establishmentDays: 22,
          minEstablishedGrowthTempC: 10,
        }
      );
      expect(result.viable).toBe(false);
      expect(result.reason).toContain('Too cold');
    });

    it('falls back to establishment threshold when minEstablishedGrowthTempC not provided', () => {
      // Without the established growth temp, behavior is unchanged
      const cultivarWithoutEstablished: Cultivar = {
        ...squashCultivar,
        id: 'squash-no-established',
        minEstablishedGrowthTempC: undefined,
      };

      // Period extending into September where tavg drops below 16°C
      const withoutResult = isGrowingPeriodViable(
        '2025-06-15',
        '2025-09-10',
        cultivarWithoutEstablished,
        sussexClimate,
        { method: 'direct' }
      );
      expect(withoutResult.viable).toBe(false);
    });

    it('uses shorter establishment period for transplants', () => {
      const transplantSquash: Cultivar = {
        ...squashCultivar,
        id: 'squash-transplant-test',
        sowMethod: 'transplant',
        indoorLeadWeeksMin: 2,
        indoorLeadWeeksMax: 3,
        transplantAfterLsfDays: 14,
        minGrowingTempTransplantC: 12,
      };

      // Transplant June 15, establishment = 14 days (transplant method)
      // Establishment phase: June 15 - June 29 (needs tavg >= 13°C with margin for transplant threshold)
      // June 15-29 tavg ≈ 17-18°C -> passes
      // Established phase: June 30 onwards (needs tavg >= 11°C with margin)
      const result = isGrowingPeriodViable(
        '2025-06-15',
        '2025-09-10',
        transplantSquash,
        sussexClimate,
        {
          method: 'transplant',
          establishmentDays: 14,
          minEstablishedGrowthTempC: 10,
        }
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
// Shared Utility Tests: FROST_BUFFER_DAYS
// ============================================

describe('FROST_BUFFER_DAYS', () => {
  it('equals 4', () => {
    expect(FROST_BUFFER_DAYS).toBe(4);
  });
});

// ============================================
// Shared Utility Tests: calculateFrostDeadline
// ============================================

describe('calculateFrostDeadline', () => {
  describe('frost-sensitive crops', () => {
    it('uses earliest probable frost minus buffer when climate data is provided', () => {
      // Climate earliest fall frost: 09-15, buffer: 4 days
      // Deadline = 2025-09-15 - 4 = 2025-09-11
      const result = calculateFrostDeadline(
        { frostSensitive: true },
        defaultFrostWindow,
        sussexClimate
      );
      expect(result).toBe('2025-09-11');
    });

    it('falls back to frostWindow date minus buffer without climate', () => {
      // frostWindow.firstFallFrost = 2025-10-01, buffer: 4 days
      // Deadline = 2025-10-01 - 4 = 2025-09-27
      const result = calculateFrostDeadline(
        { frostSensitive: true },
        defaultFrostWindow
      );
      expect(result).toBe('2025-09-27');
    });

    it('falls back to frostWindow date when climate has no earliest frost', () => {
      const climateNoEarliest: Climate = {
        ...sussexClimate,
        firstFallFrost: {
          ...sussexClimate.firstFallFrost!,
          earliest: undefined as unknown as string,
        },
      };
      const result = calculateFrostDeadline(
        { frostSensitive: true },
        defaultFrostWindow,
        climateNoEarliest
      );
      // Falls back to frostWindow date: 2025-10-01 - 4 = 2025-09-27
      expect(result).toBe('2025-09-27');
    });
  });

  describe('frost-tolerant crops', () => {
    it('uses frost+21 fallback when no minGrowingTempC is set', () => {
      // No minGrowingTempC → can't do temperature-aware calculation
      // Climate typical fall frost: 10-01
      // Deadline = 2025-10-01 + 21 = 2025-10-22
      const result = calculateFrostDeadline(
        { frostSensitive: false },
        defaultFrostWindow,
        sussexClimate
      );
      expect(result).toBe('2025-10-22');
    });

    it('falls back to frostWindow date plus 21 days without climate', () => {
      // frostWindow.firstFallFrost = 2025-10-01
      // Deadline = 2025-10-01 + 21 = 2025-10-22
      const result = calculateFrostDeadline(
        { frostSensitive: false },
        defaultFrostWindow
      );
      expect(result).toBe('2025-10-22');
    });

    it('extends deadline past frost+21 for cold-hardy crops based on soil temp', () => {
      // Spinach: minGrowingTempC=4, effectiveMin=5 (4 + 1°C margin)
      // Frost+21 = Oct 22. Soil stays above 5°C until Nov 15 (interpolated).
      // Nov 16 soil = 4.87°C < 5 → deadline = Nov 15
      const result = calculateFrostDeadline(
        { frostSensitive: false, minGrowingTempC: 4 },
        defaultFrostWindow,
        sussexClimate
      );
      expect(result).toBe('2025-11-15');
    });

    it('extends further for very cold-hardy crops', () => {
      // minGrowingTempC=2, effectiveMin=3
      // Soil stays above 3°C until Nov 30 (interpolated between Nov 15=5°C and Dec 15=1°C)
      // Dec 1 soil = 2.87°C < 3 → deadline = Nov 30
      const result = calculateFrostDeadline(
        { frostSensitive: false, minGrowingTempC: 2 },
        defaultFrostWindow,
        sussexClimate
      );
      expect(result).toBe('2025-11-30');
    });

    it('gives shorter extension for crops with higher cold threshold', () => {
      // minGrowingTempC=7, effectiveMin=8
      // Soil drops below 8°C on Oct 28 (interpolated between Oct 15=10°C and Nov 15=5°C)
      // → deadline = Oct 27
      const result = calculateFrostDeadline(
        { frostSensitive: false, minGrowingTempC: 7 },
        defaultFrostWindow,
        sussexClimate
      );
      expect(result).toBe('2025-10-27');
    });

    it('does not extend when soil already below threshold at frost+21', () => {
      // minGrowingTempC=10, effectiveMin=11
      // Oct 23 soil = 8.71°C, already below 11 → no extension, stays at frost+21
      const result = calculateFrostDeadline(
        { frostSensitive: false, minGrowingTempC: 10 },
        defaultFrostWindow,
        sussexClimate
      );
      expect(result).toBe('2025-10-22');
    });

    it('colder-hardy crops get later deadlines than warmer ones', () => {
      const veryHardy = calculateFrostDeadline(
        { frostSensitive: false, minGrowingTempC: 2 },
        defaultFrostWindow,
        sussexClimate
      );
      const moderate = calculateFrostDeadline(
        { frostSensitive: false, minGrowingTempC: 7 },
        defaultFrostWindow,
        sussexClimate
      );
      expect(veryHardy > moderate).toBe(true);
    });
  });

  describe('different frost windows', () => {
    it('adjusts deadline based on frost window year', () => {
      const earlyFrostWindow = createFrostWindow('2025-05-15', '2025-09-15');
      const result = calculateFrostDeadline(
        { frostSensitive: true },
        earlyFrostWindow,
        sussexClimate
      );
      // Climate earliest frost 09-15 in the same year, minus 4 days
      expect(result).toBe('2025-09-11');
    });

    it('produces later deadline for frost-tolerant vs frost-sensitive', () => {
      const tolerant = calculateFrostDeadline(
        { frostSensitive: false, minGrowingTempC: 4 },
        defaultFrostWindow,
        sussexClimate
      );
      const sensitive = calculateFrostDeadline(
        { frostSensitive: true },
        defaultFrostWindow,
        sussexClimate
      );
      expect(tolerant > sensitive).toBe(true);
    });
  });
});

// ============================================
// Shared Utility Tests: calculateHarvestEnd
// ============================================

describe('calculateHarvestEnd', () => {
  const frostDeadline = '2025-09-11'; // Typical frost-sensitive deadline

  describe('explicit harvestDurationDays', () => {
    it('returns harvestStart + duration when within frost deadline', () => {
      // harvestStart + 21 days = 2025-07-22, well before Sept 11
      const result = calculateHarvestEnd(
        '2025-07-01',
        { harvestDurationDays: 21, harvestStyle: 'continuous' as const },
        frostDeadline
      );
      expect(result).toBe('2025-07-22');
    });

    it('caps at frost deadline when duration exceeds it', () => {
      // harvestStart + 60 days = 2025-10-09, past Sept 11
      const result = calculateHarvestEnd(
        '2025-08-10',
        { harvestDurationDays: 60, harvestStyle: 'continuous' as const },
        frostDeadline
      );
      expect(result).toBe(frostDeadline);
    });

    it('returns frost deadline when duration ends exactly on deadline', () => {
      // harvestStart + 21 = 2025-09-11 = deadline exactly
      const result = calculateHarvestEnd(
        '2025-08-21',
        { harvestDurationDays: 21, harvestStyle: 'continuous' as const },
        frostDeadline
      );
      expect(result).toBe(frostDeadline);
    });
  });

  describe('null harvestDurationDays with continuous harvest', () => {
    it('returns frost deadline (harvest until frost)', () => {
      const result = calculateHarvestEnd(
        '2025-07-21',
        { harvestDurationDays: null, harvestStyle: 'continuous' as const },
        frostDeadline
      );
      expect(result).toBe(frostDeadline);
    });
  });

  describe('no harvestDurationDays with single harvest', () => {
    it('uses default 7-day duration for single harvest', () => {
      const result = calculateHarvestEnd(
        '2025-07-01',
        { harvestDurationDays: undefined, harvestStyle: 'single' as const },
        frostDeadline
      );
      // Default single duration = 7 days
      expect(result).toBe('2025-07-08');
    });
  });

  describe('undefined harvestDurationDays with continuous harvest', () => {
    it('returns frost deadline (same as null — harvest until frost)', () => {
      // undefined and null both pass the `!= null` check the same way,
      // so continuous harvest without a duration always runs until frost
      const result = calculateHarvestEnd(
        '2025-07-01',
        { harvestDurationDays: undefined, harvestStyle: 'continuous' as const },
        frostDeadline
      );
      expect(result).toBe(frostDeadline);
    });
  });

  describe('frost deadline interaction', () => {
    it('different deadlines change the cap', () => {
      const lateFrostDeadline = '2025-10-22'; // frost-tolerant deadline
      const result = calculateHarvestEnd(
        '2025-10-01',
        { harvestDurationDays: 30, harvestStyle: 'continuous' as const },
        lateFrostDeadline
      );
      // 10-01 + 30 = 10-31 > 10-22, so capped
      expect(result).toBe(lateFrostDeadline);
    });

    it('frost-tolerant deadline allows longer harvest', () => {
      const lateFrostDeadline = '2025-10-22';
      const result = calculateHarvestEnd(
        '2025-10-01',
        { harvestDurationDays: 14, harvestStyle: 'continuous' as const },
        lateFrostDeadline
      );
      // 10-01 + 14 = 10-15, before 10-22 deadline
      expect(result).toBe('2025-10-15');
    });
  });
});
