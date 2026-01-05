import { useMemo, useCallback } from 'react';
import { useDataFile } from './useDataFile';
import type { Planting, Task, TaskCompletion, Cultivar } from '@/lib/types';
import { generateAllTasks, groupTasksByWeek } from '@/lib/tasks';

type UseTasksResult = {
  tasks: Task[];
  tasksByWeek: Map<string, Task[]>;
  loading: boolean;
  error: string | null;
  toggleTaskComplete: (taskId: string) => Promise<void>;
};

export function useTasks(
  plantings: Planting[],
  cultivars: Cultivar[]
): UseTasksResult {
  const {
    data: completions,
    loading,
    error,
    save,
  } = useDataFile<TaskCompletion>('tasks');

  // Generate tasks from plantings and merge with completion state
  const tasks = useMemo(() => {
    const generatedTasks = generateAllTasks(plantings, cultivars);
    const completionMap = new Map(completions.map((c) => [c.id, c]));

    return generatedTasks
      .map((task) => {
        const completion = completionMap.get(task.id);
        return {
          ...task,
          completed: completion?.completed ?? false,
          completedAt: completion?.completedAt,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [plantings, cultivars, completions]);

  const tasksByWeek = useMemo(() => groupTasksByWeek(tasks), [tasks]);

  const toggleTaskComplete = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const existingIndex = completions.findIndex((c) => c.id === taskId);
      const newCompletions = [...completions];
      const newCompleted = !task.completed;

      if (existingIndex >= 0) {
        newCompletions[existingIndex] = {
          ...newCompletions[existingIndex],
          completed: newCompleted,
          completedAt: newCompleted ? new Date().toISOString() : undefined,
        };
      } else {
        newCompletions.push({
          id: taskId,
          plantingId: task.plantingId,
          type: task.type,
          completed: newCompleted,
          completedAt: newCompleted ? new Date().toISOString() : undefined,
        });
      }

      await save(newCompletions);
    },
    [tasks, completions, save]
  );

  return {
    tasks,
    tasksByWeek,
    loading,
    error,
    toggleTaskComplete,
  };
}
