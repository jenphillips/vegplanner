# Cultivar Library

The cultivar library provides reference data for all available crops and varieties, including timing requirements, temperature tolerances, and spacing specifications.

**Key files**:
- `src/lib/types.ts` - Cultivar type definition
- `data/baseline-cultivars.json` - Reference cultivar library
- `data/vegplanner.json` - Active cultivars and climate data

## Cultivar Structure

```typescript
type Cultivar = {
  // Identity
  id: string;
  crop: string;              // "Tomato", "Spinach"
  variety: string;           // "Early Girl", "Bloomsdale"
  family?: string;           // Botanical family for rotation
  plantType?: PlantType;     // 'vegetable' | 'flower'
  vendor?: string;           // Seed source

  // Germination & Maturity
  germDaysMin: number;
  germDaysMax: number;
  maturityDays: number;
  maturityBasis: MaturityBasis;  // 'from_sow' | 'from_transplant'

  // Sowing Method
  sowMethod: SowMethod;          // 'direct' | 'transplant' | 'either'
  preferredMethod?: 'direct' | 'transplant';
  indoorLeadWeeksMin?: number;
  indoorLeadWeeksMax?: number;
  directAfterLsfDays?: number;   // Days after last spring frost for direct sow
  transplantAfterLsfDays?: number;

  // Harvest
  harvestStyle?: HarvestStyle;   // 'single' | 'continuous'
  harvestDurationDays?: number;
  fallBufferDays?: number;

  // Temperature Tolerance
  frostSensitive?: boolean;
  minGrowingTempC?: number;
  maxGrowingTempC?: number;
  optimalTempMinC?: number;
  optimalTempMaxC?: number;

  // Garden Layout
  spacingCm?: number;            // Space between plants
  trailingHabit?: boolean;       // Spills over container edges

  // Perennial-specific
  isPerennial?: boolean;
  perennialHarvestStartDaysAfterLSF?: number;

  notes?: string;
};
```

## Key Fields Explained

### Timing Fields

| Field | Used For | Example |
|-------|----------|---------|
| `maturityDays` | Calculating harvest date | 75 for tomatoes |
| `maturityBasis` | Whether maturity counts from sow or transplant | `'from_transplant'` |
| `indoorLeadWeeksMin/Max` | Indoor growing time before transplant | 6-8 weeks |
| `directAfterLsfDays` | Earliest direct sow (relative to frost) | 14 days after |
| `transplantAfterLsfDays` | Earliest transplant (relative to frost) | 7 days after |

### Temperature Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `frostSensitive` | Dies at frost? | true for tomatoes |
| `minGrowingTempC` | Cold limit | 10°C for peppers |
| `maxGrowingTempC` | Heat limit (compared directly against avg daily high) | 24°C for spinach |
| `optimalTempMinC/MaxC` | Best growing range | 15-24°C |

### Harvest Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `harvestStyle` | One-time or ongoing | `'continuous'` for tomatoes |
| `harvestDurationDays` | How long harvest lasts | 21 for lettuce |
| `fallBufferDays` | Extra time before frost deadline | 7 days |

## Plant Types

### Vegetables
The default plant type. Shown in the "Vegetables" tab.

### Flowers
Set `plantType: 'flower'` for ornamentals. Shown in the "Flowers" tab. Uses the same succession and scheduling logic as vegetables.

### Perennials
Set `isPerennial: true` for crops that return each year (asparagus, rhubarb, strawberries).

Perennial behavior:
- No succession windows (one "planting" represents the permanent plant)
- Harvest window calculated relative to last spring frost
- Uses `perennialHarvestStartDaysAfterLSF` + `harvestDurationDays`
- No sow/transplant tasks generated

## Sowing Methods

### Direct Sow (`'direct'`)
Seeds planted directly outdoors. Uses `directAfterLsfDays` for earliest date.

### Transplant (`'transplant'`)
Seeds started indoors, moved outdoors after hardening. Uses lead weeks for indoor period.

### Either (`'either'`)
Can be grown both ways. User can toggle per-planting. Uses `preferredMethod` for default.

## Botanical Families

The `family` field enables crop rotation planning. Common families:

| Family | Example Crops |
|--------|---------------|
| Solanaceae | Tomato, pepper, potato, eggplant |
| Brassicaceae | Broccoli, cabbage, kale, bok choy |
| Fabaceae | Beans, peas |
| Cucurbitaceae | Squash, cucumber, melon |
| Amaranthaceae | Beet, spinach, chard |
| Asteraceae | Lettuce, sunflower |
| Apiaceae | Carrot, parsley, cilantro |
| Amaryllidaceae | Onion, garlic, leek |

Crops in the same family shouldn't be planted in the same bed in consecutive years.

## Library Tab

The Library tab provides:

### Browsing
- View all available cultivars from baseline library
- Filter by crop name, family, or plant type
- See which cultivars are already in this year's plan

### Adding to Plan
- Click to add a cultivar to the active season
- Cultivar appears in Vegetables or Flowers tab
- Ready for planting generation

### Status Indicators
- **In plan**: Already added to this season
- **Not in plan**: Available to add

## Data Files

### `data/baseline-cultivars.json`
The reference library of all cultivars with complete data. This is the source of truth for cultivar specifications.

### `data/vegplanner.json`
Contains:
- Active cultivars for the current season (subset of baseline)
- Climate data (monthly temperatures, frost probabilities)
- Frost window (last spring frost, first fall frost)

When a cultivar is "added to plan," it's copied from baseline-cultivars into vegplanner.json.

## Example Cultivar

```json
{
  "id": "tomato-early-girl",
  "crop": "Tomato",
  "variety": "Early Girl",
  "family": "Solanaceae",
  "plantType": "vegetable",
  "germDaysMin": 5,
  "germDaysMax": 10,
  "maturityDays": 75,
  "maturityBasis": "from_transplant",
  "sowMethod": "transplant",
  "indoorLeadWeeksMin": 6,
  "indoorLeadWeeksMax": 8,
  "transplantAfterLsfDays": 14,
  "harvestStyle": "continuous",
  "frostSensitive": true,
  "minGrowingTempC": 10,
  "maxGrowingTempC": 35,
  "optimalTempMinC": 21,
  "optimalTempMaxC": 29,
  "spacingCm": 60,
  "notes": "Indeterminate, disease resistant"
}
```

## Trailing Habit

The `trailingHabit` field indicates plants that spill over container edges:
- Petunias
- Sweet potato vine
- Trailing nasturtiums

These are handled differently in container layout visualization, allowing them to visually extend beyond the container boundary.
