'use client';

import type { Task, Cultivar, TaskType, PropagationType } from '@/lib/types';
import { getPropagationLabels } from '@/lib/propagationLabels';
import styles from './TaskCard.module.css';

type TaskCardProps = {
  task: Task;
  cultivar?: Cultivar;
  onToggleComplete: (taskId: string) => void;
};

function getTaskTypeLabel(type: TaskType, propagationType?: PropagationType): string {
  if (type === 'sow_direct') return getPropagationLabels(propagationType).directMethodLabel;
  if (type === 'sow_indoor') return getPropagationLabels(propagationType).indoorMethodLabel;
  const staticLabels: Partial<Record<TaskType, string>> = {
    harden_off: 'Harden Off',
    transplant: 'Transplant',
    harvest_start: 'Harvest',
  };
  return staticLabels[type] ?? type;
}

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

export function TaskCard({ task, cultivar, onToggleComplete }: TaskCardProps) {
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
            {getTaskTypeLabel(task.type, cultivar?.propagationType)}
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
