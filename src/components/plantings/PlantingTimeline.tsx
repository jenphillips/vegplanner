'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import type { Planting, FrostWindow, Climate, Cultivar } from '@/lib/types';
import styles from './PlantingTimeline.module.css';

type PlantingTimelineProps = {
  planting: Planting;
  frost: FrostWindow;
  climate?: Climate;
  cultivar?: Cultivar;
  onUpdateSowDate?: (id: string, sowDateOverride: string, newHarvestStart: string, newHarvestEnd: string) => void;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function PlantingTimeline({ planting, frost, climate, cultivar, onUpdateSowDate }: PlantingTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSowDate, setDragSowDate] = useState<string | null>(null);

  // Check if this is a draggable transplant crop
  const isTransplant = planting.method === 'transplant' && planting.transplantDate;
  const canDrag = isTransplant && cultivar && onUpdateSowDate;

  // Calculate drag bounds based on indoor lead weeks
  const dragBounds = useMemo(() => {
    if (!canDrag || !planting.transplantDate) return null;

    const minWeeks = cultivar.indoorLeadWeeksMin ?? 4;
    const maxWeeks = cultivar.indoorLeadWeeksMax ?? 8;

    // Earliest sow = transplant - maxWeeks, Latest sow = transplant - minWeeks
    const earliestSow = addDays(planting.transplantDate, -maxWeeks * 7);
    const latestSow = addDays(planting.transplantDate, -minWeeks * 7);

    return { earliestSow, latestSow, minWeeks, maxWeeks };
  }, [canDrag, cultivar, planting.transplantDate]);

  // Convert pixel position to date
  const pixelToDate = useCallback((clientX: number): string | null => {
    if (!trackRef.current || !dragBounds) return null;

    const rect = trackRef.current.getBoundingClientRect();
    const year = new Date(`${frost.lastSpringFrost}T00:00:00Z`).getUTCFullYear();
    const rangeStart = new Date(`${year}-03-01T00:00:00Z`);
    const rangeEnd = new Date(`${year}-11-30T00:00:00Z`);
    const rangeDays = (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24);

    const pct = (clientX - rect.left) / rect.width;
    const dayOffset = Math.round(pct * rangeDays);
    const targetDate = addDays(`${year}-03-01`, dayOffset);

    // Clamp to bounds
    if (targetDate < dragBounds.earliestSow) return dragBounds.earliestSow;
    if (targetDate > dragBounds.latestSow) return dragBounds.latestSow;
    return targetDate;
  }, [frost.lastSpringFrost, dragBounds]);

  // Calculate the frost deadline for harvest end calculations
  const frostDeadline = useMemo(() => {
    const year = new Date(`${frost.lastSpringFrost}T00:00:00Z`).getUTCFullYear();
    const FROST_BUFFER_DAYS = 4;

    if (cultivar?.frostSensitive) {
      // Use earliest fall frost from climate data if available
      const earliestFrost = climate?.firstFallFrost?.earliest
        ? `${year}-${climate.firstFallFrost.earliest}`
        : frost.firstFallFrost;
      return addDays(earliestFrost, -FROST_BUFFER_DAYS);
    } else {
      // Frost-tolerant crops can extend past typical frost
      const typicalFrost = climate?.firstFallFrost?.typical
        ? `${year}-${climate.firstFallFrost.typical}`
        : frost.firstFallFrost;
      return addDays(typicalFrost, 21);
    }
  }, [frost, climate, cultivar?.frostSensitive]);

  // Calculate new harvest dates when sow date changes
  // Harvest start shifts 1:1 with sow date changes.
  // Harvest end either shifts with start (if within duration) or extends to frost deadline.
  const calculateNewHarvest = useCallback((newSowDate: string): { harvestStart: string; harvestEnd: string } | null => {
    if (!cultivar || !planting.transplantDate) return null;

    // Calculate what harvest dates would be with no override (the baseline)
    // Current override shifts harvest by (sowDate - sowDateOverride) days
    const currentOverrideShift = planting.sowDateOverride
      ? Math.round(
          (new Date(`${planting.sowDate}T00:00:00Z`).getTime() -
            new Date(`${planting.sowDateOverride}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    // Baseline harvest start (what it would be without any override)
    const baselineHarvestStart = addDays(planting.harvestStart, currentOverrideShift);

    // How many days earlier is the new sow date vs the calculated sow date?
    const newShift = Math.round(
      (new Date(`${planting.sowDate}T00:00:00Z`).getTime() -
        new Date(`${newSowDate}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    // Shift harvest start earlier by the new amount
    const newHarvestStart = addDays(baselineHarvestStart, -newShift);

    // For harvest end: extend to frost deadline if the crop has explicit duration,
    // or if the original harvest was truncated by frost
    let newHarvestEnd: string;

    if (cultivar.harvestDurationDays != null) {
      // Crop has explicit harvest duration - use it, but cap at frost deadline
      const durationEnd = addDays(newHarvestStart, cultivar.harvestDurationDays);
      newHarvestEnd = durationEnd > frostDeadline ? frostDeadline : durationEnd;
    } else if (cultivar.harvestStyle === 'continuous') {
      // Continuous harvest until frost
      newHarvestEnd = frostDeadline;
    } else {
      // Single harvest - just shift with start
      const baselineHarvestEnd = addDays(planting.harvestEnd, currentOverrideShift);
      newHarvestEnd = addDays(baselineHarvestEnd, -newShift);
    }

    return { harvestStart: newHarvestStart, harvestEnd: newHarvestEnd };
  }, [cultivar, planting, frostDeadline]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canDrag) return;
    e.preventDefault();
    setIsDragging(true);
    const newDate = pixelToDate(e.clientX);
    if (newDate) setDragSowDate(newDate);
  }, [canDrag, pixelToDate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const newDate = pixelToDate(e.clientX);
    if (newDate) setDragSowDate(newDate);
  }, [isDragging, pixelToDate]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragSowDate || !onUpdateSowDate) {
      setIsDragging(false);
      setDragSowDate(null);
      return;
    }

    const newHarvest = calculateNewHarvest(dragSowDate);
    if (newHarvest) {
      onUpdateSowDate(planting.id, dragSowDate, newHarvest.harvestStart, newHarvest.harvestEnd);
    }

    setIsDragging(false);
    setDragSowDate(null);
  }, [isDragging, dragSowDate, onUpdateSowDate, calculateNewHarvest, planting.id]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      handleMouseUp();
    }
  }, [isDragging, handleMouseUp]);
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
    // Use drag sow date if actively dragging, otherwise use override or original
    const effectiveSowDate = dragSowDate ?? planting.sowDateOverride ?? planting.sowDate;
    const sowLeft = clampPct(effectiveSowDate);
    const sowWidth = planting.transplantDate
      ? clampPct(planting.transplantDate) - sowLeft
      : 2; // Minimum width for visibility

    // Calculate drag bound positions for visual indicator
    const dragBoundLeft = dragBounds ? clampPct(dragBounds.earliestSow) : null;
    const dragBoundRight = dragBounds ? clampPct(dragBounds.latestSow) : null;

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
      dragBoundLeft,
      dragBoundRight,
    };
  }, [planting, frost, climate, dragSowDate, dragBounds]);

  // Get the effective sow date for display
  const effectiveSowDate = dragSowDate ?? planting.sowDateOverride ?? planting.sowDate;

  return (
    <div className={styles.timeline}>
      <div
        ref={trackRef}
        className={`${styles.track} ${isDragging ? styles.trackDragging : ''}`}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
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

        {/* Drag bounds indicator (shown when dragging) */}
        {isDragging && timeline.dragBoundLeft !== null && timeline.dragBoundRight !== null && (
          <div
            className={styles.dragBounds}
            style={{
              left: `${timeline.dragBoundLeft}%`,
              width: `${timeline.dragBoundRight - timeline.dragBoundLeft}%`,
            }}
          />
        )}

        {/* Sow period bar */}
        <div
          className={`${styles.barSow} ${canDrag ? styles.barSowDraggable : ''} ${isDragging ? styles.barSowDragging : ''}`}
          style={{
            left: `${timeline.sow.left}%`,
            width: `${timeline.sow.width}%`,
          }}
          title={`Sow: ${effectiveSowDate}${planting.sowDateOverride ? ' (adjusted)' : ''}`}
          onMouseDown={handleMouseDown}
        >
          {/* Drag handle on left edge for transplants */}
          {canDrag && (
            <div className={styles.dragHandle} title="Drag to adjust indoor start date" />
          )}
        </div>

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
