'use client';

import type { Task, Cultivar } from '@/lib/types';
import { TaskCard } from './TaskCard';
import styles from './WeekGroup.module.css';

type WeekGroupProps = {
  weekStart: string;
  tasks: Task[];
  cultivars: Cultivar[];
  onToggleComplete: (taskId: string) => void;
};

function formatWeekHeader(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return `Week of ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })}`;
}

export function WeekGroup({
  weekStart,
  tasks,
  cultivars,
  onToggleComplete,
}: WeekGroupProps) {
  const cultivarMap = new Map(cultivars.map((c) => [c.id, c]));
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className={styles.group}>
      <div className={styles.header}>
        <h3 className={styles.title}>{formatWeekHeader(weekStart)}</h3>
        <span className={styles.count}>
          {completedCount}/{tasks.length} complete
        </span>
      </div>
      <div className={styles.tasks}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            cultivar={cultivarMap.get(task.cultivarId)}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
    </div>
  );
}
