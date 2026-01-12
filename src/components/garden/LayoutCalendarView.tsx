'use client';

import { useMemo } from 'react';
import type { Cultivar, Planting, FrostWindow, Climate } from '@/lib/types';
import { PlantingCard } from '@/components/plantings/PlantingCard';
import { DateScrubberTimeline } from './DateScrubberTimeline';
import { filterPlantingsInGround, getSeasonDateRange } from '@/lib/gardenLayout';
import styles from './LayoutCalendarView.module.css';

type LayoutCalendarViewProps = {
  plantings: Planting[];
  cultivars: Cultivar[];
  frost: FrostWindow;
  climate?: Climate;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onUpdatePlanting?: (id: string, updates: Partial<Planting>) => void;
  onDeletePlanting?: (id: string) => void;
};

export function LayoutCalendarView({
  plantings,
  cultivars,
  frost,
  climate,
  selectedDate,
  onDateChange,
  onUpdatePlanting,
  onDeletePlanting,
}: LayoutCalendarViewProps) {
  // Create map for O(1) cultivar lookup
  const cultivarMap = useMemo(
    () => new Map(cultivars.map((c) => [c.id, c])),
    [cultivars]
  );

  // Get season date range for checking if we have plantings
  const seasonRange = useMemo(
    () => getSeasonDateRange(plantings),
    [plantings]
  );

  // Filter plantings to those in ground on selected date
  const inGroundPlantings = useMemo(
    () => filterPlantingsInGround(plantings, selectedDate),
    [plantings, selectedDate]
  );

  // Sort filtered plantings by effective sow date
  const sortedPlantings = useMemo(() => {
    return [...inGroundPlantings].sort((a, b) => {
      const aDate = a.sowDateOverride ?? a.sowDate;
      const bDate = b.sowDateOverride ?? b.sowDate;
      return aDate.localeCompare(bDate);
    });
  }, [inGroundPlantings]);

  // Format date for the empty state message
  const formatDateFull = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!seasonRange) {
    return (
      <div className={styles.empty}>
        No plantings scheduled yet. Add plantings in the Timeline tab to see them here.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Date Scrubber Timeline - aligned with planting cards */}
      <DateScrubberTimeline
        frost={frost}
        climate={climate}
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        plantingCount={sortedPlantings.length}
      />

      {/* Plantings */}
      {sortedPlantings.length === 0 ? (
        <div className={styles.noPlantings}>
          No plantings in ground on {formatDateFull(selectedDate)}.
        </div>
      ) : (
        <div className={styles.plantings}>
          {sortedPlantings.map((planting) => {
            const cultivar = cultivarMap.get(planting.cultivarId);
            if (!cultivar) return null;

            return (
              <PlantingCard
                key={planting.id}
                planting={planting}
                cultivar={cultivar}
                frost={frost}
                climate={climate}
                previousHarvestEnd={undefined}
                onUpdate={onUpdatePlanting ?? (() => {})}
                onDelete={onDeletePlanting ?? (() => {})}
                disableDrag
                selectedDate={selectedDate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
