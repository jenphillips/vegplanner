import { useCallback } from 'react';
import { useDataFile } from './useDataFile';
import type { PlantingPlan } from '@/lib/types';

export function usePlans() {
  const { data, loading, error, add, remove, refetch } =
    useDataFile<PlantingPlan>('plans');

  const addPlan = useCallback(
    async (cultivarId: string) => {
      const newPlan: PlantingPlan = {
        id: `plan-${cultivarId}`,
        cultivarId,
        frostWindowId: 'default-frost',
        season: 'spring',
        successionOffsetsDays: [0],
      };
      await add(newPlan);
      return newPlan;
    },
    [add]
  );

  const removePlan = useCallback(
    async (cultivarId: string) => {
      const plan = data.find((p) => p.cultivarId === cultivarId);
      if (plan) {
        await remove(plan.id);
      }
    },
    [data, remove]
  );

  const hasPlan = useCallback(
    (cultivarId: string) => {
      return data.some((p) => p.cultivarId === cultivarId);
    },
    [data]
  );

  return {
    plans: data,
    loading,
    error,
    addPlan,
    removePlan,
    hasPlan,
    refetch,
  };
}
