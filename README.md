# Vegplanner

A lightweight planner for vegetable gardening. Track seed cultivars, record your local frost dates, and generate sowing, transplant, and harvest timelines using catalog data (germination and maturity days).

## What you can do
- Enter cultivars with catalog details (germination window, maturity days, direct vs transplant).
- Save your average last spring and first fall frost dates.
- See recommended indoor start, direct sow, transplant, and expected harvest windows.
- Support separate timelines for crops grown by transplant vs direct sow.
- Plan successions (optional offsets for multiple plantings).

## How scheduling works (concept)
- Indoor start: `last_spring_frost - lead_time_weeks*7 - harden_days`.
- Direct sow: `last_spring_frost + direct_after_frost_days` (or relative weeks).
- Days to maturity:
  - If labeled “from transplant”: `transplant_date + maturity_days`.
  - If labeled “from sow”: `sow_date + maturity_days`.
- Expected germination window: `sow_date + germ_min/germ_max`.
- Fall plantings can anchor to `first_fall_frost - fall_buffer_days`.

See `docs/spec.md` for the detailed data model and logic outline.

## Next steps
- Pick a stack (suggested: Expo/React Native or Next.js) and scaffold the app.
- Build data entry for cultivars and frost dates.
- Implement the scheduling engine and surface a calendar/timeline view.
- Add import/export (CSV/JSON) for cultivar lists.
