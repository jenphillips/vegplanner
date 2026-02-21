import type { Cultivar, YieldCategory, Climate, FrostWindow } from './types';
import { calculateSuccessionWindows, type PlantingWindow, type SuccessionResult } from './succession';
import { toDate } from './dateUtils';

// Viable growing period for a crop
export type ViablePeriod = {
  label: string;        // e.g., "Spring", "Fall", "Summer"
  startDate: string;
  endDate: string;
  harvestWeeks: number;
  windows: PlantingWindow[];
  selected: boolean;    // Whether user wants to grow in this period
};

// Result from calculating viable periods
export type ViablePeriodsResult = {
  periods: ViablePeriod[];
  totalViableWeeks: number;
  selectedWeeks: number;
  successionResult: SuccessionResult;
};

/**
 * Calculate viable growing periods for a cultivar based on climate.
 * Groups succession windows into logical periods (Spring, Summer, Fall)
 * and identifies gaps where the crop can't grow.
 *
 * @param methodOverride - For cultivars with sowMethod: "either", force a specific method.
 *                         This is useful for showing users how transplanting can extend seasons.
 */
export function calculateViablePeriods(
  cultivar: Cultivar,
  frostWindow: FrostWindow,
  climate: Climate,
  methodOverride?: 'direct' | 'transplant'
): ViablePeriodsResult {
  // If a method override is provided and the cultivar supports either method,
  // create a modified cultivar that forces the specified method
  const effectiveCultivar = methodOverride && cultivar.sowMethod === 'either'
    ? { ...cultivar, sowMethod: methodOverride, preferredMethod: undefined }
    : cultivar;

  const successionResult = calculateSuccessionWindows(effectiveCultivar, frostWindow, climate);
  const { windows } = successionResult;

  if (windows.length === 0) {
    return {
      periods: [],
      totalViableWeeks: 0,
      selectedWeeks: 0,
      successionResult,
    };
  }

  // Group windows into periods based on gaps
  // A gap of > 4 weeks indicates a new period (e.g., summer heat gap)
  const periods: ViablePeriod[] = [];
  let currentPeriod: PlantingWindow[] = [];
  let periodStart: string | null = null;

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i];

    if (currentPeriod.length === 0) {
      currentPeriod.push(window);
      periodStart = window.harvestStart;
    } else {
      const prevWindow = currentPeriod[currentPeriod.length - 1];
      const prevEnd = toDate(prevWindow.harvestEnd).getTime();
      const currStart = toDate(window.harvestStart).getTime();
      const gapWeeks = (currStart - prevEnd) / (7 * 24 * 60 * 60 * 1000);

      if (gapWeeks > 4) {
        // Close current period and start new one
        const periodEnd = prevWindow.harvestEnd;
        periods.push(createPeriod(currentPeriod, periodStart!, periodEnd, periods.length));
        currentPeriod = [window];
        periodStart = window.harvestStart;
      } else {
        currentPeriod.push(window);
      }
    }
  }

  // Close final period
  if (currentPeriod.length > 0 && periodStart) {
    const periodEnd = currentPeriod[currentPeriod.length - 1].harvestEnd;
    periods.push(createPeriod(currentPeriod, periodStart, periodEnd, periods.length));
  }

  const totalViableWeeks = periods.reduce((sum, p) => sum + p.harvestWeeks, 0);
  const selectedWeeks = periods.filter(p => p.selected).reduce((sum, p) => sum + p.harvestWeeks, 0);

  return {
    periods,
    totalViableWeeks,
    selectedWeeks: selectedWeeks || totalViableWeeks, // Default all selected
    successionResult,
  };
}

