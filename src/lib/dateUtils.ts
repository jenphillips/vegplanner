/**
 * Shared date utilities for planting schedule calculations.
 * All functions work with ISO date strings (YYYY-MM-DD format).
 */

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
