# Vegplanner Architecture

## Tech Stack
- Next.js 16 + React 19 + TypeScript
- CSS Modules for styling
- Local JSON files for storage (data/*.json)
- API route at /api/data/[collection] for CRUD

---

## Architecture Overview

### Data Flow
- Reference data (cultivars, climate) in `data/vegplanner.json`
- User data (plantings, tasks) in separate JSON files
- API route reads/writes JSON files from `data/` directory

### Key Types
- `Planting`: Individual planting instance with calculated dates and status
- `Task`: Generated from plantings (sow, transplant, harvest reminders)
- `Cultivar`: Extended with temperature tolerance fields for succession logic

---

## Succession Planting Logic

Location: `src/lib/succession.ts`

The app auto-generates the first planting at earliest viable sow date.
"Add Succession" calculates the next optimal date for continuous harvest.
Temperature-aware: skips periods where monthly temps exceed cultivar's maxGrowingTempC.

**Example**: Spinach (maxGrowingTempC: 24) gets plantings in spring,
skips July-August (too hot), resumes in fall.

### Algorithm

```
1. Find earliest sow date (after last spring frost + offset)
2. Calculate harvest window for that planting
3. Find next sow date where:
   - Harvest from new planting begins as previous ends
   - Temperature during growing period is within cultivar tolerance
4. If temperature is too extreme, skip to next viable window
5. Continue until first fall frost (minus maturity buffer)
```

---

## Interactive Features

### Drag to Reschedule
Location: `src/components/plantings/PlantingTimeline.tsx`

Users can drag planting bars on the timeline to reschedule. The system calculates shift bounds that:
- Prevent shifting earlier than previous planting's harvest end (respects succession spacing)
- Prevent shifting later than frost deadline allows
- Enforce season start/end boundaries

**Temperature-aware shifting**: For heat-sensitive crops with viable spring and fall windows, dragging past an unfavorable temperature period will "jump" to the next viable range.

### Method Toggle
Location: `src/components/plantings/MethodToggle.tsx`

For cultivars with `sowMethod: "either"`, plantings can be toggled between direct sow (DS) and transplant (TR). When toggled:
- All dates recalculate based on the new method
- Transplant adds indoor lead time and transplant date
- Direct sow removes transplant date and recalculates harvest based on sow date

### Automatic Succession Renumbering
Location: `src/lib/succession.ts`, `src/hooks/usePlantings.ts`

When plantings are added or edited, succession numbers automatically renumber based on chronological sow date order. This ensures plantings always display as #1, #2, #3 in date order regardless of when they were created.

---

## UI Structure

- **Tab navigation**: Timeline | Tasks | Garden Layout
- **CultivarCard**: Expandable cards showing cultivar info + plantings
- **PlantingCard**: Individual planting with dates, quantity, status

---

## File Structure

```
src/
├── app/
│   ├── api/data/[collection]/route.ts  # JSON file CRUD
│   ├── page.tsx                         # Main app with tabs
│   └── page.module.css
├── components/
│   ├── cultivars/CultivarCard.tsx
│   ├── plantings/
│   │   ├── PlantingCard.tsx
│   │   ├── PlantingTimeline.tsx  # Timeline bar with drag support
│   │   └── MethodToggle.tsx      # Direct sow / transplant toggle
│   ├── tasks/TaskList.tsx, TaskCalendar.tsx
│   ├── timeline/Timeline.tsx
│   └── garden/GardenCanvas.tsx (Phase 3)
├── lib/
│   ├── types.ts          # All type definitions
│   ├── dateUtils.ts      # Shared date utilities
│   ├── schedule.ts       # Date calculation
│   ├── succession.ts     # Succession window calculation
│   └── tasks.ts          # Task generation
└── hooks/
    ├── useDataFile.ts    # Generic JSON file access
    ├── usePlantings.ts
    └── useTasks.ts

data/
├── vegplanner.json       # Cultivars, frost window, climate
├── plantings.json        # User plantings
├── tasks.json            # Task state
└── garden-beds.json      # Bed layouts (Phase 3)
```

---

## Implementation Phases

### Phase 1: Foundation & Succession Planting
- Storage setup (API route, data files)
- Cultivar temperature data
- Succession calculation engine
- CultivarCard with planting forms

### Phase 2: Task Schedule Dashboard
- Task generation from plantings
- TaskList and TaskCalendar components
- Tab navigation

### Phase 3: Garden Bed Layout
- Bed editor
- Drag-and-drop canvas
- Spacing visualization

---

## Data Types

### Planting
```typescript
type Planting = {
  id: string;
  cultivarId: string;
  label: string;           // "Spinach #1"
  quantity: number;
  sowDate: string;
  transplantDate?: string;
  harvestStart: string;
  harvestEnd: string;
  method: SowMethod;
  status: PlantingStatus;
  successionNumber: number;
  notes?: string;
  createdAt: string;
};
```

### Task
```typescript
type Task = {
  id: string;
  plantingId: string;
  cultivarId: string;
  type: TaskType;  // 'sow_indoor' | 'sow_direct' | 'transplant' | 'harvest_start'
  date: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
};
```

### Cultivar Temperature Fields
```typescript
// Added to Cultivar type
minGrowingTempC?: number;   // Below this, don't plant
maxGrowingTempC?: number;   // Above this, skip succession
optimalTempMinC?: number;
optimalTempMaxC?: number;
preferredMethod?: 'direct' | 'transplant';  // Default method for sowMethod: "either"
```

---

## Design Decisions

1. **Storage**: Local JSON files (not IndexedDB) for version control and portability
2. **Reminders**: In-app dashboard only, no browser notifications
3. **Succession logic**: Temperature-aware gaps using climate monthly data
4. **UI layout**: Same page with tabs (not separate routes)