function createPeriod(
  windows: PlantingWindow[],
  startDate: string,
  endDate: string,
  index: number
): ViablePeriod {
  // Use SOW dates to determine the season, not harvest dates
  // This better reflects when the gardener is actually planting
  const firstSowDate = windows.length > 0 ? toDate(windows[0].sowDate) : toDate(startDate);
  const lastSowDate = windows.length > 0 ? toDate(windows[windows.length - 1].sowDate) : toDate(startDate);
  const sowStartMonth = firstSowDate.getUTCMonth();
  const sowEndMonth = lastSowDate.getUTCMonth();

  // Determine period label based on sow months
  // Spring planting: Feb-May (months 1-4)
  // Summer planting: Jun-Jul (months 5-6) - rare for cool-weather crops
  // Fall planting: Aug-Sep (months 7-8)
  let label: string;
  if (sowStartMonth >= 1 && sowEndMonth <= 4) {
    label = 'Spring';
  } else if (sowStartMonth >= 5 && sowEndMonth <= 6) {
    label = 'Summer';
  } else if (sowStartMonth >= 7 && sowEndMonth <= 9) {
    label = 'Fall';
  } else if (sowStartMonth <= 4 && sowEndMonth >= 5) {
    // Spans spring into summer - call it "Early Season"
    label = 'Early Season';
  } else if (sowStartMonth >= 7 && sowEndMonth >= 7) {
    // Late season plantings
    label = 'Late Season';
  } else {
    label = index === 0 ? 'First Period' : 'Second Period';
  }

  const startTime = toDate(startDate).getTime();
  const endTime = toDate(endDate).getTime();
  const harvestWeeks = Math.max(1, Math.round((endTime - startTime) / (7 * 24 * 60 * 60 * 1000)));

  return {
    label,
    startDate,
    endDate,
    harvestWeeks,
    windows,
    selected: true, // Default to selected
  };
}

// Consumption frequency options
export type ConsumptionFrequency =
  | 'rarely'        // Once a month or less
  | 'occasionally'  // 1-2 times per week
  | 'regular'       // 3-4 times per week
  | 'daily';        // 5-7 times per week

// Preservation plan options
export type PreservationPlan =
  | 'none'          // Fresh consumption only
  | 'some'          // Light preserving (a few jars, some freezing)
  | 'moderate'      // Moderate preserving (significant freezing/canning)
  | 'heavy';        // Heavy preserving (stocking pantry for off-season)

// Inputs for the quantity estimator
export type EstimatorInputs = {
  householdSize: number;
  consumptionFrequency: ConsumptionFrequency;
  preservationPlan: PreservationPlan;
  growingSeasonWeeks: number;
  servingSizeMultiplier: number; // 0.5 = small portions, 1.0 = normal, 2.0 = large portions
};

// Weight unit preference
export type WeightUnit = 'kg' | 'lbs';

// Result from the quantity estimator
export type EstimatorResult = {
  recommended: number;
  min: number;
  max: number;
  breakdown: string;
  // Transparency fields
  yieldPerPlantKg: number;
  servingSizeKg: number;
  servingDescription: string;
  yieldDescription: string;
  yieldCategory: YieldCategory;
  totalNeededKg: number;
  // Succession recommendations
  successionsRecommended: number;
  plantsPerSuccession: number;
  harvestDurationDays: number;
};

