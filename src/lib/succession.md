# Succession Planting Algorithm

This document describes the logic in `succession.ts` for calculating planting windows.

## Overview

The algorithm calculates viable planting windows for each cultivar based on:
1. **Frost dates** - when it's safe to plant outdoors
2. **Temperature constraints** - crops have min/max growing temperatures
3. **Harvest timing** - ensuring continuous harvest through succession planting

## Key Concepts

### Frost Sensitivity

Crops are classified as either **frost-sensitive** or **frost-tolerant**:

| Type | Earliest Sow | Fall Deadline | Cold Check |
|------|--------------|---------------|------------|
| Frost-sensitive | After last spring frost + offset | Before first fall frost (with buffer) | Yes - avg temp must exceed minGrowingTempC |
| Frost-tolerant | April 1 or earlier if allowed | 3 weeks past typical frost | No - can handle cold |

### Temperature Checking

Temperature viability is checked from **outdoor start** through **harvest start** (not harvest end, since mature plants tolerate more stress).

**Heat check** (all crops):
- Compare monthly avg high (`tmax_c`) against `maxGrowingTempC - margin`
- Default margin is 2°C (can override with `tempMarginC`)
- If avg high exceeds effective max, the window is skipped

**Cold check** (frost-sensitive crops only):
- Compare monthly avg temp (`tavg_c`) against `minGrowingTempC`
- No margin applied (already using avg temp, not low)
- If avg temp is below min, the window is skipped

### Harvest Duration

The `harvestDurationDays` field controls how long a planting produces:

| Value | Meaning | Example |
|-------|---------|---------|
| `null` | Harvest until frost | Indeterminate tomatoes, peppers |
| Number | Fixed harvest window | Spinach (21 days), lettuce (14 days), beets (7 days) |

For crops with explicit duration, `harvestEnd = harvestStart + duration`, capped at frost deadline.

## Algorithm Flow

```
1. Calculate earliestSowDate based on frost tolerance and method
2. Calculate latestSowDate (must reach maturity before fall frost)
3. For each week from earliest to latest:
   a. Calculate planting dates (sow, transplant, harvestStart, harvestEnd)
   b. Check temperature viability for growing period
   c. If viable: add window, calculate next sow date for continuous harvest
   d. If not viable: skip to next week, track skipped period
4. Return windows and skipped periods with diagnostics
```

## Examples by Crop Type

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
- `indoorLeadWeeksMin: 6`
- `transplantAfterLsfDays: 7`
- `maturityDays: 57`, `maturityBasis: from_transplant`
- `harvestDurationDays: null` (harvest until frost)
- `harvestStyle: continuous`

**Calculation:**
- Transplant date: June 8 (June 1 + 7 days)
- Sow date: April 20 (June 8 - 6 weeks indoors)
- Harvest start: Aug 4 (June 8 + 57 days)
- Harvest end: Sept 22 (earliest frost - 4 day buffer)

**Temperature check:**
- Only check from transplant (June 8) through harvest start (Aug 4)
- Indoor period (April 20 - June 8) not checked
- June/July/Aug all within 10-33°C range → OK ✓

**Result:** Single planting provides continuous harvest July 21 - Sept 22. No succession needed because `harvestDurationDays: null` means it produces until frost.

---

### Example 4: Gai Lan (frost-tolerant, heat-sensitive, transplant)

**Cultivar data:**
- `minGrowingTempC: 10`, `maxGrowingTempC: 25`
- `frostSensitive: false`
- `sowMethod: transplant`
- `indoorLeadWeeksMin: 4`
- `transplantAfterLsfDays: 0`
- `maturityDays: 55`, `maturityBasis: from_transplant`
- `harvestDurationDays: 21`

**Climate:**
- June avg high: 21°C
- July avg high: 24°C

**Calculation:**
- Effective max: 25 - 2 = 23°C
- Transplant date: June 1 (frost date + 0)
- Sow date: May 4 (June 1 - 4 weeks)
- Harvest start: July 26 (June 1 + 55 days)

**Temperature check (June 1 - July 26):**
- June: 21°C < 23°C → OK
- July: 24°C > 23°C → FAIL

**Spring window attempt:**
- The earliest transplant puts harvest start in late July
- July is too hot → spring window fails

**Fall window (sow Aug 10):**
- Transplant: Sept 7
- Harvest start: Nov 1
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

---

## Configuration Options

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
| `indoorLeadWeeksMin` | number | Weeks to start seeds indoors before transplant |
| `maturityBasis` | 'from_sow' \| 'from_transplant' | When maturity countdown starts |

### Climate Data Used

| Field | Used For |
|-------|----------|
| `monthlyAvgC[month].tmax_c` | Heat check - avg daily high |
| `monthlyAvgC[month].tavg_c` | Cold check - avg daily temp |
| `firstFallFrost.earliest` | Frost deadline for frost-sensitive crops |
| `firstFallFrost.typical` | Extended season end for frost-tolerant crops |
| `lastSpringFrost.typical` | Not currently used (uses frostWindow instead) |

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
