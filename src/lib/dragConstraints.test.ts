import { describe, it, expect } from 'vitest';
import { calculateShiftBounds } from './dragConstraints';
import type { Cultivar, Climate, FrostWindow, Planting } from './types';

// ============================================
// Test Fixtures
// ============================================

const createFrostWindow = (lastSpring: string, firstFall: string): FrostWindow => ({
  id: 'test-frost',
  lastSpringFrost: lastSpring,
  firstFallFrost: firstFall,
});

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

// Last frost June 1st
const defaultFrostWindow = createFrostWindow('2025-06-01', '2025-10-01');

// Cosmos - frost-sensitive flower with different direct/transplant offsets
// This is the bug case: directAfterLsfDays=-7 (before frost), transplantAfterLsfDays=0 (at frost)
const cosmosCultivar: Cultivar = {
  id: 'cosmos-test',
  crop: 'Cosmos',
  variety: 'Sensation Mix',
  germDaysMin: 7,
  germDaysMax: 10,
  maturityDays: 60,
  maturityBasis: 'from_sow',
  sowMethod: 'either',
  directAfterLsfDays: -7, // Can direct sow 7 days BEFORE last frost
  transplantAfterLsfDays: 0, // Must transplant ON or AFTER last frost
  indoorLeadWeeksMin: 4,
  indoorLeadWeeksMax: 6,
  frostSensitive: true,
  harvestStyle: 'continuous',
};

// Beets - frost-tolerant vegetable
const beetsCultivar: Cultivar = {
  id: 'beets-test',
  crop: 'Beets',
  variety: 'Detroit Dark Red',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 55,
  maturityBasis: 'from_sow',
  sowMethod: 'either',
  directAfterLsfDays: -14,
  transplantAfterLsfDays: -21, // Can transplant 3 weeks before frost
  indoorLeadWeeksMin: 4,
  indoorLeadWeeksMax: 6,
  frostSensitive: false, // Frost tolerant!
  harvestStyle: 'single',
};

// Zinnia - frost-sensitive, but both offsets are positive (after frost)
const zinniaCultivar: Cultivar = {
  id: 'zinnia-test',
  crop: 'Zinnia',
  variety: 'State Fair Mix',
  germDaysMin: 5,
  germDaysMax: 7,
  maturityDays: 70,
  maturityBasis: 'from_sow',
  sowMethod: 'either',
  directAfterLsfDays: 7, // After frost
  transplantAfterLsfDays: 7, // Also after frost
  indoorLeadWeeksMin: 4,
  indoorLeadWeeksMax: 6,
  frostSensitive: true,
  harvestStyle: 'continuous',
};

const createPlanting = (overrides: Partial<Planting>): Planting => ({
  id: 'test-planting',
  cultivarId: 'test',
  label: 'Test Planting',
  sowDate: '2025-04-15',
  harvestStart: '2025-07-15',
  harvestEnd: '2025-09-15',
  method: 'direct',
  status: 'planned',
  successionNumber: 1,
  createdAt: '2025-01-01',
  ...overrides,
});

// ============================================
// Tests
// ============================================

