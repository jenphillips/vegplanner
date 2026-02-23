export type PlacementDetail = { bedName: string; quantity: number };

export type FrostWindow = {
  id: string;
  lastSpringFrost: string; // ISO date (yyyy-mm-dd)
  firstFallFrost: string; // ISO date
};

export type SowMethod = 'direct' | 'transplant' | 'either';
export type MaturityBasis = 'from_sow' | 'from_transplant';
export type Season = 'spring' | 'fall';
export type HarvestStyle = 'single' | 'continuous';
export type PlantType = 'vegetable' | 'herb' | 'flower';

// Yield categories for quantity estimation (more granular for accuracy)
export type YieldCategory =
  // Tomatoes - different growth habits have different yields
  | 'tomato_indeterminate'  // Vining, 3-6 kg/plant over long season
  | 'tomato_determinate'    // Bush, 2-4 kg/plant concentrated
  | 'tomato_cherry'         // High count, 2-4 kg/plant
  // Peppers
  | 'pepper_large'          // Bell peppers, 2-3 kg/plant
  | 'pepper_small'          // Hot peppers, 1-1.5 kg/plant (use less per serving)
  // Cucurbits
  | 'cucumber'              // 3-5 kg/plant
  | 'squash_summer'         // Zucchini etc, 4-6 kg/plant (very prolific)
  | 'squash_winter'         // 3-5 kg/plant, stores well
  // Legumes
  | 'bean_bush'             // 0.2-0.3 kg/plant
  | 'bean_pole'             // 0.4-0.5 kg/plant
  | 'pea'                   // 0.2-0.3 kg/plant
  // Leafy greens - harvest stage matters
  | 'greens_head'           // Head lettuce, cabbage - single harvest, 0.3-0.5 kg
  | 'greens_leaf'           // Cut-and-come-again lettuce, chard - 0.3-0.5 kg
  | 'greens_baby'           // Baby leaf/microgreens - 0.1-0.2 kg
  | 'greens_cooking'        // Spinach, kale - cooking greens, 0.3-0.4 kg
  // Root vegetables
  | 'root_large'            // Beets, turnips - 0.2-0.3 kg/plant
  | 'root_small'            // Carrots, radishes - 0.1-0.15 kg/plant
  // Alliums
  | 'allium_bulb'           // Onions, shallots - 0.15-0.2 kg/plant
  | 'allium_green'          // Scallions, leeks - 0.1 kg/plant
  // Brassicas
  | 'brassica_head'         // Broccoli, cauliflower - 0.4-0.6 kg/plant
  | 'brassica_leafy'        // Kale, collards - 0.3-0.5 kg/plant
  // Nightshades & fruiting
  | 'eggplant'              // Eggplant - 3 kg/plant, 6-12 fruits
  // Melons
  | 'melon'                 // Cantaloupe, honeydew, watermelon - 5 kg/plant, 2-4 fruits
  // Grain & stalks
  | 'corn'                  // Sweet corn - 0.4 kg/plant, 1-2 ears
  | 'celery'                // Celery - 0.8 kg/plant, 1 bunch
  | 'okra'                  // Okra - 0.8 kg/plant, ~50 pods
  // Tubers
  | 'potato'                // Potatoes, sweet potatoes - 2 kg/plant, 8-10 tubers
  // Perennial fruit & vegetables
  | 'strawberry'            // Strawberry - 0.4 kg/plant, 25-30 berries
  | 'asparagus'             // Asparagus - 0.3 kg/plant, ~20 spears (established)
  | 'rhubarb'               // Rhubarb - 1.5 kg/plant, 8-10 stalks
  // Other
  | 'herb'                  // Fresh herbs - 0.1 kg/plant
  | 'flower';               // Cut flowers (count-based)

export type Cultivar = {
  id: string;
  crop: string;
  variety: string;
  family?: string; // Botanical family (e.g., 'Solanaceae', 'Brassicaceae') for crop rotation
  plantType?: PlantType; // 'vegetable' (default) or 'flower'
  vendor?: string;
  germDaysMin: number;
  germDaysMax: number;
  maturityDays: number;
  maturityBasis: MaturityBasis;
  sowMethod: SowMethod;
  preferredMethod?: 'direct' | 'transplant'; // For 'either' crops, which method to default to
  indoorLeadWeeksMin?: number | null;
  indoorLeadWeeksMax?: number | null;
  directAfterLsfDays?: number | null;
  transplantAfterLsfDays?: number | null;
  fallBufferDays?: number | null;
  harvestStyle?: HarvestStyle;
  harvestDurationDays?: number | null; // window length; for continuous, fallback to frost end
  frostSensitive?: boolean; // if true, continuous harvest ends at first fall frost
  // Temperature tolerance for succession planning
  minGrowingTempC?: number | null; // Below this, don't plant (e.g., 5 for tomatoes)
  maxGrowingTempC?: number | null; // Above this, skip succession (e.g., 24 for spinach)
  optimalTempMinC?: number | null; // Optimal growing range low
  optimalTempMaxC?: number | null; // Optimal growing range high
  // Spacing for garden bed layout
  spacingCm?: number; // Space between plants in cm (e.g., 60 for tomatoes, 10 for lettuce)
  trailingHabit?: boolean; // true for plants that spill over container edges (petunias, sweet potato vine, etc.)
  // Perennial-specific fields
  isPerennial?: boolean; // true for asparagus, strawberries, rhubarb, etc.
  perennialHarvestStartDaysAfterLSF?: number; // Harvest start relative to last spring frost (e.g., 14)
  notes?: string;
  // Yield estimation fields
  yieldCategory?: YieldCategory;     // Category for default yield lookup
  yieldPerPlantKg?: number;          // Override for specific cultivars
};

