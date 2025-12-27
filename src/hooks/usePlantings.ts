import { useCallback } from 'react';
import { useDataFile } from './useDataFile';
import type { Planting } from '@/lib/types';

export function usePlantings() {
  const { data, loading, error, add, update, remove, refetch } =
    useDataFile<Planting>('plantings');

  const addPlanting = useCallback(
    async (planting: Omit<Planting, 'id' | 'createdAt'>) => {
      const newPlanting: Planting = {
        ...planting,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      await add(newPlanting);
      return newPlanting;
    },
    [add]
  );

  const updatePlanting = useCallback(
    async (id: string, updates: Partial<Planting>) => {
      await update(id, updates);
    },
    [update]
  );

  const deletePlanting = useCallback(
    async (id: string) => {
      await remove(id);
    },
    [remove]
  );

  const getPlantingsForCultivar = useCallback(
    (cultivarId: string) => {
      return data.filter((p) => p.cultivarId === cultivarId);
    },
    [data]
  );

  return {
    plantings: data,
    loading,
    error,
    addPlanting,
    updatePlanting,
    deletePlanting,
    getPlantingsForCultivar,
    refetch,
  };
}