// Default yield data by category (kg per plant)
// Values are realistic home garden averages, not commercial/ideal conditions
export const YIELD_DEFAULTS: Record<YieldCategory, {
  yieldPerPlantKg: number;
  servingSizeKg: number;
  servingCountBase?: number;   // Base count at 1.0 multiplier (e.g., 20 beans)
  servingUnit?: string;        // Unit for count (e.g., "beans", "tomatoes")
  servingDescription: string;  // Fallback description when count doesn't apply
  yieldDescription: string;    // Human-readable yield (e.g., "~60 beans/plant")
  description: string;
}> = {
  // Tomatoes - yields vary significantly by type
  tomato_indeterminate: {
    yieldPerPlantKg: 4.5,    // 10 lbs realistic for home gardens
    servingSizeKg: 0.15,     // ~1 medium tomato
    servingCountBase: 1,
    servingUnit: 'tomato',
    servingDescription: '1 medium tomato',
    yieldDescription: '~25-30 tomatoes/plant',
    description: 'Vining tomatoes, continuous harvest',
  },
  tomato_determinate: {
    yieldPerPlantKg: 2.5,    // 5-6 lbs, concentrated harvest
    servingSizeKg: 0.15,
    servingCountBase: 1,
    servingUnit: 'tomato',
    servingDescription: '1 medium tomato',
    yieldDescription: '~15-20 tomatoes/plant',
    description: 'Bush tomatoes, concentrated harvest',
  },
  tomato_cherry: {
    yieldPerPlantKg: 3,      // Lots of small fruits
    servingSizeKg: 0.1,      // Handful of cherry tomatoes
    servingCountBase: 10,
    servingUnit: 'cherry tomatoes',
    servingDescription: '~10 cherry tomatoes',
    yieldDescription: '~150-200 cherry tomatoes/plant',
    description: 'Cherry/grape tomatoes',
  },
  // Peppers
  pepper_large: {
    yieldPerPlantKg: 2,      // 8-12 peppers at ~150g each
    servingSizeKg: 0.15,     // 1 pepper
    servingCountBase: 1,
    servingUnit: 'bell pepper',
    servingDescription: '1 bell pepper',
    yieldDescription: '~8-12 peppers/plant',
    description: 'Bell peppers, large sweet peppers',
  },
  pepper_small: {
    yieldPerPlantKg: 1,      // Many small peppers
    servingSizeKg: 0.03,     // A few peppers (less per dish)
    servingCountBase: 2,
    servingUnit: 'small peppers',
    servingDescription: '2-3 small peppers',
    yieldDescription: '~30-40 peppers/plant',
    description: 'Hot peppers, jalapeños',
  },
  // Cucurbits
  cucumber: {
    yieldPerPlantKg: 3,      // 6-10 cucumbers
    servingSizeKg: 0.15,     // Half a cucumber
    servingCountBase: 0.5,
    servingUnit: 'cucumber',
    servingDescription: 'half a cucumber',
    yieldDescription: '~8-12 cucumbers/plant',
    description: 'Slicing and pickling cucumbers',
  },
  squash_summer: {
    yieldPerPlantKg: 4,      // Very prolific!
    servingSizeKg: 0.2,      // 1 small zucchini
    servingCountBase: 1,
    servingUnit: 'small zucchini',
    servingDescription: '1 small zucchini',
    yieldDescription: '~15-20 zucchini/plant',
    description: 'Zucchini, yellow squash - pick often',
  },
  squash_winter: {
    yieldPerPlantKg: 4,      // 3-5 squash at 1-2 kg each
    servingSizeKg: 0.25,     // Quarter of a squash
    servingCountBase: 0.25,
    servingUnit: 'squash',
    servingDescription: 'quarter of a squash',
    yieldDescription: '~3-5 squash/plant',
    description: 'Butternut, acorn - stores well',
  },
  // Legumes - adjusted yields upward and serving sizes down (side dish portions)
  bean_bush: {
    yieldPerPlantKg: 0.2,    // ~0.45 lb per plant (adjusted up from 0.15)
    servingSizeKg: 0.075,    // Reduced from 0.1 - more realistic for side dish
    servingCountBase: 20,
    servingUnit: 'green beans',
    servingDescription: '~20 green beans',
    yieldDescription: '~55 beans/plant',
    description: 'Bush beans, concentrated harvest',
  },
  bean_pole: {
    yieldPerPlantKg: 0.45,   // ~1 lb per plant (adjusted up from 0.35)
    servingSizeKg: 0.075,    // Reduced from 0.1
    servingCountBase: 20,
    servingUnit: 'green beans',
    servingDescription: '~20 green beans',
    yieldDescription: '~120 beans/plant',
    description: 'Pole beans, extended harvest',
  },
  pea: {
    yieldPerPlantKg: 0.15,   // ~1/3 lb shelled
    servingSizeKg: 0.075,    // Reduced from 0.1
    servingCountBase: 30,
    servingUnit: 'peas',
    servingDescription: '~30 peas (shelled)',
    yieldDescription: '~60 peas/plant',
    description: 'Shelling, snap, snow peas',
  },
  // Leafy greens - harvest stage matters a lot
  greens_head: {
    yieldPerPlantKg: 0.35,   // One head
    servingSizeKg: 0.08,     // Salad serving
    servingCountBase: 2,
    servingUnit: 'cups salad greens',
    servingDescription: '2 cups salad greens',
    yieldDescription: '1 head/plant',
    description: 'Head lettuce, romaine - single harvest',
  },
  greens_leaf: {
    yieldPerPlantKg: 0.4,    // Multiple cuts
    servingSizeKg: 0.08,
    servingCountBase: 2,
    servingUnit: 'cups salad greens',
    servingDescription: '2 cups salad greens',
    yieldDescription: '4-5 harvests/plant',
    description: 'Loose leaf lettuce, chard - cut and come again',
  },
  greens_baby: {
    yieldPerPlantKg: 0.1,    // Harvested young
    servingSizeKg: 0.05,     // Small salad portion
    servingCountBase: 1,
    servingUnit: 'cup baby greens',
    servingDescription: '1 cup baby greens',
    yieldDescription: '2-3 small harvests/plant',
    description: 'Baby greens, microgreens - early harvest',
  },
  greens_cooking: {
    yieldPerPlantKg: 0.4,    // Spinach, kale - multiple harvests
    servingSizeKg: 0.15,     // Cooks down significantly
    servingCountBase: 10,
    servingUnit: 'large leaves',
    servingDescription: '~10 large leaves',
    yieldDescription: '~25 leaves/plant',
    description: 'Spinach, kale - cooking greens',
  },
  // Root vegetables
  root_large: {
    yieldPerPlantKg: 0.2,    // Beets, turnips (~200g each)
    servingSizeKg: 0.1,
    servingCountBase: 0.5,
    servingUnit: 'beet',
    servingDescription: 'half a beet/turnip',
    yieldDescription: '1 root/plant (~200g)',
    description: 'Beets, turnips, parsnips',
  },
  root_small: {
    yieldPerPlantKg: 0.08,   // Carrots ~80g each
    servingSizeKg: 0.08,     // 2-3 carrots
    servingCountBase: 2,
    servingUnit: 'carrots',
    servingDescription: '2-3 carrots',
    yieldDescription: '1 carrot/plant',
    description: 'Carrots, radishes',
  },
  // Alliums
  allium_bulb: {
    yieldPerPlantKg: 0.15,   // One onion ~150g
    servingSizeKg: 0.05,     // Half an onion
    servingCountBase: 0.5,
    servingUnit: 'onion',
    servingDescription: 'half an onion',
    yieldDescription: '1 bulb/plant',
    description: 'Onions, shallots, garlic',
  },
  allium_green: {
    yieldPerPlantKg: 0.08,   // Scallions, leek
    servingSizeKg: 0.03,     // A few scallions
    servingCountBase: 2,
    servingUnit: 'scallions',
    servingDescription: '2-3 scallions',
    yieldDescription: '1 bunch/plant',
    description: 'Scallions, leeks',
  },
  // Brassicas
  brassica_head: {
    yieldPerPlantKg: 0.5,    // One head
    servingSizeKg: 0.12,
    servingCountBase: 1,
    servingUnit: 'cup florets',
    servingDescription: '1 cup florets',
    yieldDescription: '1 head/plant',
    description: 'Broccoli, cauliflower, cabbage',
  },
  brassica_leafy: {
    yieldPerPlantKg: 0.4,    // Multiple harvests
    servingSizeKg: 0.1,
    servingCountBase: 8,
    servingUnit: 'leaves',
    servingDescription: '~8 leaves',
    yieldDescription: '~30 leaves/plant',
    description: 'Kale, collards - ongoing harvest',
  },
  // Other
  herb: {
    yieldPerPlantKg: 0.1,
    servingSizeKg: 0.01,     // Small amounts used
    servingCountBase: 10,
    servingUnit: 'leaves',
    servingDescription: '~10 leaves',
    yieldDescription: '~100 leaves/plant',
    description: 'Fresh culinary herbs',
  },
  flower: {
    yieldPerPlantKg: 0,
    servingSizeKg: 0,
    servingCountBase: 1,
    servingUnit: 'bouquet',
    servingDescription: '1 bouquet',
    yieldDescription: '~10 stems/plant',
    description: 'Cut flowers (count-based)',
  },
};

