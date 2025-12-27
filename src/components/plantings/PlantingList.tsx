'use client';

import type { Cultivar, Planting, FrostWindow, Climate } from '@/lib/types';
import { PlantingCard } from './PlantingCard';
import { TimelineHeader } from './TimelineHeader';
import styles from './PlantingList.module.css';

type PlantingListProps = {
  plantings: Planting[];
  cultivar: Cultivar;
  frost: FrostWindow;
  climate?: Climate;
  onUpdate: (id: string, updates: Partial<Planting>) => void;
  onDelete: (id: string) => void;
};

export function PlantingList({
  plantings,
  cultivar,
  frost,
  climate,
  onUpdate,
  onDelete,
}: PlantingListProps) {
  if (plantings.length === 0) {
    return null;
  }

  return (
    <div className={styles.list}>
      <h4 className={styles.heading}>Planned Plantings</h4>
      <TimelineHeader frost={frost} />
      <div className={styles.plantings}>
        {plantings.map((planting) => (
          <PlantingCard
            key={planting.id}
            planting={planting}
            cultivar={cultivar}
            frost={frost}
            climate={climate}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
