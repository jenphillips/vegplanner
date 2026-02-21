# Cultivar Library Scaling: Research & Strategy

## Context

Vegplanner currently has 36 generic baseline cultivars (one per crop type) and 18 user-specific named varieties. For multi-user release, the app needs a comprehensive plant library covering the varieties home gardeners actually grow. This document estimates the scope of that effort and outlines a strategy for building the library with AI assistance.

The existing [multi-user deployment plan](docs/multi-user-deployment-plan.md) already includes a shared cultivar library in Convex and per-user AI lookup via Claude Haiku. This plan addresses the **batch pre-population** of that library — getting it from 36 entries to 2,000+ before users ever arrive.

---

## Scale Estimate

**Reference seed companies (3 US + 2 Canadian):**

| Company | Region | Est. Vegetable Varieties |
|---------|--------|-------------------------|
| Johnny's Selected Seeds | US (Maine) | ~1,200-1,500 |
| Baker Creek Heirloom Seeds | US (Missouri) | ~800-1,000 |
| Burpee | US (Pennsylvania) | ~800-1,000 |
| West Coast Seeds | Canada (BC) | ~500-700 |
| Vesey's | Canada (PEI) | ~400-500 |

**Raw total: ~3,700-4,700** across all 5 catalogs.
**Deduplicated estimate: ~2,000-3,500** unique vegetable varieties (30-50% overlap on popular varieties).

The Canadian catalogs add particular value for cold-climate and short-season varieties (zones 3-5) that US catalogs may list but don't emphasize. West Coast Seeds is already a source for the existing baseline cultivar data.

Variety density is highly uneven — tomatoes alone can have 100-600 varieties per catalog, while crops like parsnips or kohlrabi have 3-8.

---

## Prioritization Strategy

### Tier 1: Core 150 Varieties (2-3 days)

The "can't miss" varieties covering ~80% of what home gardeners grow. Selection criteria: appears in 3+ of the 5 catalogs (Johnny's, Baker Creek, Burpee, West Coast Seeds, Vesey's) AND belongs to one of the top 15 crop types.

| Crop Group | ~Varieties | Examples |
|---|---|---|
| Tomatoes | 25-30 | Cherokee Purple, Brandywine, Sungold, Early Girl, Roma, San Marzano |
| Peppers | 15-20 | California Wonder, Cayenne, Serrano, Shishito |
| Beans | 10-12 | Blue Lake, Contender, Kentucky Wonder, Scarlet Runner |
| Lettuce | 10-12 | Buttercrunch, Black Seeded Simpson, Parris Island Cos |
| Squash | 10-12 | Costata Romanesco, Delicata, Butternut Waltham |
| Cucumbers | 6-8 | Marketmore 76, National Pickling, Lemon |
| Peas | 6-8 | Sugar Snap, Oregon Sugar Pod, Green Arrow |
| Root vegetables | 12-15 | Danvers, Nantes, Detroit Dark Red, French Breakfast |
| Greens | 10-12 | Bloomsdale spinach, Lacinato kale, Bright Lights chard |
| Alliums | 8-10 | Walla Walla, Red Wing, Music garlic |
| Herbs | 10-12 | Genovese basil, Italian parsley, Bouquet dill |
| Brassicas | 8-10 | Calabrese broccoli, Snowball cauliflower |

**Why start here**: highest data confidence (well-documented varieties with university extension data), highest user impact, and validates the pipeline before scaling up.

### Tier 2: Full Coverage of Top Crops (+500-800 varieties, 1-2 weeks)

Expand the top 8 crop groups to near-complete catalog coverage. Prioritize varieties appearing in 2+ catalogs before single-catalog exclusives.

### Tier 3: Long Tail (+800-1,500 varieties, 2-4 weeks)

Everything else. **Recommendation**: defer this and let the per-user AI lookup handle it organically. Monitor which varieties users request to prioritize additions.

### Determining Popularity

Since sales data is proprietary, use proxy signals:
1. **Cross-catalog presence** (strongest signal — countable from the catalog index)
2. **"Best seller" / "staff pick" designations** in catalogs
3. **Community data** (r/vegetablegardening, National Gardening Association lists — one-time research)

---

## AI-Assisted Data Pipeline

### Architecture

```
[1. Catalog Index]  →  [2. AI Extraction]  →  [3. Validation]  →  [4. Import]
Master list of          Claude API batch       Range checks,       Convex bulk
unique varieties        extraction             cross-reference     insert
```

### Stage 1: Catalog Index (8-12 hours manual work)

Browse each catalog's vegetable section and build a spreadsheet:
- `cropName`, `varietyName`, `catalogSource`, `catalogURL`
- Deduplicate across catalogs by normalized variety name
- Add `priority` based on cross-catalog count

This is the most labor-intensive human step but only needs to be done once.

### Stage 2: AI Extraction

Call Claude API (batch endpoint, 50% discount) with a structured prompt that maps directly to the existing `Cultivar` type in [types.ts](src/lib/types.ts). The prompt enforces:
- Standardized crop names matching existing conventions
- JSON output matching the type exactly
- `null` for any value below 80% confidence (baseline fallback handles gaps)

**Key insight — baseline fallback**: The AI doesn't need perfect data for every field. The existing 36 baseline entries provide excellent crop-level defaults for temperature, timing, and harvest data. The AI extraction only *must* produce: `crop`, `variety`, `maturityDays`, `maturityBasis`, `sowMethod`, `yieldCategory`. Everything else falls back to the baseline for that crop type.

### Stage 3: Validation

Automated checks before import:
- **Range validation**: germDaysMin 1-60, maturityDays 15-365, spacingCm 2-300, etc.
- **Cross-field consistency**: germDaysMax >= germDaysMin, optimalTempMaxC > optimalTempMinC, etc.
- **Baseline comparison**: flag entries that diverge significantly from the baseline for that crop type

