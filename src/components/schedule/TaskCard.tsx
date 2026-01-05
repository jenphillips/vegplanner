'use client';

import type { Task, Cultivar, TaskType } from '@/lib/types';
import styles from './TaskCard.module.css';

type TaskCardProps = {
  task: Task;
  cultivar?: Cultivar;
  onToggleComplete: (taskId: string) => void;
};

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  sow_indoor: 'Start Indoors',
  sow_direct: 'Direct Sow',
  harden_off: 'Harden Off',
  transplant: 'Transplant',
  harvest_start: 'Harvest',
};

const TASK_TYPE_STYLES: Record<TaskType, string> = {
  sow_indoor: 'sow',
  sow_direct: 'sow',
  harden_off: 'hardenOff',
  transplant: 'transplant',
  harvest_start: 'harvest',
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function TaskCard({ task, onToggleComplete }: TaskCardProps) {
  const colorClass = styles[TASK_TYPE_STYLES[task.type]];

  return (
    <div className={`${styles.card} ${task.completed ? styles.completed : ''}`}>
      <button
        className={styles.checkbox}
        onClick={() => onToggleComplete(task.id)}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.completed ? '\u2713' : ''}
      </button>
      <div className={styles.content}>
        <div className={styles.row}>
          <span className={`${styles.badge} ${colorClass}`}>
            {TASK_TYPE_LABELS[task.type]}
          </span>
          <span className={styles.date}>{formatDate(task.date)}</span>
        </div>
        <h4 className={styles.title}>{task.title}</h4>
        {task.description && (
          <p className={styles.description}>{task.description}</p>
        )}
      </div>
    </div>
  );
}
