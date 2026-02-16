import { describe, it, expect } from 'vitest';
import {
  estimatePlantQuantity,
  getYieldCategory,
  formatWeight,
  formatWeightShort,
  formatScaledServing,
  getFrequencyLabel,
  getPreservationLabel,
  YIELD_DEFAULTS,
  CROP_CATEGORY_MAP,
  type EstimatorInputs,
} from './quantityEstimator';
import type { Cultivar, YieldCategory } from './types';

// ============================================
// Test Fixtures
// ============================================

const baseCultivar: Cultivar = {
  id: 'tomato-test',
  crop: 'Tomato',
  variety: 'Sungold',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 65,
  maturityBasis: 'from_transplant',
  sowMethod: 'transplant',
  harvestStyle: 'continuous',
  // No harvestDurationDays → continuous harvest until frost
};

const defaultInputs: EstimatorInputs = {
  householdSize: 2,
  consumptionFrequency: 'regular',
  preservationPlan: 'none',
  growingSeasonWeeks: 16,
  servingSizeMultiplier: 1.0,
};

// ============================================
// getYieldCategory
// ============================================

describe('getYieldCategory', () => {
  it('uses cultivar-specific yieldCategory when set', () => {
    const cultivar: Cultivar = {
      ...baseCultivar,
      yieldCategory: 'tomato_cherry',
    };
    expect(getYieldCategory(cultivar)).toBe('tomato_cherry');
  });

  it('falls back to CROP_CATEGORY_MAP lookup', () => {
    expect(getYieldCategory(baseCultivar)).toBe('tomato_indeterminate');
  });

  it('defaults to greens_leaf for unknown crops', () => {
    const unknown: Cultivar = {
      ...baseCultivar,
      id: 'unknown',
      crop: 'Dragonfruit',
    };
    expect(getYieldCategory(unknown)).toBe('greens_leaf');
  });

  it('resolves common crop names correctly', () => {
    const cases: [string, YieldCategory][] = [
      ['Spinach', 'greens_cooking'],
      ['Zucchini', 'squash_summer'],
      ['Carrot', 'root_small'],
      ['Broccoli', 'brassica_head'],
      ['Basil', 'herb'],
      ['Zinnia', 'flower'],
      ['Bush Bean', 'bean_bush'],
      ['Pole Bean', 'bean_pole'],
      ['Lettuce (Romaine)', 'greens_head'],
      ['Lettuce', 'greens_leaf'],
    ];

    for (const [crop, expected] of cases) {
      const cultivar: Cultivar = { ...baseCultivar, id: crop, crop };
      expect(getYieldCategory(cultivar)).toBe(expected);
    }
  });
});

// ============================================
// formatWeight
// ============================================

describe('formatWeight', () => {
  it('formats kg values', () => {
    expect(formatWeight(2.5, 'kg')).toBe('2.50 kg');
    expect(formatWeight(0.5, 'kg')).toBe('0.50 kg');
  });

  it('switches to grams for small kg values', () => {
    expect(formatWeight(0.05, 'kg')).toBe('50g');
    expect(formatWeight(0.08, 'kg')).toBe('80g');
  });

  it('formats lbs values', () => {
    expect(formatWeight(1, 'lbs')).toBe('2.2 lbs');
  });

  it('switches to oz for small lbs values', () => {
    // 0.02 kg = 0.044 lbs = 0.7 oz
    expect(formatWeight(0.02, 'lbs')).toMatch(/oz$/);
  });

  it('handles zero', () => {
    expect(formatWeight(0, 'kg')).toBe('0g');
    expect(formatWeight(0, 'lbs')).toBe('0.0 oz');
  });
});

// ============================================
// formatWeightShort
// ============================================

describe('formatWeightShort', () => {
  it('formats kg compactly', () => {
    expect(formatWeightShort(2.5, 'kg')).toBe('2.5kg');
  });

  it('switches to grams for small values', () => {
    expect(formatWeightShort(0.05, 'kg')).toBe('50g');
  });

  it('formats lbs compactly', () => {
    expect(formatWeightShort(1, 'lbs')).toBe('2.2lb');
  });

  it('switches to oz for small lbs values', () => {
    expect(formatWeightShort(0.02, 'lbs')).toMatch(/oz$/);
  });
});

// ============================================
// formatScaledServing
// ============================================

