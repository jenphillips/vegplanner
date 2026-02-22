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
  selectedPlantingId?: string | null;
  onSelectPlanting?: (id: string) => void;
  placedQuantityMap?: Map<string, number>;
};

export function PlantingList({
  plantings,
  cultivar,
  frost,
  climate,
  onUpdate,
  onDelete,
  selectedPlantingId,
  onSelectPlanting,
  placedQuantityMap,
}: PlantingListProps) {
  if (plantings.length === 0) {
    return null;
  }

  return (
    <div className={styles.list}>
      <TimelineHeader frost={frost} />
      <div className={styles.plantings}>
        {plantings.map((planting, index) => (
          <PlantingCard
            key={planting.id}
            planting={planting}
            cultivar={cultivar}
            frost={frost}
            climate={climate}
            previousHarvestEnd={index > 0 ? plantings[index - 1].harvestEnd : undefined}
            onUpdate={onUpdate}
            onDelete={onDelete}
            isSelected={selectedPlantingId === planting.id}
            onSelect={onSelectPlanting}
            placedQuantity={placedQuantityMap?.get(planting.id)}
          />
        ))}
      </div>
    </div>
  );
}
