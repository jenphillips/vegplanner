'use client';

import { useMemo } from 'react';
import type { Cultivar, Task } from '@/lib/types';
import { WeekGroup } from './WeekGroup';
import styles from './ScheduleView.module.css';

type ScheduleViewProps = {
  tasksByWeek: Map<string, Task[]>;
  cultivars: Cultivar[];
  onToggleComplete: (taskId: string) => void;
  loading: boolean;
};

export function ScheduleView({
  tasksByWeek,
  cultivars,
  onToggleComplete,
  loading,
}: ScheduleViewProps) {
  // Sort weeks chronologically
  const sortedWeeks = useMemo(() => {
    return Array.from(tasksByWeek.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  }, [tasksByWeek]);

  if (loading) {
    return <div className={styles.loading}>Loading tasks...</div>;
  }

  if (sortedWeeks.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No tasks yet. Add plantings to generate tasks.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {sortedWeeks.map(([weekStart, tasks]) => (
        <WeekGroup
          key={weekStart}
          weekStart={weekStart}
          tasks={tasks}
          cultivars={cultivars}
          onToggleComplete={onToggleComplete}
        />
      ))}
    </div>
  );
}
