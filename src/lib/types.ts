export type FrostWindow = {
  id: string;
  lastSpringFrost: string; // ISO date (yyyy-mm-dd)
  firstFallFrost: string; // ISO date
};

export type SowMethod = 'direct' | 'transplant' | 'either';
export type MaturityBasis = 'from_sow' | 'from_transplant';
export type Season = 'spring' | 'fall';
export type HarvestStyle = 'single' | 'continuous';

export type Cultivar = {
  id: string;
  crop: string;
  variety: string;
  vendor?: string;
  germDaysMin: number;
  germDaysMax: number;
  maturityDays: number;
  maturityBasis: MaturityBasis;
  sowMethod: SowMethod;
  indoorLeadWeeksMin?: number | null;
  indoorLeadWeeksMax?: number | null;
  directAfterLsfDays?: number | null;
  transplantAfterLsfDays?: number | null;
  fallBufferDays?: number | null;
  harvestStyle?: HarvestStyle;
  harvestDurationDays?: number | null; // window length; for continuous, fallback to frost end
  frostSensitive?: boolean; // if true, continuous harvest ends at first fall frost
  notes?: string;
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