describe('calculateShiftBounds', () => {
  describe('frost-sensitive crops in transplant mode', () => {
    it('should constrain Cosmos transplant to not go before last frost (transplantAfterLsfDays=0)', () => {
      // Cosmos has transplantAfterLsfDays=0, meaning transplant must be ON or AFTER June 1st
      // Planting currently has transplant on June 15th (14 days after frost)
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'transplant',
        sowDate: '2025-04-20', // Indoor sow
        transplantDate: '2025-06-15', // 14 days after June 1 frost
        harvestStart: '2025-08-15',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: true,
      });

      // minShift should be -14 (can only go back 14 days to June 1)
      // Cannot go to May 1st (31 days before June 1) - that was the bug
      expect(result.minShift).toBe(-14);
      expect(result.minShiftReason).toBe('frost');
    });

    it('should allow Cosmos direct sow to go 7 days before frost (directAfterLsfDays=-7)', () => {
      // Cosmos has directAfterLsfDays=-7, meaning direct sow can be 7 days BEFORE June 1st
      // Planting currently has sow on June 8th (7 days after frost)
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'direct',
        sowDate: '2025-06-08', // 7 days after June 1 frost
        harvestStart: '2025-08-08',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      // minShift should allow going back 14 days (to May 25th, which is 7 days before June 1)
      // June 8 - 14 days = May 25 = June 1 - 7 days
      expect(result.minShift).toBe(-14);
      expect(result.minShiftReason).toBe('frost');
    });

    it('should constrain Zinnia equally for direct and transplant (both offsets are +7)', () => {
      // Zinnia transplant on June 15th
      const transplantPlanting = createPlanting({
        cultivarId: zinniaCultivar.id,
        method: 'transplant',
        sowDate: '2025-04-20',
        transplantDate: '2025-06-15', // 14 days after frost
        harvestStart: '2025-08-25',
        harvestEnd: '2025-09-15',
      });

      const transplantResult = calculateShiftBounds({
        planting: transplantPlanting,
        cultivar: zinniaCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: true,
      });

      // Zinnia transplant must be >= June 8 (frost + 7 days)
      // Current is June 15, so can go back 7 days
      expect(transplantResult.minShift).toBe(-7);
      expect(transplantResult.minShiftReason).toBe('frost');

      // Zinnia direct sow on June 15th
      const directPlanting = createPlanting({
        cultivarId: zinniaCultivar.id,
        method: 'direct',
        sowDate: '2025-06-15', // 14 days after frost
        harvestStart: '2025-08-25',
        harvestEnd: '2025-09-15',
      });

      const directResult = calculateShiftBounds({
        planting: directPlanting,
        cultivar: zinniaCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      // Zinnia direct sow must be >= June 8 (frost + 7 days)
      // Current is June 15, so can go back 7 days
      expect(directResult.minShift).toBe(-7);
      expect(directResult.minShiftReason).toBe('frost');
    });
  });

  describe('frost-tolerant crops', () => {
    it('should NOT constrain beets transplant by frost (frostSensitive=false)', () => {
      // Beets can be transplanted well before last frost
      const planting = createPlanting({
        cultivarId: beetsCultivar.id,
        method: 'transplant',
        sowDate: '2025-03-15', // Indoor sow
        transplantDate: '2025-05-01', // 31 days BEFORE June 1 frost
        harvestStart: '2025-06-25',
        harvestEnd: '2025-07-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: beetsCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: true,
      });

      // Beets are frost-tolerant, so frost constraint should NOT apply
      // The only constraint should be season start (March 1)
      // Sow date is March 15, so can go back 14 days to March 1
      expect(result.minShift).toBe(-14);
      expect(result.minShiftReason).toBe('season');
    });

    it('should NOT constrain beets direct sow by frost', () => {
      const planting = createPlanting({
        cultivarId: beetsCultivar.id,
        method: 'direct',
        sowDate: '2025-05-01', // 31 days before frost
        harvestStart: '2025-06-25',
        harvestEnd: '2025-07-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: beetsCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      // Beets are frost-tolerant - can go back to March 1
      // May 1 to March 1 = 61 days
      expect(result.minShift).toBe(-61);
      expect(result.minShiftReason).toBe('season');
    });
  });

  describe('succession constraints', () => {
    it('should constrain shift to not overlap with previous planting harvest', () => {
      const planting = createPlanting({
        sowDate: '2025-06-15',
        harvestStart: '2025-08-15',
        harvestEnd: '2025-09-15',
        method: 'direct',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        previousHarvestEnd: '2025-08-01', // Previous ends Aug 1
        isTransplantMode: false,
      });

      // Harvest start is Aug 15, previous ends Aug 1
      // Can only shift 14 days earlier before overlapping
      expect(result.minShift).toBe(-14);
      expect(result.minShiftReason).toBe('succession');
    });

    it('should use succession constraint when more restrictive than frost constraint', () => {
      // Cosmos transplant where succession is more restrictive than frost
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'transplant',
        sowDate: '2025-04-20',
        transplantDate: '2025-06-15', // 14 days after frost
        harvestStart: '2025-08-15',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        previousHarvestEnd: '2025-08-10', // Very close to current harvest start
        isTransplantMode: true,
      });

      // Succession constraint: harvest Aug 15 - prev end Aug 10 = 5 days
      // Frost constraint: transplant June 15 - frost June 1 = 14 days
      // Succession is more restrictive (5 < 14)
      expect(result.minShift).toBe(-5);
      expect(result.minShiftReason).toBe('succession');
    });

    it('should report frost reason when frost is more restrictive than succession', () => {
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'transplant',
        sowDate: '2025-04-20',
        transplantDate: '2025-06-08', // 7 days after frost
        harvestStart: '2025-08-08',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        previousHarvestEnd: '2025-07-01', // Far before harvest start (38 days)
        isTransplantMode: true,
      });

      // Succession allows 38 days earlier, frost allows only 7 days. Frost wins.
      expect(result.minShift).toBe(-7);
      expect(result.minShiftReason).toBe('frost');
    });
  });

  describe('edge cases', () => {
    it('should handle planting already at frost limit', () => {
      // Cosmos transplant exactly on last frost date
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'transplant',
        sowDate: '2025-04-06', // 8 weeks before June 1
        transplantDate: '2025-06-01', // Exactly on frost date
        harvestStart: '2025-08-01',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: true,
      });

      // Already at frost limit, can't go earlier
      expect(result.minShift).toBeCloseTo(0);
    });

    it('should handle negative transplantAfterLsfDays for hardy crops', () => {
      // A hardy cultivar that can transplant before frost
      const hardyCultivar: Cultivar = {
        ...cosmosCultivar,
        id: 'hardy-test',
        transplantAfterLsfDays: -14, // Can transplant 2 weeks before frost
        frostSensitive: true, // Still frost sensitive, but has hardening allowance
      };

      const planting = createPlanting({
        cultivarId: hardyCultivar.id,
        method: 'transplant',
        sowDate: '2025-04-01',
        transplantDate: '2025-06-01', // On frost date
        harvestStart: '2025-08-01',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: hardyCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: true,
      });

      // Earliest transplant = June 1 - 14 = May 18
      // Current transplant = June 1
      // Can shift 14 days earlier
      expect(result.minShift).toBe(-14);
    });

    it('should return positive minShift when planting is before allowed date', () => {
      // Edge case: planting somehow got placed before its allowed date
      // (could happen with data migration or manual edit)
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'transplant',
        sowDate: '2025-03-15',
        transplantDate: '2025-05-15', // 17 days BEFORE frost - not allowed for frost-sensitive
        harvestStart: '2025-07-15',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: true,
      });

      // Earliest allowed is June 1, current is May 15
      // minShift should be positive (must move LATER)
      expect(result.minShift).toBe(17);
    });
  });

  describe('maxShift (frost deadline constraint)', () => {
    it('limits forward shift based on frost-sensitive deadline and maturity', () => {
      // Cosmos: frost-sensitive, maturityDays=60
      // Frost deadline: typical frost (10-01)
      // Latest sow: 2025-10-01 - 60 days = 2025-08-02
      // Current sow: 2025-06-08 → maxShift = Aug 2 - Jun 8 = 55 days
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'direct',
        sowDate: '2025-06-08',
        harvestStart: '2025-08-08',
        harvestEnd: '2025-09-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      expect(result.maxShift).toBe(55);
    });

    it('limits forward shift based on frost-tolerant deadline', () => {
      // Beets: frost-tolerant, maturityDays=55
      // Frost deadline: typical frost (10-01) + 21 days = 2025-10-22
      // Latest sow: 2025-10-22 - 55 days = 2025-08-28
      // Current sow: 2025-05-01 → maxShift = Aug 28 - May 1 = 119 days
      const planting = createPlanting({
        cultivarId: beetsCultivar.id,
        method: 'direct',
        sowDate: '2025-05-01',
        harvestStart: '2025-06-25',
        harvestEnd: '2025-07-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: beetsCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      expect(result.maxShift).toBe(119);
    });

    it('returns 0 when planting is already at latest viable date', () => {
      // Cosmos: latest sow = 2025-08-02 (see above)
      // Current sow exactly at latest sow
      const planting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'direct',
        sowDate: '2025-08-02',
        harvestStart: '2025-10-01',
        harvestEnd: '2025-10-15',
      });

      const result = calculateShiftBounds({
        planting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      expect(result.maxShift).toBe(0);
    });

    it('frost-tolerant crops get more forward room than frost-sensitive', () => {
      const sowDate = '2025-06-15';

      const sensitivePlanting = createPlanting({
        cultivarId: cosmosCultivar.id,
        method: 'direct',
        sowDate,
        harvestStart: '2025-08-15',
        harvestEnd: '2025-09-15',
      });

      const tolerantPlanting = createPlanting({
        cultivarId: beetsCultivar.id,
        method: 'direct',
        sowDate,
        harvestStart: '2025-08-09',
        harvestEnd: '2025-08-16',
      });

      const sensitiveResult = calculateShiftBounds({
        planting: sensitivePlanting,
        cultivar: cosmosCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      const tolerantResult = calculateShiftBounds({
        planting: tolerantPlanting,
        cultivar: beetsCultivar,
        frost: defaultFrostWindow,
        climate: sussexClimate,
        isTransplantMode: false,
      });

      // Frost-tolerant gets a later deadline (Oct 22 vs Sep 11)
      // so maxShift should be larger (even accounting for different maturityDays)
      expect(tolerantResult.maxShift).toBeGreaterThan(sensitiveResult.maxShift);
    });
  });
});
