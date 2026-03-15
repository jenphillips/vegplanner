# Task Scheduling

The task system generates actionable reminders from planting dates, helping gardeners know what to do and when.

**Key files**:
- `src/lib/tasks.ts` - Task generation logic
- `src/components/schedule/ScheduleView.tsx` - Task list container
- `src/components/schedule/WeekGroup.tsx` - Weekly grouping
- `src/components/schedule/TaskCard.tsx` - Individual task display
- `src/hooks/useTasks.ts` - Task state management

## Design Philosophy

**Tasks are derived, not stored.** The actual task definitions (type, date, title) are generated at runtime from planting data. Only completion state is persisted.

This means:
- Tasks automatically update when planting dates change
- No sync issues between plantings and their tasks
- Rescheduling a planting immediately updates all related tasks

## Task Types

| Type | When | Applies To | Description |
|------|------|------------|-------------|
| `sow_indoor` | sowDate | Transplant method | Start seeds indoors |
| `sow_direct` | sowDate | Direct sow method | Sow seeds outdoors |
| `harden_off` | transplantDate - 7 days | Transplant method | Begin hardening off seedlings |
| `transplant` | transplantDate | Transplant method | Move seedlings to garden |
| `harvest_start` | harvestStart | All | Begin harvesting |

### Task Generation by Method

**Transplant plantings** generate 4 tasks:
1. Sow indoor (sowDate)
2. Harden off (transplantDate - 7 days)
3. Transplant (transplantDate)
4. Harvest start (harvestStart)

**Direct sow plantings** generate 2 tasks:
1. Sow direct (sowDate)
2. Harvest start (harvestStart)

**Perennials** generate 1 task:
1. Harvest start (harvestStart)

## Task Structure

```typescript
type Task = {
  id: string;           // Format: `${plantingId}-${type}`
  plantingId: string;
  cultivarId: string;
  type: TaskType;
  date: string;         // ISO date
  title: string;        // Human-readable title
  description?: string; // Additional context
  completed: boolean;
  completedAt?: string;
};
```

### ID Format
Task IDs combine planting ID and task type: `planting-abc123-sow_indoor`

This ensures:
- Unique IDs across all tasks
- Completion state can be matched to regenerated tasks
- Same planting always generates same task IDs

## Task Persistence

Only completion state is stored in `data/tasks.json`:

```typescript
type TaskCompletion = {
  id: string;
  plantingId: string;
  type: TaskType;
  completed: boolean;
  completedAt?: string;
};
```

When tasks are generated, completion state is merged in from storage.

## Weekly Grouping

Tasks are grouped by week (Monday start) for the schedule view:

```typescript
function getWeekStart(isoDate: string): string {
  // Returns the Monday of the week containing the date
}

function groupTasksByWeek(tasks: Task[]): Map<string, Task[]> {
  // Groups tasks by week start date
  // Sorts tasks within each week by date, then by type priority
}
```

### Task Type Priority
Within a week, tasks are sorted by:
1. Date (chronological)
2. Type priority:
   - Sow indoor / Sow direct: 1
   - Harden off: 2
   - Transplant: 3
   - Harvest start: 4

This puts preparation tasks before action tasks.

## UI Components

### ScheduleView
Main container that:
- Generates tasks from all plantings
- Merges completion state
- Groups by week
- Renders WeekGroup components

### WeekGroup
Displays a week header with task count and list of TaskCards.

### TaskCard
Individual task with:
- Type badge (colored by task type)
- Title and description
- Date
- Completion checkbox
- Link to parent planting

## Date Display

The `sowDateOverride` field on plantings affects task dates. When a user manually adjusts the indoor sow date (to start earlier, for example), tasks use the override:

```typescript
const displaySowDate = planting.sowDateOverride ?? planting.sowDate;
```

This ensures the sow_indoor task reflects the user's chosen date rather than the calculated optimal date.

## Propagation-Aware Labels

Task titles and descriptions are propagation-type-aware via `getPropagationLabels()` from `src/lib/propagationLabels.ts`. For cultivars with a non-seed `propagationType`, labels are adjusted accordingly (e.g., "Plant corms" instead of "Direct sow" for gladiolus, "Plant tubers" instead of "Sow seeds" for potatoes).

## Quantity in Descriptions

Task descriptions include quantity when known:
- "Sow 24 seeds"
- "Transplant 24 seedlings"

When quantity is undefined (planting not yet placed in garden):
- "Sow some seeds"

This handles the workflow where plantings are scheduled before being placed in specific beds.
