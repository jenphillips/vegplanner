/**
 * Task generation utilities for deriving tasks from plantings.
 * Tasks are generated on-the-fly; only completion state is persisted.
 */

import type { Planting, Task, TaskType, Cultivar } from './types';
import { addDays } from './dateUtils';

const HARDEN_OFF_DAYS_BEFORE_TRANSPLANT = 7;

type GeneratedTask = Omit<Task, 'completed' | 'completedAt'>;

/**
 * Generate all tasks for a single planting based on its method and dates.
 */
export function generateTasksFromPlanting(
  planting: Planting,
  cultivar: Cultivar
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  const displaySowDate = planting.sowDateOverride ?? planting.sowDate;
  // Format quantity for display, handling undefined
  const quantityStr = planting.quantity != null ? String(planting.quantity) : 'some';

  if (planting.method === 'transplant') {
    // Sow indoor task
    tasks.push({
      id: `${planting.id}-sow_indoor`,
      plantingId: planting.id,
      cultivarId: planting.cultivarId,
      type: 'sow_indoor',
      date: displaySowDate,
      title: `Start ${planting.label} indoors`,
      description: `Sow ${quantityStr} seeds`,
    });

    // Harden off and transplant tasks (only if transplant date exists)
    if (planting.transplantDate) {
      tasks.push({
        id: `${planting.id}-harden_off`,
        plantingId: planting.id,
        cultivarId: planting.cultivarId,
        type: 'harden_off',
        date: addDays(planting.transplantDate, -HARDEN_OFF_DAYS_BEFORE_TRANSPLANT),
        title: `Harden off ${planting.label}`,
        description: 'Move seedlings outdoors during the day',
      });

      tasks.push({
        id: `${planting.id}-transplant`,
        plantingId: planting.id,
        cultivarId: planting.cultivarId,
        type: 'transplant',
        date: planting.transplantDate,
        title: `Transplant ${planting.label}`,
        description: `Plant out ${quantityStr} seedlings`,
      });
    }
  } else {
    // Direct sow task
    tasks.push({
      id: `${planting.id}-sow_direct`,
      plantingId: planting.id,
      cultivarId: planting.cultivarId,
      type: 'sow_direct',
      date: displaySowDate,
      title: `Direct sow ${planting.label}`,
      description: `Sow ${quantityStr} seeds outdoors`,
    });
  }

  // Harvest start task (always)
  tasks.push({
    id: `${planting.id}-harvest_start`,
    plantingId: planting.id,
    cultivarId: planting.cultivarId,
    type: 'harvest_start',
    date: planting.harvestStart,
    title: `Begin harvesting ${planting.label}`,
    description: `Harvest ready through ${formatDate(planting.harvestEnd)}`,
  });

  return tasks;
}

/**
 * Generate all tasks from all plantings.
 */
export function generateAllTasks(
  plantings: Planting[],
  cultivars: Cultivar[]
): GeneratedTask[] {
  const cultivarMap = new Map(cultivars.map((c) => [c.id, c]));

  return plantings.flatMap((planting) => {
    const cultivar = cultivarMap.get(planting.cultivarId);
    if (!cultivar) return [];
    return generateTasksFromPlanting(planting, cultivar);
  });
}

/**
 * Group tasks by week (Monday start).
 * Returns a Map with week start dates as keys, sorted chronologically.
 */
export function groupTasksByWeek(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>();

  for (const task of tasks) {
    const weekStart = getWeekStart(task.date);
    const existing = groups.get(weekStart) ?? [];
    existing.push(task);
    groups.set(weekStart, existing);
  }

  // Sort tasks within each week by date, then by type priority
  for (const [, weekTasks] of groups) {
    weekTasks.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return getTaskTypePriority(a.type) - getTaskTypePriority(b.type);
    });
  }

  return groups;
}

/**
 * Get the Monday of the week containing the given date.
 */
function getWeekStart(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay();
  // Adjust to Monday (day 0 = Sunday, so we shift back)
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
  date.setUTCDate(diff);
  return date.toISOString().slice(0, 10);
}

/**
 * Task type display priority (lower = earlier in list).
 */
function getTaskTypePriority(type: TaskType): number {
  const priorities: Record<TaskType, number> = {
    sow_indoor: 1,
    sow_direct: 1,
    harden_off: 2,
    transplant: 3,
    harvest_start: 4,
  };
  return priorities[type];
}

/**
 * Format an ISO date for display.
 */
function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
