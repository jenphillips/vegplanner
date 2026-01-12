'use client';

import { useMemo, useState } from 'react';
import type { Cultivar, Planting, FrostWindow, Climate } from '@/lib/types';
import { TimelineHeader } from '@/components/plantings/TimelineHeader';
import { PlantTypeFilter, type PlantTypeFilterValue } from '@/components/plantings/PlantTypeFilter';
import { CalendarPlantingCard } from './CalendarPlantingCard';
import styles from './CalendarView.module.css';

type CalendarViewProps = {
  plantings: Planting[];
  cultivars: Cultivar[];
  frost: FrostWindow;
  climate?: Climate;
  onUpdatePlanting: (id: string, updates: Partial<Planting>) => void;
  onDeletePlanting: (id: string) => void;
  loading: boolean;
};

export function CalendarView({
  plantings,
  cultivars,
  frost,
  climate,
  onUpdatePlanting,
  onDeletePlanting,
  loading,
}: CalendarViewProps) {
  const [filter, setFilter] = useState<PlantTypeFilterValue>('all');

  // Create map for O(1) cultivar lookup
  const cultivarMap = useMemo(
    () => new Map(cultivars.map((c) => [c.id, c])),
    [cultivars]
  );

  // Sort plantings by effective sow date
  const sortedPlantings = useMemo(() => {
    return [...plantings].sort((a, b) => {
      const aDate = a.sowDateOverride ?? a.sowDate;
      const bDate = b.sowDateOverride ?? b.sowDate;
      return aDate.localeCompare(bDate);
    });
  }, [plantings]);

  // Filter plantings by plant type
  const filteredPlantings = useMemo(() => {
    if (filter === 'all') return sortedPlantings;
    return sortedPlantings.filter((p) => {
      const cultivar = cultivarMap.get(p.cultivarId);
      return (cultivar?.plantType ?? 'vegetable') === filter;
    });
  }, [sortedPlantings, filter, cultivarMap]);

  if (loading) {
    return <div className={styles.loading}>Loading plantings...</div>;
  }

  if (sortedPlantings.length === 0) {
    return (
      <div className={styles.empty}>
        No plantings yet. Add plantings from the Vegetables or Flowers tab.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.filterRow}>
        <PlantTypeFilter value={filter} onChange={setFilter} />
      </div>
      <TimelineHeader frost={frost} />
      <div className={styles.plantings}>
        {filteredPlantings.map((planting) => {
          const cultivar = cultivarMap.get(planting.cultivarId);
          if (!cultivar) return null;

          return (
            <CalendarPlantingCard
              key={planting.id}
              planting={planting}
              cultivar={cultivar}
              frost={frost}
              climate={climate}
              onUpdate={onUpdatePlanting}
              onDelete={onDeletePlanting}
            />
          );
        })}
      </div>
    </div>
  );
}
