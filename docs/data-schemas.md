# Data Schemas

This document describes all data structures used in Vegplanner, including JSON file formats and TypeScript types.

## Data Files Overview

| File | Purpose | Type Definition |
|------|---------|-----------------|
| `data/vegplanner.json` | Main config: frost window, climate, user cultivars | `VegplannerData` |
| `data/baseline-cultivars.json` | Reference cultivar library | `BaselineCultivarsData` |
| `data/plantings.json` | User's planting instances | `Planting[]` |
| `data/tasks.json` | Task completion state only | `TaskCompletion[]` |
| `data/garden-beds.json` | Garden bed definitions | `GardenBed[]` |
| `data/placements.json` | Planting positions in beds | `PlantingPlacement[]` |
| `data/plans.json` | Annual planting plans | `PlantingPlan[]` |

---

## Core Types

### Cultivar

Reference data for a crop variety. All cultivars require `plantType` to be set.

```typescript
type Cultivar = {
  // Required identification
  id: string;                    // Unique identifier (e.g., "tomato-san-marzano")
  crop: string;                  // Crop name (e.g., "Tomato")
  variety: string;               // Variety name (e.g., "San Marzano")
  plantType: PlantType;          // "vegetable" or "flower" (required)

  // Required timing
  germDaysMin: number;           // Minimum germination days
  germDaysMax: number;           // Maximum germination days
  maturityDays: number;          // Days to maturity
  maturityBasis: MaturityBasis;  // "from_sow" or "from_transplant"
  sowMethod: SowMethod;          // "direct", "transplant", or "either"

  // Optional identification
  family?: string;               // Botanical family for rotation (e.g., "Solanaceae")
  vendor?: string;               // Seed vendor

  // Method-specific timing (required based on sowMethod)
  preferredMethod?: "direct" | "transplant";  // Default for "either" crops
  indoorLeadWeeksMin?: number;   // Min weeks before transplant to start indoors
  indoorLeadWeeksMax?: number;   // Max weeks before transplant to start indoors
  directAfterLsfDays?: number;   // Days after last spring frost to direct sow
  transplantAfterLsfDays?: number; // Days after last spring frost to transplant
  fallBufferDays?: number;       // Days before first fall frost to stop planting

  // Harvest characteristics
  harvestStyle?: HarvestStyle;   // "single" or "continuous"
  harvestDurationDays?: number;  // Harvest window length (null = until frost)
  frostSensitive?: boolean;      // If true, harvest ends at first fall frost

  // Temperature tolerances (for succession planning)
  minGrowingTempC?: number;      // Minimum viable temperature (°C)
  maxGrowingTempC?: number;      // Maximum viable temperature (°C)
  optimalTempMinC?: number;      // Optimal range low (°C)
  optimalTempMaxC?: number;      // Optimal range high (°C)
  tempMarginC?: number;          // Safety margin override (default: 2°C)

  // Garden layout
  spacingCm?: number;            // Space between plants in cm
  trailingHabit?: boolean;       // For plants that spill over edges

  // Perennials
  isPerennial?: boolean;
  perennialHarvestStartDaysAfterLSF?: number;

  notes?: string;
};
```

#### Enums

```typescript
type PlantType = "vegetable" | "flower";
type SowMethod = "direct" | "transplant" | "either";
type MaturityBasis = "from_sow" | "from_transplant";
type HarvestStyle = "single" | "continuous";
```

---

### Planting

An individual planting instance created from a cultivar.

```typescript
type Planting = {
  id: string;                    // UUID
  cultivarId: string;            // Reference to cultivar
  label: string;                 // Display name (e.g., "Spinach #1")

  // Dates (ISO format: yyyy-mm-dd)
  sowDate: string;               // Calculated or scheduled sow date
  sowDateOverride?: string;      // User-adjusted sow date (for transplants)
  transplantDate?: string;       // Present if method is "transplant"
  harvestStart: string;          // Expected harvest begin
  harvestEnd: string;            // Expected harvest end

  method: SowMethod;             // Actual method used (not "either")
  status: PlantingStatus;        // Current status
  successionNumber: number;      // Order within crop series (1, 2, 3...)
  quantity?: number;             // Number of plants (optional, canvas is authoritative when placed)
  notes?: string;
  createdAt: string;             // ISO timestamp
};

type PlantingStatus =
  | "planned"
  | "sowing"
  | "growing"
  | "transplanting"
  | "harvesting"
  | "completed"
  | "failed";
```

---

### Task & TaskCompletion

Tasks are generated at runtime from plantings. Only completion state is persisted.

