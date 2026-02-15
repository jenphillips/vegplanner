import { useCallback } from 'react';
import { useDataFile } from './useDataFile';
import type { Planting } from '@/lib/types';
import { renumberPlantingsForCrop } from '@/lib/succession';

export function usePlantings() {
  const { data, loading, error, add, update, remove, save, refetch } =
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

  const renumberPlantings = useCallback(
    async (cropName: string, cultivarId: string, variety?: string) => {
      const renumbered = renumberPlantingsForCrop(data, cropName, cultivarId, variety);
      await save(renumbered);
    },
    [data, save]
  );

  const updateAndRenumber = useCallback(
    async (
      id: string,
      updates: Partial<Planting>,
      cropName: string,
      cultivarId: string,
      variety?: string
    ) => {
      // Apply update first, then renumber in one save operation
      const updated = data.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      );
      const renumbered = renumberPlantingsForCrop(updated, cropName, cultivarId, variety);
      await save(renumbered);
    },
    [data, save]
  );

  const addAndRenumber = useCallback(
    async (
      planting: Omit<Planting, 'id' | 'createdAt'>,
      cropName: string,
      variety?: string
    ) => {
      const newPlanting: Planting = {
        ...planting,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      // Add new planting, then renumber all plantings for this cultivar
      const withNew = [...data, newPlanting];
      const renumbered = renumberPlantingsForCrop(withNew, cropName, planting.cultivarId, variety);
      await save(renumbered);
      return newPlanting;
    },
    [data, save]
  );

  // Add multiple plantings at once (avoids race condition when adding in a loop)
  const addMultipleAndRenumber = useCallback(
    async (
      plantings: Omit<Planting, 'id' | 'createdAt'>[],
      cropName: string,
      variety?: string
    ) => {
      if (plantings.length === 0) return [];

      const newPlantings: Planting[] = plantings.map((planting) => ({
        ...planting,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }));

      // Add all new plantings, then renumber
      const cultivarId = plantings[0].cultivarId;
      const withNew = [...data, ...newPlantings];
      const renumbered = renumberPlantingsForCrop(withNew, cropName, cultivarId, variety);
      await save(renumbered);
      return newPlantings;
    },
    [data, save]
  );

  const deleteAllForCultivar = useCallback(
    async (cultivarId: string) => {
      const remaining = data.filter((p) => p.cultivarId !== cultivarId);
      await save(remaining);
    },
    [data, save]
  );

  return {
    plantings: data,
    loading,
    error,
    addPlanting,
    updatePlanting,
    deletePlanting,
    deleteAllForCultivar,
    getPlantingsForCultivar,
    renumberPlantings,
    updateAndRenumber,
    addAndRenumber,
    addMultipleAndRenumber,
    refetch,
  };
}
