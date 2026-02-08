# Succession Planting

Succession planting is the practice of making multiple plantings of the same crop throughout the season to ensure a continuous harvest. Vegplanner automates this with a temperature-aware algorithm that calculates optimal planting windows.

**Location**: `src/lib/succession.ts`

## Overview

The succession engine answers the question: "When should I plant this crop to have fresh produce all season?"

For a crop like spinach that matures in 45 days and can be harvested for 21 days:
- Plant #1 sown April 15 → harvest May 30 to June 20
- Plant #2 sown May 23 → harvest July 7 to July 28
- But wait—July is too hot for spinach (bolts above 24°C)
- Skip summer, resume in fall...
- Plant #3 sown August 15 → harvest September 29 to October 20

The algorithm handles all of this automatically.

## Key Concepts

### Planting Window
A calculated set of dates for a single planting:

```typescript
type PlantingWindow = {
  sowDate: string;           // When to sow seeds
  transplantDate?: string;   // When to transplant (if applicable)
  harvestStart: string;      // When harvest begins
  harvestEnd: string;        // When harvest ends
  method: SowMethod;         // 'direct' | 'transplant'
  successionNumber: number;  // 1, 2, 3...
};
```

### Frost Window
The growing season boundaries, provided by the user:

```typescript
type FrostWindow = {
  lastSpringFrost: string;   // ISO date, e.g. "2025-05-15"
  firstFallFrost: string;    // ISO date, e.g. "2025-09-22"
};
```

This is distinct from the `Climate` data which contains probability-based frost dates (`firstFallFrost.earliest`, `firstFallFrost.typical`). The `FrostWindow` represents the user's chosen reference dates, while `Climate` provides statistical ranges for more nuanced calculations.

### Temperature Viability
Each cultivar can define temperature tolerances:

| Field | Purpose | Example |
|-------|---------|---------|
| `minGrowingTempC` | Too cold below this | 10°C for tomatoes |
| `maxGrowingTempC` | Bolts/fails above this | 24°C for spinach |
| `tempMarginC` | Safety buffer (default 2°C) | Per-crop override |
| `frostSensitive` | Dies at frost | true for tomatoes |

The algorithm checks monthly average temperatures against these thresholds.

### Harvest Styles

| Style | Behavior | Example |
|-------|----------|---------|
| `single` | One harvest, plant is done | Carrots, beets |
| `continuous` | Ongoing harvest until end | Tomatoes, lettuce |

For continuous harvest crops without an explicit duration, harvest extends until frost (for frost-sensitive) or 3 weeks past typical frost (for frost-tolerant).

## The Algorithm

### Step 1: Calculate Season Bounds

```
Earliest Sow Date:
├── Frost-tolerant direct sow: April 1 or (last spring frost + offset), whichever is earlier
├── Frost-sensitive direct sow: last spring frost + directAfterLsfDays
└── Transplant: transplant date - indoor lead weeks

Latest Sow Date:
├── Frost-sensitive: earliest fall frost - buffer - maturity days
└── Frost-tolerant: typical fall frost + 21 days - maturity days
```

### Step 2: Generate First Window

Starting from the earliest sow date, calculate all dates for the planting:

```
For transplant method:
  transplantDate = sowDate + (indoorLeadWeeksMin × 7)
  harvestStart = transplantDate + maturityDays  (if maturityBasis = 'from_transplant')
           OR  = sowDate + maturityDays         (if maturityBasis = 'from_sow')

For direct sow:
  harvestStart = sowDate + maturityDays

Harvest end:
  = harvestStart + harvestDurationDays  (if explicitly set)
  = frost deadline                       (if continuous + no duration)
  = harvestStart + default duration      (single: 7 days, continuous: 21 days)
```

### Step 3: Check Temperature Viability

For each potential window, check if the growing period is viable:

```
Outdoor start = transplantDate (if transplant) or sowDate (if direct)
Check period  = outdoor start through harvestStart

For each month in that period:
├── Heat check: Is avgHigh > maxGrowingTempC - margin?
│   └── If yes: NOT VIABLE (too hot)
└── Cold check (frost-sensitive only): Is avgTemp < minGrowingTempC?
    └── If yes: NOT VIABLE (too cold)
```

**Important**: Heat is checked through `harvestStart`, not `harvestEnd`. Mature plants tolerate more heat than actively growing ones.

### Step 4: Calculate Next Succession

For continuous harvest, the goal is seamless coverage:

```
Next sow date = previous harvestEnd - maturityDays

(For transplants with maturityBasis = 'from_transplant':
 Next sow date = previous harvestEnd - maturityDays - leadWeeks)
```

This targets the new planting's harvest to begin exactly when the previous ends.

