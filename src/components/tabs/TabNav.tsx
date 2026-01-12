'use client';

import styles from './TabNav.module.css';

export type Tab = 'vegetables' | 'flowers' | 'calendar' | 'tasks' | 'garden';

type TabNavProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className={styles.nav}>
      <button
        className={`${styles.tab} ${activeTab === 'vegetables' ? styles.active : ''}`}
        onClick={() => onTabChange('vegetables')}
      >
        Vegetables
      </button>
      <button
        className={`${styles.tab} ${activeTab === 'flowers' ? styles.active : ''}`}
        onClick={() => onTabChange('flowers')}
      >
        Flowers
      </button>
      <button
        className={`${styles.tab} ${activeTab === 'calendar' ? styles.active : ''}`}
        onClick={() => onTabChange('calendar')}
      >
        Calendar
      </button>
      <button
        className={`${styles.tab} ${activeTab === 'tasks' ? styles.active : ''}`}
        onClick={() => onTabChange('tasks')}
      >
        Tasks
      </button>
      <button
        className={`${styles.tab} ${activeTab === 'garden' ? styles.active : ''}`}
        onClick={() => onTabChange('garden')}
      >
        Garden
      </button>
    </nav>
  );
}
