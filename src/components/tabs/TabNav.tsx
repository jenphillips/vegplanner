'use client';

import styles from './TabNav.module.css';

export type Tab = 'timeline' | 'calendar' | 'tasks' | 'garden';

type TabNavProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className={styles.nav}>
      <button
        className={`${styles.tab} ${activeTab === 'timeline' ? styles.active : ''}`}
        onClick={() => onTabChange('timeline')}
      >
        Timeline
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