### Step 5: Skip Unfavorable Periods

If temperature check fails, advance by one week and try again. This continues until:
- A viable window is found (add it, continue to next succession)
- Latest sow date is exceeded (stop generating windows)
- Maximum successions reached (default 10)

Skipped periods are tracked for display in the UI.

### Step 6: Handle Edge Cases

**Continuous harvest crops without duration** (e.g., indeterminate tomatoes):
- Only one window is generated—the plant harvests until frost
- No benefit to additional successions

**Perennials** (e.g., asparagus, rhubarb):
- Don't use succession logic at all
- Harvest window is relative to last spring frost
- Uses `perennialHarvestStartDaysAfterLSF` + `harvestDurationDays`

**Spring-fall gap crops** (e.g., spinach):
- Spring plantings continue until heat makes them unviable
- Algorithm skips summer months
- Resumes with fall plantings when temperatures allow

## Example: Spinach Succession

Given:
- `maturityDays`: 45
- `harvestDurationDays`: 21
- `maxGrowingTempC`: 24
- `frostSensitive`: false
- Last spring frost: April 15
- Climate: July avgHigh = 29°C, August avgHigh = 28°C

```
Window 1: Sow Apr 1 → Harvest May 16-Jun 6
Window 2: Sow May 16 → Harvest Jun 30-Jul 21
  └── Check viability: July avgHigh (29°C) > 24°C - 2°C margin
  └── NOT VIABLE - too hot

Skip forward week by week...

Window 2 (adjusted): Sow Aug 20 → Harvest Oct 4-Oct 25
  └── Check viability: Sep/Oct temps are fine
  └── VIABLE

Skipped period recorded: May 16 - Aug 19 (too hot)
```

## API Functions

### `calculateSuccessionWindows(cultivar, frostWindow, climate, options?)`
Generate all viable planting windows for a cultivar within the growing season.

Returns:
```typescript
{
  windows: PlantingWindow[];
  skippedPeriods: Array<{ startDate, endDate, reason }>;
  diagnostic?: { earliestSowDate, latestSowDate, noWindowsReason? };
}
```

### `calculateNextSuccession(cultivar, frostWindow, climate, existingPlantings)`
Calculate the next succession window based on existing plantings. Used when adding a single new planting to an existing series.

### `calculateAvailableWindowsAfter(cultivar, frostWindow, climate, afterDate, existingPlantings)`
Find all remaining viable windows after a given date. Useful for showing available options when manually adjusting plantings.

### `isGrowingPeriodViable(startDate, endDate, cultivar, climate, options?)`
Check if a date range is temperature-viable for a cultivar. Returns `{ viable: boolean; reason?: string }`. Used internally by the succession algorithm and useful for drag-to-reschedule validation.

Options:
- `checkHeatOnly: true` - Skip cold check (useful for frost-tolerant crops)

### `renumberPlantingsForCrop(allPlantings, cropName, cultivarId, variety?)`
Renumber succession numbers to match chronological sow date order. Called automatically when plantings are added or dates change.

### `recalculatePlantingForMethodChange(planting, newMethod, cultivar, frostWindow, climate?)`
Recalculate dates when switching between direct sow and transplant. If the new dates land in an unfavorable period, auto-adjusts to the next viable window.

## Temperature Checking Details

### Heat Check Strategy
Uses `avgHigh` (daily maximum average) against `maxGrowingTempC`. Only applies during active growth (sow/transplant to harvestStart). Rationale: mature plants are more heat-tolerant than actively growing ones.

### Cold Check Strategy
Uses `avgTemp` (daily average) against `minGrowingTempC`. Only applies to frost-sensitive crops. Rationale: `minGrowingTempC` typically represents soil/growing conditions, not survival of overnight lows.

### Safety Margin
Default 2°C margin applied to heat checks only (effective max = `maxGrowingTempC - margin`). Cold checks compare directly against `minGrowingTempC` without margin, since we already use `tavg_c` (average temp) rather than `tmin_c` (average low). Can be overridden per-cultivar with `tempMarginC`. Since we use monthly averages, actual daily temps often exceed these values.

### Frost Handling
- Frost-sensitive crops: must finish harvest before earliest probable frost (minus 4-day buffer)
- Frost-tolerant crops: can extend harvest ~3 weeks past typical frost date

## Detailed Examples

### Example 1: Spinach (heat-sensitive, frost-tolerant, direct sow)

**Cultivar data:**
- `maxGrowingTempC: 21`, `tempMarginC: undefined` (uses default 2)
- `frostSensitive: false`
- `directAfterLsfDays: -28`
- `maturityDays: 40`, `harvestDurationDays: 21`

