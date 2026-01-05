# Vegplanner specification

This document captures the initial requirements, data model, and scheduling logic for the vegetable gardening planner.

## Goals
- Store cultivar-level catalog info (germination window, maturity days, whether maturity is from sow or transplant).
- Track gardener-specific context: last spring frost (LSF), first fall frost (FFF), and preferred lead times (hardening off, indoor start windows).
- Generate actionable dates: indoor sow, direct sow, transplant, germination window, and expected harvest window.
- Support both spring and fall plantings and simple successions.
- Keep the logic transparent so formulas can be audited by gardeners.

## User stories
- As a gardener I can enter my LSF and FFF dates.
- As a gardener I can add a cultivar with its catalog-specified germination range and maturity days, and whether maturity is counted from sow or transplant.
- As a gardener I can record whether I plan to direct sow or transplant a cultivar (or both).
- As a gardener I see when to start seeds indoors, when to transplant, when to direct sow, and when to expect harvest.
- As a gardener I can schedule multiple successions by shifting the start date forward by a fixed interval.
- As a gardener I can toggle a planting between direct sow and transplant for crops that support both methods.
- As a gardener I can drag planting bars on the timeline to reschedule, with the system respecting temperature windows and season boundaries.
- As a gardener I see succession numbers automatically reorder when I add or modify plantings.

## Data model (proposed)
- `FrostWindow`
  - `last_spring_frost` (date)
  - `first_fall_frost` (date)
- `Cultivar`
  - `id`, `crop` (e.g., Tomato), `variety` (e.g., Sungold), `vendor`
  - `germ_days_min`, `germ_days_max`
  - `maturity_days` (integer)
  - `maturity_basis` (`from_sow` | `from_transplant`)
  - `sow_method` (`direct` | `transplant` | `either`)
  - `indoor_lead_weeks_min`, `indoor_lead_weeks_max` (for transplant crops; weeks before LSF to sow indoors)
  - `direct_after_lsf_days` (days after LSF for first safe direct sow; can be negative for cold-hardy crops)
  - `transplant_after_lsf_days` (days after LSF for safe transplant; often 0–14)
  - `fall_buffer_days` (days before FFF you want harvest to finish; e.g., 14)
  - `harvest_style` (`single` | `continuous`)
  - `harvest_duration_days` (optional window length; for `continuous` defaults to frost-bounded)
  - `frost_sensitive` (bool; if true and `continuous`, harvest ends at first fall frost)
  - `preferredMethod` (`direct` | `transplant`; for `sow_method: either`, which method to default to)
  - `notes`
- `PlantingPlan`
  - `cultivar_id`
  - `season` (`spring` | `fall`)
  - `succession_offsets_days` (array of day offsets for extra plantings, e.g., `[0, 21, 42]`)
  - `method_override` (optional `direct` | `transplant`)
  - `target_frost_window_id`

Example cultivar entry:
```json
{
  "id": "tomato-sungold",
  "crop": "Tomato",
  "variety": "Sungold",
  "vendor": "Johnny's",
  "germ_days_min": 6,
  "germ_days_max": 10,
  "maturity_days": 57,
  "maturity_basis": "from_transplant",
  "sow_method": "transplant",
  "indoor_lead_weeks_min": 6,
  "indoor_lead_weeks_max": 8,
  "direct_after_lsf_days": null,
  "transplant_after_lsf_days": 7,
  "fall_buffer_days": 14,
  "notes": "F1, indeterminate, thin to one plant per cell after first true leaves."
}
```

## Scheduling logic
Given `LSF`, `FFF`, and a `PlantingPlan` for a `Cultivar`:
- Choose method: `method = plan.method_override || cultivar.sow_method`.
- Spring vs fall anchor dates:
  - `spring_anchor = LSF`
  - `fall_anchor = FFF - cultivar.fall_buffer_days`
- Direct sow (spring):
  - `direct_sow_date = spring_anchor + cultivar.direct_after_lsf_days`
  - Germ window: `direct_sow_date + germ_min` to `direct_sow_date + germ_max`
  - Maturity:
    - If `maturity_basis == from_sow`: `harvest_start = direct_sow_date + maturity_days`
    - If `maturity_basis == from_transplant`: not applicable for direct sow (should warn)
- Transplant flow (spring):
  - `transplant_date = spring_anchor + cultivar.transplant_after_lsf_days`
  - Indoor start window:
    - `indoor_start_early = transplant_date - cultivar.indoor_lead_weeks_max*7`
    - `indoor_start_late = transplant_date - cultivar.indoor_lead_weeks_min*7`
  - Germ window: `indoor_start_* + germ_min/germ_max`
  - Maturity when labeled “from transplant”:
    - `harvest_start = transplant_date + maturity_days`
  - If labeled “from sow”, start from `indoor_start_*`.
- Fall direct sow (if supported):
  - `direct_sow_date = fall_anchor - maturity_days` (earliest to finish before frost)
  - Adjust by cultivar cold tolerance (not modeled yet; use `direct_after_lsf_days` as a correction if negative to indicate cold-hardy).
- Succession planting:
  - For each `offset` in `succession_offsets_days`, duplicate the chosen method schedule with `+ offset` days applied to sow and transplant dates.
- Harvest window logic:
  - `harvest_start = maturity anchor` (from sow or transplant per `maturity_basis`)
  - If `harvest_style == single`: `harvest_end = harvest_start + max(harvest_duration_days-1,0)` (defaults to 1 day)
  - If `harvest_style == continuous`: `harvest_end = min(first_fall_frost, harvest_start + harvest_duration_days)` when `frost_sensitive`; otherwise use the duration. If duration missing, default to frost-bounded.

All generated dates should include the assumptions used (basis, lead times, buffers) so gardeners can tweak inputs.

## Interactive features

### Drag to reschedule
Planting bars on the timeline can be dragged to reschedule. The system calculates valid shift bounds:
- Cannot shift earlier than previous succession's harvest end
- Cannot shift later than frost deadline allows
- Respects season start/end boundaries

For heat-sensitive crops, dragging past an unfavorable temperature window will "jump" to the next viable range (e.g., spring to fall for crops that skip hot summer months).

### Method toggle
For cultivars with `sow_method: either`, individual plantings can be toggled between direct sow and transplant. When toggled:
- All dates recalculate based on the new method
- Transplant mode adds indoor lead time and transplant date
- Direct sow mode removes transplant date and recalculates harvest from sow date

### Automatic succession renumbering
When plantings are added or edited, succession numbers automatically renumber based on chronological sow date order. This keeps the display as #1, #2, #3 in date order regardless of creation order.

## Implementation notes
- JSON-backed store for cultivars and plans in `data/` directory.
- Scheduling functions in `src/lib/schedule.ts` and `src/lib/succession.ts`.
- Date utilities extracted to `src/lib/dateUtils.ts`.
- UI built with Next.js + React + TypeScript.
- Tab-based navigation: Timeline, Tasks, Garden Layout.
- Keep all numbers editable; catalogs vary and gardeners need overrides.
