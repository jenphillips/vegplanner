'use client';

import { useState } from 'react';
import type { Cultivar, Planting, FrostWindow, Climate } from '@/lib/types';
import { PlantingTimeline } from './PlantingTimeline';
import styles from './PlantingCard.module.css';

type PlantingCardProps = {
  planting: Planting;
  cultivar: Cultivar;
  frost: FrostWindow;
  climate?: Climate;
  onUpdate: (id: string, updates: Partial<Planting>) => void;
  onDelete: (id: string) => void;
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
  onUpdate,
  onDelete,
}: PlantingCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(planting.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
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

  // Use the override sow date for display if available
  const displaySowDate = planting.sowDateOverride ?? planting.sowDate;

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <div className={styles.info}>
          <span className={styles.label}>{planting.label}</span>
          <span className={styles.quantity}>{planting.quantity}</span>
          <span className={styles.dateRange}>
            {formatDate(displaySowDate)} → {formatDate(planting.harvestEnd)}
          </span>
        </div>
        <PlantingTimeline
          planting={planting}
          frost={frost}
          climate={climate}
          cultivar={cultivar}
          onUpdateSowDate={handleSowDateUpdate}
        />
        <button
          onClick={handleDelete}
          className={`${styles.deleteButton} ${confirmDelete ? styles.deleteConfirm : ''}`}
          title={confirmDelete ? 'Click again to confirm' : 'Delete planting'}
        >
          {confirmDelete ? '✓' : '×'}
        </button>
      </div>
      {planting.notes && <p className={styles.notes}>{planting.notes}</p>}
    </div>
  );
}
