'use client';

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { FrostWindow, Climate } from '@/lib/types';
import styles from './DateScrubberTimeline.module.css';

type DateScrubberTimelineProps = {
  frost: FrostWindow;
  climate?: Climate;
  selectedDate: string;
  onDateChange: (date: string) => void;
  plantingCount: number;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function DateScrubberTimeline({
  frost,
  climate,
  selectedDate,
  onDateChange,
  plantingCount,
}: DateScrubberTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Format date for display
  const formatDateFull = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Static timeline elements (week bands, month ticks, frost ranges)
  const staticTimeline = useMemo(() => {
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

    // Month ticks with labels
    const monthLabel = (iso: string) =>
      new Date(`${iso}T00:00:00Z`).toLocaleString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      });

    const monthTicks = Array.from({ length: 9 }, (_, i) => {
      const monthNum = i + 3;
      const month = String(monthNum).padStart(2, '0');
      const date = `${year}-${month}-01`;
      const nextMonthNum = monthNum + 1;
      const nextMonth = String(nextMonthNum).padStart(2, '0');
      const nextDate = nextMonthNum <= 11
        ? `${year}-${nextMonth}-01`
        : `${year}-12-01`;
      const monthStart = clampPct(date);
      const monthEnd = clampPct(nextDate);
      const center = (monthStart + monthEnd) / 2;
      return { date, label: monthLabel(date), left: clampPct(date), center };
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

    return {
      year,
      rangeStart,
      rangeEnd,
      rangeDays,
      weekBands,
      monthTicks,
      springFrostRange: buildFrostRange(climate?.lastSpringFrost),
      fallFrostRange: buildFrostRange(climate?.firstFallFrost),
      frostMarker: clampPct(frost.lastSpringFrost),
      fallFrostMarker: clampPct(frost.firstFallFrost),
      clampPct,
    };
  }, [frost, climate]);

  // Selected date position
  const selectedDatePosition = useMemo(() => {
    return staticTimeline.clampPct(selectedDate);
  }, [staticTimeline, selectedDate]);

  // Convert pixel position to date
  const pixelToDate = useCallback((clientX: number): string => {
    if (!trackRef.current) return selectedDate;

    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dayOffset = Math.round(pct * staticTimeline.rangeDays);
    return addDays(staticTimeline.rangeStart, dayOffset);
  }, [staticTimeline, selectedDate]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const newDate = pixelToDate(e.clientX);
    onDateChange(newDate);
  }, [pixelToDate, onDateChange]);

  // Document-level mouse events for smooth dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newDate = pixelToDate(e.clientX);
      onDateChange(newDate);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, pixelToDate, onDateChange]);

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        {/* Info section - matches PlantingCard width */}
        <div className={styles.info}>
          <span className={styles.dateValue}>{formatDateFull(selectedDate)}</span>
          <span className={styles.plantingCount}>
            {plantingCount} in ground
          </span>
        </div>

        {/* Timeline track */}
        <div
          ref={trackRef}
          className={`${styles.track} ${isDragging ? styles.trackDragging : ''}`}
          onMouseDown={handleMouseDown}
        >
          {/* Background container - clips week bands and frost ranges */}
          <div className={styles.trackBackground}>
            {/* Week bands (zebra striping) */}
            <div className={styles.weekBands}>
              {staticTimeline.weekBands.map((band, idx) => (
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
            {staticTimeline.monthTicks.map((t) => (
              <div
                key={t.date}
                className={styles.monthTick}
                style={{ left: `${t.left}%` }}
              />
            ))}

            {/* Spring frost range */}
            {staticTimeline.springFrostRange ? (
              <>
                <div
                  className={styles.frostRange}
                  style={{
                    left: `${staticTimeline.springFrostRange.left}%`,
                    width: `${staticTimeline.springFrostRange.width}%`,
                  }}
                />
                <div
                  className={styles.frostTypical}
                  style={{ left: `${staticTimeline.springFrostRange.typicalLeft}%` }}
                />
              </>
            ) : (
              <div
                className={styles.frostMarker}
                style={{ left: `${staticTimeline.frostMarker}%` }}
              />
            )}

            {/* Fall frost range */}
            {staticTimeline.fallFrostRange ? (
              <>
                <div
                  className={styles.frostRange}
                  style={{
                    left: `${staticTimeline.fallFrostRange.left}%`,
                    width: `${staticTimeline.fallFrostRange.width}%`,
                  }}
                />
                <div
                  className={styles.frostTypical}
                  style={{ left: `${staticTimeline.fallFrostRange.typicalLeft}%` }}
                />
              </>
            ) : (
              <div
                className={styles.frostMarker}
                style={{ left: `${staticTimeline.fallFrostMarker}%` }}
              />
            )}
          </div>

          {/* Selected date marker - outside trackBackground so circle can overflow */}
          <div
            className={styles.dateMarker}
            style={{ left: `${selectedDatePosition}%` }}
          />
        </div>

        {/* Spacer to match method toggle slot */}
        <div className={styles.toggleSpacer} />

        {/* Spacer to match delete button */}
        <div className={styles.deleteSpacer} />
      </div>

      {/* Month labels row */}
      <div className={styles.labelsRow}>
        <div className={styles.labelsSpacer} />
        <div className={styles.labels}>
          {staticTimeline.monthTicks.map((t) => (
            <span
              key={t.date}
              className={styles.monthLabel}
              style={{ left: `${t.center}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className={styles.toggleSpacer} />
        <div className={styles.deleteSpacer} />
      </div>
    </div>
  );
}
