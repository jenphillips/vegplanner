import { useCallback } from 'react';
import { useDataFile } from './useDataFile';
import type { PlantingPlacement } from '@/lib/types';

export function usePlacements() {
  const { data, loading, error, add, update, remove, save } =
    useDataFile<PlantingPlacement>('placements');

  const addPlacement = useCallback(
    async (placement: Omit<PlantingPlacement, 'id'>) => {
      const newPlacement: PlantingPlacement = {
        ...placement,
        id: crypto.randomUUID(),
      };
      await add(newPlacement);
      return newPlacement;
    },
    [add]
  );

  const updatePlacement = useCallback(
    async (id: string, updates: Partial<PlantingPlacement>) => {
      await update(id, updates);
    },
    [update]
  );

  const deletePlacement = useCallback(
    async (id: string) => {
      await remove(id);
    },
    [remove]
  );

  const getPlacementsForBed = useCallback(
    (bedId: string) => data.filter((p) => p.bedId === bedId),
    [data]
  );

  const getPlacementForPlanting = useCallback(
    (plantingId: string) => data.find((p) => p.plantingId === plantingId),
    [data]
  );

  const bulkUpdatePlacements = useCallback(
    async (updates: PlantingPlacement[]) => {
      const updatedIds = new Set(updates.map((u) => u.id));
      const unchanged = data.filter((p) => !updatedIds.has(p.id));
      await save([...unchanged, ...updates]);
    },
    [data, save]
  );

  return {
    placements: data,
    loading,
    error,
    addPlacement,
    updatePlacement,
    deletePlacement,
    getPlacementsForBed,
    getPlacementForPlanting,
    bulkUpdatePlacements,
  };
}