describe('formatScaledServing', () => {
  it('scales count-based servings', () => {
    const yieldData = YIELD_DEFAULTS['tomato_cherry'];
    // servingCountBase: 10, servingUnit: 'cherry tomatoes'
    // multiplier 2 → ~20 cherry tomatoes
    expect(formatScaledServing(yieldData, 2)).toBe('~20 cherry tomatoes');
  });

  it('returns fraction labels for small multipliers', () => {
    const yieldData = YIELD_DEFAULTS['cucumber'];
    // servingCountBase: 0.5, multiplier: 0.5 → 0.25 → "quarter cucumber"
    expect(formatScaledServing(yieldData, 0.5)).toBe('quarter cucumber');
  });

  it('returns half label', () => {
    const yieldData = YIELD_DEFAULTS['cucumber'];
    // servingCountBase: 0.5, multiplier: 1 → 0.5 → "half cucumber"
    expect(formatScaledServing(yieldData, 1)).toBe('half cucumber');
  });

  it('pluralizes single-word units for counts > 1', () => {
    const yieldData = YIELD_DEFAULTS['tomato_indeterminate'];
    // servingCountBase: 1, servingUnit: 'tomato', multiplier: 3 → ~3 tomatos
    const result = formatScaledServing(yieldData, 3);
    expect(result).toBe('~3 tomatos');
  });

  it('does not double-pluralize units already ending in s', () => {
    const yieldData = YIELD_DEFAULTS['bean_bush'];
    // servingUnit: 'green beans' — already plural
    const result = formatScaledServing(yieldData, 2);
    expect(result).toContain('green beans');
    expect(result).not.toContain('green beanss');
  });

  it('falls back to servingDescription when no count data', () => {
    const noCountData = {
      ...YIELD_DEFAULTS['tomato_indeterminate'],
      servingCountBase: undefined as unknown as number,
      servingUnit: undefined as unknown as string,
    };
    expect(formatScaledServing(noCountData, 2)).toBe(noCountData.servingDescription);
  });
});

// ============================================
// getFrequencyLabel / getPreservationLabel
// ============================================

describe('getFrequencyLabel', () => {
  it('returns labels for all frequencies', () => {
    expect(getFrequencyLabel('rarely')).toBe('Rarely (monthly)');
    expect(getFrequencyLabel('occasionally')).toBe('1-2x/week');
    expect(getFrequencyLabel('regular')).toBe('3-4x/week');
    expect(getFrequencyLabel('daily')).toBe('Daily');
  });
});

describe('getPreservationLabel', () => {
  it('returns labels for all preservation plans', () => {
    expect(getPreservationLabel('none')).toBe('Fresh only');
    expect(getPreservationLabel('some')).toContain('few jars');
    expect(getPreservationLabel('moderate')).toContain('freezing');
    expect(getPreservationLabel('heavy')).toContain('pantry');
  });
});

// ============================================
// estimatePlantQuantity — core estimation
// ============================================

