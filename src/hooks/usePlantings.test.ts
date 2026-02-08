import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePlantings } from './usePlantings';
import type { Planting } from '@/lib/types';

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

// ============================================
// Mock Setup
// ============================================

const mockFetch = vi.fn();
const mockRandomUUID = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });
  mockFetch.mockReset();
  mockRandomUUID.mockReturnValue('new-uuid-123');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper to set up mock with initial data
const setupMockWithData = (data: Planting[]) => {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
    })
    .mockResolvedValue({ ok: true });
};

// ============================================
// Tests
// ============================================

describe('usePlantings', () => {
  describe('data loading', () => {
    it('returns plantings from useDataFile', async () => {
      const plantings = [
        createPlanting({ id: '1', label: 'Spinach #1' }),
        createPlanting({ id: '2', label: 'Spinach #2' }),
      ];
      setupMockWithData(plantings);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plantings).toEqual(plantings);
    });

    it('returns loading state', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => usePlantings());

      expect(result.current.loading).toBe(true);
    });

    it('returns error state', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch plantings');
      });
    });
  });

  describe('addPlanting', () => {
    it('adds planting with generated id and createdAt', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newPlanting = {
        cultivarId: 'tomato-1',
        label: 'Tomato #1',
        quantity: 6,
        sowDate: '2025-04-01',
        harvestStart: '2025-07-15',
        harvestEnd: '2025-09-30',
        method: 'transplant' as const,
        status: 'planned' as const,
        successionNumber: 1,
      };

      let addedPlanting: Planting | undefined;
      await act(async () => {
        addedPlanting = await result.current.addPlanting(newPlanting);
      });

      expect(addedPlanting?.id).toBe('new-uuid-123');
      expect(addedPlanting?.createdAt).toBeDefined();
      expect(addedPlanting?.cultivarId).toBe('tomato-1');
    });

    it('persists the new planting', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addPlanting({
          cultivarId: 'tomato-1',
          label: 'Tomato #1',
          quantity: 6,
          sowDate: '2025-04-01',
          harvestStart: '2025-07-15',
          harvestEnd: '2025-09-30',
          method: 'transplant',
          status: 'planned',
          successionNumber: 1,
        });
      });

      // Should have called POST to save
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/data/plantings',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('updatePlanting', () => {
    it('updates planting by id', async () => {
      const planting = createPlanting({ id: 'p1', label: 'Original' });
      setupMockWithData([planting]);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(1);
      });

      await act(async () => {
        await result.current.updatePlanting('p1', { label: 'Updated' });
      });

      expect(result.current.plantings[0].label).toBe('Updated');
    });
  });

  describe('deletePlanting', () => {
    it('removes planting by id', async () => {
      const plantings = [
        createPlanting({ id: 'p1' }),
        createPlanting({ id: 'p2' }),
      ];
      setupMockWithData(plantings);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deletePlanting('p1');
      });

      expect(result.current.plantings).toHaveLength(1);
      expect(result.current.plantings[0].id).toBe('p2');
    });
  });

  describe('getPlantingsForCultivar', () => {
    it('filters plantings by cultivarId', async () => {
      const plantings = [
        createPlanting({ id: 'p1', cultivarId: 'spinach-1' }),
        createPlanting({ id: 'p2', cultivarId: 'tomato-1' }),
        createPlanting({ id: 'p3', cultivarId: 'spinach-1' }),
      ];
      setupMockWithData(plantings);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(3);
      });

      const spinachPlantings = result.current.getPlantingsForCultivar('spinach-1');

      expect(spinachPlantings).toHaveLength(2);
      expect(spinachPlantings.every((p) => p.cultivarId === 'spinach-1')).toBe(true);
    });

    it('returns empty array for unknown cultivar', async () => {
      setupMockWithData([createPlanting()]);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const plantings = result.current.getPlantingsForCultivar('unknown');

      expect(plantings).toEqual([]);
    });
  });

  describe('renumberPlantings', () => {
    it('renumbers plantings for a crop in chronological order', async () => {
      // Start with plantings that are out of order by succession number
      const plantings = [
        createPlanting({
          id: 'p1',
          cultivarId: 'spinach-1',
          sowDate: '2025-05-01',
          successionNumber: 1,
        }),
        createPlanting({
          id: 'p2',
          cultivarId: 'spinach-1',
          sowDate: '2025-04-01', // Earlier date but higher succession number
          successionNumber: 2,
        }),
      ];
      setupMockWithData(plantings);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(2);
      });

      await act(async () => {
        await result.current.renumberPlantings('Spinach', 'spinach-1');
      });

      // Verify POST was called with renumbered data
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body);

      // p2 (earlier date) should now be #1, p1 should be #2
      const p2 = savedData.find((p: Planting) => p.id === 'p2');
      const p1 = savedData.find((p: Planting) => p.id === 'p1');

      expect(p2.successionNumber).toBe(1);
      expect(p1.successionNumber).toBe(2);
    });
  });

  describe('updateAndRenumber', () => {
    it('updates planting and renumbers in one operation', async () => {
      const plantings = [
        createPlanting({
          id: 'p1',
          cultivarId: 'spinach-1',
          sowDate: '2025-04-01',
          successionNumber: 1,
        }),
        createPlanting({
          id: 'p2',
          cultivarId: 'spinach-1',
          sowDate: '2025-05-01',
          successionNumber: 2,
        }),
      ];
      setupMockWithData(plantings);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(2);
      });

      // Move p1 to a later date, making it #2
      await act(async () => {
        await result.current.updateAndRenumber(
          'p1',
          { sowDate: '2025-06-01' },
          'Spinach',
          'spinach-1'
        );
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body);

      const p1 = savedData.find((p: Planting) => p.id === 'p1');
      const p2 = savedData.find((p: Planting) => p.id === 'p2');

      // p2 is now first (April), p1 is second (June)
      expect(p2.successionNumber).toBe(1);
      expect(p1.successionNumber).toBe(2);
      expect(p1.sowDate).toBe('2025-06-01');
    });
  });

  describe('addAndRenumber', () => {
    it('adds planting and renumbers all for cultivar', async () => {
      const existingPlanting = createPlanting({
        id: 'p1',
        cultivarId: 'spinach-1',
        sowDate: '2025-05-01',
        successionNumber: 1,
      });
      setupMockWithData([existingPlanting]);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(1);
      });

      // Add a planting with earlier date
      await act(async () => {
        await result.current.addAndRenumber(
          {
            cultivarId: 'spinach-1',
            label: 'Spinach #2',
            sowDate: '2025-04-01', // Earlier than existing
            harvestStart: '2025-05-10',
            harvestEnd: '2025-06-01',
            method: 'direct',
            status: 'planned',
            successionNumber: 0, // Will be renumbered
          },
          'Spinach'
        );
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body);

      // New planting (earlier) should be #1, existing should be #2
      const newPlanting = savedData.find((p: Planting) => p.id === 'new-uuid-123');
      const existingUpdated = savedData.find((p: Planting) => p.id === 'p1');

      expect(newPlanting.successionNumber).toBe(1);
      expect(existingUpdated.successionNumber).toBe(2);
    });

    it('returns the new planting', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let newPlanting: Planting | undefined;
      await act(async () => {
        newPlanting = await result.current.addAndRenumber(
          {
            cultivarId: 'spinach-1',
            label: 'Spinach #1',
            sowDate: '2025-04-01',
            harvestStart: '2025-05-10',
            harvestEnd: '2025-06-01',
            method: 'direct',
            status: 'planned',
            successionNumber: 1,
          },
          'Spinach'
        );
      });

      expect(newPlanting?.id).toBe('new-uuid-123');
      expect(newPlanting?.cultivarId).toBe('spinach-1');
    });
  });

  describe('deleteAllForCultivar', () => {
    it('removes all plantings for a cultivar', async () => {
      const plantings = [
        createPlanting({ id: 'p1', cultivarId: 'spinach-1' }),
        createPlanting({ id: 'p2', cultivarId: 'tomato-1' }),
        createPlanting({ id: 'p3', cultivarId: 'spinach-1' }),
      ];
      setupMockWithData(plantings);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(3);
      });

      await act(async () => {
        await result.current.deleteAllForCultivar('spinach-1');
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body);

      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('p2');
    });

    it('preserves plantings for other cultivars', async () => {
      const plantings = [
        createPlanting({ id: 'p1', cultivarId: 'spinach-1' }),
        createPlanting({ id: 'p2', cultivarId: 'tomato-1' }),
      ];
      setupMockWithData(plantings);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.plantings).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteAllForCultivar('spinach-1');
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body);

      expect(savedData[0].cultivarId).toBe('tomato-1');
    });
  });

  describe('refetch', () => {
    it('exposes refetch from useDataFile', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => usePlantings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });
  });
});
