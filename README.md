# Vegplanner

A lightweight planner for vegetable gardening. Track seed cultivars, record your local frost dates, and generate sowing, transplant, and harvest timelines using catalog data (germination and maturity days).

## What you can do
- Enter cultivars with catalog details (germination window, maturity days, direct vs transplant).
- Save your average last spring and first fall frost dates.
- See recommended indoor start, direct sow, transplant, and expected harvest windows.
- Support separate timelines for crops grown by transplant vs direct sow.
- Plan successions with automatic scheduling based on temperature windows.
- Toggle plantings between direct sow and transplant for crops that support both methods.
- Drag planting bars on the timeline to reschedule (temperature-aware, respects season boundaries).
- Succession numbers automatically renumber when plantings are added or reordered.

## How scheduling works (concept)
- Indoor start: `last_spring_frost - lead_time_weeks*7 - harden_days`.
- Direct sow: `last_spring_frost + direct_after_frost_days` (or relative weeks).
- Days to maturity:
  - If labeled “from transplant”: `transplant_date + maturity_days`.
  - If labeled “from sow”: `sow_date + maturity_days`.
- Expected germination window: `sow_date + germ_min/germ_max`.
- Fall plantings can anchor to `first_fall_frost - fall_buffer_days`.

See `docs/spec.md` for the detailed data model and logic outline.

## Tech stack
- Next.js + React + TypeScript
- CSS Modules for styling
- Local JSON files for storage

See `docs/ARCHITECTURE.md` for implementation details.
