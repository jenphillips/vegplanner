'use client';

import { useState } from 'react';
import type { Cultivar, PlantType } from '@/lib/types';
import { getMethodLabels } from '@/lib/propagationLabels';
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

  const baseline = group.baselineCultivars[0];
  const baselineInPlan = baseline ? planCultivarIds.has(baseline.id) : false;

  const methodLabels = baseline
    ? getMethodLabels(baseline.sowMethod, baseline.propagationType)
    : [];

  const tempRange =
    baseline?.minGrowingTempC != null && baseline?.maxGrowingTempC != null
      ? `${baseline.minGrowingTempC}–${baseline.maxGrowingTempC}°C`
      : null;

  return (
    <div className={`${rowClass} ${baselineInPlan ? styles.cropRowInPlan : ''}`}>
      <div
        className={styles.cropHeader}
        onClick={() => setUserToggled(expanded ? false : true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUserToggled(expanded ? false : true); } }}
        aria-expanded={expanded}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`}>
          &#9654;
        </span>
        <span className={nameClass}>{displayName ?? group.crop}</span>
        {!nested && (
          <span className={`${styles.typeBadge} ${typeBadgeClass}`}>
            {group.plantType}
          </span>
        )}
        {baseline && (
          <span className={styles.headerDetails}>
            <span className={styles.headerDetail}>{baseline.maturityDays}d</span>
            {methodLabels.map((label) => (
              <span key={label} className={label === 'Transplant' ? styles.headerBadgeTransplant : styles.headerBadge}>
                {label}
              </span>
            ))}
            {tempRange && <span className={styles.headerDetail}>{tempRange}</span>}
          </span>
        )}
        <span className={styles.varietyCount}>
          {totalVarieties} {totalVarieties === 1 ? 'variety' : 'varieties'}
        </span>
        <span className={styles.headerAction} onClick={(e) => e.stopPropagation()}>
          {group.inPlanCount > 0 && (
            <span className={styles.inPlanSummary}>
              {group.inPlanCount} in plan
            </span>
          )}
          {baseline && (
            <>
              {baselineInPlan && <span className={styles.headerInPlanBadge}>In Plan</span>}
              <button
                type="button"
                onClick={() => baselineInPlan ? onRemoveFromPlan(baseline.id) : onAddToPlan(baseline.id)}
                className={baselineInPlan ? styles.headerRemoveButton : styles.headerAddButton}
              >
                {baselineInPlan ? 'Remove' : 'Add to Plan'}
              </button>
            </>
          )}
        </span>
      </div>

      {expanded && (
        <div className={styles.expandedContent}>
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
