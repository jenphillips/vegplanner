'use client';

import { useMemo, useState } from 'react';
import type { Cultivar, Planting, PlantingPlacement, FrostWindow, Climate } from '@/lib/types';
import { PlantingTimeline } from '@/components/plantings/PlantingTimeline';
import { DateScrubberTimeline } from './DateScrubberTimeline';
import { PlantTypeFilter, type PlantTypeFilterValue } from '@/components/plantings/PlantTypeFilter';
import { filterPlantingsInGround, getSeasonDateRange, isPlantingInGround } from '@/lib/gardenLayout';
import styles from './LayoutCalendarView.module.css';

type LayoutCalendarViewProps = {
  plantings: Planting[];
  cultivars: Cultivar[];
  placements: PlantingPlacement[];
  frost: FrostWindow;
  climate?: Climate;
  selectedDate: string;
  onDateChange: (date: string) => void;
  plantTypeFilter: PlantTypeFilterValue;
  onPlantTypeFilterChange: (value: PlantTypeFilterValue) => void;
};

export function LayoutCalendarView({
  plantings,
  cultivars,
  placements,
  frost,
  climate,
  selectedDate,
  onDateChange,
  plantTypeFilter,
  onPlantTypeFilterChange,
}: LayoutCalendarViewProps) {
  const [showAll, setShowAll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Build display list: in-ground plantings + optionally all others
  const displayPlantings = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const source = showAll ? plantings : filterPlantingsInGround(plantings, selectedDate);
    const filtered = query
      ? source.filter((p) => p.label.toLowerCase().includes(query))
      : source;

    return [...filtered].sort((a, b) => {
      const aDate = a.sowDateOverride ?? a.sowDate;
      const bDate = b.sowDateOverride ?? b.sowDate;
      return aDate.localeCompare(bDate);
    });
  }, [plantings, selectedDate, showAll, searchQuery]);

  // Sum placed quantity per planting
  const placedByPlanting = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of placements) {
      map.set(p.plantingId, (map.get(p.plantingId) ?? 0) + p.quantity);
    }
    return map;
  }, [placements]);

  const inGroundCount = useMemo(
    () => filterPlantingsInGround(plantings, selectedDate).length,
    [plantings, selectedDate]
  );

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
        plantingCount={inGroundCount}
      />

      {/* Controls */}
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search plantings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <PlantTypeFilter value={plantTypeFilter} onChange={onPlantTypeFilterChange} />
        <label className={styles.showAllToggle}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all
        </label>
      </div>

      {/* Plantings */}
      {displayPlantings.length === 0 ? (
        <div className={styles.noPlantings}>
          {searchQuery
            ? 'No plantings match your search.'
            : `No plantings in ground on ${formatDateFull(selectedDate)}.`}
        </div>
      ) : (
        <div className={styles.plantings}>
          {displayPlantings.map((planting) => {
            const cultivar = cultivarMap.get(planting.cultivarId);
            if (!cultivar) return null;

            const inGround = isPlantingInGround(planting, selectedDate);
            const isInactive = showAll && !inGround;

            return (
              <div
                key={planting.id}
                className={`${styles.plantingRow} ${isInactive ? styles.inactive : ''}`}
              >
                <span className={styles.label}>{planting.label}</span>
                <span className={styles.quantity}>
                  {planting.quantity ?? <em className={styles.quantityUnset}>—</em>}
                </span>
                {planting.quantity != null ? (() => {
                  const placed = placedByPlanting.get(planting.id) ?? 0;
                  return placed >= planting.quantity
                    ? <span className={styles.placedCheck}>✓</span>
                    : <span className={styles.placedPartial}>{placed}/{planting.quantity}</span>;
                })() : <span className={styles.placedStatus} />}
                <PlantingTimeline
                  planting={planting}
                  frost={frost}
                  climate={climate}
                  cultivar={cultivar}
                  selectedDate={selectedDate}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
