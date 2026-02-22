'use client';

import { useState, useMemo } from 'react';
import type { Cultivar, PlantingPlan } from '@/lib/types';
import { PlantTypeFilter, type PlantTypeFilterValue } from '@/components/plantings/PlantTypeFilter';
import { CropRow, CropFamilyRow, type CropGroup, type CropFamily } from './CropRow';
import styles from './LibraryView.module.css';

type LibraryViewProps = {
  cultivars: Cultivar[];
  baselines: Cultivar[];
  plans: PlantingPlan[];
  loading: boolean;
  onAddToPlan: (cultivarId: string) => Promise<unknown>;
  onRemoveFromPlan: (cultivarId: string) => Promise<void>;
};

/** Extract base crop name: "Pepper (Bell)" → "Pepper", "Spinach" → "Spinach" */
function getBaseCrop(crop: string): string {
  const match = crop.match(/^(.+?)\s*\(.+\)$/);
  return match ? match[1] : crop;
}

/** Find baseline entries that match a crop name (exact or base-crop match). */
function findBaselinesForCrop(crop: string, baselines: Cultivar[]): Cultivar[] {
  const exact = baselines.filter((b) => b.crop === crop);
  if (exact.length > 0) return exact;

  // Match by shared base crop: "Tomato (Cherry)" matches baselines for "Tomato (Determinate)", etc.
  const inputBase = getBaseCrop(crop);
  return baselines.filter((b) => {
    return b.crop === inputBase || getBaseCrop(b.crop) === inputBase;
  });
}

export function LibraryView({
  cultivars,
  baselines,
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

  // Compute total counts for the toolbar (before status filter)
  const totalCounts = useMemo(() => {
    const inPlan = cultivars.filter((c) => planCultivarIds.has(c.id)).length;
    return { total: cultivars.length, inPlan, notInPlan: cultivars.length - inPlan };
  }, [cultivars, planCultivarIds]);

  const cropFamilies = useMemo(() => {
    let filtered = cultivars;

    // 1. Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (c) =>
          c.crop.toLowerCase().includes(q) ||
          c.variety.toLowerCase().includes(q) ||
          c.notes?.toLowerCase().includes(q)
      );
    }

    // 2. Plant type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((c) => c.plantType === typeFilter);
    }

    // 3. Group by full crop name
    const groupMap = new Map<string, Cultivar[]>();
    for (const c of filtered) {
      const group = groupMap.get(c.crop) ?? [];
      group.push(c);
      groupMap.set(c.crop, group);
    }

    // 4. Build CropGroup objects
    let groups: CropGroup[] = Array.from(groupMap.entries()).map(([crop, cvs]) => {
      const sorted = [...cvs].sort((a, b) => a.variety.localeCompare(b.variety));
      const baselineMatches = findBaselinesForCrop(crop, baselines);
      const inPlanCount =
        cvs.filter((c) => planCultivarIds.has(c.id)).length +
        baselineMatches.filter((b) => planCultivarIds.has(b.id)).length;
      return {
        crop,
        plantType: cvs[0].plantType ?? 'vegetable',
        cultivars: sorted,
        baselineCultivars: baselineMatches,
        inPlanCount,
      };
    });

    // 5. Status filter at group level
    if (statusFilter === 'in-plan') {
      groups = groups.filter((g) => g.inPlanCount > 0);
    } else if (statusFilter === 'not-in-plan') {
      groups = groups.filter(
        (g) => g.inPlanCount < g.cultivars.length + g.baselineCultivars.length
      );
    }

    // 6. Group into families by base crop name
    const familyMap = new Map<string, CropGroup[]>();
    for (const g of groups) {
      const base = getBaseCrop(g.crop);
      const family = familyMap.get(base) ?? [];
      family.push(g);
      familyMap.set(base, family);
    }

    // 7. Build CropFamily objects, sorting sub-groups alphabetically
    const families: CropFamily[] = Array.from(familyMap.entries()).map(([baseCrop, subGroups]) => {
      subGroups.sort((a, b) => a.crop.localeCompare(b.crop));
      return {
        baseCrop,
        plantType: subGroups[0].plantType,
        subGroups,
        totalCultivars: subGroups.reduce((sum, g) => sum + g.cultivars.length, 0),
        totalInPlan: subGroups.reduce((sum, g) => sum + g.inPlanCount, 0),
      };
    });

    // 8. Sort families alphabetically
    families.sort((a, b) => a.baseCrop.localeCompare(b.baseCrop));

    return families;
  }, [cultivars, baselines, search, typeFilter, statusFilter, planCultivarIds]);

  if (loading) {
    return <div className={styles.loading}>Loading library...</div>;
  }

  const isSearching = !!search.trim();

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Search crops and varieties..."
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
            All ({totalCounts.total})
          </button>
          <button
            type="button"
            className={`${styles.statusOption} ${statusFilter === 'in-plan' ? styles.active : ''}`}
            onClick={() => setStatusFilter('in-plan')}
          >
            In Plan ({totalCounts.inPlan})
          </button>
          <button
            type="button"
            className={`${styles.statusOption} ${statusFilter === 'not-in-plan' ? styles.active : ''}`}
            onClick={() => setStatusFilter('not-in-plan')}
          >
            Not in Plan ({totalCounts.notInPlan})
          </button>
        </div>
      </div>

      {cropFamilies.length === 0 ? (
        <div className={styles.empty}>
          {search.trim() || typeFilter !== 'all' || statusFilter !== 'all'
            ? 'No cultivars match your filters'
            : 'No cultivars in library'}
        </div>
      ) : (
        <div className={styles.grid}>
          {cropFamilies.map((family) =>
            family.subGroups.length === 1 ? (
              <CropRow
                key={family.baseCrop}
                group={family.subGroups[0]}
                planCultivarIds={planCultivarIds}
                onAddToPlan={onAddToPlan}
                onRemoveFromPlan={onRemoveFromPlan}
                defaultExpanded={isSearching}
              />
            ) : (
              <CropFamilyRow
                key={family.baseCrop}
                family={family}
                planCultivarIds={planCultivarIds}
                onAddToPlan={onAddToPlan}
                onRemoveFromPlan={onRemoveFromPlan}
                defaultExpanded={isSearching}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