**Climate (Sussex, NB):**
- May avg high: 17°C
- June avg high: 21°C
- July/Aug avg high: 24°C
- Sept avg high: 19°C

**Calculation:**
- Effective max temp: 21 - 2 = 19°C
- Earliest sow: April 1 (frost-tolerant, can start early)
- Latest sow: ~Sept 22 (can grow past frost)

**Spring window (sow April 1):**
- Outdoor: April 1
- Harvest start: May 11 (April 1 + 40 days)
- Check April (10°C high) → OK
- Check May (17°C high) → 17 < 19 → OK ✓
- Harvest end: June 1 (May 11 + 21 days)

**Next succession (sow April 22):**
- Target harvest start = previous harvest end (June 1)
- Sow = June 1 - 40 days = April 22
- Check April/May temps → OK ✓
- Harvest: June 1 - June 22

**Summer gap:**
- Sow May 13 → harvest starts June 22, growing through June
- June avg high 21°C > 19°C effective max → SKIP
- Continue skipping through August
- Resume sowing Sept 2 when temps drop

**Result:** 2 spring plantings (April 1, April 22), gap June-Aug, 2 fall plantings (Sept 2, Sept 22)

---

### Example 2: Bush Beans (frost-sensitive, heat-tolerant, direct sow)

**Cultivar data:**
- `minGrowingTempC: 15`, `maxGrowingTempC: 32`
- `frostSensitive: true`
- `directAfterLsfDays: 7`
- `maturityDays: 50`, `harvestDurationDays: 21`

**Climate:**
- June avg temp: 16°C, avg high: 21°C
- July avg temp: 19°C, avg high: 24°C

**Calculation:**
- Earliest sow: June 8 (last frost June 1 + 7 days)
- Cold check uses avg temp (not low): June 16°C ≥ 15°C → OK
- Heat check: July 24°C < 30°C (32 - 2) → OK
- Latest sow: ~July 20 (must harvest before Sept 22 frost deadline)

**First window (sow June 8):**
- Harvest start: July 28
- Harvest end: Aug 18
- Check June temps → OK ✓

**Second window (sow June 29):**
- Harvest start: Aug 18
- Harvest end: Sept 8
- Check June/July temps → OK ✓

**Third window (sow July 20):**
- Harvest start: Sept 8
- Harvest end: Sept 22 (capped at frost deadline - 4 days)

**Result:** 3 plantings through summer, no gaps (beans thrive in heat)

---

### Example 3: Tomato Sungold (frost-sensitive, transplant, harvest until frost)

**Cultivar data:**
- `minGrowingTempC: 10`, `maxGrowingTempC: 35`
- `frostSensitive: true`
- `sowMethod: transplant`
- `indoorLeadWeeksMin: 6`, `indoorLeadWeeksMax: 8`
- `transplantAfterLsfDays: 7`
- `maturityDays: 57`, `maturityBasis: from_transplant`
- `harvestDurationDays: null` (harvest until frost)
- `harvestStyle: continuous`

**Calculation:**

The algorithm uses two different lead week values:
- `indoorLeadWeeksMax` (8 weeks): Used to calculate the **earliest possible sow date**
- `indoorLeadWeeksMin` (6 weeks): Used to calculate **transplant date from sow date**

Step by step:
1. Target transplant date: June 8 (June 1 + 7 days after frost)
2. Earliest sow date: April 13 (June 8 - 8 weeks using `indoorLeadWeeksMax`)
3. Actual transplant date: May 25 (April 13 + 6 weeks using `indoorLeadWeeksMin`)
4. Harvest start: July 21 (May 25 + 57 days from transplant)
5. Harvest end: Sept 11 (earliest frost Sept 15 - 4 day buffer)

**Temperature check:**
- Only check from transplant (May 25) through harvest start (July 21)
- Indoor period (April 13 - May 25) not checked
- May/June/July all within 10-33°C range → OK ✓

**Result:** Single planting provides continuous harvest July 21 - Sept 11. No succession needed because `harvestDurationDays: null` means it produces until frost.

> **Note:** The use of `indoorLeadWeeksMax` for earliest sow allows gardeners to start seeds earlier if desired (up to 8 weeks before transplant), while `indoorLeadWeeksMin` ensures transplants aren't set out too young (minimum 6 weeks old).

---

### Example 4: Gai Lan (frost-tolerant, heat-sensitive, transplant)

**Cultivar data:**
- `minGrowingTempC: 10`, `maxGrowingTempC: 25`
- `frostSensitive: false`
- `sowMethod: transplant`
- `indoorLeadWeeksMin: 4`, `indoorLeadWeeksMax: 6`
- `transplantAfterLsfDays: 0`
- `maturityDays: 55`, `maturityBasis: from_transplant`
- `harvestDurationDays: 21`

