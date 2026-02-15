import { describe, it, expect } from 'vitest';
import { toDate, addDays, addWeeks, daysBetween, getMonth, ensureNumber, interpolateClimateValue, getInterpolatedClimate, dayOfYear, buildDailyClimateTable, lookupDailyClimate } from './dateUtils';
import type { Climate } from './types';

// ============================================
// toDate
// ============================================

describe('toDate', () => {
  it('parses ISO date string to UTC midnight', () => {
    const date = toDate('2025-05-15');
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(4); // 0-indexed
    expect(date.getUTCDate()).toBe(15);
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });

  it('handles year boundaries', () => {
    const date = toDate('2025-01-01');
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(1);
  });
});

// ============================================
// addDays
// ============================================

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2025-05-15', 7)).toBe('2025-05-22');
  });

  it('subtracts with negative days', () => {
    expect(addDays('2025-05-15', -7)).toBe('2025-05-08');
  });

  it('crosses month boundaries', () => {
    expect(addDays('2025-05-28', 7)).toBe('2025-06-04');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2025-12-28', 7)).toBe('2026-01-04');
  });

  it('handles zero days', () => {
    expect(addDays('2025-05-15', 0)).toBe('2025-05-15');
  });

  it('handles leap year February', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
  });
});

// ============================================
// addWeeks
// ============================================

describe('addWeeks', () => {
  it('adds whole weeks', () => {
    expect(addWeeks('2025-05-15', 2)).toBe('2025-05-29');
  });

  it('subtracts with negative weeks', () => {
    expect(addWeeks('2025-05-15', -2)).toBe('2025-05-01');
  });

  it('rounds fractional weeks', () => {
    // 1.5 weeks = 10.5 days, rounds to 11
    expect(addWeeks('2025-05-15', 1.5)).toBe('2025-05-26');
  });
});

// ============================================
// daysBetween
// ============================================

describe('daysBetween', () => {
  it('calculates positive difference', () => {
    expect(daysBetween('2025-05-15', '2025-05-22')).toBe(7);
  });

  it('calculates negative difference when end is before start', () => {
    expect(daysBetween('2025-05-22', '2025-05-15')).toBe(-7);
  });

  it('returns zero for same date', () => {
    expect(daysBetween('2025-05-15', '2025-05-15')).toBe(0);
  });

  it('works across month boundaries', () => {
    expect(daysBetween('2025-05-28', '2025-06-04')).toBe(7);
  });

  it('works across year boundaries', () => {
    expect(daysBetween('2025-12-28', '2026-01-04')).toBe(7);
  });
});

// ============================================
// getMonth
// ============================================

describe('getMonth', () => {
  it('returns 1-based month number', () => {
    expect(getMonth('2025-01-15')).toBe(1);
    expect(getMonth('2025-06-15')).toBe(6);
    expect(getMonth('2025-12-15')).toBe(12);
  });
});

// ============================================
// ensureNumber
// ============================================

describe('ensureNumber', () => {
  it('returns the number when given a number', () => {
    expect(ensureNumber(42)).toBe(42);
    expect(ensureNumber(0)).toBe(0);
    expect(ensureNumber(-5)).toBe(-5);
  });

  it('returns fallback for null', () => {
    expect(ensureNumber(null)).toBe(0);
    expect(ensureNumber(null, 10)).toBe(10);
  });

  it('returns fallback for undefined', () => {
    expect(ensureNumber(undefined)).toBe(0);
    expect(ensureNumber(undefined, 10)).toBe(10);
  });

  it('uses 0 as default fallback', () => {
    expect(ensureNumber(null)).toBe(0);
  });
});

// ============================================
// Climate fixture for interpolation tests
// ============================================

