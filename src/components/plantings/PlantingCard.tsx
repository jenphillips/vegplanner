'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Cultivar, Planting, FrostWindow, Climate } from '@/lib/types';
import { recalculatePlantingForMethodChange } from '@/lib/succession';
import { PlantingTimeline } from './PlantingTimeline';
import { MethodToggle } from './MethodToggle';
import styles from './PlantingCard.module.css';

type PlantingCardProps = {
  planting: Planting;
  cultivar: Cultivar;
  frost: FrostWindow;
  climate?: Climate;
  previousHarvestEnd?: string;
  onUpdate: (id: string, updates: Partial<Planting>) => void;
  onDelete: (id: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  disableDrag?: boolean;
  /** Number of plants already placed in garden beds. Quantity cannot be reduced below this. */
  placedQuantity?: number;
  /** Optional selected date to show as a vertical indicator line (for layout calendar view) */
  selectedDate?: string;
};

// TODO: Move status tracking to Tasks scheduler page
// Status will be auto-derived from task completion dates (sow date, transplant date, etc.)
// const STATUS_OPTIONS: { value: PlantingStatus; label: string }[] = [
//   { value: 'planned', label: 'Planned' },
//   { value: 'sowing', label: 'Sowing' },
//   { value: 'growing', label: 'Growing' },
//   { value: 'transplanting', label: 'Transplanting' },
//   { value: 'harvesting', label: 'Harvesting' },
//   { value: 'completed', label: 'Completed' },
//   { value: 'failed', label: 'Failed' },
// ];

const formatDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

export function PlantingCard({
  planting,
  cultivar,
  frost,
  climate,
  previousHarvestEnd,
  onUpdate,
  onDelete,
  isSelected,
  onSelect,
  disableDrag,
  placedQuantity,
  selectedDate,
}: PlantingCardProps) {
  const handleDelete = () => {
    onDelete(planting.id);
  };

  const handleSowDateUpdate = (
    id: string,
    sowDateOverride: string,
    newHarvestStart: string,
    newHarvestEnd: string
  ) => {
    onUpdate(id, {
      sowDateOverride,
      harvestStart: newHarvestStart,
      harvestEnd: newHarvestEnd,
    });
  };

  // Helper to add days to an ISO date string
  const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // Calculate the frost deadline for harvest end calculations
  const calculateFrostDeadline = () => {
    const year = new Date(`${frost.lastSpringFrost}T00:00:00Z`).getUTCFullYear();
    const FROST_BUFFER_DAYS = 4;

    if (cultivar.frostSensitive) {
      const earliestFrost = climate?.firstFallFrost?.earliest
        ? `${year}-${climate.firstFallFrost.earliest}`
        : frost.firstFallFrost;
      return addDays(earliestFrost, -FROST_BUFFER_DAYS);
    } else {
      const typicalFrost = climate?.firstFallFrost?.typical
        ? `${year}-${climate.firstFallFrost.typical}`
        : frost.firstFallFrost;
      return addDays(typicalFrost, 21);
    }
  };

  const [methodNotice, setMethodNotice] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState<string | null>(null);
  const [dragNotice, setDragNotice] = useState<string | null>(null);

  // Quantity inline editing
  const [isEditingQuantity, setIsEditingQuantity] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState('');
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const quantityCommittedRef = useRef(false);
  const minQuantity = Math.max(1, placedQuantity ?? 0);

  const commitQuantity = useCallback(() => {
    if (quantityCommittedRef.current) return;
    quantityCommittedRef.current = true;
    setIsEditingQuantity(false);
    const parsed = parseInt(quantityDraft);
    if (isNaN(parsed)) return;
    const clamped = Math.max(minQuantity, parsed);
    if (clamped !== planting.quantity) {
      onUpdate(planting.id, { quantity: clamped });
    }
  }, [quantityDraft, minQuantity, planting.quantity, planting.id, onUpdate]);

  const handleQuantityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    quantityCommittedRef.current = false;
    setQuantityDraft(String(planting.quantity ?? ''));
    setIsEditingQuantity(true);
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitQuantity();
    } else if (e.key === 'Escape') {
      setIsEditingQuantity(false);
    }
  };

  useEffect(() => {
    if (isEditingQuantity && quantityInputRef.current) {
      quantityInputRef.current.focus();
      quantityInputRef.current.select();
    }
  }, [isEditingQuantity]);

  // Refs for detecting reorder after method change
  const pendingMethodChangeRef = useRef(false);
  const preMethodChangeNumberRef = useRef(planting.successionNumber);

  const handleMethodChange = (newMethod: 'direct' | 'transplant') => {
    if (newMethod === planting.method) return;

    const result = recalculatePlantingForMethodChange(
      planting,
      newMethod,
      cultivar,
      frost,
      climate,
      previousHarvestEnd
    );

    if (!result.viable) {
      setMethodNotice(result.reason);
      return;
    }

    setMethodNotice(null);
    setReorderNotice(null);
    pendingMethodChangeRef.current = true;
    preMethodChangeNumberRef.current = planting.successionNumber;
    onUpdate(planting.id, {
      method: newMethod,
      ...result.updates,
    });
  };

  const handleShiftPlanting = (id: string, shiftDays: number) => {
    const newSowDate = addDays(planting.sowDate, shiftDays);
    const newHarvestStart = addDays(planting.harvestStart, shiftDays);
    let newHarvestEnd = addDays(planting.harvestEnd, shiftDays);

    // For transplant plantings, also shift the transplant date
    const newTransplantDate = planting.transplantDate
      ? addDays(planting.transplantDate, shiftDays)
      : undefined;

    // Recalculate harvest end based on cultivar settings and frost deadline
    const frostDeadline = calculateFrostDeadline();

    if (cultivar.harvestDurationDays != null) {
      // Crop has explicit harvest duration - use it, but cap at frost deadline
      const durationEnd = addDays(newHarvestStart, cultivar.harvestDurationDays);
      newHarvestEnd = durationEnd > frostDeadline ? frostDeadline : durationEnd;
    } else if (cultivar.harvestStyle === 'continuous') {
      // Continuous harvest until frost
      newHarvestEnd = frostDeadline;
    } else {
      // Single harvest - shift with start, but don't exceed frost deadline
      if (newHarvestEnd > frostDeadline) {
        newHarvestEnd = frostDeadline;
      }
    }

    onUpdate(id, {
      sowDate: newSowDate,
      transplantDate: newTransplantDate,
      harvestStart: newHarvestStart,
      harvestEnd: newHarvestEnd,
    });
  };

  const handleDragConstraintHit = () => {
    setDragNotice("Can\u2019t move earlier \u2014 harvest would overlap previous planting");
  };

  // Detect if a method change caused plantings to reorder.
  // The ref guard ensures this only fires after an explicit method toggle action,
  // not on every successionNumber change.
  useEffect(() => {
    if (pendingMethodChangeRef.current) {
      if (planting.successionNumber !== preMethodChangeNumberRef.current) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded by ref, only fires once per method change
        setReorderNotice('Plantings reordered to keep harvests in chronological order');
      }
      pendingMethodChangeRef.current = false;
    }
  }, [planting.successionNumber]);

  // Use the override sow date for display if available
  const displaySowDate = planting.sowDateOverride ?? planting.sowDate;

  const handleInfoClick = () => {
    if (onSelect) {
      onSelect(planting.id);
    }
  };

  return (
    <div className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}>
      <div className={styles.row}>
        <div
          className={`${styles.info} ${onSelect ? styles.infoSelectable : ''}`}
          onClick={handleInfoClick}
          role={onSelect ? 'button' : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onKeyDown={onSelect ? (e) => e.key === 'Enter' && handleInfoClick() : undefined}
        >
          <span className={styles.label}>{planting.label}</span>
          <span className={styles.dateRange}>
            {formatDate(displaySowDate)} → {formatDate(planting.harvestEnd)}
          </span>
        </div>
        <PlantingTimeline
          planting={planting}
          frost={frost}
          climate={climate}
          cultivar={cultivar}
          previousHarvestEnd={previousHarvestEnd}
          onUpdateSowDate={disableDrag ? undefined : handleSowDateUpdate}
          onShiftPlanting={disableDrag ? undefined : handleShiftPlanting}
          onDragConstraintHit={handleDragConstraintHit}
          selectedDate={selectedDate}
        />
        <div className={styles.methodToggleSlot}>
          {cultivar.sowMethod === 'either' && (
            <MethodToggle
              currentMethod={planting.method as 'direct' | 'transplant'}
              onChange={handleMethodChange}
            />
          )}
        </div>
        {isEditingQuantity ? (
          <input
            ref={quantityInputRef}
            type="number"
            className={styles.quantityInput}
            value={quantityDraft}
            min={minQuantity}
            onChange={(e) => setQuantityDraft(e.target.value)}
            onBlur={commitQuantity}
            onKeyDown={handleQuantityKeyDown}
          />
        ) : (
          <span
            className={styles.quantity}
            onClick={handleQuantityClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuantityClick(e as unknown as React.MouseEvent); }}
            title={
              (placedQuantity ?? 0) > 0
                ? `${placedQuantity} placed in garden beds`
                : 'Click to edit quantity'
            }
          >
            {planting.quantity != null ? planting.quantity : <em className={styles.quantityUnset}>—</em>}
          </span>
        )}
        <button
          onClick={handleDelete}
          className={styles.deleteButton}
          title="Delete planting"
        >
          ×
        </button>
      </div>
      {methodNotice && (
        <p className={styles.notice}>
          Can&apos;t switch method: {methodNotice}
          <button
            onClick={() => setMethodNotice(null)}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#7a5e00', fontWeight: 600 }}
          >
            Dismiss
          </button>
        </p>
      )}
      {reorderNotice && (
        <p className={styles.notice}>
          {reorderNotice}
          <button
            onClick={() => setReorderNotice(null)}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#7a5e00', fontWeight: 600 }}
          >
            Dismiss
          </button>
        </p>
      )}
      {dragNotice && (
        <p className={styles.notice}>
          {dragNotice}
          <button
            onClick={() => setDragNotice(null)}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#7a5e00', fontWeight: 600 }}
          >
            Dismiss
          </button>
        </p>
      )}
      {planting.notes && <p className={styles.notes}>{planting.notes}</p>}
    </div>
  );
}
