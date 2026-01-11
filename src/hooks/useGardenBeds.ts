import { useCallback } from 'react';
import { useDataFile } from './useDataFile';
import type { GardenBed } from '@/lib/types';

export function useGardenBeds() {
  const { data, loading, error, add, update, remove } =
    useDataFile<GardenBed>('garden-beds');

  const addBed = useCallback(
    async (bed: Omit<GardenBed, 'id'>) => {
      const newBed: GardenBed = {
        ...bed,
        id: crypto.randomUUID(),
      };
      await add(newBed);
      return newBed;
    },
    [add]
  );

  const updateBed = useCallback(
    async (id: string, updates: Partial<GardenBed>) => {
      await update(id, updates);
    },
    [update]
  );

  const deleteBed = useCallback(
    async (id: string) => {
      await remove(id);
    },
    [remove]
  );

  return {
    beds: data,
    loading,
    error,
    addBed,
    updateBed,
    deleteBed,
  };
}
