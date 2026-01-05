import { describe, it, expect } from 'vitest';
import {
  generateTasksFromPlanting,
  generateAllTasks,
  groupTasksByWeek,
} from './tasks';
import type { Planting, Cultivar, Task } from './types';

// ============================================
// Test Fixtures
// ============================================

const baseCultivar: Cultivar = {
  id: 'spinach-bloomsdale',
  crop: 'Spinach',
  variety: 'Bloomsdale',
  germDaysMin: 7,
  germDaysMax: 14,
  maturityDays: 45,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
};

const transplantCultivar: Cultivar = {
  id: 'tomato-cherokee',
  crop: 'Tomato',
  variety: 'Cherokee Purple',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 80,
  maturityBasis: 'from_transplant',
  sowMethod: 'transplant',
  indoorLeadWeeksMin: 6,
  indoorLeadWeeksMax: 8,
};

const directSowPlanting: Planting = {
  id: 'planting-1',
  cultivarId: 'spinach-bloomsdale',
  label: 'Spinach #1',
  quantity: 20,
  sowDate: '2025-03-15',
  harvestStart: '2025-04-29',
  harvestEnd: '2025-05-20',
  method: 'direct',
  status: 'planned',
  successionNumber: 1,
  createdAt: '2025-01-01T00:00:00Z',
};

const transplantPlanting: Planting = {
  id: 'planting-2',
  cultivarId: 'tomato-cherokee',
  label: 'Tomato #1',
  quantity: 6,
  sowDate: '2025-03-01',
  transplantDate: '2025-05-15',
  harvestStart: '2025-08-03',
  harvestEnd: '2025-10-15',
  method: 'transplant',
  status: 'planned',
  successionNumber: 1,
  createdAt: '2025-01-01T00:00:00Z',
};

// ============================================
// generateTasksFromPlanting
// ============================================

describe('generateTasksFromPlanting', () => {
  describe('direct sow planting', () => {
    it('generates sow_direct task', () => {
      const tasks = generateTasksFromPlanting(directSowPlanting, baseCultivar);
      const sowTask = tasks.find((t) => t.type === 'sow_direct');

      expect(sowTask).toBeDefined();
      expect(sowTask?.date).toBe('2025-03-15');
      expect(sowTask?.title).toBe('Direct sow Spinach #1');
      expect(sowTask?.description).toBe('Sow 20 seeds outdoors');
    });

    it('generates harvest_start task', () => {
      const tasks = generateTasksFromPlanting(directSowPlanting, baseCultivar);
      const harvestTask = tasks.find((t) => t.type === 'harvest_start');

      expect(harvestTask).toBeDefined();
      expect(harvestTask?.date).toBe('2025-04-29');
      expect(harvestTask?.title).toBe('Begin harvesting Spinach #1');
      expect(harvestTask?.description).toContain('May 20');
    });

    it('does not generate transplant tasks', () => {
      const tasks = generateTasksFromPlanting(directSowPlanting, baseCultivar);

      expect(tasks.find((t) => t.type === 'sow_indoor')).toBeUndefined();
      expect(tasks.find((t) => t.type === 'harden_off')).toBeUndefined();
      expect(tasks.find((t) => t.type === 'transplant')).toBeUndefined();
    });

    it('generates exactly 2 tasks', () => {
      const tasks = generateTasksFromPlanting(directSowPlanting, baseCultivar);
      expect(tasks).toHaveLength(2);
    });
  });

  describe('transplant planting', () => {
    it('generates sow_indoor task', () => {
      const tasks = generateTasksFromPlanting(
        transplantPlanting,
        transplantCultivar
      );
      const sowTask = tasks.find((t) => t.type === 'sow_indoor');

      expect(sowTask).toBeDefined();
      expect(sowTask?.date).toBe('2025-03-01');
      expect(sowTask?.title).toBe('Start Tomato #1 indoors');
      expect(sowTask?.description).toBe('Sow 6 seeds');
    });

    it('generates harden_off task 7 days before transplant', () => {
      const tasks = generateTasksFromPlanting(
        transplantPlanting,
        transplantCultivar
      );
      const hardenTask = tasks.find((t) => t.type === 'harden_off');

      expect(hardenTask).toBeDefined();
      expect(hardenTask?.date).toBe('2025-05-08'); // 7 days before 2025-05-15
      expect(hardenTask?.title).toBe('Harden off Tomato #1');
    });

    it('generates transplant task', () => {
      const tasks = generateTasksFromPlanting(
        transplantPlanting,
        transplantCultivar
      );
      const transplantTask = tasks.find((t) => t.type === 'transplant');

      expect(transplantTask).toBeDefined();
      expect(transplantTask?.date).toBe('2025-05-15');
      expect(transplantTask?.title).toBe('Transplant Tomato #1');
      expect(transplantTask?.description).toBe('Plant out 6 seedlings');
    });

    it('generates harvest_start task', () => {
      const tasks = generateTasksFromPlanting(
        transplantPlanting,
        transplantCultivar
      );
      const harvestTask = tasks.find((t) => t.type === 'harvest_start');

      expect(harvestTask).toBeDefined();
      expect(harvestTask?.date).toBe('2025-08-03');
    });

    it('generates exactly 4 tasks', () => {
      const tasks = generateTasksFromPlanting(
        transplantPlanting,
        transplantCultivar
      );
      expect(tasks).toHaveLength(4);
    });
  });

  describe('sowDateOverride', () => {
    it('uses sowDateOverride when present', () => {
      const plantingWithOverride: Planting = {
        ...directSowPlanting,
        sowDateOverride: '2025-03-10',
      };

      const tasks = generateTasksFromPlanting(
        plantingWithOverride,
        baseCultivar
      );
      const sowTask = tasks.find((t) => t.type === 'sow_direct');

      expect(sowTask?.date).toBe('2025-03-10');
    });
  });

  describe('task IDs', () => {
    it('generates unique composite IDs', () => {
      const tasks = generateTasksFromPlanting(
        transplantPlanting,
        transplantCultivar
      );

      expect(tasks.find((t) => t.type === 'sow_indoor')?.id).toBe(
        'planting-2-sow_indoor'
      );
      expect(tasks.find((t) => t.type === 'harden_off')?.id).toBe(
        'planting-2-harden_off'
      );
      expect(tasks.find((t) => t.type === 'transplant')?.id).toBe(
        'planting-2-transplant'
      );
      expect(tasks.find((t) => t.type === 'harvest_start')?.id).toBe(
        'planting-2-harvest_start'
      );
    });
  });
});