export type PlantingPlan = {
  id: string;
  cultivarId: string;
  season: Season;
  successionOffsetsDays?: number[];
  methodOverride?: SowMethod;
  frostWindowId: string;
};

export type ScheduleInput = {
  frostWindow: FrostWindow;
  cultivar: Cultivar;
  plan: PlantingPlan;
};

export type DateRange = {
  start: string; // ISO date
  end: string; // ISO date
};

export type ScheduleEntry = {
  label: string;
  date: string;
  details?: string;
};

export type ScheduleResult = {
  method: SowMethod;
  season: Season;
  sowDates: ScheduleEntry[];
  germinationWindow?: DateRange;
  transplantDate?: ScheduleEntry;
  harvestWindow?: DateRange;
  assumptions: Record<string, string | number | null | undefined>;
};

// Climate data types for historical weather reference
export type MonthlyTemperature = {
  tavg_c: number; // Average air temperature (°C)
  tmin_c: number; // Average daily minimum (°C)
  tmax_c: number; // Average daily maximum (°C)
  soil_avg_c?: number; // Estimated average soil temperature at 10cm depth (°C)
  gdd_base5: number; // Growing degree days (base 5°C) accumulated by end of month
};

export type FrostProbability = {
  date: string; // ISO date (MM-DD format)
  probability: number; // Percentage chance of frost (0-100)
};

export type FrostDateRange = {
  earliest: string; // Earliest recorded date (MM-DD)
  typical: string; // Most common/median date (MM-DD)
  latest: string; // Latest recorded date (MM-DD)
  probability10: string; // 10% probability date (MM-DD)
  probability50: string; // 50% probability date (MM-DD)
  probability90: string; // 90% probability date (MM-DD)
};

export type Climate = {
  location: string;
  coordinates: { lat: number; lon: number };
  elevation_m: number;
  source: string;
  monthlyAvgC: Record<string, MonthlyTemperature>; // Keys are month numbers 1-12
  lastSpringFrost: FrostDateRange;
  firstFallFrost: FrostDateRange;
  growingSeasonDays: number; // Average frost-free days
  annualGDD: number; // Total growing degree days (base 5°C)
  notes: string;
};

// ============================================
// Planting & Task Types (for succession planning)
// ============================================

export type PlantingStatus =
  | 'planned'
  | 'sowing'
  | 'growing'
  | 'transplanting'
  | 'harvesting'
  | 'completed'
  | 'failed';

export type Planting = {
  id: string;
  cultivarId: string;
  label: string; // "Spinach #1", "Tomato - Early"
  quantity?: number; // Number of plants/seeds (optional - canvas is authoritative when placed)
  sowDate: string; // Calculated ISO date
  sowDateOverride?: string; // User-adjusted sow date (earlier indoor start for transplants)
  transplantDate?: string; // If transplant method
  harvestStart: string;
  harvestEnd: string;
  method: SowMethod;
  status: PlantingStatus;
  successionNumber: number; // 1, 2, 3... for ordering
  notes?: string;
  createdAt: string;
};

export type TaskType =
  | 'sow_indoor'
  | 'sow_direct'
  | 'harden_off'
  | 'transplant'
  | 'harvest_start';

export type Task = {
  id: string;
  plantingId: string;
  cultivarId: string;
  type: TaskType;
  date: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
};

export type TaskCompletion = {
  id: string; // Format: `${plantingId}-${type}`
  plantingId: string;
  type: TaskType;
  completed: boolean;
  completedAt?: string;
};

// ============================================
// Garden Bed Types (Phase 3)
// ============================================

export type GardenBedShape = 'bed' | 'container';

export type GardenBed = {
  id: string;
  name: string;
  shape: GardenBedShape; // 'bed' = rectangle, 'container' = circle (uses widthCm as diameter)
  widthCm: number; // For containers, this is the diameter
  lengthCm: number; // Ignored for containers
  sunExposure: 'full' | 'partial' | 'shade';
  notes?: string;
  // Position on unified garden canvas (in cm from top-left)
  positionX?: number;
  positionY?: number;
};

export type PlantingPlacement = {
  id: string;
  plantingId: string;
  bedId: string;
  xCm: number;
  yCm: number;
  spacingCm: number;
  cols?: number; // Optional: override default square-ish layout
  quantity: number; // Number of plants in this placement (allows splitting across multiple placements)
};

// Calculated footprint for rendering (not persisted)
export type PlantingFootprintData = {
  plantingId: string;
  bedId: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  rows: number;
  cols: number;
};

// Collision detection result
export type CollisionResult = {
  hasCollision: boolean;
  overlappingPlacements: string[];
};

// Auto-layout suggestion
export type PlacementSuggestion = {
  plantingId: string;
  bedId: string;
  xCm: number;
  yCm: number;
  spacingCm: number;
  quantity: number;
  score: number;
};
