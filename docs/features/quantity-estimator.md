# Quantity Estimator

The quantity estimator helps gardeners figure out how many plants to grow based on household size, eating habits, and available growing season. It combines yield data with the succession algorithm's viable growing windows to recommend plant counts and succession schedules.

**Status**: Experimental — yield data and consumption multipliers are being calibrated against real-world results.

**Key files**:
- `src/lib/quantityEstimator.ts` - Estimation logic and yield data
- `src/components/cultivars/QuantityEstimator.tsx` - Interactive estimator UI
- `src/components/cultivars/CultivarCard.tsx` - Integration point (renders estimator)

## How It Works

The estimator answers two questions:
1. **How many plants?** Based on how much you eat and how much each plant produces.
2. **How many successions?** Based on harvest window duration vs. total growing season.

### Core Formula

```
weeklyConsumption = servingsPerWeek × servingSize × householdSize
totalNeeded      = weeklyConsumption × growingWeeks × preservationMultiplier
plantsNeeded     = ceil(totalNeeded / yieldPerPlant)
```

The result is presented as a recommended count with a min–max range, giving users flexibility to scale up or down.

### Succession Recommendations

- **Continuous harvest crops** (tomatoes, peppers): 1 succession — the same plants produce all season.
- **Limited harvest crops** (lettuce, radishes): Multiple successions spaced across the growing season, calculated as `ceil(growingWeeks / harvestWeeks)`.
- Plants are distributed evenly across successions: `ceil(totalPlants / successions)` per planting.

## User Inputs

| Input | Options | Effect |
|-------|---------|--------|
| Household size | 1+ | Linear multiplier on consumption |
| Consumption frequency | Rarely (1×/month), Occasionally (1-2×/week), Regular (3-4×/week), Daily | Sets servings/week: 0.25, 1.5, 3.5, 6 |
| Preservation plan | None, Some, Moderate, Heavy | Multiplies total yield needed: 1×, 1.25×, 1.75×, 2.5× |
| Serving size | Slider 0.5–2.0 | Scales base serving size (small portions → large portions) |
| Growing periods | Checkboxes | Which seasons to plant in (spring, summer, fall) |

For cultivars with `sowMethod: 'either'`, each period also shows a direct/transplant toggle so the user can pick the better method per season.

## Yield Data

### Two-Tier System

1. **Category defaults** — 23 yield categories with baseline kg-per-plant values, serving sizes, and descriptions. The estimator looks up a cultivar's category from `cultivar.yieldCategory` or falls back to a crop-name mapping (`CROP_CATEGORY_MAP`). Unknown crops default to `greens_leaf`.

2. **Per-cultivar overrides** — If a cultivar has `yieldPerPlantKg` set, that value takes precedence over the category default.

### Yield Categories

| Category | Yield/Plant | Serving | Example |
|----------|-------------|---------|---------|
| `tomato_indeterminate` | 4.5 kg | 1 medium tomato (150g) | Vining tomatoes |
| `tomato_determinate` | 2.5 kg | 1 medium tomato (150g) | Bush tomatoes |
| `tomato_cherry` | 3.0 kg | 8 cherry tomatoes (120g) | Cherry/grape types |
| `pepper_large` | 2.0 kg | 1 pepper (150g) | Bell peppers |
| `pepper_small` | 1.0 kg | 3 peppers (60g) | Hot peppers |
| `cucumber` | 3.0 kg | ½ cucumber (150g) | Slicing cucumbers |
| `squash_summer` | 4.0 kg | 1 small squash (200g) | Zucchini |
| `squash_winter` | 4.0 kg | ¼ squash (300g) | Butternut, acorn |
| `bean_bush` | 0.2 kg | 1 cup (125g) | Bush beans |
| `bean_pole` | 0.45 kg | 1 cup (125g) | Pole beans |
| `pea` | 0.15 kg | ¾ cup (100g) | Snap/snow peas |
| `greens_head` | 0.35 kg | 1 head (350g) | Head lettuce |
| `greens_leaf` | 0.4 kg | 2 cups (60g) | Leaf lettuce |
| `greens_baby` | 0.1 kg | 2 cups (60g) | Mesclun, baby spinach |
| `greens_cooking` | 0.4 kg | 2 cups raw (80g) | Spinach, chard, kale |
| `root_large` | 0.2 kg | 1 root (150g) | Beets, turnips |
| `root_small` | 0.08 kg | 3 roots (80g) | Carrots, radishes |
| `allium_bulb` | 0.15 kg | 1 bulb (150g) | Onions, garlic |
| `allium_green` | 0.08 kg | 2 stalks (30g) | Green onions |
| `brassica_head` | 0.5 kg | ¼ head (150g) | Broccoli, cauliflower |
| `brassica_leafy` | 0.4 kg | 2 cups (80g) | Kale, collards |
| `herb` | 0.1 kg | 2 tbsp (10g) | Basil, cilantro |
| `flower` | — | 3 stems/bouquet | Cut flowers |

Flowers use count-based estimation (bouquets per week × stems per bouquet ÷ stems per plant) with a minimum of 3 plants.

## Viable Growing Periods

The estimator uses the succession algorithm's `calculateSuccessionWindows()` to determine when each crop can actually grow, then groups those windows into logical periods:

- Windows are grouped by season (spring, summer, fall) based on sow date
- Gaps longer than 4 weeks create period boundaries (e.g., a lettuce heat gap splits spring and fall periods)
- Each period shows its date range and total harvest weeks
- Users select which periods to plant in; the total `growingSeasonWeeks` feeds the core formula

For `either`-method cultivars, the estimator calculates periods for both direct sow and transplant, then merges them by season. Each period shows the better default method with an option to switch.

## UI Integration

The estimator is accessed from a cultivar card via a "Help me estimate" button. It opens as an inline panel with:

1. **Input controls** — household size, frequency, preservation, serving size slider
2. **Period selection** — checkboxes for each viable growing period with date ranges
3. **Result summary** — recommended count (with min–max range), succession breakdown, total kg needed
4. **Expandable details** — yield per plant, serving size, yield category for transparency
5. **Generate button** — "Generate N plantings" creates succession plantings from selected periods

Weight units (kg/lbs) are toggled and persisted to localStorage.

## Known Limitations

- Yield-per-plant values are rough home-garden estimates; actual yields vary significantly with soil, weather, and care
- The crop-name-to-category mapping covers common crops but unknown varieties fall back to `greens_leaf`
- Preservation multipliers are simple scaling factors — actual preservation needs depend on the method (freezing, canning, fermenting)
- Flower estimation assumes a fixed stems-per-plant value that varies widely by variety
