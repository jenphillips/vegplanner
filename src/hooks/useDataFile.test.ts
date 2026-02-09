import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDataFile } from './useDataFile';

// ============================================
// Test Fixtures
// ============================================

type TestItem = {
  id: string;
  name: string;
  value: number;
};

const createTestItem = (overrides: Partial<TestItem> = {}): TestItem => ({
  id: 'test-1',
  name: 'Test Item',
  value: 42,
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

// ============================================
// Tests
// ============================================

describe('useDataFile', () => {
  describe('initial data loading', () => {
    it('fetches data on mount', async () => {
      const testData = [createTestItem()];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testData),
      });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      expect(mockFetch).toHaveBeenCalledWith('/api/data/plantings');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(testData);
      expect(result.current.error).toBeNull();
    });

    it('sets loading to true while fetching', () => {
      mockFetch.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      expect(result.current.loading).toBe(true);
    });

    it('sets error when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch plantings');
      expect(result.current.data).toEqual([]);
    });

    it('sets error when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.data).toEqual([]);
    });

    it('fetches correct collection endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      renderHook(() => useDataFile<TestItem>('garden-beds'));

      expect(mockFetch).toHaveBeenCalledWith('/api/data/garden-beds');
    });
  });

  describe('refetch', () => {
    it('refetches data when called', async () => {
      const initialData = [createTestItem({ id: '1', name: 'Initial' })];
      const updatedData = [createTestItem({ id: '1', name: 'Updated' })];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(initialData),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(updatedData),
        });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.data).toEqual(initialData);
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.data).toEqual(updatedData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('save', () => {
    it('saves data via POST request', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newData = [createTestItem({ id: '1' }), createTestItem({ id: '2' })];

      await act(async () => {
        await result.current.save(newData);
      });

      expect(mockFetch).toHaveBeenLastCalledWith('/api/data/plantings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData),
      });
    });

    it('updates local data after save', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newData = [createTestItem({ id: '1', name: 'Saved' })];

      await act(async () => {
        await result.current.save(newData);
      });

      expect(result.current.data).toEqual(newData);
    });

    it('throws and sets error when save fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.save([createTestItem()]);
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect((thrownError as Error).message).toBe('Failed to save plantings');
      expect(result.current.error).toBe('Failed to save plantings');
    });
  });

  describe('add', () => {
    it('adds item to data and persists', async () => {
      const existingItem = createTestItem({ id: '1' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([existingItem]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.data).toEqual([existingItem]);
      });

      const newItem = createTestItem({ id: '2', name: 'New Item' });

      await act(async () => {
        await result.current.add(newItem);
      });

      expect(result.current.data).toContainEqual(existingItem);
      expect(result.current.data).toContainEqual(newItem);
      expect(result.current.data).toHaveLength(2);
    });

    it('sends POST with combined data', async () => {
      const existingItem = createTestItem({ id: '1' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([existingItem]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newItem = createTestItem({ id: '2' });

      await act(async () => {
        await result.current.add(newItem);
      });

      expect(mockFetch).toHaveBeenLastCalledWith('/api/data/plantings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([existingItem, newItem]),
      });
    });
  });

  describe('update', () => {
    it('updates item in data', async () => {
      const item1 = createTestItem({ id: '1', name: 'Original' });
      const item2 = createTestItem({ id: '2', name: 'Other' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([item1, item2]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.data).toHaveLength(2);
      });

      await act(async () => {
        await result.current.update('1', { name: 'Updated' });
      });

      expect(result.current.data.find((i) => i.id === '1')?.name).toBe('Updated');
      expect(result.current.data.find((i) => i.id === '2')?.name).toBe('Other');
    });

    it('preserves other fields when updating', async () => {
      const item = createTestItem({ id: '1', name: 'Original', value: 100 });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([item]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.update('1', { name: 'Updated' });
      });

      const updated = result.current.data.find((i) => i.id === '1');
      expect(updated?.name).toBe('Updated');
      expect(updated?.value).toBe(100);
    });
  });

  describe('remove', () => {
    it('removes item from data', async () => {
      const item1 = createTestItem({ id: '1' });
      const item2 = createTestItem({ id: '2' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([item1, item2]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.data).toHaveLength(2);
      });

      await act(async () => {
        await result.current.remove('1');
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0].id).toBe('2');
    });

    it('sends POST with filtered data', async () => {
      const item1 = createTestItem({ id: '1' });
      const item2 = createTestItem({ id: '2' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([item1, item2]),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.remove('1');
      });

      expect(mockFetch).toHaveBeenLastCalledWith('/api/data/plantings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([item2]),
      });
    });
  });

  describe('error handling', () => {
    it('clears error on successful operation', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const { result } = renderHook(() => useDataFile<TestItem>('plantings'));

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch plantings');
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('collection types', () => {
    it.each([
      'plantings',
      'tasks',
      'garden-beds',
      'placements',
      'plans',
    ] as const)('works with %s collection', async (collection) => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      renderHook(() => useDataFile<TestItem>(collection));

      expect(mockFetch).toHaveBeenCalledWith(`/api/data/${collection}`);
    });
  });
});