```typescript
// Generated at runtime (not stored)
type Task = {
  id: string;                    // Format: `${plantingId}-${type}`
  plantingId: string;
  cultivarId: string;
  type: TaskType;
  date: string;                  // ISO date
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
};

// Stored in data/tasks.json
type TaskCompletion = {
  id: string;                    // Format: `${plantingId}-${type}`
  plantingId: string;
  type: TaskType;
  completed: boolean;
  completedAt?: string;          // ISO timestamp
};

type TaskType =
  | "sow_indoor"
  | "sow_direct"
  | "harden_off"
  | "transplant"
  | "harvest_start";
```

---

### GardenBed

Physical garden bed or container.

```typescript
type GardenBed = {
  id: string;                    // UUID
  name: string;                  // Display name (e.g., "Raised Bed 1")
  shape: GardenBedShape;         // "bed" (rectangle) or "container" (circle)
  widthCm: number;               // Width in cm (diameter for containers)
  lengthCm: number;              // Length in cm (ignored for containers)
  sunExposure: "full" | "partial" | "shade";
  notes?: string;

  // Position on unified canvas (cm from origin)
  positionX?: number;
  positionY?: number;
};

type GardenBedShape = "bed" | "container";
```

---

### PlantingPlacement

Position of a planting within a garden bed.

```typescript
type PlantingPlacement = {
  id: string;                    // UUID
  plantingId: string;            // Reference to planting
  bedId: string;                 // Reference to garden bed
  xCm: number;                   // X position within bed (cm)
  yCm: number;                   // Y position within bed (cm)
  spacingCm: number;             // Space between plants (from cultivar)
  quantity: number;              // Plants in this placement (authoritative)
  cols?: number;                 // Optional column override for layout
};
```

**Note:** When a planting is placed in a bed, the placement's `quantity` becomes authoritative. A single planting can be split across multiple placements.

---

### Climate

Historical climate data for a location, used for temperature-aware succession planning.

```typescript
type Climate = {
  location: string;              // Display name (e.g., "Sussex, NB")
  coordinates: { lat: number; lon: number };
  elevation_m: number;
  source: string;                // Data source attribution

  // Monthly temperature averages (keys are month numbers "1"-"12")
  monthlyAvgC: Record<string, MonthlyTemperature>;

  // Frost date ranges
  lastSpringFrost: FrostDateRange;
  firstFallFrost: FrostDateRange;

  growingSeasonDays: number;     // Average frost-free days
  annualGDD: number;             // Growing degree days (base 5°C)
  notes: string;
};

type MonthlyTemperature = {
  tavg_c: number;                // Average air temperature (°C)
  tmin_c: number;                // Average daily minimum (°C)
  tmax_c: number;                // Average daily maximum (°C)
  soil_avg_c: number;            // Estimated soil temp at 10cm (°C)
  gdd_base5: number;             // Cumulative GDD by month end
};

type FrostDateRange = {
  earliest: string;              // Earliest recorded (MM-DD)
  typical: string;               // Median date (MM-DD)
  latest: string;                // Latest recorded (MM-DD)
  probability10: string;         // 10% probability (MM-DD)
  probability50: string;         // 50% probability (MM-DD)
  probability90: string;         // 90% probability (MM-DD)
};
```

---

### FrostWindow

Simple frost dates for schedule calculations.

```typescript
type FrostWindow = {
  id: string;
  lastSpringFrost: string;       // ISO date (yyyy-mm-dd)
  firstFallFrost: string;        // ISO date (yyyy-mm-dd)
};
```

---

### PlantingPlan

Annual plan linking cultivars to seasons (stored in `data/plans.json`).

```typescript
type PlantingPlan = {
  id: string;
  cultivarId: string;
  season: Season;                // "spring" or "fall"
  successionOffsetsDays?: number[];
  methodOverride?: SowMethod;
  frostWindowId: string;
};

type Season = "spring" | "fall";
```

---

## File Formats

### vegplanner.json

Main configuration file containing frost window, climate data, and user cultivars.

```json
{
  "frostWindow": {
    "id": "default-frost",
    "lastSpringFrost": "2025-06-01",
    "firstFallFrost": "2025-10-05"
  },
  "climate": {
    "location": "Sussex, NB",
    "coordinates": { "lat": 45.722, "lon": -65.507 },
    "elevation_m": 55,
    "source": "WeatherSpark/Environment Canada",
    "monthlyAvgC": {
      "1": { "tavg_c": -8, "tmin_c": -12, "tmax_c": -3, "soil_avg_c": -1, "gdd_base5": 0 },
      // ... months 2-12
    },
    "lastSpringFrost": { "earliest": "04-19", "typical": "05-06", "latest": "05-24", ... },
    "firstFallFrost": { "earliest": "09-26", "typical": "10-11", "latest": "10-26", ... },
    "growingSeasonDays": 159,
    "annualGDD": 1810,
    "notes": "..."
  },
  "cultivars": [
    { "id": "tomato-san-marzano", "crop": "Tomato", "variety": "San Marzano", ... }
  ]
}
```

