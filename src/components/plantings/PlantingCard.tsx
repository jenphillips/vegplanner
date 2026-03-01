'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import type { Cultivar, Planting, FrostWindow, Climate, PlacementDetail } from '@/lib/types';
import { recalculatePlantingForMethodChange, calculateFrostDeadline, calculateHarvestEnd } from '@/lib/succession';
import { addDays } from '@/lib/dateUtils';
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
  /** Placement locations with bed names and quantities */
  placementDetails?: PlacementDetail[];
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
  placementDetails,
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

    // For transplant plantings, also shift the transplant date
    const newTransplantDate = planting.transplantDate
      ? addDays(planting.transplantDate, shiftDays)
      : undefined;

    // Recalculate harvest end based on cultivar settings and frost deadline
    const frostDeadline = calculateFrostDeadline(cultivar, frost, climate);
    const newHarvestEnd = calculateHarvestEnd(newHarvestStart, cultivar, frostDeadline);

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
        {placementDetails && placementDetails.length > 0 && (
          <span
            className={styles.placementIndicator}
            title={placementDetails.map((d) => `${d.bedName}: ${d.quantity}`).join('\n')}
          >
            <MapPin size={13} />
          </span>
        )}
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
