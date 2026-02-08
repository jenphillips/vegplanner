# Garden Layout

The garden layout feature provides a visual drag-and-drop interface for placing plantings in beds and visualizing the garden throughout the growing season.

**Key files**:
- `src/components/garden/GardenView.tsx` - Main view container
- `src/components/garden/UnifiedGardenCanvas.tsx` - Drag-and-drop canvas
- `src/components/garden/BedEditor.tsx` - Bed creation/editing
- `src/lib/gardenLayout.ts` - Layout calculations and utilities

## Bed Types

### Rectangular Beds
Standard raised beds or in-ground plots defined by width and length.

```typescript
{
  shape: 'bed',
  widthCm: 120,
  lengthCm: 240,
  // ...
}
```

### Circular Containers
Pots, barrels, or round planters. Uses `widthCm` as diameter; `lengthCm` is ignored.

```typescript
{
  shape: 'container',
  widthCm: 45,  // diameter
  // ...
}
```

Containers use circle packing algorithms for plant placement rather than grid layouts.

## Placements

Plantings are placed in beds via `PlantingPlacement` records:

```typescript
type PlantingPlacement = {
  id: string;
  plantingId: string;
  bedId: string;
  xCm: number;          // Position from bed left edge
  yCm: number;          // Position from bed top edge
  spacingCm: number;    // Space between plants
  cols?: number;        // Optional column override
  quantity: number;     // Plants in this placement
};
```

### Split Placements
A single planting can be split across multiple beds. For example, 20 tomato plants might be placed as:
- 12 in the main vegetable bed
- 8 in a sunny side bed

Each placement has its own quantity, and the sum represents the total planted.

## Plant Visualization

### Grid Layout (Rectangular Beds)
Plants are arranged in a square-ish grid:

```
Columns = ceil(sqrt(quantity))
Rows = ceil(quantity / columns)
Width = columns × spacing
Height = rows × spacing
```

The `cols` override allows forcing a specific arrangement (e.g., a 1×10 row instead of 4×3 grid).

### Circle Packing (Containers)
For containers, plants use optimal packing patterns:

| Count | Pattern |
|-------|---------|
| 1 | Center |
| 2 | Horizontal pair |
| 3 | Equilateral triangle |
| 4 | Square corners |
| 5 | Center + 4 corners |
| 6 | Hexagon |
| 7 | Center + hexagon ring |
| 8+ | Concentric rings |

### Growth Visualization
Plant dots grow over time to show maturity:
- At planting: 15% of mature radius
- At harvest: 100% of mature radius (90% of spacing width)

Growth factor is calculated as `daysSincePlanting / maturityDays`, clamped to [0, 1].

## Collision Detection

### Spatial Collisions
Two placements collide if their bounding rectangles overlap:

```typescript
function rectanglesOverlap(r1, r2): boolean {
  return !(
    r1.x + r1.width <= r2.x ||
    r2.x + r2.width <= r1.x ||
    r1.y + r1.height <= r2.y ||
    r2.y + r2.height <= r1.y
  );
}
```

### Temporal Collisions
Placements only truly conflict if they occupy the same space at the same time. A spring lettuce and fall brassica can share the same location if their in-ground periods don't overlap.

```typescript
// In-ground period:
// - Transplants: transplantDate to harvestEnd
// - Direct sow: sowDate to harvestEnd

// Collision occurs when:
// - Spatial overlap exists AND
// - Date ranges overlap (a.start <= b.end AND b.start <= a.end)
```

### Collision Resolution
When dragging, the canvas finds the nearest valid position using a spiral search pattern:
1. Try the target position
2. If collision, search outward in expanding rings
3. Return first valid position found (or null if none exists)

## Auto-Layout

The `autoLayout()` function suggests placements for unplaced plantings:

1. Sort plantings by footprint area (largest first for better packing)
2. For each planting, try each bed:
   - Score sun exposure match (full-sun crops prefer full-sun beds)
   - Find first valid position using grid scan
   - Track best placement across all beds
3. Reserve space for each placed planting before processing next

### Sun Matching Heuristic
| Crop Type | Full Sun Bed | Partial Bed | Shade Bed |
|-----------|--------------|-------------|-----------|
| Tomato, Pepper, Squash | 1.0 | 0.5 | 0.2 |
| Lettuce, Spinach | 0.6 | 1.0 | 0.6 |
| Other | 0.8 | 0.7 | 0.5 |

## Crop Rotation Colors

Plants are color-coded by botanical family to aid rotation planning:

| Family | Color | Example Crops |
|--------|-------|---------------|
| Solanaceae | Red | Tomato, pepper, potato |
| Brassicaceae | Blue | Broccoli, kale, cabbage |
| Fabaceae | Yellow | Beans, peas |
| Cucurbitaceae | Teal | Squash, cucumber |
| Amaranthaceae | Purple | Beet, spinach |
| Asteraceae | Green | Lettuce |
| Apiaceae | Orange | Carrot, parsley |
| Amaryllidaceae | Gold | Onion, leek, garlic |

Different crops within the same family get different shades for visual distinction.

## Date Scrubber

The date scrubber lets users view the garden at any point in the season:
- Drag the slider to change the viewing date
- Only plantings "in ground" on that date are visible
- Plant sizes reflect growth stage at the selected date

The date range spans from the earliest sow date to the latest harvest end across all plantings.

## Canvas Interactions

### Drag Operations
- **Drag planting from sidebar**: Create new placement in bed
- **Drag placement within bed**: Reposition (with collision avoidance)
- **Drag bed on canvas**: Reposition the entire bed
- **Resize placement**: Change grid layout (snaps to valid configurations)

### Zoom
12 zoom levels from 0.5× to 2.0×. Zoom affects the pixels-per-cm scale.

### Grid Snapping
Placements snap to a 5cm grid for clean alignment.

### Bed Locking
Beds can be locked to prevent accidental modifications. Lock state persists in localStorage.

## Unit Conversion

The app supports both metric and imperial display:
- **Metric**: cm, m²
- **Imperial**: feet/inches, ft²

All internal calculations use centimeters. Conversion happens at the display layer. User preference persists in localStorage.
