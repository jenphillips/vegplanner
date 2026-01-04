import { describe, it, expect } from 'vitest';
import { buildSchedule } from './schedule';
import type { Cultivar, FrostWindow, PlantingPlan } from './types';

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

const defaultFrostWindow = createFrostWindow('2025-05-15', '2025-09-25');

// Base cultivar with sensible defaults - override as needed
const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'test-cultivar',
  crop: 'Test Crop',
  variety: 'Test Variety',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 60,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  directAfterLsfDays: 0,
  transplantAfterLsfDays: 14,
  indoorLeadWeeksMin: 6,
  indoorLeadWeeksMax: 8,
  fallBufferDays: 14,
  harvestStyle: 'single',
  harvestDurationDays: 7,
  frostSensitive: false,
  ...overrides,
});

const createPlan = (
  cultivarId: string,
  season: 'spring' | 'fall',
  overrides: Partial<PlantingPlan> = {}
): PlantingPlan => ({
  id: 'test-plan',
  cultivarId,
  season,
  frostWindowId: 'test-frost',
  ...overrides,
});

// ============================================
// buildSchedule Tests
// ============================================

describe('buildSchedule', () => {
  // ============================================
  // Spring + Direct Sow
  // ============================================
  describe('spring direct sow', () => {
    it('calculates sow date as LSF + directAfterLsfDays', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        directAfterLsfDays: 7,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // LSF is 2025-05-15, plus 7 days = 2025-05-22
      expect(result.sowDates).toHaveLength(1);
      expect(result.sowDates[0].label).toBe('Direct sow');
      expect(result.sowDates[0].date).toBe('2025-05-22');
    });

    it('defaults directAfterLsfDays to 0 when null', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        directAfterLsfDays: null,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Should sow on LSF itself when no offset
      expect(result.sowDates[0].date).toBe('2025-05-15');
    });

    it('calculates germination window from sow date', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        directAfterLsfDays: 0,
        germDaysMin: 7,
        germDaysMax: 14,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Sow date is 2025-05-15
      // Germination starts 7 days later, ends 14 days later
      expect(result.germinationWindow).toEqual({
        start: '2025-05-22',
        end: '2025-05-29',
      });
    });

    it('calculates harvest window from maturity (from_sow basis)', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        directAfterLsfDays: 0,
        maturityDays: 60,
        maturityBasis: 'from_sow',
        harvestDurationDays: 7,
        harvestStyle: 'single',
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Sow date is 2025-05-15, maturity 60 days later = 2025-07-14
      // Harvest window: 7 days, so end is start + 6 = 2025-07-20
      expect(result.harvestWindow).toEqual({
        start: '2025-07-14',
        end: '2025-07-20',
      });
    });

    it('sets correct method and season in result', () => {
      const cultivar = createCultivar({ sowMethod: 'direct' });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      expect(result.method).toBe('direct');
      expect(result.season).toBe('spring');
    });

    it('includes assumptions from cultivar data', () => {
      const cultivar = createCultivar({
        directAfterLsfDays: 7,
        fallBufferDays: 14,
        indoorLeadWeeksMin: 6,
        indoorLeadWeeksMax: 8,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      expect(result.assumptions.directAfterLsfDays).toBe(7);
      expect(result.assumptions.fallBufferDays).toBe(14);
      expect(result.assumptions.indoorLeadWeeksMin).toBe(6);
      expect(result.assumptions.indoorLeadWeeksMax).toBe(8);
    });
  });

  // ============================================
  // Spring + Transplant
  // ============================================
  describe('spring transplant', () => {
    it('calculates transplant date as LSF + transplantAfterLsfDays', () => {
      const cultivar = createCultivar({
        sowMethod: 'transplant',
        transplantAfterLsfDays: 14,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // LSF is 2025-05-15, plus 14 days = 2025-05-29
      expect(result.transplantDate?.date).toBe('2025-05-29');
      expect(result.transplantDate?.label).toBe('Transplant');
    });

    it('calculates indoor sow dates backwards from transplant using lead weeks', () => {
      const cultivar = createCultivar({
        sowMethod: 'transplant',
        transplantAfterLsfDays: 14,
        indoorLeadWeeksMin: 6,
        indoorLeadWeeksMax: 8,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Transplant date is 2025-05-29
      // Early sow (max lead): 8 weeks before = 2025-04-03
      // Late sow (min lead): 6 weeks before = 2025-04-17
      expect(result.sowDates).toHaveLength(2);
      expect(result.sowDates[0].label).toBe('Indoor sow (early)');
      expect(result.sowDates[0].date).toBe('2025-04-03');
      expect(result.sowDates[1].label).toBe('Indoor sow (late)');
      expect(result.sowDates[1].date).toBe('2025-04-17');
    });

    it('uses indoorLeadWeeksMin for both dates when max is not specified', () => {
      const cultivar = createCultivar({
        sowMethod: 'transplant',
        transplantAfterLsfDays: 0,
        indoorLeadWeeksMin: 6,
        indoorLeadWeeksMax: null,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Transplant date is 2025-05-15
      // Both early and late should be 6 weeks before = 2025-04-03
      expect(result.sowDates[0].date).toBe('2025-04-03');
      expect(result.sowDates[1].date).toBe('2025-04-03');
    });

    it('calculates germination window from early indoor sow date', () => {
      const cultivar = createCultivar({
        sowMethod: 'transplant',
        transplantAfterLsfDays: 14,
        indoorLeadWeeksMin: 6,
        indoorLeadWeeksMax: 8,
        germDaysMin: 5,
        germDaysMax: 10,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Early sow is 2025-04-03
      // Germination: starts 5 days later (2025-04-08), ends 10 days later (2025-04-13)
      expect(result.germinationWindow).toEqual({
        start: '2025-04-08',
        end: '2025-04-13',
      });
    });

    it('calculates harvest from transplant date when maturityBasis is from_transplant', () => {
      const cultivar = createCultivar({
        sowMethod: 'transplant',
        transplantAfterLsfDays: 14,
        indoorLeadWeeksMin: 6,
        indoorLeadWeeksMax: 8,
        maturityDays: 45,
        maturityBasis: 'from_transplant',
        harvestDurationDays: 7,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Transplant date is 2025-05-29, maturity 45 days later = 2025-07-13
      // Harvest window 7 days: 2025-07-13 to 2025-07-19
      expect(result.harvestWindow).toEqual({
        start: '2025-07-13',
        end: '2025-07-19',
      });
    });

    it('calculates harvest from early sow date when maturityBasis is from_sow', () => {
      const cultivar = createCultivar({
        sowMethod: 'transplant',
        transplantAfterLsfDays: 14,
        indoorLeadWeeksMin: 6,
        indoorLeadWeeksMax: 8,
        maturityDays: 90,
        maturityBasis: 'from_sow',
        harvestDurationDays: 7,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Early sow is 2025-04-03, maturity 90 days later = 2025-07-02
      // Harvest window 7 days: 2025-07-02 to 2025-07-08
      expect(result.harvestWindow).toEqual({
        start: '2025-07-02',
        end: '2025-07-08',
      });
    });
  });

  // ============================================
  // Fall Season
  // ============================================
  describe('fall season', () => {
    it('calculates fall anchor as firstFallFrost minus fallBufferDays', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        maturityDays: 60,
        fallBufferDays: 14,
      });
      const plan = createPlan(cultivar.id, 'fall');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // firstFallFrost is 2025-09-25, fallBuffer 14 days = anchor 2025-09-11
      expect(result.assumptions.fallAnchor).toBe('2025-09-11');
    });

    it('calculates sow date backwards from fall anchor by maturity days', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        maturityDays: 60,
        fallBufferDays: 14,
      });
      const plan = createPlan(cultivar.id, 'fall');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Fall anchor is 2025-09-11, maturity 60 days = sow 2025-07-13
      expect(result.sowDates).toHaveLength(1);
      expect(result.sowDates[0].label).toBe('Fall sow');
      expect(result.sowDates[0].date).toBe('2025-07-13');
    });

    it('uses default fallBufferDays of 14 when not specified', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        maturityDays: 30,
        fallBufferDays: null,
      });
      const plan = createPlan(cultivar.id, 'fall');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Fall anchor should be 2025-09-25 - 14 = 2025-09-11
      // Sow date = anchor - 30 = 2025-08-12
      expect(result.sowDates[0].date).toBe('2025-08-12');
    });

    it('calculates germination window from fall sow date', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        maturityDays: 60,
        fallBufferDays: 14,
        germDaysMin: 5,
        germDaysMax: 10,
      });
      const plan = createPlan(cultivar.id, 'fall');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Sow date is 2025-07-13
      // Germination: 2025-07-18 to 2025-07-23
      expect(result.germinationWindow).toEqual({
        start: '2025-07-18',
        end: '2025-07-23',
      });
    });

    it('calculates harvest window ending at fall anchor for single harvest', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        maturityDays: 60,
        fallBufferDays: 14,
        harvestStyle: 'single',
        harvestDurationDays: 7,
      });
      const plan = createPlan(cultivar.id, 'fall');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Sow 2025-07-13, maturity 60 days = harvest starts 2025-09-11 (= fall anchor)
      // Single harvest 7 days: 2025-09-11 to 2025-09-17
      expect(result.harvestWindow).toEqual({
        start: '2025-09-11',
        end: '2025-09-17',
      });
    });
  });

  // ============================================
  // Method Override
  // ============================================
  describe('method override', () => {
    it('uses methodOverride from plan instead of cultivar sowMethod', () => {
      const cultivar = createCultivar({
        sowMethod: 'either',
        directAfterLsfDays: 0,
      });
      const plan = createPlan(cultivar.id, 'spring', {
        methodOverride: 'direct',
      });

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      expect(result.method).toBe('direct');
      expect(result.sowDates[0].label).toBe('Direct sow');
    });

    it('can override direct to transplant', () => {
      const cultivar = createCultivar({
        sowMethod: 'direct',
        transplantAfterLsfDays: 14,
        indoorLeadWeeksMin: 6,
        indoorLeadWeeksMax: 8,
      });
      const plan = createPlan(cultivar.id, 'spring', {
        methodOverride: 'transplant',
      });

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      expect(result.method).toBe('transplant');
      expect(result.transplantDate).toBeDefined();
      expect(result.sowDates[0].label).toBe('Indoor sow (early)');
    });
  });
});

