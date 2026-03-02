'use client';

import { useRef } from 'react';
import type { Cultivar, Planting, FrostWindow, Climate, PlacementDetail } from '@/lib/types';
import { PlantingCard } from './PlantingCard';
import { TimelineHeader } from './TimelineHeader';
import { useFlipAnimation } from '@/hooks/useFlipAnimation';
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
  placementDetailsMap?: Map<string, PlacementDetail[]>;
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
  placementDetailsMap,
}: PlantingListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const keys = plantings.map((p) => p.id);
  useFlipAnimation(containerRef, keys);

  if (plantings.length === 0) {
    return null;
  }

  return (
    <div className={styles.list}>
      <TimelineHeader frost={frost} />
      <div className={styles.plantings} ref={containerRef}>
        {plantings.map((planting, index) => (
          <div key={planting.id} data-flip-id={planting.id}>
            <PlantingCard
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
              placementDetails={placementDetailsMap?.get(planting.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
