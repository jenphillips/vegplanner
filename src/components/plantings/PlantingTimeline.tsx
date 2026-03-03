'use client';

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { Planting, FrostWindow, Climate, Cultivar, SowMethod } from '@/lib/types';
import { isGrowingPeriodViable, calculateFrostDeadline, calculateHarvestEnd } from '@/lib/succession';
import { addDays, daysBetween } from '@/lib/dateUtils';
import { calculateShiftBounds } from '@/lib/dragConstraints';
import styles from './PlantingTimeline.module.css';

const formatShortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

type PlantingTimelineProps = {
  planting: Planting;
  frost: FrostWindow;
  climate?: Climate;
  cultivar?: Cultivar;
  previousHarvestEnd?: string;
  onUpdateSowDate?: (id: string, sowDateOverride: string, newHarvestStart: string, newHarvestEnd: string) => void;
  onShiftPlanting?: (id: string, shiftDays: number) => void;
  /** Called when user tries to drag past the minimum bound due to succession overlap */
  onDragConstraintHit?: () => void;
  /** Optional selected date to show as a vertical indicator line (for layout calendar view) */
  selectedDate?: string;
};

export function PlantingTimeline({ planting, frost, climate, cultivar, previousHarvestEnd, onUpdateSowDate, onShiftPlanting, onDragConstraintHit, selectedDate }: PlantingTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSowDate, setDragSowDate] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [shiftDays, setShiftDays] = useState<number>(0);
  const hitMinBoundRef = useRef(false);

  // Check if this is a draggable transplant crop
  const isTransplant = planting.method === 'transplant' && planting.transplantDate;
  const isDirectSow = planting.method === 'direct';

  // For crops that support both methods ("either"), use shift-based dragging even for transplants
  // This allows more flexibility - the transplant date follows sow date + lead weeks
  const isEitherCrop = cultivar?.sowMethod === 'either';

  // Traditional transplant drag (fixed transplant date, adjust sow within lead-week range)
  const canDragTransplant = isTransplant && cultivar && onUpdateSowDate && !isEitherCrop;

  // Shift-based drag for direct sow OR "either" crops in transplant mode
  const canDragDirectSow = isDirectSow && onShiftPlanting;
  const canDragTransplantShift = isTransplant && isEitherCrop && onShiftPlanting;

  // Calculate drag bounds based on indoor lead weeks (for transplants)
  const dragBounds = useMemo(() => {
    if (!canDragTransplant || !planting.transplantDate) return null;

    const minWeeks = cultivar.indoorLeadWeeksMin ?? 6;
    const maxWeeks = cultivar.indoorLeadWeeksMax ?? 6;

    // Earliest sow = transplant - maxWeeks, Latest sow = transplant - minWeeks
    const earliestSow = addDays(planting.transplantDate, -maxWeeks * 7);
    const latestSow = addDays(planting.transplantDate, -minWeeks * 7);

    return { earliestSow, latestSow, minWeeks, maxWeeks };
  }, [canDragTransplant, cultivar, planting.transplantDate]);

  // Type for a viable shift range (contiguous range of valid shift days)
  type ViableRange = { minShift: number; maxShift: number };

  // Calculate shift bounds for direct sow crops AND "either" crops in transplant mode
  // Uses extracted function for testability - see dragConstraints.test.ts
  const shiftBounds = useMemo(() => {
    if (!canDragDirectSow && !canDragTransplantShift) return null;

    return calculateShiftBounds({
      planting,
      cultivar,
      frost,
      climate,
      previousHarvestEnd,
      isTransplantMode: !!canDragTransplantShift,
    });
  }, [canDragDirectSow, canDragTransplantShift, frost, climate, cultivar, planting, previousHarvestEnd]);

  // Calculate temperature-aware shift bounds for direct sow AND transplant "either" crops
  // This finds ALL viable ranges (e.g., spring and fall windows for heat-sensitive crops)
  // to allow "jumping" over hot periods when dragging
  const temperatureShiftBounds = useMemo(() => {
    if ((!canDragDirectSow && !canDragTransplantShift) || !climate || !cultivar || !shiftBounds) return null;

    // For direct sow, outdoor period starts at sow date
    // For transplant, outdoor period starts at transplant date
    const outdoorStart = planting.transplantDate ?? planting.sowDate;

    // Helper to check if a shift is temperature-viable
    const isShiftViable = (shiftDays: number): boolean => {
      const shiftedStart = addDays(outdoorStart, shiftDays);
      const shiftedHarvestStart = addDays(planting.harvestStart, shiftDays);
      const result = isGrowingPeriodViable(shiftedStart, shiftedHarvestStart, cultivar, climate, { method: planting.method as SowMethod });
      return result.viable;
    };

    // Check current position
    const currentViable = isShiftViable(0);

    // Find ALL viable ranges across the entire shift bounds
    // This allows jumping between spring and fall windows
    const ranges: ViableRange[] = [];
    let rangeStart: number | null = null;

    for (let shift = shiftBounds.minShift; shift <= shiftBounds.maxShift; shift++) {
      const viable = isShiftViable(shift);

      if (viable && rangeStart === null) {
        // Start of a new viable range
        rangeStart = shift;
      } else if (!viable && rangeStart !== null) {
        // End of current viable range
        ranges.push({ minShift: rangeStart, maxShift: shift - 1 });
        rangeStart = null;
      }
    }

    // Close final range if we ended in a viable position
    if (rangeStart !== null) {
      ranges.push({ minShift: rangeStart, maxShift: shiftBounds.maxShift });
    }

    return {
      ranges,
      currentViable,
    };
  }, [canDragDirectSow, canDragTransplantShift, climate, cultivar, shiftBounds, planting.transplantDate, planting.sowDate, planting.harvestStart, planting.method]);

  // Track previous shift value to detect drag direction for range jumping
  const prevShiftRef = useRef<number>(0);

  // Convert pixel offset to days for direct sow shifting
  // Uses temperature-aware bounds if available, falls back to basic shift bounds
  // When dragging past a hot period, snaps to the next viable range
  const pixelToDays = useCallback((deltaX: number): number => {
    if (!trackRef.current || !shiftBounds) return 0;

    const rect = trackRef.current.getBoundingClientRect();
    const year = new Date(`${frost.lastSpringFrost}T00:00:00Z`).getUTCFullYear();
    const rangeStart = new Date(`${year}-03-01T00:00:00Z`);
    const rangeEnd = new Date(`${year}-11-30T00:00:00Z`);
    const rangeDays = (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24);

    const rawDaysDelta = Math.round((deltaX / rect.width) * rangeDays);

    // Show notice immediately when user first hits the succession bound
    if (rawDaysDelta < shiftBounds.minShift && !hitMinBoundRef.current) {
      hitMinBoundRef.current = true;
      if (shiftBounds.minShiftReason === 'succession') {
        callbacksRef.current.onDragConstraintHit?.();
      }
    }

    // If we have multiple viable ranges, handle jumping between them
    if (temperatureShiftBounds && temperatureShiftBounds.ranges.length > 0) {
      const ranges = temperatureShiftBounds.ranges;
      const prevShift = prevShiftRef.current;
      const movingRight = rawDaysDelta > prevShift;

      // First, clamp to overall bounds
      const clampedDelta = Math.max(
        shiftBounds.minShift,
        Math.min(shiftBounds.maxShift, rawDaysDelta)
      );

      // Check if we're in a viable range
      const inViableRange = ranges.some(
        (r) => clampedDelta >= r.minShift && clampedDelta <= r.maxShift
      );

      if (inViableRange) {
        // We're in a valid range - use the value directly
        prevShiftRef.current = clampedDelta;
        return clampedDelta;
      }

      // We're in a gap between ranges - snap to appropriate range boundary
      if (movingRight) {
        // Moving right: find the next range that starts after our current position
        const nextRange = ranges.find((r) => r.minShift > prevShift);
        if (nextRange) {
          // Check if we've dragged far enough to "trigger" the jump
          // Jump when we're past the midpoint of the gap
          const prevRange = ranges.find((r) => r.maxShift <= prevShift && r.maxShift >= prevShift - 7);
          const gapStart = prevRange ? prevRange.maxShift : ranges[0].minShift;
          const gapMidpoint = gapStart + (nextRange.minShift - gapStart) / 2;

          if (clampedDelta >= gapMidpoint) {
            // Jump to start of next range
            prevShiftRef.current = nextRange.minShift;
            return nextRange.minShift;
          } else {
            // Stay at end of previous range
            const stayRange = ranges.find((r) => r.maxShift < nextRange.minShift);
            if (stayRange) {
              prevShiftRef.current = stayRange.maxShift;
              return stayRange.maxShift;
            }
          }
        }
      } else {
        // Moving left: find the previous range that ends before our current position
        const prevRange = [...ranges].reverse().find((r) => r.maxShift < prevShift);
        if (prevRange) {
          // Check if we've dragged far enough to "trigger" the jump back
          const nextRange = ranges.find((r) => r.minShift >= prevShift);
          const gapEnd = nextRange ? nextRange.minShift : ranges[ranges.length - 1].maxShift;
          const gapMidpoint = prevRange.maxShift + (gapEnd - prevRange.maxShift) / 2;

          if (clampedDelta <= gapMidpoint) {
            // Jump to end of previous range
            prevShiftRef.current = prevRange.maxShift;
            return prevRange.maxShift;
          } else {
            // Stay at start of current range
            if (nextRange) {
              prevShiftRef.current = nextRange.minShift;
              return nextRange.minShift;
            }
          }
        }
      }

      // Fallback: clamp to nearest range
      let nearestValue = clampedDelta;
      let minDistance = Infinity;
      for (const range of ranges) {
        const distToMin = Math.abs(clampedDelta - range.minShift);
        const distToMax = Math.abs(clampedDelta - range.maxShift);
        if (distToMin < minDistance) {
          minDistance = distToMin;
          nearestValue = range.minShift;
        }
        if (distToMax < minDistance) {
          minDistance = distToMax;
          nearestValue = range.maxShift;
        }
      }
      prevShiftRef.current = nearestValue;
      return nearestValue;
    }

    // Fallback to simple bounds if no temperature ranges
    const result = Math.max(shiftBounds.minShift, Math.min(shiftBounds.maxShift, rawDaysDelta));
    prevShiftRef.current = result;
    return result;
  }, [frost.lastSpringFrost, shiftBounds, temperatureShiftBounds]);

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
    return calculateFrostDeadline(cultivar ?? { frostSensitive: false }, frost, climate);
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

    // Recalculate harvest end based on cultivar settings and frost deadline
    const newHarvestEnd = calculateHarvestEnd(newHarvestStart, cultivar, frostDeadline);

    return { harvestStart: newHarvestStart, harvestEnd: newHarvestEnd };
  }, [cultivar, planting, frostDeadline]);

  // Track drag type to distinguish between transplant and direct sow drags
  const [dragType, setDragType] = useState<'transplant' | 'directSow' | 'transplantShift' | null>(null);

  // Mouse handlers for transplant crops (adjust indoor start date)
  const handleTransplantMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canDragTransplant) return;
    e.preventDefault();
    setIsDragging(true);
    setDragType('transplant');
    const newDate = pixelToDate(e.clientX);
    if (newDate) setDragSowDate(newDate);
  }, [canDragTransplant, pixelToDate]);

  // Mouse handlers for direct sow crops (shift entire planting)
  const handleDirectSowMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canDragDirectSow) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragType('directSow');
    setDragStartX(e.clientX);
    setShiftDays(0);
    prevShiftRef.current = 0; // Reset direction tracking for new drag
    hitMinBoundRef.current = false;
  }, [canDragDirectSow]);

  // Mouse handlers for transplant "either" crops (shift entire planting, transplant follows sow)
  const handleTransplantShiftMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canDragTransplantShift) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragType('transplantShift');
    setDragStartX(e.clientX);
    setShiftDays(0);
    prevShiftRef.current = 0;
    hitMinBoundRef.current = false;
  }, [canDragTransplantShift]);

  // Use refs to access latest values in event handlers without re-attaching listeners.
  // The ref-current-update pattern is correct here — the React Compiler can't verify it's safe
  // but this is the standard way to keep stable event handlers that read fresh values.
  const dragStateRef = useRef({ dragType, dragStartX, dragSowDate, shiftDays });
  dragStateRef.current = { dragType, dragStartX, dragSowDate, shiftDays };

  const callbacksRef = useRef({ onUpdateSowDate, onShiftPlanting, calculateNewHarvest, pixelToDate, pixelToDays, onDragConstraintHit });
  callbacksRef.current = { onUpdateSowDate, onShiftPlanting, calculateNewHarvest, pixelToDate, pixelToDays, onDragConstraintHit };

  // Use document-level mouse events for smooth dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { dragType, dragStartX } = dragStateRef.current;
      const { pixelToDate, pixelToDays } = callbacksRef.current;

      if (dragType === 'transplant') {
        const newDate = pixelToDate(e.clientX);
        if (newDate) setDragSowDate(newDate);
      } else if ((dragType === 'directSow' || dragType === 'transplantShift') && dragStartX !== null) {
        const deltaX = e.clientX - dragStartX;
        const days = pixelToDays(deltaX);
        setShiftDays(days);
      }
    };

    const handleMouseUp = () => {
      const { dragType, dragSowDate, shiftDays } = dragStateRef.current;
      const { onUpdateSowDate, onShiftPlanting, calculateNewHarvest } = callbacksRef.current;

      if (dragType === 'transplant' && dragSowDate && onUpdateSowDate) {
        const newHarvest = calculateNewHarvest(dragSowDate);
        if (newHarvest) {
          onUpdateSowDate(planting.id, dragSowDate, newHarvest.harvestStart, newHarvest.harvestEnd);
        }
      } else if ((dragType === 'directSow' || dragType === 'transplantShift') && shiftDays !== 0 && onShiftPlanting) {
        onShiftPlanting(planting.id, shiftDays);
      }

      hitMinBoundRef.current = false;

      // Reset drag state but keep shiftDays momentarily to prevent flash
      // The shiftDays will be reset when planting data updates
      setIsDragging(false);
      setDragType(null);
      setDragSowDate(null);
      setDragStartX(null);
      // Don't reset shiftDays here - it will be reset by the useEffect below
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, planting.id]);

  // Reset shiftDays when planting data changes (after drag commit).
  // isDragging and shiftDays are intentionally excluded: including shiftDays would loop,
  // and isDragging would cause unwanted resets on drag start/stop.
  useEffect(() => {
    if (!isDragging && shiftDays !== 0) {
      setShiftDays(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planting.sowDate, planting.harvestStart, planting.harvestEnd]);

  // Static timeline elements (don't change during drag)
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

    return {
      weekBands,
      monthTicks,
      springFrostRange: buildFrostRange(climate?.lastSpringFrost),
      fallFrostRange: buildFrostRange(climate?.firstFallFrost),
      frostMarker: clampPct(frost.lastSpringFrost),
      fallFrostMarker: clampPct(frost.firstFallFrost),
      clampPct,
    };
  }, [frost, climate]);

  // Dynamic bar positions (change during drag)
  const barPositions = useMemo(() => {
    const { clampPct } = staticTimeline;

    // For direct sow shifting, calculate shifted dates during drag
    // For both direct sow and transplant "either" crops, apply shift during drag
    const isShifting = (isDirectSow || (isTransplant && isEitherCrop)) && shiftDays !== 0;
    const shiftedSowDate = isShifting ? addDays(planting.sowDate, shiftDays) : planting.sowDate;
    const shiftedTransplantDate = isShifting && planting.transplantDate ? addDays(planting.transplantDate, shiftDays) : planting.transplantDate;
    const shiftedHarvestStart = isShifting ? addDays(planting.harvestStart, shiftDays) : planting.harvestStart;

    // Calculate shifted harvest end, accounting for frost deadline extension
    const shiftedHarvestEnd = isShifting && cultivar
      ? calculateHarvestEnd(shiftedHarvestStart, cultivar, frostDeadline)
      : planting.harvestEnd;

    // Sow period
    const effectiveSowDate = isShifting
      ? shiftedSowDate
      : (dragSowDate ?? planting.sowDateOverride ?? planting.sowDate);
    const sowLeft = clampPct(effectiveSowDate);
    const effectiveTransplantDate = shiftedTransplantDate ?? planting.transplantDate;
    const sowWidth = effectiveTransplantDate
      ? clampPct(effectiveTransplantDate) - sowLeft
      : 2;

    // Drag bounds for transplants
    const dragBoundLeft = dragBounds ? clampPct(dragBounds.earliestSow) : null;
    const dragBoundRight = dragBounds ? clampPct(dragBounds.latestSow) : null;

    // Transplant marker
    const transplantLeft = effectiveTransplantDate
      ? clampPct(effectiveTransplantDate)
      : null;

    // Growing period - starts at transplant date (if transplant) or sow date (if direct)
    const growingStart = effectiveTransplantDate || (isShifting ? shiftedSowDate : planting.sowDate);
    const effectiveHarvestStart = isShifting ? shiftedHarvestStart : planting.harvestStart;
    const growingLeft = clampPct(growingStart);
    const growingWidth = clampPct(effectiveHarvestStart) - growingLeft;

    // Harvest period
    const effectiveHarvestEnd = isShifting ? shiftedHarvestEnd : planting.harvestEnd;
    const harvestLeft = clampPct(effectiveHarvestStart);
    const harvestWidth = clampPct(effectiveHarvestEnd) - harvestLeft;

    // Shift bounds for direct sow crops (temperature-aware)
    // Show all viable ranges (e.g., spring and fall windows for heat-sensitive crops)
    const shiftBoundRanges: Array<{ left: number; right: number }> = [];
    if ((isDirectSow || (isTransplant && isEitherCrop)) && temperatureShiftBounds && temperatureShiftBounds.ranges.length > 0) {
      const currentGrowingStart = planting.transplantDate ?? planting.sowDate;
      const growingDays = Math.round(
        (new Date(`${planting.harvestStart}T00:00:00Z`).getTime() -
          new Date(currentGrowingStart + 'T00:00:00Z').getTime()) /
          (1000 * 60 * 60 * 24)
      );

      // Convert each viable range to visual positions
      for (const range of temperatureShiftBounds.ranges) {
        const rangeStartDate = addDays(currentGrowingStart, range.minShift);
        const rangeEndDate = addDays(currentGrowingStart, range.maxShift + growingDays);
        shiftBoundRanges.push({
          left: clampPct(rangeStartDate),
          right: clampPct(rangeEndDate),
        });
      }
    }

    return {
      sow: { left: sowLeft, width: Math.max(sowWidth, 0.5) },
      transplant: transplantLeft,
      growing: { left: growingLeft, width: Math.max(growingWidth, 0.5) },
      harvest: { left: harvestLeft, width: Math.max(harvestWidth, 0.5) },
      dragBoundLeft,
      dragBoundRight,
      shiftBoundRanges,
    };
  }, [staticTimeline, planting, dragSowDate, dragBounds, isDirectSow, isTransplant, isEitherCrop, shiftDays, temperatureShiftBounds, cultivar, frostDeadline]);

  // Get the effective sow date for display
  const effectiveSowDate = dragSowDate ?? planting.sowDateOverride ?? planting.sowDate;

  // Calculate selected date position (for layout calendar view indicator)
  const selectedDatePosition = useMemo(() => {
    if (!selectedDate) return null;
    return staticTimeline.clampPct(selectedDate);
  }, [selectedDate, staticTimeline]);

  return (
    <div className={styles.timeline}>
      <div
        ref={trackRef}
        className={`${styles.track} ${isDragging ? styles.trackDragging : ''}`}
      >
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

        {/* Drag bounds indicator for transplants (shown when dragging) */}
        {isDragging && barPositions.dragBoundLeft !== null && barPositions.dragBoundRight !== null && (
          <div
            className={styles.dragBounds}
            style={{
              left: `${barPositions.dragBoundLeft}%`,
              width: `${barPositions.dragBoundRight - barPositions.dragBoundLeft}%`,
            }}
          />
        )}

        {/* Shift bounds indicators for direct sow (shown when dragging) */}
        {/* Shows all viable ranges - e.g., spring and fall windows for heat-sensitive crops */}
        {isDragging && (dragType === 'directSow' || dragType === 'transplantShift') && barPositions.shiftBoundRanges.map((range, idx) => (
          <div
            key={idx}
            className={styles.shiftBounds}
            style={{
              left: `${range.left}%`,
              width: `${range.right - range.left}%`,
            }}
          />
        ))}

        {/* Sow period bar */}
        <div
          className={`${styles.barSow} ${(canDragTransplant || canDragTransplantShift) ? styles.barSowDraggable : ''} ${isDragging && (canDragTransplant || canDragTransplantShift) ? styles.barSowDragging : ''}`}
          style={{
            left: `${barPositions.sow.left}%`,
            width: `${barPositions.sow.width}%`,
          }}
          title={planting.transplantDate
            ? `Start indoors: ${formatShortDate(effectiveSowDate)} → ${formatShortDate(planting.transplantDate)} (${daysBetween(effectiveSowDate, planting.transplantDate)}d)${canDragTransplantShift && shiftDays !== 0 ? `\nShift: ${shiftDays > 0 ? '+' : ''}${shiftDays} days` : ''}`
            : `Sow: ${formatShortDate(effectiveSowDate)}${planting.sowDateOverride ? ' (adjusted)' : ''}`}
          onMouseDown={canDragTransplantShift ? handleTransplantShiftMouseDown : handleTransplantMouseDown}
        >
          {/* Drag handle on left edge for transplants */}
          {canDragTransplant && (
            <div className={styles.dragHandle} title="Drag to adjust indoor start date" />
          )}
        </div>

        {/* Growing period bar */}
        <div
          className={`${styles.barGrowing} ${(canDragDirectSow || canDragTransplantShift) ? styles.barDirectSowDraggable : ''} ${isDragging && (canDragDirectSow || canDragTransplantShift) ? styles.barDirectSowDragging : ''}`}
          style={{
            left: `${barPositions.growing.left}%`,
            width: `${barPositions.growing.width}%`,
          }}
          title={(() => {
            const growStart = planting.transplantDate ?? planting.sowDate;
            const label = planting.transplantDate ? 'Grow outdoors' : 'Grow';
            const info = `${label}: ${formatShortDate(growStart)} → ${formatShortDate(planting.harvestStart)} (${daysBetween(growStart, planting.harvestStart)}d)`;
            const dragHint = (canDragDirectSow || canDragTransplantShift) && shiftDays !== 0
              ? `\nShift: ${shiftDays > 0 ? '+' : ''}${shiftDays} days`
              : '';
            return info + dragHint;
          })()}
          onMouseDown={canDragTransplantShift ? handleTransplantShiftMouseDown : handleDirectSowMouseDown}
        />

        {/* Harvest period bar */}
        <div
          className={`${styles.barHarvest} ${(canDragDirectSow || canDragTransplantShift) ? styles.barDirectSowDraggable : ''} ${isDragging && (canDragDirectSow || canDragTransplantShift) ? styles.barDirectSowDragging : ''}`}
          style={{
            left: `${barPositions.harvest.left}%`,
            width: `${barPositions.harvest.width}%`,
          }}
          title={(() => {
            const info = `Harvest: ${formatShortDate(planting.harvestStart)} → ${formatShortDate(planting.harvestEnd)} (${daysBetween(planting.harvestStart, planting.harvestEnd)}d)`;
            const dragHint = (canDragDirectSow || canDragTransplantShift) && shiftDays !== 0
              ? `\nShift: ${shiftDays > 0 ? '+' : ''}${shiftDays} days`
              : '';
            return info + dragHint;
          })()}
          onMouseDown={canDragTransplantShift ? handleTransplantShiftMouseDown : handleDirectSowMouseDown}
        />

        {/* Transplant marker */}
        {barPositions.transplant !== null && (
          <div
            className={styles.markerTransplant}
            style={{ left: `${barPositions.transplant}%` }}
            title={`Transplant outdoors: ${formatShortDate(planting.transplantDate!)}`}
          />
        )}

        {/* Selected date indicator (for layout calendar view) */}
        {selectedDatePosition !== null && (
          <div
            className={styles.selectedDateIndicator}
            style={{ left: `${selectedDatePosition}%` }}
          />
        )}
      </div>

    </div>
  );
}
