'use client';

import styles from './PlantTypeFilter.module.css';

export type PlantTypeFilterValue = 'all' | 'vegetable' | 'flower';

type PlantTypeFilterProps = {
  value: PlantTypeFilterValue;
  onChange: (value: PlantTypeFilterValue) => void;
};

export function PlantTypeFilter({ value, onChange }: PlantTypeFilterProps) {
  return (
    <div className={styles.filter}>
      <button
        type="button"
        className={`${styles.option} ${value === 'all' ? styles.active : ''}`}
        onClick={() => onChange('all')}
      >
        All
      </button>
      <button
        type="button"
        className={`${styles.option} ${value === 'vegetable' ? styles.active : ''}`}
        onClick={() => onChange('vegetable')}
      >
        Vegetables
      </button>
      <button
        type="button"
        className={`${styles.option} ${value === 'flower' ? styles.active : ''}`}
        onClick={() => onChange('flower')}
      >
        Flowers
      </button>
    </div>
  );
}