// ============================================
// generateAllTasks
// ============================================

describe('generateAllTasks', () => {
  it('generates tasks for all plantings', () => {
    const plantings = [directSowPlanting, transplantPlanting];
    const cultivars = [baseCultivar, transplantCultivar];

    const tasks = generateAllTasks(plantings, cultivars);

    // 2 tasks from direct sow + 4 tasks from transplant = 6 total
    expect(tasks).toHaveLength(6);
  });

  it('skips plantings with missing cultivars', () => {
    const plantings = [directSowPlanting];
    const cultivars: Cultivar[] = []; // No matching cultivar

    const tasks = generateAllTasks(plantings, cultivars);

    expect(tasks).toHaveLength(0);
  });

  it('handles empty plantings array', () => {
    const tasks = generateAllTasks([], [baseCultivar]);
    expect(tasks).toHaveLength(0);
  });
});

// ============================================
// groupTasksByWeek
// ============================================

describe('groupTasksByWeek', () => {
  const createTask = (date: string, id: string): Task => ({
    id,
    plantingId: 'p1',
    cultivarId: 'c1',
    type: 'sow_direct',
    date,
    title: 'Test task',
    completed: false,
  });

  it('groups tasks by week (Monday start)', () => {
    // 2025-03-10 is a Monday
    const tasks: Task[] = [
      createTask('2025-03-10', 't1'), // Monday
      createTask('2025-03-12', 't2'), // Wednesday same week
      createTask('2025-03-17', 't3'), // Monday next week
    ];

    const grouped = groupTasksByWeek(tasks);

    expect(grouped.size).toBe(2);
    expect(grouped.get('2025-03-10')).toHaveLength(2);
    expect(grouped.get('2025-03-17')).toHaveLength(1);
  });

  it('handles Sunday correctly (belongs to previous week)', () => {
    // 2025-03-16 is a Sunday, should group with week starting 2025-03-10
    const tasks: Task[] = [
      createTask('2025-03-10', 't1'), // Monday
      createTask('2025-03-16', 't2'), // Sunday (same week)
    ];

    const grouped = groupTasksByWeek(tasks);

    expect(grouped.size).toBe(1);
    expect(grouped.get('2025-03-10')).toHaveLength(2);
  });

  it('sorts tasks within each week by date', () => {
    const tasks: Task[] = [
      createTask('2025-03-14', 't1'), // Friday
      createTask('2025-03-10', 't2'), // Monday
      createTask('2025-03-12', 't3'), // Wednesday
    ];

    const grouped = groupTasksByWeek(tasks);
    const weekTasks = grouped.get('2025-03-10');

    expect(weekTasks?.[0].date).toBe('2025-03-10');
    expect(weekTasks?.[1].date).toBe('2025-03-12');
    expect(weekTasks?.[2].date).toBe('2025-03-14');
  });

  it('returns empty map for empty tasks array', () => {
    const grouped = groupTasksByWeek([]);
    expect(grouped.size).toBe(0);
  });

  it('sorts by task type priority when dates are equal', () => {
    const tasks: Task[] = [
      { ...createTask('2025-03-10', 't1'), type: 'harvest_start' }, // priority 4
      { ...createTask('2025-03-10', 't2'), type: 'sow_direct' }, // priority 1
      { ...createTask('2025-03-10', 't3'), type: 'transplant' }, // priority 3
    ];

    const grouped = groupTasksByWeek(tasks);
    const weekTasks = grouped.get('2025-03-10');

    expect(weekTasks?.[0].type).toBe('sow_direct');
    expect(weekTasks?.[1].type).toBe('transplant');
    expect(weekTasks?.[2].type).toBe('harvest_start');
  });
});
