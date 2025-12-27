import { Cultivar, PlantingPlan, ScheduleInput, ScheduleResult, SowMethod } from './types';

const toDate = (iso: string) => new Date(iso + 'T00:00:00Z');
const addDays = (iso: string, days: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const addWeeks = (iso: string, weeks: number) => addDays(iso, Math.round(weeks * 7));

const ensureNumber = (value: number | null | undefined, fallback = 0) =>
  typeof value === 'number' ? value : fallback;

const pickMethod = (plan: PlantingPlan, cultivar: Cultivar): SowMethod =>
  plan.methodOverride ?? cultivar.sowMethod;

export const buildSchedule = ({ frostWindow, cultivar, plan }: ScheduleInput): ScheduleResult => {
  const method = pickMethod(plan, cultivar);
  const season = plan.season;
  const springAnchor = frostWindow.lastSpringFrost;
  const fallAnchor = addDays(frostWindow.firstFallFrost, -ensureNumber(cultivar.fallBufferDays, 14));

  const assumptions: ScheduleResult['assumptions'] = {
    maturityBasis: cultivar.maturityBasis,
    indoorLeadWeeksMin: cultivar.indoorLeadWeeksMin,
    indoorLeadWeeksMax: cultivar.indoorLeadWeeksMax,
    directAfterLsfDays: cultivar.directAfterLsfDays,
    transplantAfterLsfDays: cultivar.transplantAfterLsfDays,
    fallBufferDays: cultivar.fallBufferDays,
  };

  // Initialize fields to be filled per method/season.
  let sowDates: ScheduleResult['sowDates'] = [];
  let transplantDate: ScheduleResult['transplantDate'];
  let germinationWindow: ScheduleResult['germinationWindow'];
  let harvestWindow: ScheduleResult['harvestWindow'];

  if (season === 'spring' && method === 'direct') {
    const offset = ensureNumber(cultivar.directAfterLsfDays, 0);
    const sowDate = addDays(springAnchor, offset);
    sowDates = [{ label: 'Direct sow', date: sowDate }];
    germinationWindow = {
      start: addDays(sowDate, cultivar.germDaysMin),
      end: addDays(sowDate, cultivar.germDaysMax),
    };
    if (cultivar.maturityBasis === 'from_sow') {
      const start = addDays(sowDate, cultivar.maturityDays);
      harvestWindow = buildHarvestWindow(start, fallAnchor, cultivar);
    }
  }

  if (season === 'spring' && method === 'transplant') {
    const transplantAfter = ensureNumber(cultivar.transplantAfterLsfDays, 0);
    const transplant = addDays(springAnchor, transplantAfter);
    transplantDate = { label: 'Transplant', date: transplant };

    const leadMin = ensureNumber(cultivar.indoorLeadWeeksMin, 6);
    const leadMax = ensureNumber(cultivar.indoorLeadWeeksMax, leadMin);
    const indoorEarly = addWeeks(transplant, -leadMax);
    const indoorLate = addWeeks(transplant, -leadMin);
    sowDates = [
      { label: 'Indoor sow (early)', date: indoorEarly },
      { label: 'Indoor sow (late)', date: indoorLate },
    ];
    germinationWindow = {
      start: addDays(indoorEarly, cultivar.germDaysMin),
      end: addDays(indoorEarly, cultivar.germDaysMax),
    };

    const start =
      cultivar.maturityBasis === 'from_transplant'
        ? addDays(transplant, cultivar.maturityDays)
        : addDays(indoorEarly, cultivar.maturityDays);
    harvestWindow = buildHarvestWindow(start, fallAnchor, cultivar);
  }

  if (season === 'fall') {
    // Simplified fall direct sow anchored to finishing before frost.
    const maturity = ensureNumber(cultivar.maturityDays, 60);
    const sowDate = addDays(fallAnchor, -maturity);
    sowDates = [{ label: 'Fall sow', date: sowDate }];
    germinationWindow = {
      start: addDays(sowDate, cultivar.germDaysMin),
      end: addDays(sowDate, cultivar.germDaysMax),
    };
    const start = addDays(sowDate, cultivar.maturityDays);
    harvestWindow = buildHarvestWindow(start, fallAnchor, cultivar);
    assumptions.fallAnchor = fallAnchor;
  }

  return {
    method,
    season,
    sowDates,
    germinationWindow,
    transplantDate,
    harvestWindow,
    assumptions,
  };
};

function buildHarvestWindow(start: string, fallAnchor: string, cultivar: Cultivar) {
  const style = cultivar.harvestStyle ?? 'single';
  const duration = ensureNumber(cultivar.harvestDurationDays, style === 'continuous' ? 999 : 1);
  if (style === 'continuous') {
    const durationEnd = addDays(start, duration);
    // Use whichever comes first: duration limit or fall frost (for frost-sensitive crops)
    const end = cultivar.frostSensitive
      ? (durationEnd < fallAnchor ? durationEnd : fallAnchor)
      : durationEnd;
    return { start, end };
  }
  const end = addDays(start, Math.max(duration - 1, 0));
  return { start, end };
}
