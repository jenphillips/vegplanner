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
| `frostSensitive` | Dies at frost | true for tomatoes |

The algorithm checks day-by-day interpolated temperatures against these thresholds with a 1°C safety margin applied (e.g., effective max = `maxGrowingTempC - 1`, effective min = `minGrowingTempC + 1`). Future: the margin will be replaced by a user-configurable conservatism level that interpolates between `optimalTemp` and `min/maxGrowingTemp` ranges.

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
├── Frost-tolerant direct sow: climate-derived season start or (last spring frost + offset),
│     whichever is earlier.
│     Season start = first date where interpolated soil temp >= minGrowingTempC (or >= 0°C if no min set).
│     Monthly averages are linearly interpolated (midpoint = 15th of each month).
│     This is fully data-driven — warmer zones get earlier starts, colder zones later.
├── Frost-tolerant transplant: same climate-derived start for outdoor date, minus indoor lead weeks
├── Frost-sensitive direct sow: last spring frost + directAfterLsfDays
└── Frost-sensitive transplant: (last spring frost + transplantAfterLsfDays) - indoor lead weeks

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

For each potential window, check if the growing period is viable. The function iterates through each calendar month the period spans (not sampling every 30 days), ensuring no month is skipped:

```
Outdoor start = transplantDate (if transplant) or sowDate (if direct)
Check period  = outdoor start through harvestStart

For each calendar month in that period:
├── Heat check: Is avgHigh > maxGrowingTempC - margin?
│   └── If yes: NOT VIABLE (too hot)
├── Cold check (frost-tolerant): Is soil_avg_c < minGrowingTempC?
│   └── Fallback: if soil_avg_c unavailable, uses tavg_c - 2°C
│   └── If yes: NOT VIABLE (soil too cold)
└── Cold check (frost-sensitive): Is avgTemp < minGrowingTempC?
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

If temperature check fails, advance by one day and try again. Using 1-day increments finds the exact first viable date rather than overshooting by up to a week. This continues until:
- A viable window is found (add it, continue to next succession)
- Latest sow date is exceeded (stop generating windows)
- Maximum successions reached (default 10)

Skipped periods are tracked for display in the UI. When a gap transitions between reason types (e.g., "too hot" → "too cold"), it is split into separate segments so each displays an accurate label. This commonly occurs with cool-season crops where summer heat gives way to autumn soil cooling.

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
- Algorithm skips summer months (day by day, up to 365 days of searching)
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

Skip forward day by day...

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
Calculate the next succession window based on existing plantings. Used when adding a single new planting to an existing series. Searches up to 365 days forward to find the next viable date, allowing it to jump across large heat gaps (e.g., summer to fall).

### `calculateAvailableWindowsAfter(cultivar, frostWindow, climate, afterDate, existingPlantings)`
Find all remaining viable succession windows after a given date. Windows are chained for continuous harvest coverage — each window's harvest starts when the previous one ends, with no overlapping harvest periods. Filters out windows that overlap with existing plantings.

### `isGrowingPeriodViable(startDate, endDate, cultivar, climate, options?)`
Check if a date range is temperature-viable for a cultivar. Returns `{ viable: boolean; reason?: string }`. Used internally by the succession algorithm and useful for drag-to-reschedule validation.

Options:
- `checkHeatOnly: true` - Skip cold check (useful when only heat tolerance matters)

### `renumberPlantingsForCrop(allPlantings, cropName, cultivarId, variety?)`
Renumber succession numbers to match chronological sow date order. Called automatically when plantings are added or dates change.

### `recalculatePlantingForMethodChange(planting, newMethod, cultivar, frostWindow, climate?)`
Recalculate dates when switching between direct sow and transplant. Returns a discriminated union:

```typescript
type MethodChangeResult =
  | { viable: true; updates: Partial<Planting> }
  | { viable: false; reason: string };
