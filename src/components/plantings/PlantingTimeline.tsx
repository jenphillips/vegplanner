'use client';

import { useMemo } from 'react';
import type { Planting, FrostWindow, Climate } from '@/lib/types';
import styles from './PlantingTimeline.module.css';

type PlantingTimelineProps = {
  planting: Planting;
  frost: FrostWindow;
  climate?: Climate;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function PlantingTimeline({ planting, frost, climate }: PlantingTimelineProps) {
  const timeline = useMemo(() => {
    const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
    const year = toDate(frost.lastSpringFrost).getUTCFullYear();
    const rangeStart = `${year}-03-01`;
    const rangeEnd = `${year}-11-30`;

    const startDate = toDate(rangeStart);
    const endDate = toDate(rangeEnd);
    const rangeDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) || 1;

    const clampPct = (iso: string) => {
      const raw =
        (toDate(iso).getTime() - startDate.getTime()) /
        (1000 * 60 * 60 * 24) /
        rangeDays;
      return Math.min(1, Math.max(0, raw)) * 100;
    };

    // Week bands for zebra striping
    const weekBands: { left: number; width: number }[] = [];
    let cursor = rangeStart;
    while (cursor <= rangeEnd) {
      const next = addDays(cursor, 7);
      const left = clampPct(cursor);
      const width = Math.max(clampPct(next) - left, 0.01);
      weekBands.push({ left, width });
      cursor = next;
    }

    // Month ticks (for visual tick marks on track)
    const monthTicks = Array.from({ length: 9 }, (_, i) => {
      const monthNum = i + 3;
      const month = String(monthNum).padStart(2, '0');
      const date = `${year}-${month}-01`;
      return { date, left: clampPct(date) };
    });

    // Frost ranges
    const buildFrostRange = (frostRange?: {
      earliest: string;
      typical: string;
      latest: string;
    }) => {
      if (!frostRange) return null;
      const earliest = `${year}-${frostRange.earliest}`;
      const typical = `${year}-${frostRange.typical}`;
      const latest = `${year}-${frostRange.latest}`;
      return {
        left: clampPct(earliest),
        width: clampPct(latest) - clampPct(earliest),
        typicalLeft: clampPct(typical),
      };
    };

    // Sow period (just a marker for direct sow, or sow->transplant for transplants)
    const sowLeft = clampPct(planting.sowDate);
    const sowWidth = planting.transplantDate
      ? clampPct(planting.transplantDate) - sowLeft
      : 2; // Minimum width for visibility

    // Transplant marker
    const transplantLeft = planting.transplantDate
      ? clampPct(planting.transplantDate)
      : null;

    // Growing period (from transplant or sow to harvest start)
    const growingStart = planting.transplantDate || planting.sowDate;
    const growingLeft = clampPct(growingStart);
    const growingWidth = clampPct(planting.harvestStart) - growingLeft;

    // Harvest period
    const harvestLeft = clampPct(planting.harvestStart);
    const harvestWidth = clampPct(planting.harvestEnd) - harvestLeft;

    return {
      weekBands,
      monthTicks,
      sow: { left: sowLeft, width: Math.max(sowWidth, 0.5) },
      transplant: transplantLeft,
      growing: { left: growingLeft, width: Math.max(growingWidth, 0.5) },
      harvest: { left: harvestLeft, width: Math.max(harvestWidth, 0.5) },
      springFrostRange: buildFrostRange(climate?.lastSpringFrost),
      fallFrostRange: buildFrostRange(climate?.firstFallFrost),
      frostMarker: clampPct(frost.lastSpringFrost),
      fallFrostMarker: clampPct(frost.firstFallFrost),
    };
  }, [planting, frost, climate]);

  return (
    <div className={styles.timeline}>
      <div className={styles.track}>
        {/* Week bands (zebra striping) */}
        <div className={styles.weekBands}>
          {timeline.weekBands.map((band, idx) => (
            <div
              key={idx}
              className={`${styles.weekBand} ${idx % 2 === 0 ? styles.weekBandLight : styles.weekBandDark}`}
              style={{
                left: `${band.left}%`,
                width: `${band.width}%`,
              }}
            />
          ))}
        </div>

        {/* Month tick marks */}
        {timeline.monthTicks.map((t) => (
          <div
            key={t.date}
            className={styles.monthTick}
            style={{ left: `${t.left}%` }}
          />
        ))}

        {/* Spring frost range */}
        {timeline.springFrostRange ? (
          <>
            <div
              className={styles.frostRange}
              style={{
                left: `${timeline.springFrostRange.left}%`,
                width: `${timeline.springFrostRange.width}%`,
              }}
            />
            <div
              className={styles.frostTypical}
              style={{ left: `${timeline.springFrostRange.typicalLeft}%` }}
            />
          </>
        ) : (
          <div
            className={styles.frostMarker}
            style={{ left: `${timeline.frostMarker}%` }}
          />
        )}

        {/* Fall frost range */}
        {timeline.fallFrostRange ? (
          <>
            <div
              className={styles.frostRange}
              style={{
                left: `${timeline.fallFrostRange.left}%`,
                width: `${timeline.fallFrostRange.width}%`,
              }}
            />
            <div
              className={styles.frostTypical}
              style={{ left: `${timeline.fallFrostRange.typicalLeft}%` }}
            />
          </>
        ) : (
          <div
            className={styles.frostMarker}
            style={{ left: `${timeline.fallFrostMarker}%` }}
          />
        )}

        {/* Sow period bar */}
        <div
          className={styles.barSow}
          style={{
            left: `${timeline.sow.left}%`,
            width: `${timeline.sow.width}%`,
          }}
          title={`Sow: ${planting.sowDate}`}
        />

        {/* Growing period bar */}
        <div
          className={styles.barGrowing}
          style={{
            left: `${timeline.growing.left}%`,
            width: `${timeline.growing.width}%`,
          }}
          title={`Growing`}
        />

        {/* Harvest period bar */}
        <div
          className={styles.barHarvest}
          style={{
            left: `${timeline.harvest.left}%`,
            width: `${timeline.harvest.width}%`,
          }}
          title={`Harvest: ${planting.harvestStart} – ${planting.harvestEnd}`}
        />

        {/* Transplant marker */}
        {timeline.transplant !== null && (
          <div
            className={styles.markerTransplant}
            style={{ left: `${timeline.transplant}%` }}
            title={`Transplant: ${planting.transplantDate}`}
          />
        )}
      </div>

    </div>
  );
}