describe('estimatePlantQuantity', () => {
  describe('basic estimation', () => {
    it('returns positive plant counts', () => {
      const result = estimatePlantQuantity(baseCultivar, defaultInputs);
      expect(result.recommended).toBeGreaterThan(0);
      expect(result.min).toBeGreaterThan(0);
      expect(result.max).toBeGreaterThan(0);
    });

    it('min <= recommended <= max', () => {
      const result = estimatePlantQuantity(baseCultivar, defaultInputs);
      expect(result.min).toBeLessThanOrEqual(result.recommended);
      expect(result.recommended).toBeLessThanOrEqual(result.max);
    });

    it('populates transparency fields', () => {
      const result = estimatePlantQuantity(baseCultivar, defaultInputs);
      expect(result.yieldPerPlantKg).toBeGreaterThan(0);
      expect(result.servingSizeKg).toBeGreaterThan(0);
      expect(result.servingDescription).toBeTruthy();
      expect(result.yieldDescription).toBeTruthy();
      expect(result.yieldCategory).toBe('tomato_indeterminate');
      expect(result.totalNeededKg).toBeGreaterThan(0);
    });

    it('generates a breakdown string', () => {
      const result = estimatePlantQuantity(baseCultivar, defaultInputs);
      expect(result.breakdown).toContain('2 people');
      expect(result.breakdown).toContain('regular');
    });
  });

  describe('household size scaling', () => {
    it('larger households need more plants', () => {
      const small = estimatePlantQuantity(baseCultivar, { ...defaultInputs, householdSize: 1 });
      const large = estimatePlantQuantity(baseCultivar, { ...defaultInputs, householdSize: 4 });
      expect(large.recommended).toBeGreaterThan(small.recommended);
      expect(large.totalNeededKg).toBeGreaterThan(small.totalNeededKg);
    });
  });

  describe('consumption frequency scaling', () => {
    it('higher frequency needs more plants', () => {
      const rarely = estimatePlantQuantity(baseCultivar, { ...defaultInputs, consumptionFrequency: 'rarely' });
      const daily = estimatePlantQuantity(baseCultivar, { ...defaultInputs, consumptionFrequency: 'daily' });
      expect(daily.recommended).toBeGreaterThan(rarely.recommended);
    });
  });

  describe('preservation multiplier', () => {
    it('preservation increases total needed', () => {
      const fresh = estimatePlantQuantity(baseCultivar, { ...defaultInputs, preservationPlan: 'none' });
      const heavy = estimatePlantQuantity(baseCultivar, { ...defaultInputs, preservationPlan: 'heavy' });
      expect(heavy.totalNeededKg).toBeGreaterThan(fresh.totalNeededKg);
      expect(heavy.recommended).toBeGreaterThan(fresh.recommended);
    });

    it('includes preservation note in breakdown', () => {
      const result = estimatePlantQuantity(baseCultivar, { ...defaultInputs, preservationPlan: 'moderate' });
      expect(result.breakdown).toContain('moderate');
    });

    it('does not include preservation note when none', () => {
      const result = estimatePlantQuantity(baseCultivar, { ...defaultInputs, preservationPlan: 'none' });
      expect(result.breakdown).not.toContain('preserving');
    });
  });

  describe('serving size multiplier', () => {
    it('larger servings need more plants', () => {
      const small = estimatePlantQuantity(baseCultivar, { ...defaultInputs, servingSizeMultiplier: 0.5 });
      const large = estimatePlantQuantity(baseCultivar, { ...defaultInputs, servingSizeMultiplier: 2.0 });
      expect(large.recommended).toBeGreaterThan(small.recommended);
    });
  });

  describe('growing season length', () => {
    it('longer seasons need more plants (more total consumption)', () => {
      const short = estimatePlantQuantity(baseCultivar, { ...defaultInputs, growingSeasonWeeks: 8 });
      const long = estimatePlantQuantity(baseCultivar, { ...defaultInputs, growingSeasonWeeks: 24 });
      expect(long.totalNeededKg).toBeGreaterThan(short.totalNeededKg);
    });
  });

  describe('cultivar-specific yield override', () => {
    it('uses yieldPerPlantKg when set on cultivar', () => {
      const highYield: Cultivar = { ...baseCultivar, yieldPerPlantKg: 10 };
      const lowYield: Cultivar = { ...baseCultivar, yieldPerPlantKg: 1 };
      const high = estimatePlantQuantity(highYield, defaultInputs);
      const low = estimatePlantQuantity(lowYield, defaultInputs);
      expect(high.yieldPerPlantKg).toBe(10);
      expect(low.yieldPerPlantKg).toBe(1);
      // Higher yield per plant → fewer plants needed
      expect(high.recommended).toBeLessThan(low.recommended);
    });
  });

  describe('succession recommendations', () => {
    it('recommends 1 succession for continuous harvest crops (no explicit duration)', () => {
      // baseCultivar has harvestStyle: 'continuous' and no harvestDurationDays
      const result = estimatePlantQuantity(baseCultivar, defaultInputs);
      expect(result.successionsRecommended).toBe(1);
      expect(result.plantsPerSuccession).toBe(result.recommended);
    });

    it('recommends multiple successions for crops with limited harvest duration', () => {
      const spinach: Cultivar = {
        ...baseCultivar,
        id: 'spinach-test',
        crop: 'Spinach',
        harvestStyle: 'continuous',
        harvestDurationDays: 21, // 3 weeks harvest per planting
      };
      const result = estimatePlantQuantity(spinach, { ...defaultInputs, growingSeasonWeeks: 16 });
      // 16 weeks / 3 week harvest = ~5-6 successions needed
      expect(result.successionsRecommended).toBeGreaterThan(1);
    });

    it('does not recommend more successions than plants', () => {
      const lowYield: Cultivar = {
        ...baseCultivar,
        id: 'low-yield',
        crop: 'Spinach',
        yieldPerPlantKg: 100, // Unrealistically high yield → very few plants
        harvestStyle: 'single',
        harvestDurationDays: 7,
      };
      const result = estimatePlantQuantity(lowYield, {
        ...defaultInputs,
        householdSize: 1,
        consumptionFrequency: 'rarely',
      });
      expect(result.successionsRecommended).toBeLessThanOrEqual(result.recommended);
    });

    it('distributes plants across successions', () => {
      const lettuce: Cultivar = {
        ...baseCultivar,
        id: 'lettuce-test',
        crop: 'Lettuce',
        harvestStyle: 'single',
        harvestDurationDays: 14,
      };
      const result = estimatePlantQuantity(lettuce, defaultInputs);
      // plantsPerSuccession * successionsRecommended should cover recommended
      expect(result.plantsPerSuccession * result.successionsRecommended)
        .toBeGreaterThanOrEqual(result.recommended);
    });
  });

  describe('flower special case', () => {
    it('uses count-based estimation for flowers', () => {
      const zinnia: Cultivar = {
        ...baseCultivar,
        id: 'zinnia',
        crop: 'Zinnia',
        yieldCategory: 'flower',
      };
      const result = estimatePlantQuantity(zinnia, defaultInputs);
      expect(result.yieldCategory).toBe('flower');
      expect(result.yieldPerPlantKg).toBe(0);
      expect(result.totalNeededKg).toBe(0);
      expect(result.recommended).toBeGreaterThanOrEqual(3); // Minimum of 3
    });

    it('scales flower count with frequency', () => {
      const zinnia: Cultivar = {
        ...baseCultivar,
        id: 'zinnia',
        crop: 'Zinnia',
        yieldCategory: 'flower',
      };
      const rarely = estimatePlantQuantity(zinnia, { ...defaultInputs, consumptionFrequency: 'rarely' });
      const daily = estimatePlantQuantity(zinnia, { ...defaultInputs, consumptionFrequency: 'daily' });
      expect(daily.recommended).toBeGreaterThan(rarely.recommended);
    });

    it('enforces minimum of 3 plants for flowers', () => {
      const zinnia: Cultivar = {
        ...baseCultivar,
        id: 'zinnia',
        crop: 'Zinnia',
        yieldCategory: 'flower',
      };
      const result = estimatePlantQuantity(zinnia, {
        ...defaultInputs,
        consumptionFrequency: 'rarely',
        growingSeasonWeeks: 1,
      });
      expect(result.recommended).toBeGreaterThanOrEqual(3);
      expect(result.min).toBeGreaterThanOrEqual(3);
    });
  });

  describe('edge cases', () => {
    it('never recommends zero plants', () => {
      const result = estimatePlantQuantity(baseCultivar, {
        ...defaultInputs,
        householdSize: 1,
        consumptionFrequency: 'rarely',
        growingSeasonWeeks: 1,
      });
      expect(result.recommended).toBeGreaterThanOrEqual(1);
      expect(result.min).toBeGreaterThanOrEqual(1);
    });

    it('handles single-person household', () => {
      const result = estimatePlantQuantity(baseCultivar, {
        ...defaultInputs,
        householdSize: 1,
      });
      expect(result.breakdown).toContain('1 person');
    });
  });
});

