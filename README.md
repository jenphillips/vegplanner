# Vegplanner

A garden planning application for scheduling plantings, managing succession planting for continuous harvests, and visualizing garden bed layouts throughout the growing season.

## Features

### Planting Schedule
- Add cultivars from a library with timing data (germination, maturity, temperature tolerances)
- Generate succession plantings automatically based on temperature windows
- Toggle between direct sow and transplant for crops that support both methods
- Drag planting bars on the timeline to reschedule (temperature-aware, respects frost boundaries)
- Succession numbers automatically renumber based on chronological order

### Task Management
- Weekly task list generated from planting dates
- Tasks include: sow indoors, harden off, transplant, direct sow, begin harvest
- Mark tasks complete with persistent state

### Garden Layout
- Create rectangular beds and circular containers
- Drag-and-drop placement of plantings in beds
- Date scrubber to view the garden at any point in the season
- Plant growth visualization (dots grow from seedling to mature size)
- Collision detection (spatial and temporal)
- Crop family color coding for rotation planning
- Split plantings across multiple beds

### Cultivar Library
- 36+ baseline cultivars with complete timing and temperature data
- Support for vegetables, flowers, and perennials
- Temperature tolerances for heat-sensitive and frost-sensitive crops
- Spacing data for garden layout

## How It Works

### Scheduling Logic
- **Indoor start**: Calculated from transplant date minus lead weeks
- **Direct sow**: Last spring frost + offset (can be negative for cold-hardy crops)
- **Maturity**: From sow date or transplant date depending on cultivar
- **Harvest end**: Based on duration, or extends to frost for continuous harvest crops

### Temperature-Aware Succession
The app calculates viable planting windows by checking monthly temperatures against cultivar tolerances. Heat-sensitive crops (lettuce, spinach) automatically skip hot summer months and resume in fall. See the [succession planting docs](docs/succession-planting.md) for the full algorithm.

## Tech Stack
- Next.js 16 + React 19 + TypeScript
- CSS Modules for styling
- Local JSON files for storage (`data/` directory)
- Single API route for CRUD operations

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

- [Overview](docs/overview.md) - Architecture, data flow, and file structure
- [Succession Planting](docs/succession-planting.md) - Temperature-aware scheduling algorithm
- [Garden Layout](docs/features/garden-layout.md) - Beds, placements, and collision detection
- [Task Scheduling](docs/features/task-scheduling.md) - Task generation and weekly grouping
- [Timeline Interactions](docs/features/timeline-interactions.md) - Drag-to-reschedule and method toggle
- [Cultivar Library](docs/features/cultivar-library.md) - Cultivar data structure and plant types
