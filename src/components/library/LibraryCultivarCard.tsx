'use client';

import type { Cultivar } from '@/lib/types';
import styles from './LibraryCultivarCard.module.css';

type LibraryCultivarCardProps = {
  cultivar: Cultivar;
  inPlan: boolean;
  onAddToPlan: (cultivarId: string) => void;
  onRemoveFromPlan: (cultivarId: string) => void;
};

export function LibraryCultivarCard({
  cultivar,
  inPlan,
  onAddToPlan,
  onRemoveFromPlan,
}: LibraryCultivarCardProps) {
  const methodLabel =
    cultivar.sowMethod === 'transplant'
      ? 'Transplant'
      : cultivar.sowMethod === 'direct'
        ? 'Direct sow'
        : 'Either';

  const tempRange =
    cultivar.minGrowingTempC != null && cultivar.maxGrowingTempC != null
      ? `${cultivar.minGrowingTempC}–${cultivar.maxGrowingTempC}°C`
      : null;

  return (
    <div className={`${styles.card} ${inPlan ? styles.inPlan : ''}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            {cultivar.crop} — {cultivar.variety}
          </h3>
          {inPlan && <span className={styles.inPlanBadge}>In Plan</span>}
        </div>
        <div className={styles.meta}>
          {cultivar.maturityDays} days from {cultivar.maturityBasis === 'from_transplant' ? 'transplant' : 'sow'}
          {tempRange && <> · {tempRange}</>}
        </div>
        <div className={styles.badges}>
          <span className={cultivar.sowMethod === 'transplant' ? styles.badgeTransplant : styles.badge}>
            {methodLabel}
          </span>
          {cultivar.harvestStyle === 'continuous' && (
            <span className={styles.harvestBadge}>Continuous</span>
          )}
        </div>
      </div>
      <div className={styles.footer}>
        {cultivar.notes && (
          <p className={styles.notes}>{cultivar.notes}</p>
        )}
        <button
          onClick={() => inPlan ? onRemoveFromPlan(cultivar.id) : onAddToPlan(cultivar.id)}
          className={inPlan ? styles.removeButton : styles.addButton}
        >
          {inPlan ? 'Remove from Plan' : 'Add to Plan'}
        </button>
      </div>
    </div>
  );
}