const testClimate: Climate = {
  location: 'Test',
  coordinates: { lat: 45.0, lon: -65.0 },
  elevation_m: 30,
  source: 'test',
  monthlyAvgC: {
    '1':  { tavg_c: -9,  tmin_c: -15, tmax_c: -3,  soil_avg_c: -2,  gdd_base5: 0 },
    '2':  { tavg_c: -7,  tmin_c: -13, tmax_c: -1,  soil_avg_c: -1,  gdd_base5: 0 },
    '3':  { tavg_c: -1,  tmin_c: -7,  tmax_c: 4,   soil_avg_c: 1,   gdd_base5: 0 },
    '4':  { tavg_c: 6,   tmin_c: 0,   tmax_c: 10,  soil_avg_c: 5,   gdd_base5: 30 },
    '5':  { tavg_c: 12,  tmin_c: 5,   tmax_c: 17,  soil_avg_c: 10,  gdd_base5: 150 },
    '6':  { tavg_c: 17,  tmin_c: 10,  tmax_c: 21,  soil_avg_c: 15,  gdd_base5: 350 },
    '7':  { tavg_c: 20,  tmin_c: 13,  tmax_c: 24,  soil_avg_c: 18,  gdd_base5: 600 },
    '8':  { tavg_c: 19,  tmin_c: 12,  tmax_c: 24,  soil_avg_c: 17,  gdd_base5: 850 },
    '9':  { tavg_c: 14,  tmin_c: 7,   tmax_c: 19,  soil_avg_c: 14,  gdd_base5: 1000 },
    '10': { tavg_c: 8,   tmin_c: 2,   tmax_c: 12,  soil_avg_c: 10,  gdd_base5: 1100 },
    '11': { tavg_c: 2,   tmin_c: -3,  tmax_c: 6,   soil_avg_c: 5,   gdd_base5: 1120 },
    '12': { tavg_c: -5,  tmin_c: -11, tmax_c: 0,   soil_avg_c: 1,   gdd_base5: 1120 },
  },
  lastSpringFrost: {
    earliest: '04-20', typical: '05-15', latest: '06-05',
    probability10: '04-25', probability50: '05-15', probability90: '06-01',
  },
  firstFallFrost: {
    earliest: '09-15', typical: '10-01', latest: '10-20',
    probability10: '09-20', probability50: '10-01', probability90: '10-15',
  },
  growingSeasonDays: 140,
  annualGDD: 1120,
  notes: 'Test',
};

// ============================================
// interpolateClimateValue
// ============================================