// Map crop names to yield categories
export const CROP_CATEGORY_MAP: Record<string, YieldCategory> = {
  // Tomatoes - distinguish by growth habit
  'Tomato': 'tomato_indeterminate',
  'Tomato (Indeterminate)': 'tomato_indeterminate',
  'Tomato (Determinate)': 'tomato_determinate',
  'Cherry Tomato': 'tomato_cherry',
  'Grape Tomato': 'tomato_cherry',

  // Peppers - distinguish by size
  'Pepper': 'pepper_large',
  'Bell Pepper': 'pepper_large',
  'Sweet Pepper': 'pepper_large',
  'Jalapeño': 'pepper_small',
  'Jalapeño Pepper': 'pepper_small',
  'Hot Pepper': 'pepper_small',
  'Cayenne': 'pepper_small',
  'Habanero': 'pepper_small',

  // Cucurbits
  'Cucumber': 'cucumber',
  'Cucumber (Slicing)': 'cucumber',
  'Cucumber (Pickling)': 'cucumber',
  'Cucamelon': 'cucumber',
  'Eggplant': 'cucumber', // Similar yield profile
  'Summer Squash': 'squash_summer',
  'Zucchini': 'squash_summer',
  'Yellow Squash': 'squash_summer',
  'Winter Squash': 'squash_winter',
  'Butternut': 'squash_winter',
  'Acorn Squash': 'squash_winter',
  'Spaghetti Squash': 'squash_winter',
  'Pumpkin': 'squash_winter',

  // Legumes - distinguish by growth habit
  'Bean': 'bean_bush',
  'Bean, Bush': 'bean_bush',
  'Bush Bean': 'bean_bush',
  'Pole Bean': 'bean_pole',
  'Runner Bean': 'bean_pole',
  'Pea': 'pea',
  'Shelling Pea': 'pea',
  'Sugar Snap Pea': 'pea',
  'Snow Pea': 'pea',

  // Leafy greens - distinguish by harvest style
  'Lettuce': 'greens_leaf',
  'Lettuce (Loose Leaf)': 'greens_leaf',
  'Lettuce (Romaine)': 'greens_head',
  'Lettuce (Butterhead)': 'greens_head',
  'Lettuce (Head)': 'greens_head',
  'Lettuce (Batavian)': 'greens_head',
  'Baby Lettuce': 'greens_baby',
  'Mesclun': 'greens_baby',
  'Spinach': 'greens_cooking',
  'Arugula': 'greens_leaf',
  'Arugula (Wild)': 'greens_leaf',
  'Mustard Greens': 'greens_cooking',
  'Bok Choy': 'greens_head',
  'Bok Choy (Baby)': 'greens_baby',
  'Chard': 'greens_cooking',
  'Swiss Chard': 'greens_cooking',
  'Kale': 'greens_cooking',
  'Collards': 'greens_cooking',
  'Mizuna': 'greens_leaf',
  'Mâche': 'greens_baby',
  'Miner\'s Lettuce': 'greens_leaf',
  'New Zealand Spinach': 'greens_cooking',
  'Callaloo': 'greens_cooking',
  'Good King Henry': 'greens_cooking',
  'Lovage': 'herb',

  // Root vegetables - distinguish by size
  'Carrot': 'root_small',
  'Radish': 'root_small',
  'Beet': 'root_large',
  'Turnip': 'root_large',
  'Parsnip': 'root_large',
  'Potato': 'root_large',
  'Potato (Early)': 'root_large',
  'Potato (Mid-Season)': 'root_large',
  'Potato (Late)': 'root_large',

  // Brassicas
  'Broccoli': 'brassica_head',
  'Sprouting Broccoli': 'brassica_leafy',
  'Broccolini': 'brassica_leafy',
  'Cabbage': 'brassica_head',
  'Cauliflower': 'brassica_head',
  'Brussels Sprouts': 'brassica_head',
  'Gai Lan': 'brassica_leafy',

  // Alliums
  'Onion': 'allium_bulb',
  'Onion (Bulbing)': 'allium_bulb',
  'Shallot': 'allium_bulb',
  'Garlic': 'allium_bulb',
  'Scallion': 'allium_green',
  'Green Onion': 'allium_green',
  'Leek': 'allium_green',
  'Leek (Overwintering)': 'allium_green',

  // Herbs
  'Basil': 'herb',
  'Cilantro': 'herb',
  'Parsley': 'herb',
  'Dill': 'herb',
  'Oregano': 'herb',
  'Thyme': 'herb',
  'Sage': 'herb',
  'Rosemary': 'herb',
  'Mint': 'herb',
  'Chives': 'herb',
  'Sweet Marjoram': 'herb',
  'Summer Savory': 'herb',
  'Winter Savory': 'herb',
  'Lemon Balm': 'herb',
  'Tarragon': 'herb',
  'Chervil': 'herb',
  'Chamomile': 'herb',
  'Sorrel': 'herb',
  'Shiso': 'herb',
  'Lemongrass': 'herb',
  'Stevia': 'herb',

  // Flowers
  'Zinnia': 'flower',
  'Cosmos': 'flower',
  'Sunflower': 'flower',
  'Marigold': 'flower',
  'Dahlia': 'flower',
  'Snapdragon': 'flower',
};

