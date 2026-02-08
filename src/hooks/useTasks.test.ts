import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTasks } from './useTasks';
import type { Planting, Cultivar, TaskCompletion } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createPlanting = (overrides: Partial<Planting> = {}): Planting => ({
  id: 'planting-1',
  cultivarId: 'spinach-1',
  label: 'Spinach #1',
  quantity: 12,
  sowDate: '2025-04-15',
  harvestStart: '2025-05-25',
  harvestEnd: '2025-06-15',
  method: 'direct',
  status: 'planned',
  successionNumber: 1,
  createdAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const createTransplantPlanting = (overrides: Partial<Planting> = {}): Planting => ({
  id: 'planting-2',
  cultivarId: 'tomato-1',
  label: 'Tomato #1',
  quantity: 6,
  sowDate: '2025-03-15',
  transplantDate: '2025-05-15',
  harvestStart: '2025-07-15',
  harvestEnd: '2025-09-30',
  method: 'transplant',
  status: 'planned',
  successionNumber: 1,
  createdAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'spinach-1',
  crop: 'Spinach',
  variety: 'Bloomsdale',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 40,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  ...overrides,
});

const createCompletion = (overrides: Partial<TaskCompletion> = {}): TaskCompletion => ({
  id: 'planting-1-sow_direct',
  plantingId: 'planting-1',
  type: 'sow_direct',
  completed: true,
  completedAt: '2025-04-15T10:00:00Z',
  ...overrides,
});

// ============================================
// Mock Setup
// ============================================

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const setupMockWithCompletions = (completions: TaskCompletion[]) => {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(completions),
    })
    .mockResolvedValue({ ok: true });
};

// ============================================
// Tests
// ============================================

