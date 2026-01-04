import { describe, it, expect } from 'vitest';
import { toDate, addDays, addWeeks, daysBetween, getMonth, ensureNumber } from './dateUtils';

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
