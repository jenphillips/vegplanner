'use client';

import { useCallback, useMemo } from 'react';
import type {
  Cultivar,
  FrostWindow,
  PlantingPlan,
  ScheduleResult,
  FrostDateRange,
  Climate,
} from '@/lib/types';
import { buildSchedule } from '@/lib/schedule';
import styles from './Timeline.module.css';

// ============================================
// Utility Functions
// ============================================

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });

const roundTemp = (value: number) => Math.round(value);

const lerpColor = (a: string, b: string, t: number) => {
  const pa = a.match(/\w\w/g)?.map((x) => parseInt(x, 16)) || [0, 0, 0];
  const pb = b.match(/\w\w/g)?.map((x) => parseInt(x, 16)) || [0, 0, 0];
  const pc = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${pc.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

const tempColor = (celsius: number) => {
  if (Number.isNaN(celsius)) return '#e6e6e6';
  if (celsius >= 0) {
    const t = Math.min(1, Math.max(0, celsius / 30));
    return lerpColor('ffeedd', 'f29b7c', t);
  }
  const t = Math.min(1, Math.max(0, Math.abs(celsius) / 25));
  return lerpColor('e2f5ff', '6aa1d8', t);
};

// ============================================
// Types
// ============================================

type TimelineData = {
  rangeStart: string;
  rangeEnd: string;
  monthTicks: { date: string; left: number }[];
  weekBands: { left: number; width: number }[];
  sow: { start: string; end: string; left: number; width: number };
  transplant: { date: string; left: number } | null;
  harvest: { start: string; end: string; left: number; width: number } | null;
  frost: { date: string; left: number } | null;
  fallFrost: { date: string; left: number } | null;
  springFrostRange: {
    earliest: string;
    typical: string;
    latest: string;
    left: number;
    width: number;
    typicalLeft: number;
  } | null;
  fallFrostRange: {
    earliest: string;
    typical: string;
    latest: string;
    left: number;
    width: number;
    typicalLeft: number;
  } | null;
};

type ScheduleRow = {
  plan: PlantingPlan;
  cultivar: Cultivar;
  schedule: ScheduleResult;
};

type TimelineProps = {
  frost: FrostWindow;
  cultivars: Cultivar[];
  plans: PlantingPlan[];
  climate?: Climate;
};

// ============================================
// Timeline Component
// ============================================

export function Timeline({ frost, cultivars, plans, climate }: TimelineProps) {
  const scheduleRows = useMemo(() => {
    const byCultivar = new Map(cultivars.map((c) => [c.id, c]));
    return plans
      .map((plan) => {
        const cultivar = byCultivar.get(plan.cultivarId);
        if (!cultivar) return null;
        return {
          plan,
          cultivar,
          schedule: buildSchedule({
            frostWindow: frost,
            cultivar,
            plan,
          }),
        };
      })
      .filter(Boolean) as ScheduleRow[];
  }, [frost, cultivars, plans]);

  const buildTimeline = useCallback(
    (schedule: ScheduleResult): TimelineData | null => {
      const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
      const year = new Date(
        `${frost.lastSpringFrost}T00:00:00Z`
      ).getUTCFullYear();
      const rangeStart = `${year}-03-01`;
      const rangeEnd = `${year}-10-31`;

      const startDate = toDate(rangeStart);
      const endDate = toDate(rangeEnd);
      const rangeDays =
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) || 1;

      const clampPct = (iso: string) => {
        const raw =
          (toDate(iso).getTime() - startDate.getTime()) /
          (1000 * 60 * 60 * 24) /
          rangeDays;
        return Math.min(1, Math.max(0, raw));
      };

      const sowStart = schedule.sowDates[0]?.date ?? rangeStart;
      const sowEnd =
        schedule.sowDates[schedule.sowDates.length - 1]?.date ?? sowStart;
      const frostMarker = frost.lastSpringFrost;
      const fallFrostMarker = frost.firstFallFrost;

      const monthTicks = Array.from({ length: 8 }, (_, i) => {
        const monthNum = i + 3;
        const month = String(monthNum).padStart(2, '0');
        const date = `${year}-${month}-01`;
        return { date, left: clampPct(date) };
      });

      const weekBands: { left: number; width: number }[] = [];
      let cursor = rangeStart;
      while (cursor <= rangeEnd) {
        const next = addDays(cursor, 7);
        const left = clampPct(cursor);
        const width = Math.max(clampPct(next) - left, 0.0001);
        weekBands.push({ left, width });
        cursor = next;
      }

      const buildFrostRange = (frostRange: FrostDateRange | undefined) => {
        if (!frostRange) return null;
        const earliest = `${year}-${frostRange.earliest}`;
        const typical = `${year}-${frostRange.typical}`;
        const latest = `${year}-${frostRange.latest}`;
        const leftPos = clampPct(earliest);
        const rightPos = clampPct(latest);
        return {
          earliest,
          typical,
          latest,
          left: leftPos,
          width: Math.max(rightPos - leftPos, 0.01),
          typicalLeft: clampPct(typical),
        };
      };

      return {
        rangeStart,
        rangeEnd,
        monthTicks,
        weekBands,
        sow: {
          start: sowStart,
          end: sowEnd,
          left: clampPct(sowStart),
          width: Math.max(clampPct(sowEnd) - clampPct(sowStart), 0.01),
        },
        transplant: schedule.transplantDate
          ? {
              date: schedule.transplantDate.date,
              left: clampPct(schedule.transplantDate.date),
            }
          : null,
        harvest: schedule.harvestWindow
          ? {
              start: schedule.harvestWindow.start,
              end: schedule.harvestWindow.end,
              left: clampPct(schedule.harvestWindow.start),
              width: Math.max(
                clampPct(schedule.harvestWindow.end) -
                  clampPct(schedule.harvestWindow.start),
                0.01
              ),
            }
          : null,
        frost: frostMarker
          ? { date: frostMarker, left: clampPct(frostMarker) }
          : null,
        fallFrost: fallFrostMarker
          ? { date: fallFrostMarker, left: clampPct(fallFrostMarker) }
          : null,
        springFrostRange: buildFrostRange(climate?.lastSpringFrost),
        fallFrostRange: buildFrostRange(climate?.firstFallFrost),
      };
    },
    [frost, climate]
  );

  const monthTicks = useMemo(() => {
    const year = new Date(
      `${frost.lastSpringFrost}T00:00:00Z`
    ).getUTCFullYear();
    const startDate = new Date(`${year}-03-01T00:00:00Z`);
    const endDate = new Date(`${year}-10-31T00:00:00Z`);
    const rangeDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) || 1;
    const clampPct = (iso: string) => {
      const t =
        (new Date(`${iso}T00:00:00Z`).getTime() - startDate.getTime()) /
        (1000 * 60 * 60 * 24) /
        rangeDays;
      return Math.min(1, Math.max(0, t));
    };
    return Array.from({ length: 8 }, (_, i) => {
      const monthNum = i + 3;
      const date = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      return { date, left: clampPct(date) };
    });
  }, [frost]);

  if (scheduleRows.length === 0) {
    return null;
  }

  return (
    <div className={styles.timelineCard}>
      <div className={styles.timelineHeader}>
        <div>
          <h3>Visual timeline</h3>
          <p className={styles.muted}>
            Bars show sow window, transplant, harvest, with frost markers.
          </p>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.swatchSow} /> Sow window
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchTransplant} /> Transplant
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchHarvest} /> Harvest window
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchFrostRange} /> Frost risk range
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchFrostTypical} /> Typical frost date
          </span>
        </div>
      </div>

      {/* Top month ticks */}
      {monthTicks.length > 0 && (
        <div className={`${styles.tickRow} ${styles.tickRowTop}`}>
          <div className={styles.tickLabelPlaceholder} aria-hidden="true" />
          <div className={styles.timelineTicks}>
            {monthTicks.map((t) => (
              <div
                key={`top-${t.date}`}
                className={styles.tick}
                style={{ left: `${t.left * 100}%` }}
                title={t.date}
              >
                <div className={styles.tickMark} />
                <div className={styles.tickLabel}>
                  <div>{monthLabel(t.date)}</div>
                  {(() => {
                    const month =
                      new Date(`${t.date}T00:00:00Z`).getUTCMonth() + 1;
                    const temp = climate?.monthlyAvgC?.[String(month)];
                    return temp ? (
                      <div className={styles.tickTemp}>
                        <span
                          className={styles.tempBadge}
                          style={{ background: tempColor(temp.tmax_c) }}
                          title={`High ${roundTemp(temp.tmax_c)}°C`}
                        >
                          H {roundTemp(temp.tmax_c)}°
                        </span>
                        <span
                          className={styles.tempBadge}
                          style={{ background: tempColor(temp.tmin_c) }}
                          title={`Low ${roundTemp(temp.tmin_c)}°C`}
                        >
                          L {roundTemp(temp.tmin_c)}°
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline rows */}
      {scheduleRows.map(({ plan, cultivar, schedule }) => {
        const timeline = buildTimeline(schedule);
        if (!timeline) return null;
        return (
          <div className={styles.timelineRow} key={plan.id}>
            <div
              className={styles.timelineLabel}
              title={`Cultivar: ${cultivar.crop} — ${cultivar.variety}
Season: ${plan.season}, Method: ${schedule.method}
Germ: ${cultivar.germDaysMin}–${cultivar.germDaysMax} days • Maturity: ${cultivar.maturityDays} (${cultivar.maturityBasis})
Frosts: last ${frost.lastSpringFrost}, first ${frost.firstFallFrost}`}
            >
              {cultivar.crop} — {cultivar.variety}
            </div>
            <div className={styles.timelineBody}>
              <div className={styles.timelineTrack}>
                <div className={styles.weekBands}>
                  {timeline.weekBands.map((band, idx) => (
                    <div
                      key={idx}
                      className={`${styles.weekBand} ${idx % 2 === 0 ? styles.weekBandLight : styles.weekBandDark}`}
                      style={{
                        left: `${band.left * 100}%`,
                        width: `${band.width * 100}%`,
                      }}
                    />
                  ))}
                </div>
                <div
                  className={styles.barSow}
                  style={{
                    left: `${timeline.sow.left * 100}%`,
                    width: `${timeline.sow.width * 100}%`,
                  }}
                  title={`Sow window ${timeline.sow.start} – ${timeline.sow.end}`}
                />
                {timeline.transplant && (
                  <div
                    className={styles.barTransplant}
                    style={{ left: `${timeline.transplant.left * 100}%` }}
                    title={`Transplant ${timeline.transplant.date}`}
                  />
                )}
                {timeline.harvest && (
                  <div
                    className={styles.barHarvest}
                    style={{
                      left: `${timeline.harvest.left * 100}%`,
                      width: `${timeline.harvest.width * 100}%`,
                    }}
                    title={`Harvest ${timeline.harvest.start} – ${timeline.harvest.end}`}
                  />
                )}
                {timeline.springFrostRange ? (
                  <>
                    <div
                      className={styles.frostRangeSpring}
                      style={{
                        left: `${timeline.springFrostRange.left * 100}%`,
                        width: `${timeline.springFrostRange.width * 100}%`,
                      }}
                      title={`Spring frost risk: ${timeline.springFrostRange.earliest} (earliest) → ${timeline.springFrostRange.typical} (typical) → ${timeline.springFrostRange.latest} (latest)`}
                    />
                    <div
                      className={styles.frostTypicalMarker}
                      style={{
                        left: `${timeline.springFrostRange.typicalLeft * 100}%`,
                      }}
                      title={`Typical last frost: ${timeline.springFrostRange.typical}`}
                    />
                  </>
                ) : (
                  timeline.frost && (
                    <div
                      className={styles.barFrost}
                      style={{ left: `${timeline.frost.left * 100}%` }}
                      title={`Last spring frost ${timeline.frost.date}`}
                    />
                  )
                )}
                {timeline.fallFrostRange ? (
                  <>
                    <div
                      className={styles.frostRangeFall}
                      style={{
                        left: `${timeline.fallFrostRange.left * 100}%`,
                        width: `${timeline.fallFrostRange.width * 100}%`,
                      }}
                      title={`Fall frost risk: ${timeline.fallFrostRange.earliest} (earliest) → ${timeline.fallFrostRange.typical} (typical) → ${timeline.fallFrostRange.latest} (latest)`}
                    />
                    <div
                      className={styles.frostTypicalMarker}
                      style={{
                        left: `${timeline.fallFrostRange.typicalLeft * 100}%`,
                      }}
                      title={`Typical first frost: ${timeline.fallFrostRange.typical}`}
                    />
                  </>
                ) : (
                  timeline.fallFrost && (
                    <div
                      className={styles.barFallFrost}
                      style={{ left: `${timeline.fallFrost.left * 100}%` }}
                      title={`First fall frost ${timeline.fallFrost.date}`}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Bottom month ticks */}
      {monthTicks.length > 0 && (
        <div className={`${styles.tickRow} ${styles.tickRowBottom}`}>
          <div className={styles.tickLabelPlaceholder} aria-hidden="true" />
          <div className={styles.timelineTicks}>
            {monthTicks.map((t) => (
              <div
                key={`bottom-${t.date}`}
                className={styles.tick}
                style={{ left: `${t.left * 100}%` }}
                title={t.date}
              >
                <div className={styles.tickMark} />
                <div className={styles.tickLabel}>
                  <div>{monthLabel(t.date)}</div>
                  {(() => {
                    const month =
                      new Date(`${t.date}T00:00:00Z`).getUTCMonth() + 1;
                    const temp = climate?.monthlyAvgC?.[String(month)];
                    return temp ? (
                      <div className={styles.tickTemp}>
                        <span
                          className={styles.tempBadge}
                          style={{ background: tempColor(temp.tmax_c) }}
                          title={`High ${roundTemp(temp.tmax_c)}°C`}
                        >
                          H {roundTemp(temp.tmax_c)}°
                        </span>
                        <span
                          className={styles.tempBadge}
                          style={{ background: tempColor(temp.tmin_c) }}
                          title={`Low ${roundTemp(temp.tmin_c)}°C`}
                        >
                          L {roundTemp(temp.tmin_c)}°
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