describe('interpolateClimateValue', () => {
  describe('midpoint dates', () => {
    it('returns exact monthly value on the 15th', () => {
      // June 15 is the midpoint for month 6 — should return June's tmax_c exactly
      expect(interpolateClimateValue('2025-06-15', testClimate, 'tmax_c')).toBe(21);
    });

    it('returns exact value for January 15', () => {
      expect(interpolateClimateValue('2025-01-15', testClimate, 'tavg_c')).toBe(-9);
    });

    it('returns exact value for December 15', () => {
      expect(interpolateClimateValue('2025-12-15', testClimate, 'tmax_c')).toBe(0);
    });
  });

  describe('linear interpolation between midpoints', () => {
    it('interpolates between adjacent months (day after midpoint)', () => {
      // June 15 tmax=21, July 15 tmax=24
      // June 30: 15 days into a 30-day span → t = 15/30 = 0.5
      // Expected: 21 + 0.5 * (24 - 21) = 22.5
      const result = interpolateClimateValue('2025-06-30', testClimate, 'tmax_c');
      expect(result).toBeCloseTo(22.5, 1);
    });

    it('interpolates in first half of month (before midpoint)', () => {
      // June 1: between May 15 (tmax=17) and June 15 (tmax=21)
      // 17 days into a 31-day span → t = 17/31 ≈ 0.548
      // Expected: 17 + 0.548 * (21 - 17) ≈ 19.19
      const result = interpolateClimateValue('2025-06-01', testClimate, 'tmax_c');
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(17);
      expect(result!).toBeLessThan(21);
    });

    it('produces monotonically increasing values in a warming trend', () => {
      // March through June: tmax goes 4 → 10 → 17 → 21
      const dates = ['2025-03-15', '2025-04-01', '2025-04-15', '2025-05-01', '2025-05-15', '2025-06-01', '2025-06-15'];
      const values = dates.map(d => interpolateClimateValue(d, testClimate, 'tmax_c')!);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      }
    });
  });

  describe('December → January year wrap', () => {
    it('interpolates in late December (Dec 15 → Jan 15)', () => {
      // Dec 15 tmax=0, Jan 15 tmax=-3
      // Dec 31: 16 days into a 31-day span → t = 16/31 ≈ 0.516
      // Expected: 0 + 0.516 * (-3 - 0) ≈ -1.55
      const result = interpolateClimateValue('2025-12-31', testClimate, 'tmax_c');
      expect(result).not.toBeNull();
      expect(result!).toBeLessThan(0);
      expect(result!).toBeGreaterThan(-3);
    });

    it('interpolates in early January (Dec 15 → Jan 15)', () => {
      // Jan 1: between Dec 15 prev year and Jan 15 this year
      // Dec 15 tmax=0, Jan 15 tmax=-3
      // 17 days into a 31-day span → t = 17/31 ≈ 0.548
      // Expected: 0 + 0.548 * (-3 - 0) ≈ -1.65
      const result = interpolateClimateValue('2025-01-01', testClimate, 'tmax_c');
      expect(result).not.toBeNull();
      expect(result!).toBeLessThan(0);
      expect(result!).toBeGreaterThan(-3);
    });

    it('Dec 31 and Jan 1 are close in value (continuous wrap)', () => {
      const dec31 = interpolateClimateValue('2025-12-31', testClimate, 'tavg_c');
      const jan1 = interpolateClimateValue('2026-01-01', testClimate, 'tavg_c');
      expect(dec31).not.toBeNull();
      expect(jan1).not.toBeNull();
      // One day apart — values should be very close
      expect(Math.abs(dec31! - jan1!)).toBeLessThan(0.5);
    });
  });

  describe('missing data handling', () => {
    it('returns null when bounding month data is missing', () => {
      const sparseClimate: Climate = {
        ...testClimate,
        monthlyAvgC: {
          '6': testClimate.monthlyAvgC['6'],
          // No month 5 or 7 data
        },
      };
      // June 1 needs May 15 data (month 5) — missing
      expect(interpolateClimateValue('2025-06-01', sparseClimate, 'tmax_c')).toBeNull();
    });

    it('returns null when the field is null on one side', () => {
      const nullFieldClimate: Climate = {
        ...testClimate,
        monthlyAvgC: {
          ...testClimate.monthlyAvgC,
          '6': { ...testClimate.monthlyAvgC['6'], soil_avg_c: undefined as unknown as number },
        },
      };
      // June 15 has null soil_avg_c — direct midpoint hit but field missing
      // Actually the midpoint would be month 6 for dates >= Jun 15
      // soil_avg_c is undefined on month 6, so valA is null → returns null
      expect(interpolateClimateValue('2025-06-15', nullFieldClimate, 'soil_avg_c')).toBeNull();
    });
  });

  describe('all temperature fields', () => {
    it('interpolates tavg_c', () => {
      const result = interpolateClimateValue('2025-07-15', testClimate, 'tavg_c');
      expect(result).toBe(20);
    });

    it('interpolates tmin_c', () => {
      const result = interpolateClimateValue('2025-07-15', testClimate, 'tmin_c');
      expect(result).toBe(13);
    });

    it('interpolates soil_avg_c', () => {
      const result = interpolateClimateValue('2025-07-15', testClimate, 'soil_avg_c');
      expect(result).toBe(18);
    });
  });
});

// ============================================
// getInterpolatedClimate
// ============================================

describe('getInterpolatedClimate', () => {
  it('returns all four temperature fields', () => {
    const result = getInterpolatedClimate('2025-06-15', testClimate);
    expect(result).toHaveProperty('tavg_c');
    expect(result).toHaveProperty('tmin_c');
    expect(result).toHaveProperty('tmax_c');
    expect(result).toHaveProperty('soil_avg_c');
  });

  it('returns exact monthly values on midpoint dates', () => {
    const result = getInterpolatedClimate('2025-06-15', testClimate);
    expect(result.tavg_c).toBe(17);
    expect(result.tmin_c).toBe(10);
    expect(result.tmax_c).toBe(21);
    expect(result.soil_avg_c).toBe(15);
  });

  it('interpolates all fields consistently for non-midpoint dates', () => {
    const result = getInterpolatedClimate('2025-06-30', testClimate);
    // All should be between June 15 and July 15 values
    expect(result.tavg_c!).toBeGreaterThan(17);
    expect(result.tavg_c!).toBeLessThan(20);
    expect(result.tmax_c!).toBeGreaterThan(21);
    expect(result.tmax_c!).toBeLessThan(24);
  });

  it('handles the December-January wrap for all fields', () => {
    const result = getInterpolatedClimate('2025-12-31', testClimate);
    // Dec tavg=-5, Jan tavg=-9 → should be between
    expect(result.tavg_c!).toBeLessThan(-5);
    expect(result.tavg_c!).toBeGreaterThan(-9);
  });
});