**Climate:**
- June avg high: 21°C
- July avg high: 24°C

**Calculation:**
- Effective max: 25 - 2 = 23°C
- Target transplant date: June 1 (frost date + 0)
- Earliest sow date: April 20 (June 1 - 6 weeks using `indoorLeadWeeksMax`)
- Actual transplant date: May 18 (April 20 + 4 weeks using `indoorLeadWeeksMin`)
- Harvest start: July 12 (May 18 + 55 days)

**Temperature check (May 18 - July 12):**
- May: 17°C < 23°C → OK
- June: 21°C < 23°C → OK
- July: 24°C > 23°C → FAIL

**Spring window attempt:**
- Growing period extends into July when it's too hot
- July is too hot → spring window fails

**Fall window:**
- Resume sowing when temps drop in late summer
- Check Sept (19°C) → OK ✓

**Result:** Only fall plantings viable. To get spring gai lan, would need earlier transplanting (negative `transplantAfterLsfDays`) to harvest before July heat.

---

### Example 5: Lettuce Little Gem (frost-tolerant, heat-sensitive, direct sow)

**Cultivar data:**
- `maxGrowingTempC: 24`, `tempMarginC: undefined`
- `frostSensitive: false`
- `directAfterLsfDays: -21`
- `maturityDays: 50`, `harvestDurationDays: 14`

**Climate:**
- May avg high: 17°C
- June avg high: 21°C
- July avg high: 24°C

**Calculation:**
- Effective max: 24 - 2 = 22°C
- Earliest sow: April 1 (frost-tolerant)

**Spring windows:**
- Sow April 1 → harvest May 21 - June 4, check April/May → OK ✓
- Sow April 15 → harvest June 4 - June 18, check April/May → OK ✓
- Sow April 29 → harvest June 18 - July 2, check May/June → OK (June 21°C < 22°C) ✓
- Sow May 13 → harvest July 2 - July 16, check May/June → OK ✓
- Sow May 27 → harvest July 16 - July 30, check June → OK ✓

**Summer gap:**
- Sow June 10 → harvest July 30, growing through July
- July avg high 24°C > 22°C effective max → SKIP
- Continue skipping through August

**Fall windows:**
- Resume Sept 2 when temps drop

**Result:** 5 spring plantings (April 1 through May 27), gap June-Aug, fall plantings resume Sept 2

## Diagnostic Output

When no windows are found, `SuccessionResult.diagnostic` explains why:

```typescript
{
  earliestSowDate: "2025-05-04",
  latestSowDate: "2025-09-12",
  noWindowsReason: "Too hot in month 7 (avg high 24°C > max 25°C - 2° margin)"
}
```

Skipped periods are also tracked:

```typescript
skippedPeriods: [
  {
    startDate: "2025-06-03",
    endDate: "2025-08-26",
    reason: "Too hot in month 6 (avg high 21°C > max 21°C - 2° margin)"
  }
]
```

## Configuration Reference

### Per-Cultivar Settings

| Field | Type | Description |
|-------|------|-------------|
| `frostSensitive` | boolean | Whether crop is killed by frost |
| `minGrowingTempC` | number | Minimum temperature for growth (cold check) |
| `maxGrowingTempC` | number | Maximum temperature before bolting/stress (heat check) |
| `tempMarginC` | number | Override default 2°C safety margin |
| `harvestDurationDays` | number \| null | Fixed harvest window, or null for "until frost" |
| `harvestStyle` | 'single' \| 'continuous' | Affects default duration if not specified |
| `directAfterLsfDays` | number | Days after last frost for direct sowing (negative = before) |
| `transplantAfterLsfDays` | number | Days after last frost for transplanting |
| `indoorLeadWeeksMin` | number | Minimum weeks indoors; used to calculate transplant date from sow date |
| `indoorLeadWeeksMax` | number | Maximum weeks indoors; used to calculate earliest possible sow date |
| `maturityBasis` | 'from_sow' \| 'from_transplant' | When maturity countdown starts |
| `preferredMethod` | 'direct' \| 'transplant' | Default method for `sowMethod: either` crops |

### Climate Data Used

| Field | Used For |
|-------|----------|
| `monthlyAvgC[month].tmax_c` | Heat check - avg daily high |
| `monthlyAvgC[month].tavg_c` | Cold check - avg daily temp |
| `firstFallFrost.earliest` | Frost deadline for frost-sensitive crops |
| `firstFallFrost.typical` | Extended season end for frost-tolerant crops |
| `lastSpringFrost.typical` | Not used (algorithm uses `frostWindow.lastSpringFrost` instead) |