// Multipliers for consumption frequency (servings per week)
const FREQUENCY_MULTIPLIERS: Record<ConsumptionFrequency, number> = {
  rarely: 0.25,      // 1 serving per month = 0.25/week
  occasionally: 1.5, // 1-2 times per week
  regular: 3.5,      // 3-4 times per week
  daily: 6,          // Nearly every day
};

// Multipliers for preservation (additional yield needed)
const PRESERVATION_MULTIPLIERS: Record<PreservationPlan, number> = {
  none: 1.0,
  some: 1.25,        // 25% extra for light preserving
  moderate: 1.75,    // 75% extra for moderate preserving
  heavy: 2.5,        // 150% extra for heavy preserving (year-round supply)
};

// Unit conversion helpers
export function formatWeight(kg: number, unit: WeightUnit): string {
  if (unit === 'lbs') {
    const lbs = kg * 2.205;
    return lbs < 0.1 ? `${(lbs * 16).toFixed(1)} oz` : `${lbs.toFixed(1)} lbs`;
  }
  return kg < 0.1 ? `${(kg * 1000).toFixed(0)}g` : `${kg.toFixed(2)} kg`;
}

export function formatWeightShort(kg: number, unit: WeightUnit): string {
  if (unit === 'lbs') {
    const lbs = kg * 2.205;
    return lbs < 0.1 ? `${(lbs * 16).toFixed(0)}oz` : `${lbs.toFixed(1)}lb`;
  }
  return kg < 0.1 ? `${(kg * 1000).toFixed(0)}g` : `${kg.toFixed(1)}kg`;
}

