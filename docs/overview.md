# Vegplanner Overview

Vegplanner is a garden planning application that helps gardeners schedule plantings, manage succession planting for continuous harvests, and visualize garden bed layouts throughout the growing season.

## Goals

- Store cultivar-level catalog info (germination window, maturity days, temperature tolerances, spacing)
- Track gardener-specific context: frost dates, climate data, and preferred timing
- Generate actionable dates: indoor sow, direct sow, transplant, and expected harvest windows
- Support temperature-aware succession planting for continuous harvest
- Provide visual garden bed layout with drag-and-drop placement
- Keep the logic transparent so calculations can be audited by gardeners

## User Stories

- As a gardener I can enter my frost dates and the system uses local climate data for temperature checks
- As a gardener I can add cultivars from a library with catalog-specified timing and temperature data
- As a gardener I can record whether I plan to direct sow or transplant (or toggle between them for crops that support both)
- As a gardener I see when to start seeds indoors, when to transplant, when to direct sow, and when to expect harvest
- As a gardener I can generate succession plantings automatically based on temperature windows
- As a gardener I can drag planting bars on the timeline to reschedule, with the system respecting temperature windows and frost boundaries
- As a gardener I see succession numbers automatically reorder when I add or modify plantings
- As a gardener I can place plantings in garden beds and see a visual layout that changes through the season
- As a gardener I can view my weekly task list generated from planting dates

## Tech Stack

- **Framework**: Next.js 16 + React 19 + TypeScript
- **Styling**: CSS Modules
- **Storage**: Local JSON files in `data/` directory
- **API**: Single route at `/api/data/[collection]` for CRUD operations

## Core Concepts

### Cultivars
Reference data for each crop variety, including timing requirements (maturity days, frost sensitivity), temperature tolerances, spacing requirements, and preferred sowing method.

### Plantings
Individual planting instances created from cultivars. Each planting has calculated dates (sow, transplant, harvest) and tracks its succession number within a crop series.

### Tasks
Action items generated from plantings (sow indoors, harden off, transplant, direct sow, begin harvest). Tasks are derived at runtime from planting dates; only completion state is persisted.

### Garden Beds & Placements
Physical beds (rectangular or circular containers) and the placement of plantings within them. Supports splitting a single planting across multiple beds/placements.

## Application Structure

### Tabs
The app uses a single-page layout with tab navigation:

| Tab | Purpose |
|-----|---------|
| **Vegetables** | Manage vegetable cultivars and their plantings |
| **Flowers** | Manage flower cultivars and their plantings |
| **Calendar** | Chronological view of all plantings with drag-to-reschedule |
| **Tasks** | Weekly task schedule with completion tracking |
| **Garden** | Visual bed layout with drag-and-drop placement |
| **Library** | Browse and add cultivars to the annual plan |

### Data Flow

```
data/vegplanner.json (cultivars, climate, frost window)
         │
         ▼
   Succession Engine ──────► Planting Windows
         │
         ▼
  User creates Plantings ──► data/plantings.json
         │
         ├──► Task generation (runtime)
         │           │
         │           ▼
         │    Completion state ──► data/tasks.json
         │
         └──► Garden placement
                     │
                     ▼
              data/placements.json
              data/garden-beds.json
```

## File Structure

```
src/
├── app/
│   ├── api/data/[collection]/route.ts  # JSON file CRUD
│   ├── page.tsx                         # Main app with tabs
│   └── page.module.css
├── components/
│   ├── cultivars/CultivarCard.tsx       # Expandable cultivar display
│   ├── plantings/
│   │   ├── PlantingCard.tsx             # Individual planting display
│   │   ├── PlantingTimeline.tsx         # Timeline bar with drag support
│   │   └── MethodToggle.tsx             # Direct sow / transplant toggle
│   ├── schedule/
│   │   ├── ScheduleView.tsx             # Task list container
│   │   ├── WeekGroup.tsx                # Weekly task grouping
│   │   └── TaskCard.tsx                 # Individual task display
│   ├── garden/
│   │   ├── GardenView.tsx               # Main garden layout view
│   │   ├── UnifiedGardenCanvas.tsx      # Drag-and-drop canvas
│   │   ├── BedEditor.tsx                # Create/edit beds
│   │   ├── DateScrubberTimeline.tsx     # Date selector for layout view
│   │   └── LayoutCalendarView.tsx       # Planting timeline in garden
│   ├── tabs/TabNav.tsx                  # Tab navigation
├── lib/
│   ├── types.ts              # All TypeScript type definitions
│   ├── dateUtils.ts          # Date manipulation utilities
│   ├── succession.ts         # Succession window calculation
│   ├── tasks.ts              # Task generation from plantings
│   ├── propagationLabels.ts  # Propagation-type-aware task labels
│   └── gardenLayout.ts       # Layout, collision, and spacing logic
└── hooks/
    ├── useDataFile.ts        # Generic JSON file access
    ├── usePlantings.ts       # Planting CRUD with renumbering
    ├── useTasks.ts           # Task state management
    ├── useGardenBeds.ts      # Bed CRUD
    └── usePlacements.ts      # Placement CRUD

data/
├── vegplanner.json           # Cultivars, frost window, climate data
├── baseline-cultivars.json   # Reference cultivar library
├── plantings.json            # User's plantings
├── tasks.json                # Task completion state
├── garden-beds.json          # Bed definitions
├── placements.json           # Planting placements in beds
├── plans.json                # Annual planting plans
└── cultivar-library.json     # User's cultivar library
```

## Key Features

### Succession Planting
Temperature-aware succession planning that calculates optimal planting windows for continuous harvest. Automatically skips unfavorable periods (too hot/cold) and can jump between spring and fall windows.

See [Succession Planting](./succession-planting.md) for detailed algorithm documentation.

### Interactive Timeline
Drag plantings on the timeline to reschedule. The system enforces constraints (frost dates, succession spacing) and can jump across temperature gaps.

See [Timeline Interactions](./features/timeline-interactions.md) for details.

### Garden Layout
Visual drag-and-drop bed layout with:
- Rectangular beds and circular containers
- Plant spacing visualization with growth animation
- Collision detection (spatial and temporal)
- Auto-layout suggestions
- Crop family color coding for rotation planning

See [Garden Layout](./features/garden-layout.md) for details.

### Task Scheduling
Tasks are generated on-the-fly from planting dates, ensuring they stay in sync when dates change. Only completion state is persisted.

See [Task Scheduling](./features/task-scheduling.md) for details.

### Data Schemas
All TypeScript types and JSON file formats are documented with field requirements and constraints.

See [Data Schemas](./data-schemas.md) for complete type definitions.

## Design Decisions

1. **Local JSON Storage**: Files in `data/` directory for version control compatibility and portability. No database required.

2. **Runtime Task Generation**: Tasks derived from plantings at runtime rather than stored separately. This ensures tasks automatically update when planting dates change.

3. **Temperature-Aware Succession**: Uses monthly climate averages with safety margins to skip unfavorable growing periods.

4. **Single-Page Tabs**: All views on one page with tab navigation rather than separate routes.

5. **Canvas as Source of Truth for Quantity**: When a planting is placed in the garden, the placement quantity becomes authoritative. This allows splitting plantings across multiple beds.