describe('useTasks', () => {
  describe('task generation', () => {
    it('generates tasks from direct sow planting', async () => {
      setupMockWithCompletions([]);
      const planting = createPlanting({ id: 'p1', method: 'direct' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tasks).toContainEqual(
        expect.objectContaining({
          id: 'p1-sow_direct',
          type: 'sow_direct',
          plantingId: 'p1',
        })
      );
      expect(result.current.tasks).toContainEqual(
        expect.objectContaining({
          id: 'p1-harvest_start',
          type: 'harvest_start',
          plantingId: 'p1',
        })
      );
    });

    it('generates tasks from transplant planting', async () => {
      setupMockWithCompletions([]);
      const planting = createTransplantPlanting({ id: 'p2' });
      const cultivar = createCultivar({
        id: 'tomato-1',
        sowMethod: 'transplant',
      });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const taskTypes = result.current.tasks.map((t) => t.type);

      expect(taskTypes).toContain('sow_indoor');
      expect(taskTypes).toContain('harden_off');
      expect(taskTypes).toContain('transplant');
      expect(taskTypes).toContain('harvest_start');
    });

    it('only generates harvest task for perennials', async () => {
      setupMockWithCompletions([]);
      const planting = createPlanting({ id: 'p3', cultivarId: 'asparagus-1' });
      const cultivar = createCultivar({
        id: 'asparagus-1',
        crop: 'Asparagus',
        isPerennial: true,
      });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].type).toBe('harvest_start');
    });

    it('generates tasks for multiple plantings', async () => {
      setupMockWithCompletions([]);
      const plantings = [
        createPlanting({ id: 'p1', cultivarId: 'spinach-1' }),
        createPlanting({ id: 'p2', cultivarId: 'spinach-1' }),
      ];
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks(plantings, [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const p1Tasks = result.current.tasks.filter((t) => t.plantingId === 'p1');
      const p2Tasks = result.current.tasks.filter((t) => t.plantingId === 'p2');

      expect(p1Tasks.length).toBeGreaterThan(0);
      expect(p2Tasks.length).toBeGreaterThan(0);
    });
  });

  describe('completion state', () => {
    it('merges completion state with generated tasks', async () => {
      const completion = createCompletion({
        id: 'p1-sow_direct',
        completed: true,
        completedAt: '2025-04-15T10:00:00Z',
      });
      setupMockWithCompletions([completion]);

      const planting = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const sowTask = result.current.tasks.find((t) => t.id === 'p1-sow_direct');

      expect(sowTask?.completed).toBe(true);
      expect(sowTask?.completedAt).toBe('2025-04-15T10:00:00Z');
    });

    it('defaults to not completed when no completion record', async () => {
      setupMockWithCompletions([]);
      const planting = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const allNotCompleted = result.current.tasks.every((t) => !t.completed);
      expect(allNotCompleted).toBe(true);
    });
  });

  describe('task sorting', () => {
    it('sorts tasks by date', async () => {
      setupMockWithCompletions([]);
      const plantings = [
        createPlanting({ id: 'p1', sowDate: '2025-05-01', harvestStart: '2025-06-15' }),
        createPlanting({ id: 'p2', sowDate: '2025-04-01', harvestStart: '2025-05-15' }),
      ];
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks(plantings, [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const dates = result.current.tasks.map((t) => t.date);
      const sortedDates = [...dates].sort();

      expect(dates).toEqual(sortedDates);
    });
  });

  describe('tasksByWeek', () => {
    it('groups tasks by week', async () => {
      setupMockWithCompletions([]);
      // Create plantings with sow dates in different weeks
      const plantings = [
        createPlanting({ id: 'p1', sowDate: '2025-04-07' }), // Week of Apr 7
        createPlanting({ id: 'p2', sowDate: '2025-04-08' }), // Same week
        createPlanting({ id: 'p3', sowDate: '2025-04-14' }), // Next week
      ];
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks(plantings, [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tasksByWeek).toBeInstanceOf(Map);
      expect(result.current.tasksByWeek.size).toBeGreaterThan(0);
    });

    it('returns empty map when no tasks', async () => {
      setupMockWithCompletions([]);

      const { result } = renderHook(() => useTasks([], []));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tasksByWeek.size).toBe(0);
    });
  });

  describe('toggleTaskComplete', () => {
    it('toggles task from incomplete to complete', async () => {
      setupMockWithCompletions([]);
      const planting = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleTaskComplete('p1-sow_direct');
      });

      // Check that save was called with completion data
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as TaskCompletion[];

      expect(savedData).toContainEqual(
        expect.objectContaining({
          id: 'p1-sow_direct',
          completed: true,
        })
      );
    });

    it('toggles task from complete to incomplete', async () => {
      const completion = createCompletion({
        id: 'p1-sow_direct',
        completed: true,
      });
      setupMockWithCompletions([completion]);

      const planting = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleTaskComplete('p1-sow_direct');
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as TaskCompletion[];

      const updatedCompletion = savedData.find((c) => c.id === 'p1-sow_direct');
      expect(updatedCompletion?.completed).toBe(false);
    });

    it('sets completedAt when completing task', async () => {
      setupMockWithCompletions([]);
      const planting = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleTaskComplete('p1-sow_direct');
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as TaskCompletion[];

      const completion = savedData.find((c) => c.id === 'p1-sow_direct');
      expect(completion?.completedAt).toBeDefined();
    });

    it('clears completedAt when uncompleting task', async () => {
      const completion = createCompletion({
        id: 'p1-sow_direct',
        completed: true,
        completedAt: '2025-04-15T10:00:00Z',
      });
      setupMockWithCompletions([completion]);

      const planting = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleTaskComplete('p1-sow_direct');
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as TaskCompletion[];

      const updatedCompletion = savedData.find((c) => c.id === 'p1-sow_direct');
      expect(updatedCompletion?.completedAt).toBeUndefined();
    });

    it('does nothing for unknown task id', async () => {
      setupMockWithCompletions([]);
      const planting = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result } = renderHook(() => useTasks([planting], [cultivar]));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const callCountBefore = mockFetch.mock.calls.length;

      await act(async () => {
        await result.current.toggleTaskComplete('unknown-task');
      });

      // Should not have made additional fetch calls
      expect(mockFetch.mock.calls.length).toBe(callCountBefore);
    });
  });

  describe('loading and error states', () => {
    it('returns loading state', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useTasks([], []));

      expect(result.current.loading).toBe(true);
    });

    it('returns error state', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { result } = renderHook(() => useTasks([], []));

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch tasks');
      });
    });
  });

  describe('reactivity', () => {
    it('regenerates tasks when plantings change', async () => {
      setupMockWithCompletions([]);
      const planting1 = createPlanting({ id: 'p1' });
      const cultivar = createCultivar({ id: 'spinach-1' });

      const { result, rerender } = renderHook(
        ({ plantings, cultivars }) => useTasks(plantings, cultivars),
        {
          initialProps: {
            plantings: [planting1],
            cultivars: [cultivar],
          },
        }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialTaskCount = result.current.tasks.length;

      // Add another planting
      const planting2 = createPlanting({ id: 'p2' });
      rerender({
        plantings: [planting1, planting2],
        cultivars: [cultivar],
      });

      expect(result.current.tasks.length).toBeGreaterThan(initialTaskCount);
    });
  });
});
