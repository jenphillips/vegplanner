'use client';

import { useState, useMemo } from 'react';
import type { Cultivar, PlantingPlan } from '@/lib/types';
import { PlantTypeFilter, type PlantTypeFilterValue } from '@/components/plantings/PlantTypeFilter';
import { LibraryCultivarCard } from './LibraryCultivarCard';
import styles from './LibraryView.module.css';

type LibraryViewProps = {
  cultivars: Cultivar[];
  plans: PlantingPlan[];
  loading: boolean;
  onAddToPlan: (cultivarId: string) => Promise<unknown>;
  onRemoveFromPlan: (cultivarId: string) => Promise<void>;
};

export function LibraryView({
  cultivars,
  plans,
  loading,
  onAddToPlan,
  onRemoveFromPlan,
}: LibraryViewProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<PlantTypeFilterValue>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-plan' | 'not-in-plan'>('all');

  const planCultivarIds = useMemo(
    () => new Set(plans.map((p) => p.cultivarId)),
    [plans]
  );

  const filteredCultivars = useMemo(() => {
    let result = cultivars;

    // Filter by search
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.crop.toLowerCase().includes(searchLower) ||
          c.variety.toLowerCase().includes(searchLower) ||
          c.notes?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by plant type
    if (typeFilter !== 'all') {
      result = result.filter((c) => c.plantType === typeFilter);
    }

    // Filter by plan status
    if (statusFilter === 'in-plan') {
      result = result.filter((c) => planCultivarIds.has(c.id));
    } else if (statusFilter === 'not-in-plan') {
      result = result.filter((c) => !planCultivarIds.has(c.id));
    }

    // Sort alphabetically by crop then variety
    return result.sort((a, b) => {
      const cropCompare = a.crop.localeCompare(b.crop);
      if (cropCompare !== 0) return cropCompare;
      return a.variety.localeCompare(b.variety);
    });
  }, [cultivars, search, typeFilter, statusFilter, planCultivarIds]);

  const inPlanCount = cultivars.filter((c) => planCultivarIds.has(c.id)).length;
  const notInPlanCount = cultivars.length - inPlanCount;

  if (loading) {
    return <div className={styles.loading}>Loading library...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Search cultivars..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
        <PlantTypeFilter value={typeFilter} onChange={setTypeFilter} />
        <div className={styles.statusFilter}>
          <button
            type="button"
            className={`${styles.statusOption} ${statusFilter === 'all' ? styles.active : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({cultivars.length})
          </button>
          <button
            type="button"
            className={`${styles.statusOption} ${statusFilter === 'in-plan' ? styles.active : ''}`}
            onClick={() => setStatusFilter('in-plan')}
          >
            In Plan ({inPlanCount})
          </button>
          <button
            type="button"
            className={`${styles.statusOption} ${statusFilter === 'not-in-plan' ? styles.active : ''}`}
            onClick={() => setStatusFilter('not-in-plan')}
          >
            Not in Plan ({notInPlanCount})
          </button>
        </div>
      </div>

      {filteredCultivars.length === 0 ? (
        <div className={styles.empty}>
          {search.trim() || typeFilter !== 'all' || statusFilter !== 'all'
            ? 'No cultivars match your filters'
            : 'No cultivars in library'}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredCultivars.map((cultivar) => (
            <LibraryCultivarCard
              key={cultivar.id}
              cultivar={cultivar}
              inPlan={planCultivarIds.has(cultivar.id)}
              onAddToPlan={onAddToPlan}
              onRemoveFromPlan={onRemoveFromPlan}
            />
          ))}
        </div>
      )}
    </div>
  );
}
