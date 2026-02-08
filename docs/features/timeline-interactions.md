# Timeline Interactions

The timeline provides interactive drag-and-drop rescheduling with intelligent constraints and temperature awareness.

**Key files**:
- `src/components/plantings/PlantingTimeline.tsx` - Main timeline with drag support
- `src/components/plantings/PlantingCard.tsx` - Individual planting display
- `src/components/plantings/MethodToggle.tsx` - Direct sow / transplant toggle

## Timeline Display

Each planting is shown as a horizontal bar on the timeline:

```
[Indoor]──────[Transplant]────────────[Harvest]
   │              │                      │
   Sow          Move to               Ready to
 indoors        garden                 pick
```

For transplant method:
- **Indoor period**: Sow date to transplant date (shows lead time)
- **Outdoor period**: Transplant date to harvest end
- **Harvest window**: Highlighted section within outdoor period

For direct sow:
- **Growing period**: Sow date to harvest end
- **Harvest window**: Highlighted section at end

## Drag to Reschedule

Users can drag planting bars to change dates. The system enforces constraints:

### Shift Bounds
When dragging, the planting can only move within valid bounds:

| Constraint | Effect |
|------------|--------|
| Previous planting's harvest end | Can't overlap succession sibling |
| Season start (earliest sow date) | Can't plant before viable date |
| Frost deadline | Must complete harvest before frost |
| Temperature viability | Can't grow during unsuitable temps |

### Temperature-Aware Jumping
For crops with both spring and fall viable windows (separated by hot summer):

1. User drags spring planting toward summer
2. As it approaches the heat boundary, visual indicator shows limit
3. If dragged past the boundary, planting "jumps" to the fall viable window
4. Works in reverse too (fall planting can jump to spring)

This lets users easily switch a planting between seasonal windows.

### What Gets Dragged

**For transplant method**:
- Dragging the indoor section adjusts `sowDateOverride` (earlier indoor start)
- Dragging the outdoor section shifts the entire planting

**For direct sow**:
- Dragging shifts the sow date and all dependent dates

### Automatic Date Recalculation
When the sow date changes:
- Transplant date recalculates (sow + lead weeks)
- Harvest start recalculates (based on maturity)
- Harvest end recalculates (based on duration/frost)

All related tasks update automatically (since they're generated from planting dates).

## Method Toggle

For cultivars with `sowMethod: 'either'`, plantings can switch between direct sow and transplant.

### Toggle Behavior

**Direct → Transplant**:
- Current sow date becomes indoor sow date
- Transplant date = sow date + indoor lead weeks
- Harvest recalculates based on `maturityBasis`

**Transplant → Direct**:
- Current transplant date becomes new sow date
- Transplant date removed
- Harvest = sow + maturity days

### Temperature Auto-Adjustment
If the new dates land in an unfavorable temperature period, the planting automatically shifts to the next viable window for that method.

```typescript
function recalculatePlantingForMethodChange(
  planting, newMethod, cultivar, frostWindow, climate
): Partial<Planting> {
  // Calculate new dates for method
  // Check temperature viability
  // If not viable, find next viable window
  // Return adjusted dates
}
```

## Succession Renumbering

When plantings are added, removed, or rescheduled:

1. All plantings for that cultivar are collected
2. Sorted by sow date (chronological)
3. Succession numbers reassigned: 1, 2, 3...
4. Labels updated: "Spinach #1", "Spinach #2"...

This ensures the numbering always reflects actual chronological order, regardless of when plantings were created or how they've been rearranged.

```typescript
function renumberPlantingsForCrop(
  allPlantings, cropName, cultivarId, variety?
): Planting[] {
  // Filter to this cultivar
  // Sort by sow date
  // Reassign numbers and labels
  // Return merged with other cultivars
}
```

## Visual Feedback

### During Drag
- Ghost indicator shows where planting will land
- Constraint indicators show valid range
- Temperature zones highlighted if applicable

### Viable Windows Display
Available succession windows can be shown on the timeline to help users see when new plantings are possible:
- Green regions: Viable planting windows
- Gray/red regions: Skipped periods (too hot/cold)
- Frost lines: Spring/fall frost dates

### Planting Status
Visual indicators for planting state:
- `planned`: Default appearance
- `sowing`: Active sow period
- `growing`: Between sow/transplant and harvest
- `harvesting`: In harvest window
- `completed`: Past harvest end
- `failed`: Marked as failed by user
