'use client';

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

  const handleMethodChange = (newMethod: 'direct' | 'transplant') => {
    if (newMethod === planting.method) return;

    const updates = recalculatePlantingForMethodChange(
      planting,
      newMethod,
      cultivar,
      frost,
      climate,
      previousHarvestEnd
    );

    onUpdate(planting.id, {
      method: newMethod,
      ...updates,
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
          <span className={styles.quantity}>
            {planting.quantity != null ? planting.quantity : <em className={styles.quantityUnset}>—</em>}
          </span>
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
        <button
          onClick={handleDelete}
          className={styles.deleteButton}
          title="Delete planting"
        >
          ×
        </button>
      </div>
      {planting.notes && <p className={styles.notes}>{planting.notes}</p>}
    </div>
  );
}