// ============================================
// dayOfYear
// ============================================

describe('dayOfYear', () => {
  it('returns 0 for January 1', () => {
    expect(dayOfYear('2025-01-01')).toBe(0);
  });

  it('returns 364 for December 31 (non-leap year)', () => {
    expect(dayOfYear('2025-12-31')).toBe(364);
  });

  it('returns 365 for December 31 (leap year)', () => {
    expect(dayOfYear('2024-12-31')).toBe(365);
  });

  it('returns 59 for March 1 (non-leap year)', () => {
    expect(dayOfYear('2025-03-01')).toBe(59);
  });

  it('returns 60 for March 1 (leap year)', () => {
    expect(dayOfYear('2024-03-01')).toBe(60);
  });

  it('returns 181 for July 1 (non-leap year)', () => {
    expect(dayOfYear('2025-07-01')).toBe(181);
  });
});

// ============================================
// buildDailyClimateTable
// ============================================

describe('buildDailyClimateTable', () => {
  it('returns 365 elements for a non-leap year', () => {
    const table = buildDailyClimateTable(testClimate, 2025);
    expect(table).toHaveLength(365);
  });

  it('returns 366 elements for a leap year', () => {
    const table = buildDailyClimateTable(testClimate, 2024);
    expect(table).toHaveLength(366);
  });

  it('matches getInterpolatedClimate for spot-checked dates', () => {
    const table = buildDailyClimateTable(testClimate, 2025);
    const checkDates = ['2025-01-01', '2025-03-15', '2025-06-30', '2025-09-01', '2025-12-31'];
    for (const date of checkDates) {
      const doy = dayOfYear(date);
      const expected = getInterpolatedClimate(date, testClimate);
      expect(table[doy].tavg_c).toBeCloseTo(expected.tavg_c!, 5);
      expect(table[doy].tmax_c).toBeCloseTo(expected.tmax_c!, 5);
      expect(table[doy].tmin_c).toBeCloseTo(expected.tmin_c!, 5);
      expect(table[doy].soil_avg_c).toBeCloseTo(expected.soil_avg_c!, 5);
    }
  });

  it('has all four temperature fields on every entry', () => {
    const table = buildDailyClimateTable(testClimate, 2025);
    for (const entry of table) {
      expect(entry).toHaveProperty('tavg_c');
      expect(entry).toHaveProperty('tmin_c');
      expect(entry).toHaveProperty('tmax_c');
      expect(entry).toHaveProperty('soil_avg_c');
    }
  });
});

// ============================================
// lookupDailyClimate
// ============================================

describe('lookupDailyClimate', () => {
  it('returns table value for same-year dates', () => {
    const table = buildDailyClimateTable(testClimate, 2025);
    const result = lookupDailyClimate(table, 2025, '2025-06-15', testClimate);
    // June 15 midpoint exact value
    expect(result.tavg_c).toBe(17);
    expect(result.tmax_c).toBe(21);
  });

  it('falls back to interpolation for cross-year dates', () => {
    const table = buildDailyClimateTable(testClimate, 2025);
    const result = lookupDailyClimate(table, 2025, '2026-01-05', testClimate);
    const expected = getInterpolatedClimate('2026-01-05', testClimate);
    expect(result.tavg_c).toBeCloseTo(expected.tavg_c!, 5);
    expect(result.tmax_c).toBeCloseTo(expected.tmax_c!, 5);
  });

  it('returns same values as direct table access', () => {
    const table = buildDailyClimateTable(testClimate, 2025);
    const doy = dayOfYear('2025-07-01');
    const result = lookupDailyClimate(table, 2025, '2025-07-01', testClimate);
    expect(result).toBe(table[doy]); // Same reference (O(1) lookup)
  });
});