### baseline-cultivars.json

Reference library of baseline/default cultivar data.

```json
{
  "description": "Baseline cultivar data for common vegetables...",
  "sources": ["Old Farmer's Almanac", "Johnny's Selected Seeds", ...],
  "cultivars": [
    { "id": "baseline-beet", "crop": "Beet", "variety": "Baseline", "plantType": "vegetable", ... }
  ]
}
```

### plantings.json

Array of planting instances.

```json
[
  {
    "id": "69157e4c-3530-4c6f-b201-7f4253b2b32c",
    "cultivarId": "tomato-sungold",
    "label": "Tomato - Sungold #1",
    "quantity": 3,
    "sowDate": "2025-04-13",
    "transplantDate": "2025-05-25",
    "harvestStart": "2025-07-21",
    "harvestEnd": "2025-09-22",
    "method": "transplant",
    "status": "planned",
    "successionNumber": 1,
    "createdAt": "2026-01-05T23:45:53.412Z"
  }
]
```

### tasks.json

Array of task completion records (not full tasks).

```json
[
  {
    "id": "69157e4c-3530-4c6f-b201-7f4253b2b32c-sow_indoor",
    "plantingId": "69157e4c-3530-4c6f-b201-7f4253b2b32c",
    "type": "sow_indoor",
    "completed": true,
    "completedAt": "2025-04-13T10:30:00.000Z"
  }
]
```

### garden-beds.json

Array of garden bed definitions.

```json
[
  {
    "id": "35ca7212-ab5b-44ac-862f-8f1e45845c4a",
    "name": "Raised Bed 1",
    "shape": "bed",
    "widthCm": 91,
    "lengthCm": 213,
    "sunExposure": "full",
    "positionX": -5,
    "positionY": 0
  },
  {
    "id": "e19fe887-fd76-4974-9ae0-1ba8c41c092a",
    "name": "Deck pot 1",
    "shape": "container",
    "widthCm": 30,
    "lengthCm": 30,
    "sunExposure": "full",
    "positionX": 185,
    "positionY": -125
  }
]
```

### placements.json

Array of planting placement records.

```json
[
  {
    "id": "abc123",
    "plantingId": "69157e4c-3530-4c6f-b201-7f4253b2b32c",
    "bedId": "35ca7212-ab5b-44ac-862f-8f1e45845c4a",
    "xCm": 15,
    "yCm": 15,
    "spacingCm": 60,
    "quantity": 3
  }
]
```

---

## Field Constraints

### Required Fields by Entity

| Entity | Required Fields |
|--------|-----------------|
| Cultivar | `id`, `crop`, `variety`, `plantType`, `germDaysMin`, `germDaysMax`, `maturityDays`, `maturityBasis`, `sowMethod` |
| Planting | `id`, `cultivarId`, `label`, `sowDate`, `harvestStart`, `harvestEnd`, `method`, `status`, `successionNumber`, `createdAt` |
| GardenBed | `id`, `name`, `shape`, `widthCm`, `lengthCm`, `sunExposure` |
| PlantingPlacement | `id`, `plantingId`, `bedId`, `xCm`, `yCm`, `spacingCm`, `quantity` |
| TaskCompletion | `id`, `plantingId`, `type`, `completed` |

### Conditional Requirements

- **Transplant method:** Requires `indoorLeadWeeksMin`, `indoorLeadWeeksMax`, `transplantAfterLsfDays`
- **Direct sow method:** Requires `directAfterLsfDays`
- **"Either" method:** Requires all of the above, plus `preferredMethod`

### ID Formats

- **Cultivar IDs:** Kebab-case descriptive (e.g., `tomato-san-marzano`, `baseline-beet`)
- **Other IDs:** UUIDs (e.g., `69157e4c-3530-4c6f-b201-7f4253b2b32c`)
- **Task IDs:** Composite format `${plantingId}-${taskType}`

### Date Formats

- **Full dates:** ISO 8601 (`yyyy-mm-dd`, e.g., `2025-06-01`)
- **Month-day only:** `MM-DD` format for frost ranges (e.g., `05-06`)
- **Timestamps:** ISO 8601 with time (`2025-04-13T10:30:00.000Z`)
