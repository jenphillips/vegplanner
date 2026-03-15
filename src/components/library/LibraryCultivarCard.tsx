'use client';

import type { Cultivar } from '@/lib/types';
import { getMethodLabels } from '@/lib/propagationLabels';
import styles from './LibraryCultivarCard.module.css';

type LibraryCultivarCardProps = {
  cultivar: Cultivar;
  inPlan: boolean;
  onAddToPlan: (cultivarId: string) => void;
  onRemoveFromPlan: (cultivarId: string) => void;
  showCropName?: boolean;
  displayName?: string;
};

export function LibraryCultivarCard({
  cultivar,
  inPlan,
  onAddToPlan,
  onRemoveFromPlan,
  showCropName = true,
  displayName,
}: LibraryCultivarCardProps) {
  const methodLabels = getMethodLabels(cultivar.sowMethod, cultivar.propagationType);

  const tempRange =
    cultivar.minGrowingTempC != null && cultivar.maxGrowingTempC != null
      ? `${cultivar.minGrowingTempC}–${cultivar.maxGrowingTempC}°C`
      : null;

  return (
    <div className={`${styles.row} ${inPlan ? styles.inPlan : ''}`}>
      <div className={styles.name}>
        {showCropName && <span className={styles.crop}>{cultivar.crop}</span>}
        <span className={showCropName ? styles.variety : styles.crop}>{displayName ?? cultivar.variety}</span>
      </div>
      <div className={styles.details}>
        <span className={styles.detail}>{cultivar.maturityDays}d</span>
        {methodLabels.map((label) => (
          <span key={label} className={label === 'Transplant' ? styles.badgeTransplant : styles.badge}>
            {label}
          </span>
        ))}
        {cultivar.harvestStyle === 'continuous' && (
          <span className={styles.harvestBadge}>Continuous</span>
        )}
        {tempRange && <span className={styles.detail}>{tempRange}</span>}
      </div>
      <div className={styles.action}>
        {inPlan && <span className={styles.inPlanBadge}>In Plan</span>}
        <button
          onClick={() => inPlan ? onRemoveFromPlan(cultivar.id) : onAddToPlan(cultivar.id)}
          className={inPlan ? styles.removeButton : styles.addButton}
        >
          {inPlan ? 'Remove' : 'Add to Plan'}
        </button>
      </div>
    </div>
  );
}