// Format a scaled serving description based on multiplier
export function formatScaledServing(
  yieldData: typeof YIELD_DEFAULTS[YieldCategory],
  multiplier: number
): string {
  if (yieldData.servingCountBase == null || yieldData.servingUnit == null) {
    return yieldData.servingDescription;
  }

  const scaledCount = yieldData.servingCountBase * multiplier;

  // Format the count nicely
  if (scaledCount < 1) {
    // Fractions like 0.25, 0.5
    if (scaledCount <= 0.25) return `quarter ${yieldData.servingUnit}`;
    if (scaledCount <= 0.5) return `half ${yieldData.servingUnit}`;
    if (scaledCount <= 0.75) return `3/4 ${yieldData.servingUnit}`;
    return `~1 ${yieldData.servingUnit}`;
  }

  // Whole numbers or approximate
  const rounded = Math.round(scaledCount);
  if (rounded === 1 && !yieldData.servingUnit.endsWith('s')) {
    return `1 ${yieldData.servingUnit}`;
  }

  // Pluralize if needed
  let unit = yieldData.servingUnit;
  if (rounded !== 1 && !unit.endsWith('s') && !unit.includes(' ')) {
    unit = unit + 's';
  }

  return `~${rounded} ${unit}`;
}

// Get the yield category for a cultivar
export function getYieldCategory(cultivar: Cultivar): YieldCategory {
  // Use cultivar-specific category if set
  if (cultivar.yieldCategory) {
    return cultivar.yieldCategory;
  }
  // Fall back to crop name lookup
  return CROP_CATEGORY_MAP[cultivar.crop] ?? 'greens_leaf';
}