```

When switching **Direct → Transplant**, the old sowDate (outdoor planting day) becomes the new transplantDate, and the indoor sowDate is calculated backwards. This preserves outdoor timing rather than delaying harvest. When the converted dates land in an unfavorable period, the function returns `{ viable: false, reason }` so the caller can show a notice explaining why the switch isn't possible.

## Temperature Checking Details

### Quick Reference

| Check | Climate metric | Compared against | Which crops | Code locations |
|---|---|---|---|---|
| Too hot | `tmax_c` (avg daily high) | `maxGrowingTempC - 1°C` | All | `isGrowingPeriodViable`, `getOutdoorGrowingConstraints` |
| Too cold | `soil_avg_c` (avg soil at 10cm) | `minGrowingTempC + 1°C` | Frost-tolerant (`frostSensitive: false`) | Same + `getClimateSeasonStart` |
| Too cold | `tavg_c` (avg air temp) | `minGrowingTempC + 1°C` | Frost-sensitive (`frostSensitive: true`) | Same + `getClimateSeasonStart` |

The `frostSensitive` flag on the cultivar determines which cold-check path is taken. `tmin_c` (avg daily minimum) is stored in climate data but not currently used by any logic.

### Safety Margin
A default 1°C safety margin (`DEFAULT_TEMP_MARGIN_C`) is applied to all temperature checks. Heat effective max = `maxGrowingTempC - 1`, cold effective min = `minGrowingTempC + 1`. This provides conservative scheduling since interpolated values are still averages — actual daily temps will vary above and below. Future: replace with a user-configurable conservatism level that interpolates between `optimalTemp` and `min/maxGrowingTemp` ranges (the data model already has both).

### Heat Check Strategy
Uses `tmax_c` (average daily high) against `maxGrowingTempC - 1°C margin`. Only checks during active growth (outdoor start to harvestStart). Using `tmax_c` (daily highs rather than daily averages) plus the margin provides conservatism. Day-by-day interpolation precisely identifies the warmest dates.

### Cold Check Strategy

**Frost-tolerant crops:** Uses `soil_avg_c` (average soil temperature at 10cm) against `minGrowingTempC + 1°C margin`. Soil temperature better represents ground-level growing conditions for hardy crops that can survive frost but still need workable soil for growth and germination. If `soil_avg_c` is unavailable in the climate data, falls back to `tavg_c - 2°C` (conservative thermal lag approximation).

**Frost-sensitive crops:** Uses `tavg_c` (average air temperature) against `minGrowingTempC + 1°C margin`. Average temperature is more realistic than overnight lows, since `minGrowingTempC` represents growing conditions rather than frost survival.

### Temperature Interpolation
Monthly averages are linearly interpolated to estimate daily values. Each monthly average is assigned to the 15th of its month (midpoint), and values between midpoints are linearly interpolated. This produces smooth temperature transitions instead of abrupt month-boundary changes. For example, if May tmax is 17°C and June tmax is 21°C, the interpolated tmax on June 1 is ~19.1°C rather than jumping from 17 to 21 at the month boundary. December-January wraps are handled correctly. Interpolation utilities are in `src/lib/dateUtils.ts` (`interpolateClimateValue`, `getInterpolatedClimate`).

### Frost Handling
- Frost-sensitive crops: must finish harvest before earliest probable frost (minus 4-day buffer)
- Frost-tolerant crops: can extend harvest ~3 weeks past typical frost date

### Season Extension with Frost Protection

**Spring (supported):** Set `transplantAfterLsfDays` or `directAfterLsfDays` to a negative number to start earlier than the last spring frost. For example, `transplantAfterLsfDays: -14` means "transplant 2 weeks before last frost," representing use of row covers, cold frames, or cloches. For frost-tolerant crops, the algorithm takes the earlier of the frost-based start and the climate-derived season start (when soil/air temp meets `minGrowingTempC`), so negative frost offsets are effective when the temperature threshold is already met.

**Fall (not yet supported per-cultivar):** The fall deadline is currently hardcoded: frost-sensitive crops end at `earliestFallFrost - 4 days`, frost-tolerant crops end at `typicalFallFrost + 21 days`. There is no per-cultivar field to extend the fall season for crops grown under protection. Possible future approaches:
- A `fallFrostExtensionDays` cultivar field to push the fall deadline later for protected plantings
- Adjusting `firstFallFrost` dates in the climate data to represent protected conditions (affects all crops globally)

## Detailed Examples

### Example 1: Spinach (heat-sensitive, frost-tolerant, direct sow)

**Cultivar data:**
- `maxGrowingTempC: 21`
- `frostSensitive: false`
- `directAfterLsfDays: -28`
- `maturityDays: 40`, `harvestDurationDays: 21`

**Climate (Sussex, NB):**
- May avg high: 17°C
- June avg high: 21°C
- July/Aug avg high: 24°C
- Sept avg high: 19°C

**Calculation:**
- Heat limit: tmax > 21°C (crosses ~mid-June with interpolation)
- Earliest sow: ~April 8 (interpolated soil reaches 4°C between Mar 15 and Apr 15)
- Latest sow: ~Sept 12 (can grow past frost)

**Spring window (sow ~April 8):**
- Outdoor: April 8
- Harvest start: May 18 (April 8 + 40 days)
- Interpolated tmax through this period stays < 19°C → OK ✓
- Harvest end: June 8 (May 18 + 21 days)

**Summer gap:**
- With interpolation, tmax exceeds 19°C around May 31
- Continue skipping day by day through September
- Interpolated tmax drops to 19.0°C at Sep 15, but latest sow is Sep 12
- Heat clears too late for fall plantings at this location

**Result:** Spring plantings only (starting ~April 8). No fall window because interpolated heat clears 3 days after the latest sow deadline.

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
- Climate-derived season start: interpolated soil reaches 10°C at May 15 (midpoint of month 5)
- Target transplant date: June 1 (frost date + 0)
- Climate-derived start May 15 < June 1, so transplant from May 15
- Earliest sow date: Apr 3 (May 15 - 6 weeks using `indoorLeadWeeksMax`)

**Spring window (sow ~Apr 3):**
- Transplant: May 1 (Apr 3 + 4 weeks using `indoorLeadWeeksMin`)
- Harvest start: Jun 25 (May 1 + 55 days from transplant)
- Check May/June temps → both < 23°C → OK ✓
- Harvest end: Jul 16 (Jun 25 + 21 days)

**Summer gap (sow ~Apr 24 onward):**
- Growing period now extends into July
- July avg high 24°C > 23°C effective max → too hot
- Continue skipping through August (also 24°C)
- When growing period moves to September/October, October soil (9°C) < 10°C → too cold
- Gap is split into two segments: "too hot" (summer) + "too cold" (fall soil)

**Fall window:**
- Resume sowing when growing period fits entirely within viable months
- Depends on climate; may or may not find viable fall dates

**Result:** One spring planting, then a split gap showing both the summer heat and fall cold constraints.

---

### Example 5: Lettuce Little Gem (frost-tolerant, heat-sensitive, direct sow)

**Cultivar data:**
- `maxGrowingTempC: 24`
- `frostSensitive: false`
- `directAfterLsfDays: -21`
- `maturityDays: 50`, `harvestDurationDays: 14`

**Climate (Sussex, NB):**
- May avg high: 17°C
- June avg high: 21°C
- July/Aug avg high: 24°C

**Calculation:**
- Heat limit: tmax > 24°C
- Earliest sow: ~April 8 (interpolated soil reaches 4°C around Apr 8)

**Result:** Sussex tmax peaks at exactly 24°C (July/Aug), which does not exceed the 24°C threshold (strict `>` comparison). Lettuce has no summer heat gap in this climate and can be planted throughout the growing season. In warmer climates where tmax exceeds 24°C, summer gaps would appear.

## Diagnostic Output

When no windows are found, `SuccessionResult.diagnostic` explains why:

```typescript
{
  earliestSowDate: "2025-05-04",
  latestSowDate: "2025-09-12",
  noWindowsReason: "Too hot (24.0°C avg high > 23°C max)"
}
```

Skipped periods are also tracked:

```typescript
skippedPeriods: [
  {
    startDate: "2025-06-03",
    endDate: "2025-08-26",
    reason: "Too hot (21.1°C avg high > 21°C max)"
  }
]
```

## Configuration Reference

### Per-Cultivar Settings

| Field | Type | Description |
|-------|------|-------------|
| `frostSensitive` | boolean | Whether crop is killed by frost |
| `minGrowingTempC` | number | Minimum temperature for growth (cold check) |
| `maxGrowingTempC` | number | Maximum temperature before bolting/stress (compared directly against tmax_c) |
| `harvestDurationDays` | number \| null | Fixed harvest window, or null for "until frost" |
| `harvestStyle` | 'single' \| 'continuous' | Affects default duration if not specified |
| `directAfterLsfDays` | number | Days after last frost for direct sowing (negative = before frost, e.g. `-28` for 4 weeks early with frost protection) |
| `transplantAfterLsfDays` | number | Days after last frost for transplanting (negative = before frost, e.g. `-14` for row covers/cold frames) |
| `indoorLeadWeeksMin` | number | Minimum weeks indoors; used to calculate transplant date from sow date |
| `indoorLeadWeeksMax` | number | Maximum weeks indoors; used to calculate earliest possible sow date |
| `maturityBasis` | 'from_sow' \| 'from_transplant' | When maturity countdown starts |
| `preferredMethod` | 'direct' \| 'transplant' | Default method for `sowMethod: either` crops |

### Climate Data Used

All monthly values are linearly interpolated between midpoints (15th of each month) to estimate daily temperatures. See `interpolateClimateValue()` in `src/lib/dateUtils.ts`.

| Field | Used For |
|-------|----------|
| `monthlyAvgC[month].tmax_c` | Heat check - avg daily high (interpolated) |
| `monthlyAvgC[month].tavg_c` | Cold check for frost-sensitive crops - avg daily temp (interpolated) |
| `monthlyAvgC[month].soil_avg_c` | Cold check for frost-tolerant crops - avg soil temp at 10cm (interpolated) |
| `firstFallFrost.earliest` | Frost deadline for frost-sensitive crops |
| `firstFallFrost.typical` | Extended season end for frost-tolerant crops |
| `lastSpringFrost.typical` | Not used (algorithm uses `frostWindow.lastSpringFrost` instead) |
