import type { Cultivar, Climate, FrostWindow } from './types';

// ============================================
// Test Fixtures
// ============================================

export const createFrostWindow = (
  lastSpring: string,
  firstFall: string
): FrostWindow => ({
  id: 'test-frost',
  lastSpringFrost: lastSpring,
  firstFallFrost: firstFall,
});

// Sussex, NB climate data (simplified for testing)
export const sussexClimate: Climate = {
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
export const defaultFrostWindow = createFrostWindow('2025-06-01', '2025-10-01');

// ============================================
// Cultivar Fixtures Based on Documentation Examples
// ============================================

// Example 1: Spinach - heat-sensitive, frost-tolerant, direct sow
export const spinachCultivar: Cultivar = {
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
export const bushBeansCultivar: Cultivar = {
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
export const tomatoCultivar: Cultivar = {
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
export const gaiLanCultivar: Cultivar = {
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
export const lettuceCultivar: Cultivar = {
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
export const beetCultivar: Cultivar = {
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
// Utility Functions
// ============================================

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}
