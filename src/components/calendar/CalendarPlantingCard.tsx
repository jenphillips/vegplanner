'use client';

import type { Cultivar, Planting, FrostWindow, Climate } from '@/lib/types';
import { PlantingCard } from '@/components/plantings/PlantingCard';

type CalendarPlantingCardProps = {
  planting: Planting;
  cultivar: Cultivar;
  frost: FrostWindow;
  climate?: Climate;
  onUpdate: (id: string, updates: Partial<Planting>) => void;
  onDelete: (id: string) => void;
};

export function CalendarPlantingCard({
  planting,
  cultivar,
  frost,
  climate,
  onUpdate,
  onDelete,
}: CalendarPlantingCardProps) {
  return (
    <PlantingCard
      planting={planting}
      cultivar={cultivar}
      frost={frost}
      climate={climate}
      previousHarvestEnd={undefined}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );
}
