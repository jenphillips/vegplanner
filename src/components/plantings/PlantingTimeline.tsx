'use client';

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import type { Planting, FrostWindow, Climate, Cultivar } from '@/lib/types';
import { isGrowingPeriodViable } from '@/lib/succession';
import styles from './PlantingTimeline.module.css';

type PlantingTimelineProps = {
  planting: Planting;
  frost: FrostWindow;
  climate?: Climate;
  cultivar?: Cultivar;
  previousHarvestEnd?: string;
  onUpdateSowDate?: (id: string, sowDateOverride: string, newHarvestStart: string, newHarvestEnd: string) => void;
  onShiftPlanting?: (id: string, shiftDays: number) => void;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function PlantingTimeline({ planting, frost, climate, cultivar, previousHarvestEnd, onUpdateSowDate, onShiftPlanting }: PlantingTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSowDate, setDragSowDate] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [shiftDays, setShiftDays] = useState<number>(0);

  // Check if this is a draggable transplant crop
  const isTransplant = planting.method === 'transplant' && planting.transplantDate;
  const isDirectSow = planting.method === 'direct';
  const canDragTransplant = isTransplant && cultivar && onUpdateSowDate;
  const canDragDirectSow = isDirectSow && onShiftPlanting;

  // Calculate drag bounds based on indoor lead weeks (for transplants)
  const dragBounds = useMemo(() => {
    if (!canDragTransplant || !planting.transplantDate) return null;

    const minWeeks = cultivar.indoorLeadWeeksMin ?? 4;
    const maxWeeks = cultivar.indoorLeadWeeksMax ?? 8;

    // Earliest sow = transplant - maxWeeks, Latest sow = transplant - minWeeks
    const earliestSow = addDays(planting.transplantDate, -maxWeeks * 7);
    const latestSow = addDays(planting.transplantDate, -minWeeks * 7);

    return { earliestSow, latestSow, minWeeks, maxWeeks };
  }, [canDragTransplant, cultivar, planting.transplantDate]);

  // Type for a viable shift range (contiguous range of valid shift days)
  type ViableRange = { minShift: number; maxShift: number };

  // Calculate shift bounds for direct sow crops
  // - Can't shift earlier than when harvest start equals previous planting's harvest end
  // - Can't shift later than when sow date reaches the latest viable sow date for the season
  // - Can't shift into temperature-unfavorable periods (handled by temperatureShiftBounds)
  const shiftBounds = useMemo(() => {
    if (!canDragDirectSow) return null;

    const harvestStart = new Date(`${planting.harvestStart}T00:00:00Z`);
    const sowDate = new Date(`${planting.sowDate}T00:00:00Z`);
    const year = new Date(`${frost.lastSpringFrost}T00:00:00Z`).getUTCFullYear();

    // Maximum shift earlier: harvest start can go back to previous harvest end (or season start if first planting)
    let maxShiftEarlier: number;
    if (previousHarvestEnd) {
      const prevEnd = new Date(`${previousHarvestEnd}T00:00:00Z`);
      maxShiftEarlier = Math.floor((harvestStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24));
    } else {
      // First planting: constrain to season start
      const seasonStart = new Date(`${year}-03-01T00:00:00Z`);
      maxShiftEarlier = Math.floor((sowDate.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Maximum shift later: constrain to end of season
    // Calculate the frost deadline (when harvest must end)
    const FROST_BUFFER_DAYS = 4;
    let frostDeadline: Date;
    if (cultivar?.frostSensitive) {
      const earliestFrost = climate?.firstFallFrost?.earliest
        ? `${year}-${climate.firstFallFrost.earliest}`
        : frost.firstFallFrost;
      frostDeadline = new Date(`${addDays(earliestFrost, -FROST_BUFFER_DAYS)}T00:00:00Z`);
    } else {
      const typicalFrost = climate?.firstFallFrost?.typical
        ? `${year}-${climate.firstFallFrost.typical}`
        : frost.firstFallFrost;
      frostDeadline = new Date(`${addDays(typicalFrost, 21)}T00:00:00Z`);
    }

    // Latest sow date = frost deadline - maturity days
    // We need harvest to start before frost deadline, so latest sow = frostDeadline - maturityDays
    const maturityDays = cultivar?.maturityDays ?? 60;
    const latestSowDate = new Date(frostDeadline.getTime() - maturityDays * 24 * 60 * 60 * 1000);
    const maxShiftLater = Math.floor((latestSowDate.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24));

    return { minShift: -maxShiftEarlier, maxShift: Math.max(0, maxShiftLater) };
  }, [canDragDirectSow, frost.lastSpringFrost, frost.firstFallFrost, climate, cultivar, planting.sowDate, planting.harvestStart, previousHarvestEnd]);

  // Calculate temperature-aware shift bounds for direct sow crops
  // This finds ALL viable ranges (e.g., spring and fall windows for heat-sensitive crops)
  // to allow "jumping" over hot periods when dragging
  const temperatureShiftBounds = useMemo(() => {
    if (!canDragDirectSow || !climate || !cultivar || !shiftBounds) return null;

    // For direct sow, the outdoor growing period is from sow date to harvest start
    const outdoorStart = planting.transplantDate ?? planting.sowDate;

    // Helper to check if a shift is temperature-viable
    const isShiftViable = (shiftDays: number): boolean => {
      const shiftedStart = addDays(outdoorStart, shiftDays);
      const shiftedHarvestStart = addDays(planting.harvestStart, shiftDays);
      const result = isGrowingPeriodViable(shiftedStart, shiftedHarvestStart, cultivar, climate);
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
      // For backwards compatibility, also provide the overall min/max
      minShift: ranges.length > 0 ? ranges[0].minShift : 0,
      maxShift: ranges.length > 0 ? ranges[ranges.length - 1].maxShift : 0,
    };
  }, [canDragDirectSow, climate, cultivar, shiftBounds, planting.transplantDate, planting.sowDate, planting.harvestStart]);

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

  // Track drag type to distinguish between transplant and direct sow drags
  const [dragType, setDragType] = useState<'transplant' | 'directSow' | null>(null);

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
  }, [canDragDirectSow]);

  // Use refs to access latest values in event handlers without re-attaching listeners
  const dragStateRef = useRef({ dragType, dragStartX, dragSowDate, shiftDays });
  dragStateRef.current = { dragType, dragStartX, dragSowDate, shiftDays };

  const callbacksRef = useRef({ onUpdateSowDate, onShiftPlanting, calculateNewHarvest, pixelToDate, pixelToDays });
  callbacksRef.current = { onUpdateSowDate, onShiftPlanting, calculateNewHarvest, pixelToDate, pixelToDays };

  // Use document-level mouse events for smooth dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { dragType, dragStartX } = dragStateRef.current;
      const { pixelToDate, pixelToDays } = callbacksRef.current;

      if (dragType === 'transplant') {
        const newDate = pixelToDate(e.clientX);
        if (newDate) setDragSowDate(newDate);
      } else if (dragType === 'directSow' && dragStartX !== null) {
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
      } else if (dragType === 'directSow' && shiftDays !== 0 && onShiftPlanting) {
        onShiftPlanting(planting.id, shiftDays);
      }

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

  // Reset shiftDays when planting data changes (after drag commit)
  useEffect(() => {
    if (!isDragging && shiftDays !== 0) {
      setShiftDays(0);
    }
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
    const isShifting = isDirectSow && shiftDays !== 0;
    const shiftedSowDate = isShifting ? addDays(planting.sowDate, shiftDays) : planting.sowDate;
    const shiftedHarvestStart = isShifting ? addDays(planting.harvestStart, shiftDays) : planting.harvestStart;

    // Calculate shifted harvest end, accounting for frost deadline extension
    let shiftedHarvestEnd = isShifting ? addDays(planting.harvestEnd, shiftDays) : planting.harvestEnd;
    if (isShifting && cultivar) {
      // Recalculate harvest end based on cultivar settings and frost deadline
      if (cultivar.harvestDurationDays != null) {
        // Crop has explicit harvest duration - use it, but cap at frost deadline
        const durationEnd = addDays(shiftedHarvestStart, cultivar.harvestDurationDays);
        shiftedHarvestEnd = durationEnd > frostDeadline ? frostDeadline : durationEnd;
      } else if (cultivar.harvestStyle === 'continuous') {
        // Continuous harvest until frost
        shiftedHarvestEnd = frostDeadline;
      } else {
        // Single harvest - shift with start, but don't exceed frost deadline
        if (shiftedHarvestEnd > frostDeadline) {
          shiftedHarvestEnd = frostDeadline;
        }
      }
    }

    // Sow period
    const effectiveSowDate = isShifting
      ? shiftedSowDate
      : (dragSowDate ?? planting.sowDateOverride ?? planting.sowDate);
    const sowLeft = clampPct(effectiveSowDate);
    const sowWidth = planting.transplantDate
      ? clampPct(planting.transplantDate) - sowLeft
      : 2;

    // Drag bounds for transplants
    const dragBoundLeft = dragBounds ? clampPct(dragBounds.earliestSow) : null;
    const dragBoundRight = dragBounds ? clampPct(dragBounds.latestSow) : null;

    // Transplant marker
    const transplantLeft = planting.transplantDate
      ? clampPct(planting.transplantDate)
      : null;

    // Growing period
    const growingStart = planting.transplantDate || (isShifting ? shiftedSowDate : planting.sowDate);
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
    if (isDirectSow && temperatureShiftBounds && temperatureShiftBounds.ranges.length > 0) {
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
  }, [staticTimeline, planting, dragSowDate, dragBounds, isDirectSow, shiftDays, temperatureShiftBounds, cultivar, frostDeadline]);

  // Get the effective sow date for display
  const effectiveSowDate = dragSowDate ?? planting.sowDateOverride ?? planting.sowDate;

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
        {isDragging && dragType === 'directSow' && barPositions.shiftBoundRanges.map((range, idx) => (
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
          className={`${styles.barSow} ${canDragTransplant ? styles.barSowDraggable : ''} ${isDragging && canDragTransplant ? styles.barSowDragging : ''}`}
          style={{
            left: `${barPositions.sow.left}%`,
            width: `${barPositions.sow.width}%`,
          }}
          title={`Sow: ${effectiveSowDate}${planting.sowDateOverride ? ' (adjusted)' : ''}`}
          onMouseDown={handleTransplantMouseDown}
        >
          {/* Drag handle on left edge for transplants */}
          {canDragTransplant && (
            <div className={styles.dragHandle} title="Drag to adjust indoor start date" />
          )}
        </div>

        {/* Growing period bar */}
        <div
          className={`${styles.barGrowing} ${canDragDirectSow ? styles.barDirectSowDraggable : ''} ${isDragging && canDragDirectSow ? styles.barDirectSowDragging : ''}`}
          style={{
            left: `${barPositions.growing.left}%`,
            width: `${barPositions.growing.width}%`,
          }}
          title={canDragDirectSow ? `Growing (drag to shift planting${shiftDays !== 0 ? `: ${shiftDays > 0 ? '+' : ''}${shiftDays} days` : ''})` : 'Growing'}
          onMouseDown={handleDirectSowMouseDown}
        />

        {/* Harvest period bar */}
        <div
          className={`${styles.barHarvest} ${canDragDirectSow ? styles.barDirectSowDraggable : ''} ${isDragging && canDragDirectSow ? styles.barDirectSowDragging : ''}`}
          style={{
            left: `${barPositions.harvest.left}%`,
            width: `${barPositions.harvest.width}%`,
          }}
          title={canDragDirectSow ? `Harvest (drag to shift planting${shiftDays !== 0 ? `: ${shiftDays > 0 ? '+' : ''}${shiftDays} days` : ''})` : `Harvest: ${planting.harvestStart} – ${planting.harvestEnd}`}
          onMouseDown={handleDirectSowMouseDown}
        />

        {/* Transplant marker */}
        {barPositions.transplant !== null && (
          <div
            className={styles.markerTransplant}
            style={{ left: `${barPositions.transplant}%` }}
            title={`Transplant: ${planting.transplantDate}`}
          />
        )}
      </div>

    </div>
  );
}
