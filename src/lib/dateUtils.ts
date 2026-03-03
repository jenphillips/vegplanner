/**
 * Shared date utilities for planting schedule calculations.
 * All functions work with ISO date strings (YYYY-MM-DD format).
 */

import type { Climate, MonthlyTemperature } from './types';

/** Parse an ISO date string to a Date object (UTC midnight) */
export const toDate = (iso: string): Date => new Date(iso + 'T00:00:00Z');

/** Add days to an ISO date string, returns new ISO date string */
export const addDays = (iso: string, days: number): string => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Add weeks to an ISO date string, returns new ISO date string */
export const addWeeks = (iso: string, weeks: number): string =>
  addDays(iso, Math.round(weeks * 7));

/** Calculate the number of days between two ISO date strings */
export const daysBetween = (start: string, end: string): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / msPerDay);
};

/** Extract the month (1-12) from an ISO date string */
export const getMonth = (iso: string): number => {
  return toDate(iso).getUTCMonth() + 1;
};

/** Safely convert a nullable number to a number with a fallback */
export const ensureNumber = (value: number | null | undefined, fallback = 0): number =>
  typeof value === 'number' ? value : fallback;

/**
 * Interpolate a monthly climate value for a specific date.
 *
 * Each monthly average is assigned to the 15th of its month (midpoint).
 * Between midpoints, values are linearly interpolated. December 15 wraps
 * to January 15 for the Dec→Jan transition.
 *
 * Returns null if either bounding month lacks data for the requested field.
 */
export function interpolateClimateValue(
  date: string,
  climate: Climate,
  field: keyof MonthlyTemperature
): number | null {
  const d = toDate(date);
  const month = d.getUTCMonth() + 1; // 1-12
  const dayOfMonth = d.getUTCDate();
  const year = d.getUTCFullYear();

  let monthA: number; // "left" midpoint month
  let monthB: number; // "right" midpoint month

  if (dayOfMonth >= 15) {
    monthA = month;
    monthB = month === 12 ? 1 : month + 1;
  } else {
    monthA = month === 1 ? 12 : month - 1;
    monthB = month;
  }

  const dataA = climate.monthlyAvgC[String(monthA)];
  const dataB = climate.monthlyAvgC[String(monthB)];
  if (!dataA || !dataB) return null;

  const valA = dataA[field];
  const valB = dataB[field];
  if (valA == null || valB == null) return null;

  // Build ISO dates for the two midpoints, handling year wrap
  let midpointA: string;
  let midpointB: string;

  if (monthA === 12 && monthB === 1) {
    if (dayOfMonth >= 15) {
      // Date is in Dec 15+: Dec 15 this year → Jan 15 next year
      midpointA = `${year}-12-15`;
      midpointB = `${year + 1}-01-15`;
    } else {
      // Date is in Jan 1-14: Dec 15 prev year → Jan 15 this year
      midpointA = `${year - 1}-12-15`;
      midpointB = `${year}-01-15`;
    }
  } else {
    midpointA = `${year}-${String(monthA).padStart(2, '0')}-15`;
    midpointB = `${year}-${String(monthB).padStart(2, '0')}-15`;
  }

  const totalDays = daysBetween(midpointA, midpointB);
  const elapsed = daysBetween(midpointA, date);
  const t = totalDays > 0 ? elapsed / totalDays : 0;

  return valA + t * (valB - valA);
}

// ============================================
// Pre-computed Climate Lookup Table
// ============================================

/** Interpolated climate values for a single day. */
export type DailyClimate = {
  tavg_c: number | null;
  tmin_c: number | null;
  tmax_c: number | null;
  soil_avg_c: number | null;
};

/** A pre-computed climate lookup table for a specific year. */
export type ClimateTable = {
  table: DailyClimate[];
  year: number;
};

/**
 * Module-level cache for the climate table. Since climate data and year are
 * static for a session, this avoids rebuilding the table on every call.
 */
let cachedClimateTable: { climate: Climate; ct: ClimateTable } | null = null;

/**
 * Get or build a cached climate lookup table for the given climate and year.
 * Returns the same table instance when called with the same climate reference
 * and year, avoiding redundant interpolation work.
 */
export function getClimateTable(climate: Climate, year: number): ClimateTable {
  if (cachedClimateTable && cachedClimateTable.ct.year === year && cachedClimateTable.climate === climate) {
    return cachedClimateTable.ct;
  }
  const ct: ClimateTable = { table: buildDailyClimateTable(climate, year), year };
  cachedClimateTable = { climate, ct };
  return ct;
}

/**
 * Get interpolated climate data for a specific date.
 * Returns all temperature fields interpolated between monthly midpoints.
 */
export function getInterpolatedClimate(
  date: string,
  climate: Climate
): DailyClimate {
  return {
    tavg_c: interpolateClimateValue(date, climate, 'tavg_c'),
    tmin_c: interpolateClimateValue(date, climate, 'tmin_c'),
    tmax_c: interpolateClimateValue(date, climate, 'tmax_c'),
    soil_avg_c: interpolateClimateValue(date, climate, 'soil_avg_c'),
  };
}

/**
 * Return the 0-based day-of-year for an ISO date string.
 * Jan 1 = 0, Dec 31 = 364 (or 365 in leap years).
 * Uses string parsing to avoid Date object allocation on the hot path.
 */
export function dayOfYear(iso: string): number {
  const year = parseInt(iso.slice(0, 4), 10);
  const month = parseInt(iso.slice(5, 7), 10) - 1;
  const day = parseInt(iso.slice(8, 10), 10);
  return Math.round(
    (Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / (24 * 60 * 60 * 1000)
  );
}

/**
 * Build a pre-computed array of daily climate values for an entire year.
 * One-time cost of 365×4 interpolation calls, then all lookups are O(1).
 */
export function buildDailyClimateTable(climate: Climate, year: number): DailyClimate[] {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const table: DailyClimate[] = new Array(daysInYear);

  const d = new Date(Date.UTC(year, 0, 1));
  for (let i = 0; i < daysInYear; i++) {
    const iso = d.toISOString().slice(0, 10);
    table[i] = {
      tavg_c: interpolateClimateValue(iso, climate, 'tavg_c'),
      tmin_c: interpolateClimateValue(iso, climate, 'tmin_c'),
      tmax_c: interpolateClimateValue(iso, climate, 'tmax_c'),
      soil_avg_c: interpolateClimateValue(iso, climate, 'soil_avg_c'),
    };
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return table;
}

/**
 * O(1) climate lookup from a pre-built table.
 * Falls back to getInterpolatedClimate for dates outside the table's year.
 */
export function lookupDailyClimate(
  table: DailyClimate[],
  tableYear: number,
  date: string,
  climate: Climate
): DailyClimate {
  const dateYear = parseInt(date.slice(0, 4), 10);

  if (dateYear === tableYear) {
    const doy = dayOfYear(date);
    if (doy >= 0 && doy < table.length) {
      return table[doy];
    }
  }

  return getInterpolatedClimate(date, climate);
}
