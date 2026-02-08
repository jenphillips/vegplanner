# Claude Code Guidelines for Vegplanner

## Project Overview

Vegplanner is a garden planning app built with Next.js 16, React 19, and TypeScript. It helps gardeners schedule plantings with temperature-aware succession planning and visualize garden bed layouts.

## Key Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
```

## Architecture

### Data Storage
- All data stored as JSON files in `data/` directory
- Single API route at `src/app/api/data/[collection]/route.ts` handles CRUD
- Collections: `plantings`, `tasks`, `garden-beds`, `placements`, `plans`

### Core Logic Files
- `src/lib/succession.ts` - Succession planting algorithm (temperature-aware window calculation)
- `src/lib/tasks.ts` - Task generation from plantings
- `src/lib/gardenLayout.ts` - Layout calculations, collision detection, circle packing
- `src/lib/types.ts` - All TypeScript type definitions
- `src/lib/dateUtils.ts` - Date manipulation utilities

### Component Structure
- `src/components/cultivars/` - Cultivar cards and forms
- `src/components/plantings/` - Planting cards, timeline, method toggle
- `src/components/schedule/` - Task list and weekly grouping
- `src/components/garden/` - Garden canvas, bed editor, date scrubber
- `src/components/tabs/` - Tab navigation

### Custom Hooks
- `usePlantings` - Planting CRUD with automatic succession renumbering
- `useTasks` - Task state with completion tracking
- `useGardenBeds` - Bed CRUD
- `usePlacements` - Placement CRUD
- `useDataFile` - Generic JSON file access

## Important Patterns

### Tasks Are Derived, Not Stored
Tasks are generated at runtime from planting dates. Only completion state (`TaskCompletion`) is persisted to `data/tasks.json`. This keeps tasks in sync when planting dates change.

### Succession Renumbering
When plantings are added or dates change, `renumberPlantingsForCrop()` is called to keep succession numbers in chronological order. Always use `addAndRenumber()` or `updateAndRenumber()` from `usePlantings`.

### Temperature Viability
The succession algorithm checks `isGrowingPeriodViable()` using monthly climate data. Heat checks use `tmax_c`, cold checks use `tavg_c`. A 2°C safety margin is applied by default.

### Placement Quantity
When a planting is placed in a garden bed, the placement's `quantity` becomes authoritative. Plantings can be split across multiple placements.

## Documentation

Detailed documentation is in `docs/`:
- `docs/overview.md` - Architecture and data flow
- `docs/data-schemas.md` - All data types and JSON file formats
- `docs/succession-planting.md` - Succession algorithm with examples
- `docs/features/` - Feature-specific documentation

## Data Schemas Quick Reference

### Key Types (defined in `src/lib/types.ts`)

| Type | Purpose | Storage |
|------|---------|---------|
| `Cultivar` | Crop variety with timing, temp tolerances, spacing | `vegplanner.json`, `baseline-cultivars.json` |
| `Planting` | Individual planting instance with dates | `plantings.json` |
| `TaskCompletion` | Task completion state only (tasks generated at runtime) | `tasks.json` |
| `GardenBed` | Bed/container definition with dimensions | `garden-beds.json` |
| `PlantingPlacement` | Position of planting in a bed | `placements.json` |
| `Climate` | Monthly temps, frost ranges for succession planning | `vegplanner.json` |

### Required Cultivar Fields
All cultivars must have: `id`, `crop`, `variety`, `plantType`, `germDaysMin`, `germDaysMax`, `maturityDays`, `maturityBasis`, `sowMethod`

### Enums
- `PlantType`: `"vegetable"` | `"flower"`
- `SowMethod`: `"direct"` | `"transplant"` | `"either"`
- `MaturityBasis`: `"from_sow"` | `"from_transplant"`
- `HarvestStyle`: `"single"` | `"continuous"`
- `GardenBedShape`: `"bed"` | `"container"`
- `TaskType`: `"sow_indoor"` | `"sow_direct"` | `"harden_off"` | `"transplant"` | `"harvest_start"`

See `docs/data-schemas.md` for complete field documentation.

## Common Tasks

### Adding a New Cultivar Field
1. Update `Cultivar` type in `src/lib/types.ts`
2. Add to baseline data in `data/baseline-cultivars.json`
3. Update any UI that displays/edits cultivars

### Modifying Succession Logic
1. Edit `src/lib/succession.ts`
2. Update examples in `docs/succession-planting.md` if behavior changes
3. Temperature checks happen in `isGrowingPeriodViable()` and `isTemperatureViable()`

### Adding a New Task Type
1. Add to `TaskType` union in `src/lib/types.ts`
2. Update `generateTasksFromPlanting()` in `src/lib/tasks.ts`
3. Update `getTaskTypePriority()` for sorting

### Modifying Garden Layout
1. Layout calculations in `src/lib/gardenLayout.ts`
2. Canvas rendering in `src/components/garden/UnifiedGardenCanvas.tsx`
3. Collision detection uses `checkCollisionsWithTiming()` for temporal awareness
