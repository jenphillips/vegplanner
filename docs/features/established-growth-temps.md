# Established Growth Temperature Thresholds

## Problem

The temperature viability algorithm applies a single `minGrowingTempC` threshold across the entire growing period. But this value typically represents the **germination/establishment** temperature — the minimum soil or air temp needed for seeds to germinate or transplants to establish. Once a plant is established (~3-4 weeks after outdoor planting), it can continue growing at significantly lower temperatures.

This causes the algorithm to reject plantings that are viable in practice. For example, squash direct-sown in mid-June in Sussex NB (Zone 5a) is flagged as "too cold" because September average temps drop below the 18°C germination threshold — even though the established plant is still growing productively at 15°C.

## Research Summary

### The Temperature Ladder (squash as example)

| Growth Stage | Minimum Temp | Source |
|---|---|---|
| Seed germination (soil) | 15.5°C (60°F) | Extension services — minimum. 18°C is *recommended*. |
| Transplant establishment | ~12-15°C | Hardening-off threshold ~10°C nighttime |
| Active growth (established) | **10°C (50°F)** | "Growth virtually stops below 50°F" — Penn State, multiple extensions |
| Optimal growth | 18-29°C | Peak productivity |
| Plant death | 0°C (frost) | Any frost kills vines |

Key insight: there's a **5-8°C gap** between what seeds need to germinate and what established plants need to keep growing. Our algorithm currently treats these as the same.

### Winter Squash and Frost

Extension sources **strongly advise against** leaving squash through frost:
- Vines die from any frost (0°C)
- Mature fruit can survive light frost (thick rind insulates), but rind is compromised
- Michigan State Extension: "fruits that have frosted begin to decay as soon as they have thawed"
- `frostSensitive: true` is correct for all squash/pumpkin

### Direct Sow in Zone 5a

- **Summer squash** (40-60 day maturity): common practice, plenty of margin
- **Winter squash** (85-100 day maturity): risky, transplanting recommended. But doable with early-maturing varieties — user has personally direct-sown butternut and zucchini successfully in Sussex NB.

## Solution: Phased Temperature Check

### New Cultivar Field

Add `minEstablishedGrowthTempC` (optional) to the `Cultivar` type. When set, the temperature viability check uses two phases:

1. **Establishment phase** — first N days after outdoor planting
   - Direct sow: `germDaysMax + 14` days (germination + seedling establishment)
   - Transplant: 14 days (root establishment)
   - Uses existing thresholds: `minGrowingTempC` (direct) or `minGrowingTempTransplantC` (transplant)

2. **Established growth phase** — remaining days through harvest
   - Uses `minEstablishedGrowthTempC`
   - If not set, falls back to the establishment threshold (no behavior change)

### Algorithm Change

Modify `isGrowingPeriodViable()` in `src/lib/succession.ts`:
- Accept establishment period info (method + cultivar germination data already available)
- During the day-by-day check, use the lower threshold after the establishment cutoff
- No changes needed to `getOutdoorGrowingConstraints()` or `getClimateSeasonStart()` — these represent when you can START growing, not established plant tolerance

### Data Changes for Squash/Pumpkin

All 16 squash/pumpkin cultivar entries get updated:

| Field | Old Value | New Value | Rationale |
|---|---|---|---|
| `minGrowingTempC` | 18 | 15 | Actual germination minimum is 15.5°C; 18 was "recommended" |
| `minGrowingTempTransplantC` | 15 | 12 | Transplants tolerate cooler conditions than seeds |
| `minEstablishedGrowthTempC` | (new) | 10 | Growth stops at 10°C/50°F per extension sources |

### Verification: Sussex NB Climate Trace

With the new values, summer squash direct sow June 15:
- **Establishment (June 15 - July 7, 22 days):** tavg check >= 16°C (15+1 margin)
  - June 15 tavg = 16°C → passes (just barely)
- **Established growth (July 8 - Aug 4):** tavg check >= 11°C (10+1 margin)
  - All of July/August >> 11°C → passes
- **Result: VIABLE** (matches real-world experience)