// ============================================
// buildHarvestWindow Tests (via buildSchedule integration)
// ============================================

describe('buildHarvestWindow behavior', () => {
  describe('single harvest style', () => {
    it('uses harvestDurationDays for window length', () => {
      const cultivar = createCultivar({
        harvestStyle: 'single',
        harvestDurationDays: 14,
        maturityDays: 60,
        directAfterLsfDays: 0,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Harvest starts 2025-07-14 (sow + 60 days)
      // Duration 14 days means end = start + 13 = 2025-07-27
      expect(result.harvestWindow?.start).toBe('2025-07-14');
      expect(result.harvestWindow?.end).toBe('2025-07-27');
    });

    it('defaults to 1 day duration when harvestDurationDays is null', () => {
      const cultivar = createCultivar({
        harvestStyle: 'single',
        harvestDurationDays: null,
        maturityDays: 60,
        directAfterLsfDays: 0,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Duration 1 day means end = start + 0 = same as start
      expect(result.harvestWindow?.start).toBe('2025-07-14');
      expect(result.harvestWindow?.end).toBe('2025-07-14');
    });
  });

  describe('continuous harvest style', () => {
    it('uses fall anchor as end date for frost-sensitive crops', () => {
      const cultivar = createCultivar({
        harvestStyle: 'continuous',
        harvestDurationDays: 999,
        frostSensitive: true,
        maturityDays: 60,
        directAfterLsfDays: 0,
        fallBufferDays: 14,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Harvest starts 2025-07-14
      // Frost-sensitive: ends at fall anchor (2025-09-11)
      expect(result.harvestWindow?.start).toBe('2025-07-14');
      expect(result.harvestWindow?.end).toBe('2025-09-11');
    });

    it('uses duration for non-frost-sensitive crops', () => {
      const cultivar = createCultivar({
        harvestStyle: 'continuous',
        harvestDurationDays: 30,
        frostSensitive: false,
        maturityDays: 60,
        directAfterLsfDays: 0,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Harvest starts 2025-07-14
      // Non-frost-sensitive: uses duration of 30 days
      expect(result.harvestWindow?.start).toBe('2025-07-14');
      expect(result.harvestWindow?.end).toBe('2025-08-13');
    });

    it('respects shorter duration even for frost-sensitive crops', () => {
      const cultivar = createCultivar({
        harvestStyle: 'continuous',
        harvestDurationDays: 14, // Ends before frost would
        frostSensitive: true,
        maturityDays: 60,
        directAfterLsfDays: 0,
        fallBufferDays: 14,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Harvest starts 2025-07-14
      // Duration end (2025-07-28) is before fall anchor (2025-09-11)
      // So should use duration end
      expect(result.harvestWindow?.start).toBe('2025-07-14');
      expect(result.harvestWindow?.end).toBe('2025-07-28');
    });

    it('defaults to large duration (999 days) when harvestDurationDays is null', () => {
      const cultivar = createCultivar({
        harvestStyle: 'continuous',
        harvestDurationDays: null,
        frostSensitive: true,
        maturityDays: 60,
        directAfterLsfDays: 0,
        fallBufferDays: 14,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // With null duration, defaults to 999 which is past frost
      // So frost-sensitive crop ends at fall anchor
      expect(result.harvestWindow?.end).toBe('2025-09-11');
    });
  });

  describe('harvestStyle defaults', () => {
    it('defaults to single harvest when harvestStyle is not specified', () => {
      const cultivar = createCultivar({
        harvestStyle: undefined,
        harvestDurationDays: null,
        maturityDays: 60,
        directAfterLsfDays: 0,
      });
      const plan = createPlan(cultivar.id, 'spring');

      const result = buildSchedule({
        frostWindow: defaultFrostWindow,
        cultivar,
        plan,
      });

      // Single harvest with no duration = 1 day
      expect(result.harvestWindow?.start).toBe('2025-07-14');
      expect(result.harvestWindow?.end).toBe('2025-07-14');
    });
  });
});