Expected distribution: ~70% pass automatically, ~25% need human review, ~5% rejected.

### Stage 4: Import

**Tier 1**: Import into a new `data/cultivar-library.json` file (separate from baseline-cultivars.json, which remains as crop-level fallback defaults).

**Tier 2+**: Migrate to Convex `cultivars` table as part of the multi-user deployment.

### Cost

| Scale | AI Cost |
|---|---|
| Tier 1 (150 varieties) | ~$0.25 |
| Tier 2 (800 varieties) | ~$1.25 |
| Tier 3 (1,500 varieties) | ~$2.25 |
| **Total with re-runs** | **~$5** |

### Relationship to Per-User AI Lookup

The batch pipeline and the existing per-user lookup (in the deployment plan) complement each other:
1. Batch pipeline pre-populates the library with 2,000+ entries
2. Per-user lookup handles varieties not yet in the library (adds them on demand)
3. Over time, user-driven lookups organically expand beyond the batch set

The batch pipeline dramatically reduces per-user lookup costs since most requested varieties will already exist.

---

## Data Model Changes

### Current Cultivar type is solid

The 25 fields in [types.ts:48-84](src/lib/types.ts#L48-L84) cover what matters for garden planning. No structural overhaul needed.

### New fields for library management

```typescript
// Add to Cultivar type
canonicalName?: string;        // Normalized slug for dedup (e.g., "tomato-brandywine-red")
aliases?: string[];            // Other names for the same variety
catalogSources?: string[];     // Which catalogs list this variety
dataSource?: 'baseline' | 'ai_batch' | 'ai_user_lookup' | 'manual' | 'community';
dataConfidence?: 'high' | 'medium' | 'low';
lastVerified?: string;         // ISO date
```

All optional, fully backward-compatible.

### Crop name standardization

Currently inconsistent between baseline ("Tomato (Determinate)") and user data ("Tomato"). At scale, this breaks filtering and grouping. Need a normalization function mapping common variations to canonical names.

### `yieldCategory` should become effectively required

The `CROP_CATEGORY_MAP` in [quantityEstimator.ts:425-536](src/lib/quantityEstimator.ts#L425-L536) can't anticipate all new crop names. Setting `yieldCategory` explicitly on every cultivar during extraction avoids bad fallback behavior.

### Deduplication strategy

- Each unique variety gets ONE canonical entry
- `canonicalName` is a kebab-case slug for matching
- `catalogSources` records which vendors sell it
- When vendor data conflicts (e.g., maturity days differ by 2-3), use the average and note the range

### Search/filtering at scale

The current [LibraryView.tsx](src/components/library/LibraryView.tsx) does client-side filtering, which won't work at 2,000+ entries. Needs:
- Convex search index on concatenated crop + variety + notes
- Faceted filters (crop family, sow method, frost sensitivity, maturity speed)
- Pagination / infinite scroll (50 entries at a time)
- Crop grouping ("Tomatoes (87 varieties)" collapsible sections)

### Baseline fallback mechanism

For any field that is `null` on a named variety, merge in the baseline entry for that crop type at runtime. This keeps the baseline entries valuable as defaults and reduces the quality bar for AI extraction.

---

## Effort Estimate

### Fully automated
- AI data extraction, range validation, cross-field consistency checks, ID generation, Convex bulk import

### Needs human effort

| Task | Hours |
|---|---|
| Building catalog index (browse 5 catalogs) | 8-12 |
| Writing batch processing script | 4-6 |
| Reviewing flagged entries (~25% of total) | 8-12 |
| Deduplication edge cases | 2-4 |
| Spot-checking high-confidence entries | 4-6 |
| Data model updates (types, normalization) | 2-3 |
| LibraryView updates (pagination, search, filters) | 4-8 |
| Documentation | 2-3 |

### Phased timeline

| Phase | Human Hours | AI Cost | Calendar |
|---|---|---|---|
| Tier 1 (150 varieties) | 20-30 | ~$0.25 | 3 days |
| Tier 2 (800 varieties) | 30-40 | ~$1.25 | 2 weeks |
| Tier 3 (1,500 varieties) | 25-35 | ~$2.25 | 3 weeks |
| UI/Schema updates | 15-20 | $0 | 1 week |
| **Total** | **90-125 hours** | **~$4** | **6-7 weeks** |

### Recommended sequencing

1. **Tier 1 now with JSON files** — high impact, low effort, validates the pipeline. Store in `data/cultivar-library.json` alongside existing baseline data
2. **Tier 2 after Convex migration** — JSON files don't scale for 800+ entries in production
3. **Tier 3: defer** — let per-user AI lookup handle the long tail; monitor what users request to prioritize additions

---

## Critical Files

| File | Role |
|---|---|
| [src/lib/types.ts](src/lib/types.ts) | Add library management fields to `Cultivar` type |
| [src/lib/quantityEstimator.ts](src/lib/quantityEstimator.ts) | `CROP_CATEGORY_MAP` needs expansion or deprecation in favor of per-cultivar `yieldCategory` |
| [data/baseline-cultivars.json](data/baseline-cultivars.json) | Stays at 36 entries as fallback defaults; named varieties go in separate collection |
| [docs/multi-user-deployment-plan.md](docs/multi-user-deployment-plan.md) | Convex schema needs search index; add batch seed script to implementation steps |
| [src/components/library/LibraryView.tsx](src/components/library/LibraryView.tsx) | Pagination, server-side search, faceted filtering, crop grouping |
| `scripts/batch-cultivars.ts` (new) | Batch processing script for AI extraction pipeline |