Butternut squash direct sow June 15, 100-day maturity:
- **Establishment (June 15 - July 7):** same as above → passes
- **Established growth (July 8 - Sept 23):** tavg on Sept 23 ≈ 13°C > 11°C → passes
- **Result: VIABLE** (matches user's experience growing butternut)

## Crop Research Results

The established growth distinction matters most for **warm-season, frost-sensitive crops** where there's a meaningful gap between germination temp and growth-cessation temp. Cool-season crops (2-7°C thresholds) already have values close to their growth-cessation point.

The primary evidence source for established growth minimums is the **GDD (Growing Degree Day) base temperature** — the temperature below which a crop accumulates no developmental heat units. This is the best proxy for the temperature at which growth effectively stops.

### Tier 1: Cucurbits (same biology as squash) — RESEARCHED

All cucurbits share similar physiology. The gradient makes biological sense: squash and cucumber are the most cold-tolerant, melons are intermediate, watermelon is most heat-demanding.

| Crop | minGrowingTempC | minGrowingTempTransplantC | minEstablishedGrowthTempC | Key Evidence |
|---|---|---|---|---|
| Cucumber | 16 (no change) | 12 (new) | **10** | OSU Croptime GDD base = 50°F (10°C). Penn State: growth slows below 50°F. ISHS: 8-12°C range. |
| Melon | 18 (no change) | 15 (new) | **12** | Baker & Reddy (USDA-ARS) Tbase = 10°C for leaf appearance. Purdue field base = 12.2°C. Using 12°C as conservative value — melons more heat-demanding than cucumbers. |
| Watermelon | **18** (from 21) | 16 (new) | **15** | ISHS found 18°C most suitable GDD base across 10 cultivars. No flowering below 13°C. Most extension sources cite 60°F (15.5°C) as actual germination minimum, not 21°C. |

#### Cucumber details

- **Germination:** Absolute minimum ~10-12°C (50-53°F), but reliable germination requires 15-16°C (60°F). Current value of 16°C is correct.
- **Established growth:** Oregon State Extension Croptime model uses 50°F (10°C) lower threshold. Penn State: "temperatures below 50°F will slow growth." ISHS (Akinci & Abak 1999) tested bases of 0-16°C, found 8 or 12°C most suitable.
- **Transplant:** Purdue's 54°F (12.2°C) base for cucumber/muskmelon development supports 12°C transplant threshold.

#### Melon details

- **Germination:** Absolute minimum ~15-16°C, reliable at 18-21°C. Current 18°C is well-justified.
- **Established growth:** Baker & Reddy (2001, Annals of Botany, USDA-ARS) definitive study — Tbase = 10°C for muskmelon leaf appearance rate. Purdue uses 12.2°C for field scheduling. Using 12°C as conservative practical value.
- **Transplant:** Penn State says soil should reach 60°F (15.5°C) before transplanting. Rounded to 15°C.

#### Watermelon details

- **Germination:** Most extension sources (Penn State, Clemson, Purdue) cite 60°F (15.5°C) as actual minimum. 21°C was "ideal" but overly restrictive. 18°C aligns with Origene production guide and ISHS research.
- **Established growth:** ISHS (Onsinejad & Abak 1999) tested 10, 13, 15, 18°C bases — found 18°C most suitable for GDD prediction. However, some growth persists to ~10°C. No flowering below 13°C. Using 15°C as practical cutoff where the plant is not meaningfully advancing toward harvest.
- **Transplant:** Transplants can go out at 60°F (15.5°C) soil per Penn State/Purdue, rounded to 16°C.

### Tier 2: Other warm-season crops — RESEARCHED

| Crop | minGrowingTempC | minEstablishedGrowthTempC | Key Evidence |
|---|---|---|---|
| Tomato | 10 (no change) | **10** | Standard GDD base = 10°C (50°F). NDSU, OMAFRA, FAO all confirm. Already transplant-only, so current value serves dual purpose — no practical change but set explicitly. |
| Pepper | 16 (no change) | **11** | OSU Croptime uses 52°F (11.1°C) for transplanted sweet pepper. OMAFRA: chilling injury below 8-10°C. Fruit set requires warmer nights (15.5°C) but vegetative growth continues to 11°C. |
| Eggplant | 16 (no change) | **12** | GDD base ~10°C like other Solanaceae, but eggplant is the most cold-sensitive member. Growth stalls more readily below 12°C. Blossom drop below 10°C. |
| Bean (Bush) | 16 (no change) | **10** | Standard GDD base = 10°C (50°F). OSU Croptime suggests even lower (40°F/4.4°C) but that's an outlier from PNW trials. |
| Bean (Pole) | 16 (no change) | **10** | Same species as bush bean (P. vulgaris), same GDD base. |
| Bean (Runner) | **12** (from 14) | **8** | RHS: seeds germinate at 12°C soil. Euphytica research: growth continues at 14°C/8°C day/night (avg ~11°C). P. coccineus is more cold-tolerant than P. vulgaris — originates from cool Central American highlands. |
| Corn | 16 (no change) | **10** | One of the most well-established values in crop science. NDSU: "the lower base temperature for corn is 50°F (10°C) — below this, little growth occurs." |
| Sweet Potato | 18 (no change) | **15** | Villordon et al. (2009, HortTechnology, LSU): GDD base = 15.5°C. Most heat-demanding crop in this group. Vine growth stunted below 10°C, but meaningful growth ceases around 15°C. |

#### Family-level patterns

- **Solanaceae (tomato, pepper, eggplant):** GDD bases cluster at 10-11°C. Eggplant is the most cold-sensitive (12°C). All frost-sensitive with chilling injury below 5-10°C.
- **Fabaceae (beans):** Common beans (P. vulgaris) at 10°C, runner beans (P. coccineus) at 8°C — runner beans are genuinely more cold-tolerant.
- **Poaceae (corn):** 10°C base is universally cited.
- **Convolvulaceae (sweet potato):** Highest base at 15-15.5°C, reflecting tropical origin.

### Tier 3: Warm-season herbs/specialty — RESEARCHED

| Crop | minGrowingTempC | minEstablishedGrowthTempC | Confidence | Key Evidence |
|---|---|---|---|---|
| Basil | 16 (no change) | **10** | High | Walters & Currey (Iowa State, 2019): Tbase for fresh weight = 10.9-12.1°C. Ferrante et al. (2021): minimum survival temp = 10.9°C. Chilling injury below 12°C. |
| Lemongrass | 15 (no change) | **12** | Medium-High | C4 tropical grass. Singh & Gupta (1982): photosynthesis "extremely low" at 15/10°C day/night. PFAF: damage at 10°C. Using 12°C conservatively — meaningful growth ceases here. |
| Shiso | 13 (no change) | **7** | Medium | Lamiaceae family, more cold-tolerant than expected. Die-back below 45°F (7°C) with prolonged exposure. Can tolerate light frost briefly. No GDD study found — value from horticultural sources. |
| Callaloo | 18 (no change) | **15** | Medium-High | DSU Extension: growth "restricted" below 60°F (15°C). PlantVillage: night temps "not lower than 15°C." Palmer amaranth GDD base = 15°C. UF/IFAS: tolerates 50°F (10°C) but not productive. Initial LINTUL 8°C base was for grain amaranth (different species, A. cruentus) in temperate Slovenia — not applicable to vegetable amaranth (A. tricolor). |
| Ground Cherry | 16 (no change) | **10** | Medium-High | Solanaceae family, uses tomato GDD base of 10°C. Slightly hardier than tomatoes once established — "will bear until a heavy frost." |
| Tomatillo | 16 (no change) | **10** | Medium-High | Solanaceae/Physalis, same 10°C vegetative base as tomato. Note: flower abortion below 13°C (55°F), so reproductive growth has a higher threshold. |

### Crops That DON'T Need It

Cool-season crops where `minGrowingTempC` is already close to growth-cessation:

- All brassicas (kale, broccoli, cabbage, etc.) — 4°C
- Root vegetables (beet, carrot, turnip, radish) — 4-5°C
- Leafy greens (spinach, lettuce, arugula) — 2-4°C
- Alliums (onion, garlic, leek, shallot) — 7°C, already frost-tolerant
- Cool-season herbs (cilantro, parsley, dill) — 4-10°C

## Implementation Plan

### Files to Modify

1. **`src/lib/types.ts`** — Add `minEstablishedGrowthTempC?: number` to Cultivar type
2. **`src/lib/succession.ts`** — Modify `isGrowingPeriodViable()` for phased check
3. **`data/baseline-cultivars.json`** — Update squash/pumpkin entries (5 baselines)
4. **`data/cultivar-library.json`** — Update squash/pumpkin varieties (11 entries)
5. **`docs/data-schemas.md`** — Document new field
6. **Tests** — Update/add tests for phased temperature check

### What NOT to Change

- `getClimateSeasonStart()` — Determines earliest start, uses germination threshold
- `PlantingTimeline.tsx` drag validation — Already passes `method` to `isGrowingPeriodViable`
- Other cultivar data — Wait for per-crop research before updating non-squash entries

### `getOutdoorGrowingConstraints()` Update

Originally planned not to change, but the constraint bands must use `minEstablishedGrowthTempC` (when set) so the timeline badges match the viability algorithm. The bands represent where the plant CAN be growing (including established growth), not just germination. Planting-start timing is handled separately by `calculateEarliestSowDate()`.

### Incremental Approach

1. **Phase 1** (done): Implement algorithm + squash/pumpkin data
2. **Phase 2** (done): Research all tiers — cucurbits, warm-season crops, herbs/specialty
3. **Phase 3** (next): Apply Tier 1 cucurbit values to baseline + library data
4. **Phase 4**: Apply Tier 2 values (tomato, pepper, eggplant, beans, corn, sweet potato)
5. **Phase 5**: Apply Tier 3 values (basil, lemongrass, shiso, callaloo, ground cherry, tomatillo)

### Data Changes Summary

Values to adjust (beyond adding `minEstablishedGrowthTempC`):

| Crop | Field | Old | New | Rationale |
|---|---|---|---|---|
| Watermelon | `minGrowingTempC` | 21 | 18 | 21°C was "ideal"; 18°C is practical minimum per extension sources |
| Runner Bean | `minGrowingTempC` | 14 | 12 | RHS: germination succeeds at 12°C soil |

All other `minGrowingTempC` values remain unchanged.

## References

### Squash/Pumpkin (Phase 1)

- Penn State Extension: "temperatures above 95°F or below 50°F slow growth and maturity"
- Michigan State Extension: harvest before frost, fruit decays after thawing
- Iowa State Extension: "Don't wait until plants have been killed by a frost"
- University of Saskatchewan: transplants recommended for short-season squash
- Alabama Cooperative Extension: soil temperature tables for seed germination
- Oklahoma State Extension: squash and pumpkin production guide
- Utah State Extension: summer and winter squash growing guide

### Tier 1: Cucurbits

- Oregon State Extension, EM-9305: Vegetable degree-day models. Cucumber GDD base = 50°F (10°C)
- Purdue University, Maynard (2007): Cucurbit crop growth and development. Cucumber/muskmelon: 194 DD above base of 54°F (12.2°C)
- Baker & Reddy (2001), Annals of Botany 87:605-613: Muskmelon Tbase = 10°C for leaf appearance rate (USDA-ARS)
- Onsinejad & Abak (ISHS, 1999): Watermelon GDD — tested 10, 13, 15, 18°C; 18°C most suitable
- Akinci & Abak (ISHS, 1999): Cucumber GDD — tested 0-16°C; 8 or 12°C most suitable
- Penn State Extension: Cucumber, Cantaloupe, Watermelon production guides
- Clemson Extension (HGIC): Cucumber and watermelon factsheets

### Tier 2: Warm-season crops

- NDSU Extension / NDAWN: Corn GDD base of 10°C (50°F)
- Ontario OMAFRA: Extreme temperature effects on tomato and pepper crops — comprehensive thresholds
- Oregon State Extension, EM-9305: Sweet pepper Croptime base = 52°F (11.1°C), snap bean = 40°F (4.4°C), sweet corn = 44-50°F
- Villordon et al. (2009), HortTechnology: Sweet potato GDD base 15.5°C (Louisiana State University)
- RHS: Runner bean germination at 12°C soil
- Euphytica (Springer): Runner bean germplasm growth at sub-optimal 14°C/8°C day/night
- Midwest Regional Climate Center (Purdue): Standard GDD bases for warm-season crops
- FAO: Tomato crop optimum temperature ranges
- Canadian Journal of Plant Science: Bean primary leaf growth at 10°C

### Tier 3: Herbs/specialty

- Walters & Currey (2019), HortScience 54(11):1915-1920: Basil Tbase for fresh weight = 10.9-12.1°C (Iowa State)
- Ferrante et al. (2021), MDPI Plants: Basil minimum survival temp = 10.9°C
- Singh & Gupta (1982), Plant Physiology: Lemongrass photosynthesis "extremely low" at 15/10°C
- Delaware State University Cooperative Extension: Callaloo production guide — growth "restricted" below 60°F (15°C)
- UF/IFAS HS1407: Production Guide of Vegetable Amaranth for Florida — tolerates 50°F but not productive
- PlantVillage (Penn State): Amaranth — night temps "not lower than 15°C"
- Palmer amaranth phenology (Weed Science, Cambridge Core): GDD base = 15°C for A. palmeri
- University of Minnesota Extension: Ground cherry and tomatillo growing guide
- Catalan & Catalan (2015), Journal of Essential Oil Bearing Plants: Basil germination cardinal temps
