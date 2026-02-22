'use client';

import { useState } from 'react';
import type { Cultivar, PlantType } from '@/lib/types';
import { LibraryCultivarCard } from './LibraryCultivarCard';
import styles from './CropRow.module.css';

export type CropGroup = {
  crop: string;
  plantType: PlantType;
  cultivars: Cultivar[];
  baselineCultivars: Cultivar[];
  inPlanCount: number;
};

export type CropFamily = {
  baseCrop: string;
  plantType: PlantType;
  subGroups: CropGroup[];
  totalCultivars: number;
  totalInPlan: number;
};

type CropRowProps = {
  group: CropGroup;
  planCultivarIds: Set<string>;
  onAddToPlan: (cultivarId: string) => Promise<unknown>;
  onRemoveFromPlan: (cultivarId: string) => Promise<void>;
  defaultExpanded?: boolean;
  /** When true, renders with nested/indented styling inside a CropFamilyRow */
  nested?: boolean;
  /** Override the displayed crop name (e.g. show qualifier only) */
  displayName?: string;
};

export function CropRow({
  group,
  planCultivarIds,
  onAddToPlan,
  onRemoveFromPlan,
  defaultExpanded = false,
  nested = false,
  displayName,
}: CropRowProps) {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const expanded = userToggled ?? defaultExpanded;

  const totalVarieties = group.cultivars.length;
  const typeBadgeClass =
    group.plantType === 'herb' ? styles.typeBadgeHerb
      : group.plantType === 'flower' ? styles.typeBadgeFlower
        : styles.typeBadgeVegetable;

  const rowClass = nested ? `${styles.cropRow} ${styles.nestedRow}` : styles.cropRow;
  const nameClass = nested ? `${styles.cropName} ${styles.nestedName}` : styles.cropName;

  return (
    <div className={rowClass}>
      <button
        type="button"
        className={styles.cropHeader}
        onClick={() => setUserToggled(expanded ? false : true)}
        aria-expanded={expanded}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}>
          &#9654;
        </span>
        <span className={nameClass}>{displayName ?? group.crop}</span>
        <span className={styles.varietyCount}>
          {totalVarieties} {totalVarieties === 1 ? 'variety' : 'varieties'}
        </span>
        {!nested && (
          <span className={`${styles.typeBadge} ${typeBadgeClass}`}>
            {group.plantType}
          </span>
        )}
        {group.inPlanCount > 0 && (
          <span className={styles.inPlanSummary}>
            {group.inPlanCount} in plan
          </span>
        )}
      </button>

      {expanded && (
        <div className={styles.expandedContent}>
          {group.baselineCultivars.length > 0 && (
            <div className={styles.defaultSection}>
              <p className={styles.defaultHint}>
                Don&apos;t see your variety? Add the default to get started.
              </p>
              {group.baselineCultivars.map((baseline) => (
                <LibraryCultivarCard
                  key={baseline.id}
                  cultivar={baseline}
                  inPlan={planCultivarIds.has(baseline.id)}
                  onAddToPlan={onAddToPlan}
                  onRemoveFromPlan={onRemoveFromPlan}
                  showCropName={baseline.crop !== group.crop}
                  displayName={baseline.crop !== group.crop
                    ? `Default ${baseline.crop.replace(group.crop, '').trim()}`
                    : 'Default'}
                />
              ))}
            </div>
          )}
          {group.cultivars.map((cultivar) => (
            <LibraryCultivarCard
              key={cultivar.id}
              cultivar={cultivar}
              inPlan={planCultivarIds.has(cultivar.id)}
              onAddToPlan={onAddToPlan}
              onRemoveFromPlan={onRemoveFromPlan}
              showCropName={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// CropFamilyRow — groups multiple sub-categories
// ============================================

type CropFamilyRowProps = {
  family: CropFamily;
  planCultivarIds: Set<string>;
  onAddToPlan: (cultivarId: string) => Promise<unknown>;
  onRemoveFromPlan: (cultivarId: string) => Promise<void>;
  defaultExpanded?: boolean;
};

export function CropFamilyRow({
  family,
  planCultivarIds,
  onAddToPlan,
  onRemoveFromPlan,
  defaultExpanded = false,
}: CropFamilyRowProps) {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const expanded = userToggled ?? defaultExpanded;

  const typeBadgeClass =
    family.plantType === 'herb' ? styles.typeBadgeHerb
      : family.plantType === 'flower' ? styles.typeBadgeFlower
        : styles.typeBadgeVegetable;

  return (
    <div className={styles.cropRow}>
      <button
        type="button"
        className={styles.cropHeader}
        onClick={() => setUserToggled(expanded ? false : true)}
        aria-expanded={expanded}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}>
          &#9654;
        </span>
        <span className={styles.cropName}>{family.baseCrop}</span>
        <span className={styles.varietyCount}>
          {family.totalCultivars} {family.totalCultivars === 1 ? 'variety' : 'varieties'}
        </span>
        <span className={`${styles.typeBadge} ${typeBadgeClass}`}>
          {family.plantType}
        </span>
        {family.totalInPlan > 0 && (
          <span className={styles.inPlanSummary}>
            {family.totalInPlan} in plan
          </span>
        )}
      </button>

      {expanded && (
        <div className={styles.familyContent}>
          {family.subGroups.map((group) => (
            <CropRow
              key={group.crop}
              group={group}
              planCultivarIds={planCultivarIds}
              onAddToPlan={onAddToPlan}
              onRemoveFromPlan={onRemoveFromPlan}
              defaultExpanded={defaultExpanded}
              nested
              displayName={getQualifier(group.crop) ?? group.crop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Extract qualifier from parenthetical crop name: "Pepper (Bell)" → "Bell" */
function getQualifier(crop: string): string | null {
  const match = crop.match(/^.+?\s*\((.+)\)$/);
  return match ? match[1] : null;
}
