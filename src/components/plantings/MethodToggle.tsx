'use client';

import styles from './MethodToggle.module.css';

type MethodToggleProps = {
  currentMethod: 'direct' | 'transplant';
  onChange: (method: 'direct' | 'transplant') => void;
  disabled?: boolean;
};

export function MethodToggle({ currentMethod, onChange, disabled }: MethodToggleProps) {
  return (
    <div className={styles.toggle}>
      <button
        type="button"
        className={`${styles.option} ${currentMethod === 'direct' ? styles.active : ''}`}
        onClick={() => onChange('direct')}
        disabled={disabled || currentMethod === 'direct'}
        title="Direct sow outdoors"
      >
        DS
      </button>
      <button
        type="button"
        className={`${styles.option} ${currentMethod === 'transplant' ? styles.active : ''}`}
        onClick={() => onChange('transplant')}
        disabled={disabled || currentMethod === 'transplant'}
        title="Start indoors, transplant later"
      >
        TR
      </button>
    </div>
  );
}
