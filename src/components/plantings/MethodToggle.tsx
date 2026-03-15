'use client';

import type { PropagationType } from '@/lib/types';
import { getPropagationLabels } from '@/lib/propagationLabels';
import styles from './MethodToggle.module.css';

type MethodToggleProps = {
  currentMethod: 'direct' | 'transplant';
  onChange: (method: 'direct' | 'transplant') => void;
  disabled?: boolean;
  propagationType?: PropagationType;
};

export function MethodToggle({ currentMethod, onChange, disabled, propagationType }: MethodToggleProps) {
  const labels = getPropagationLabels(propagationType);
  return (
    <div className={styles.toggle}>
      <button
        type="button"
        className={`${styles.option} ${currentMethod === 'direct' ? styles.active : ''}`}
        onClick={() => onChange('direct')}
        disabled={disabled || currentMethod === 'direct'}
        title={labels.directTooltip}
      >
        DS
      </button>
      <button
        type="button"
        className={`${styles.option} ${currentMethod === 'transplant' ? styles.active : ''}`}
        onClick={() => onChange('transplant')}
        disabled={disabled || currentMethod === 'transplant'}
        title={labels.indoorTooltip}
      >
        TR
      </button>
    </div>
  );
}