// Main estimation function
export function estimatePlantQuantity(
  cultivar: Cultivar,
  inputs: EstimatorInputs
): EstimatorResult {
  const category = getYieldCategory(cultivar);
  const yieldData = YIELD_DEFAULTS[category];

  // Get harvest duration for succession calculations
  const harvestDurationDays = cultivar.harvestDurationDays ?? 21; // Default 3 weeks

  // Special case for flowers - use a simple count-based estimate
  if (category === 'flower') {
    const bouquetsPerWeek = FREQUENCY_MULTIPLIERS[inputs.consumptionFrequency];
    const stemsPerBouquet = 5;
    const stemsPerPlant = 10; // Approximate stems per plant over season
    const totalStems = bouquetsPerWeek * stemsPerBouquet * inputs.growingSeasonWeeks;
    const plantsNeeded = Math.ceil(totalStems / stemsPerPlant);

    return {
      recommended: Math.max(3, plantsNeeded),
      min: Math.max(3, Math.floor(plantsNeeded * 0.7)),
      max: Math.ceil(plantsNeeded * 1.3),
      breakdown: `${Math.round(bouquetsPerWeek)} bouquets/week for ${inputs.growingSeasonWeeks} weeks`,
      yieldPerPlantKg: 0,
      servingSizeKg: 0,
      servingDescription: yieldData.servingDescription,
      yieldDescription: yieldData.yieldDescription,
      yieldCategory: category,
      totalNeededKg: 0,
      successionsRecommended: 1,
      plantsPerSuccession: Math.max(3, plantsNeeded),
      harvestDurationDays,
    };
  }

  // Use cultivar-specific yield if set, otherwise use category default
  const yieldPerPlant = cultivar.yieldPerPlantKg ?? yieldData.yieldPerPlantKg;
  const baseServingSize = yieldData.servingSizeKg;
  const servingSize = baseServingSize * inputs.servingSizeMultiplier;

  // Calculate weekly consumption in kg
  const servingsPerWeek = FREQUENCY_MULTIPLIERS[inputs.consumptionFrequency] * inputs.householdSize;
  const weeklyConsumptionKg = servingsPerWeek * servingSize;

  // Total season consumption (adjusted for preservation)
  const preservationMultiplier = PRESERVATION_MULTIPLIERS[inputs.preservationPlan];
  const totalSeasonKg = weeklyConsumptionKg * inputs.growingSeasonWeeks * preservationMultiplier;

  // Calculate plants needed
  const plantsNeeded = Math.ceil(totalSeasonKg / yieldPerPlant);

  // Calculate succession recommendations
  // For crops with short harvest windows, recommend multiple plantings
  const harvestWeeks = harvestDurationDays / 7;
  const isContinuousHarvest = cultivar.harvestStyle === 'continuous' && cultivar.harvestDurationDays == null;

  let successionsRecommended: number;
  let plantsPerSuccession: number;

  if (isContinuousHarvest) {
    // Continuous harvest until frost (tomatoes, peppers, etc.) - single planting
    successionsRecommended = 1;
    plantsPerSuccession = plantsNeeded;
  } else {
    // Calculate how many plantings needed to cover the season
    // Account for overlap - plantings should start before previous one finishes
    const maxSuccessions = Math.ceil(inputs.growingSeasonWeeks / harvestWeeks);
    // Cap successions to plantsNeeded since each succession needs at least 1 plant
    successionsRecommended = Math.max(1, Math.min(maxSuccessions, plantsNeeded));
    plantsPerSuccession = Math.max(1, Math.ceil(plantsNeeded / successionsRecommended));
  }

  // Apply reasonable bounds (min 1)
  const min = Math.max(1, Math.floor(plantsNeeded * 0.7));
  const max = Math.ceil(plantsNeeded * 1.3);
  const recommended = Math.max(1, plantsNeeded);

  // Generate explanation
  const breakdown = generateBreakdown(inputs, totalSeasonKg);

  return {
    recommended,
    min,
    max,
    breakdown,
    yieldPerPlantKg: yieldPerPlant,
    servingSizeKg: servingSize,
    servingDescription: yieldData.servingDescription,
    yieldDescription: yieldData.yieldDescription,
    yieldCategory: category,
    totalNeededKg: totalSeasonKg,
    successionsRecommended,
    plantsPerSuccession,
    harvestDurationDays,
  };
}

function generateBreakdown(
  inputs: EstimatorInputs,
  totalKg: number
): string {
  const parts = [
    `${inputs.householdSize} ${inputs.householdSize === 1 ? 'person' : 'people'}`,
    `${inputs.consumptionFrequency} consumption`,
    `${totalKg.toFixed(1)} kg total`,
  ];

  if (inputs.preservationPlan !== 'none') {
    parts.push(`(+${inputs.preservationPlan} preserving)`);
  }

  return parts.join(' · ');
}

// Helper to get human-readable frequency label
export function getFrequencyLabel(frequency: ConsumptionFrequency): string {
  switch (frequency) {
    case 'rarely': return 'Rarely (monthly)';
    case 'occasionally': return '1-2x/week';
    case 'regular': return '3-4x/week';
    case 'daily': return 'Daily';
  }
}

// Helper to get human-readable preservation label
export function getPreservationLabel(plan: PreservationPlan): string {
  switch (plan) {
    case 'none': return 'Fresh only';
    case 'some': return 'Some (few jars)';
    case 'moderate': return 'Moderate (freezing/canning)';
    case 'heavy': return 'Heavy (stocking pantry)';
  }
}