// ============================================
// YIELD_DEFAULTS data integrity
// ============================================

describe('YIELD_DEFAULTS', () => {
  it('has entries for all YieldCategory values', () => {
    const categories: YieldCategory[] = [
      'tomato_indeterminate', 'tomato_determinate', 'tomato_cherry',
      'pepper_large', 'pepper_small',
      'cucumber', 'squash_summer', 'squash_winter',
      'bean_bush', 'bean_pole', 'pea',
      'greens_head', 'greens_leaf', 'greens_baby', 'greens_cooking',
      'root_large', 'root_small',
      'allium_bulb', 'allium_green',
      'brassica_head', 'brassica_leafy',
      'herb', 'flower',
    ];
    for (const cat of categories) {
      expect(YIELD_DEFAULTS[cat]).toBeDefined();
      expect(YIELD_DEFAULTS[cat].servingDescription).toBeTruthy();
      expect(YIELD_DEFAULTS[cat].yieldDescription).toBeTruthy();
    }
  });

  it('has non-negative yields for all non-flower categories', () => {
    for (const [cat, data] of Object.entries(YIELD_DEFAULTS)) {
      if (cat !== 'flower') {
        expect(data.yieldPerPlantKg).toBeGreaterThan(0);
        expect(data.servingSizeKg).toBeGreaterThan(0);
      }
    }
  });

  it('flower category has zero kg yields', () => {
    expect(YIELD_DEFAULTS.flower.yieldPerPlantKg).toBe(0);
    expect(YIELD_DEFAULTS.flower.servingSizeKg).toBe(0);
  });
});

// ============================================
// CROP_CATEGORY_MAP data integrity
// ============================================

describe('CROP_CATEGORY_MAP', () => {
  it('maps to valid YieldCategory values', () => {
    const validCategories = Object.keys(YIELD_DEFAULTS);
    for (const [, category] of Object.entries(CROP_CATEGORY_MAP)) {
      expect(validCategories).toContain(category);
    }
  });
});
