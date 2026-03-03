import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePlacements } from './usePlacements';
import type { PlantingPlacement } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createPlacement = (overrides: Partial<PlantingPlacement> = {}): PlantingPlacement => ({
  id: 'placement-1',
  plantingId: 'planting-1',
  bedId: 'bed-1',
  xCm: 10,
  yCm: 10,
  spacingCm: 30,
  quantity: 6,
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

const setupMockWithData = (data: PlantingPlacement[]) => {
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

describe('usePlacements', () => {
  describe('data loading', () => {
    it('returns placements from useDataFile', async () => {
      const placements = [
        createPlacement({ id: 'p1' }),
        createPlacement({ id: 'p2' }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.placements).toEqual(placements);
    });

    it('fetches from placements collection', async () => {
      setupMockWithData([]);

      renderHook(() => usePlacements());

      expect(mockFetch).toHaveBeenCalledWith('/api/data/placements');
    });
  });

  describe('addPlacement', () => {
    it('adds placement with generated id', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let addedPlacement: PlantingPlacement | undefined;
      await act(async () => {
        addedPlacement = await result.current.addPlacement({
          plantingId: 'planting-1',
          bedId: 'bed-1',
          xCm: 20,
          yCm: 30,
          spacingCm: 25,
          quantity: 8,
        });
      });

      expect(addedPlacement?.id).toBe('new-uuid-123');
      expect(addedPlacement?.plantingId).toBe('planting-1');
      expect(addedPlacement?.quantity).toBe(8);
    });

    it('persists the new placement', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addPlacement({
          plantingId: 'planting-1',
          bedId: 'bed-1',
          xCm: 20,
          yCm: 30,
          spacingCm: 25,
          quantity: 8,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/data/placements',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('updatePlacement', () => {
    it('updates placement by id', async () => {
      const placement = createPlacement({ id: 'p1', xCm: 10 });
      setupMockWithData([placement]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(1);
      });

      await act(async () => {
        await result.current.updatePlacement('p1', { xCm: 50 });
      });

      expect(result.current.placements[0].xCm).toBe(50);
    });

    it('preserves other fields when updating', async () => {
      const placement = createPlacement({ id: 'p1', xCm: 10, yCm: 20, quantity: 6 });
      setupMockWithData([placement]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updatePlacement('p1', { xCm: 100 });
      });

      const updated = result.current.placements[0];
      expect(updated.xCm).toBe(100);
      expect(updated.yCm).toBe(20);
      expect(updated.quantity).toBe(6);
    });
  });

  describe('deletePlacement', () => {
    it('removes placement by id', async () => {
      const placements = [
        createPlacement({ id: 'p1' }),
        createPlacement({ id: 'p2' }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deletePlacement('p1');
      });

      expect(result.current.placements).toHaveLength(1);
      expect(result.current.placements[0].id).toBe('p2');
    });
  });

  describe('getPlacementsForBed', () => {
    it('filters placements by bedId', async () => {
      const placements = [
        createPlacement({ id: 'p1', bedId: 'bed-1' }),
        createPlacement({ id: 'p2', bedId: 'bed-2' }),
        createPlacement({ id: 'p3', bedId: 'bed-1' }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(3);
      });

      const bed1Placements = result.current.getPlacementsForBed('bed-1');

      expect(bed1Placements).toHaveLength(2);
      expect(bed1Placements.every((p) => p.bedId === 'bed-1')).toBe(true);
    });

    it('returns empty array for bed with no placements', async () => {
      setupMockWithData([createPlacement({ bedId: 'bed-1' })]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const placements = result.current.getPlacementsForBed('bed-unknown');

      expect(placements).toEqual([]);
    });
  });

  describe('getPlacementForPlanting', () => {
    it('returns first placement for a planting', async () => {
      const placements = [
        createPlacement({ id: 'p1', plantingId: 'planting-1' }),
        createPlacement({ id: 'p2', plantingId: 'planting-2' }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(2);
      });

      const placement = result.current.getPlacementForPlanting('planting-1');

      expect(placement?.id).toBe('p1');
    });

    it('returns undefined for planting with no placement', async () => {
      setupMockWithData([createPlacement({ plantingId: 'planting-1' })]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const placement = result.current.getPlacementForPlanting('unknown');

      expect(placement).toBeUndefined();
    });
  });

  describe('getPlacementsForPlanting', () => {
    it('returns all placements for a planting (split placements)', async () => {
      // A planting can be split across multiple beds
      const placements = [
        createPlacement({ id: 'p1', plantingId: 'planting-1', bedId: 'bed-1', quantity: 4 }),
        createPlacement({ id: 'p2', plantingId: 'planting-1', bedId: 'bed-2', quantity: 4 }),
        createPlacement({ id: 'p3', plantingId: 'planting-2', bedId: 'bed-1', quantity: 6 }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(3);
      });

      const splitPlacements = result.current.getPlacementsForPlanting('planting-1');

      expect(splitPlacements).toHaveLength(2);
      expect(splitPlacements.every((p) => p.plantingId === 'planting-1')).toBe(true);
    });

    it('returns empty array for unplaced planting', async () => {
      setupMockWithData([createPlacement({ plantingId: 'other' })]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const placements = result.current.getPlacementsForPlanting('unplaced');

      expect(placements).toEqual([]);
    });
  });

  describe('deleteAllForPlantings', () => {
    it('removes all placements matching the given planting IDs', async () => {
      const placements = [
        createPlacement({ id: 'p1', plantingId: 'planting-1' }),
        createPlacement({ id: 'p2', plantingId: 'planting-2' }),
        createPlacement({ id: 'p3', plantingId: 'planting-1' }),
        createPlacement({ id: 'p4', plantingId: 'planting-3' }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(4);
      });

      await act(async () => {
        await result.current.deleteAllForPlantings(new Set(['planting-1', 'planting-3']));
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as PlantingPlacement[];

      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('p2');
    });

    it('does not save when no placements match', async () => {
      const placements = [
        createPlacement({ id: 'p1', plantingId: 'planting-1' }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(1);
      });

      const fetchCallCount = mockFetch.mock.calls.length;

      await act(async () => {
        await result.current.deleteAllForPlantings(new Set(['no-match']));
      });

      // No additional fetch call should have been made
      expect(mockFetch.mock.calls.length).toBe(fetchCallCount);
    });

    it('handles empty planting ID set', async () => {
      setupMockWithData([createPlacement({ id: 'p1' })]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const fetchCallCount = mockFetch.mock.calls.length;

      await act(async () => {
        await result.current.deleteAllForPlantings(new Set());
      });

      expect(mockFetch.mock.calls.length).toBe(fetchCallCount);
    });
  });

  describe('bulkUpdatePlacements', () => {
    it('updates multiple placements at once', async () => {
      const placements = [
        createPlacement({ id: 'p1', xCm: 10 }),
        createPlacement({ id: 'p2', xCm: 20 }),
        createPlacement({ id: 'p3', xCm: 30 }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(3);
      });

      const updatedPlacements = [
        { ...placements[0], xCm: 100 },
        { ...placements[1], xCm: 200 },
      ];

      await act(async () => {
        await result.current.bulkUpdatePlacements(updatedPlacements);
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as PlantingPlacement[];

      expect(savedData).toHaveLength(3);
      expect(savedData.find((p) => p.id === 'p1')?.xCm).toBe(100);
      expect(savedData.find((p) => p.id === 'p2')?.xCm).toBe(200);
      expect(savedData.find((p) => p.id === 'p3')?.xCm).toBe(30); // Unchanged
    });

    it('preserves placements not in update list', async () => {
      const placements = [
        createPlacement({ id: 'p1', plantingId: 'a' }),
        createPlacement({ id: 'p2', plantingId: 'b' }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(2);
      });

      await act(async () => {
        await result.current.bulkUpdatePlacements([
          { ...placements[0], plantingId: 'updated' },
        ]);
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as PlantingPlacement[];

      expect(savedData).toHaveLength(2);
      expect(savedData.find((p) => p.id === 'p2')?.plantingId).toBe('b');
    });

    it('handles empty update list', async () => {
      const placements = [createPlacement({ id: 'p1' })];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.bulkUpdatePlacements([]);
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body);

      expect(savedData).toHaveLength(1);
    });
  });

  describe('split placements workflow', () => {
    it('supports creating multiple placements for same planting', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Add first placement (6 of 12 plants)
      mockRandomUUID.mockReturnValueOnce('placement-a');
      await act(async () => {
        await result.current.addPlacement({
          plantingId: 'tomato-planting',
          bedId: 'bed-1',
          xCm: 10,
          yCm: 10,
          spacingCm: 60,
          quantity: 6,
        });
      });

      // Add second placement (remaining 6 plants)
      mockRandomUUID.mockReturnValueOnce('placement-b');
      await act(async () => {
        await result.current.addPlacement({
          plantingId: 'tomato-planting',
          bedId: 'bed-2',
          xCm: 10,
          yCm: 10,
          spacingCm: 60,
          quantity: 6,
        });
      });

      const allPlacements = result.current.getPlacementsForPlanting('tomato-planting');
      expect(allPlacements).toHaveLength(2);

      const totalQuantity = allPlacements.reduce((sum, p) => sum + p.quantity, 0);
      expect(totalQuantity).toBe(12);
    });

    it('allows updating quantity of split placements', async () => {
      const placements = [
        createPlacement({ id: 'p1', plantingId: 'tomato', quantity: 6 }),
        createPlacement({ id: 'p2', plantingId: 'tomato', quantity: 6 }),
      ];
      setupMockWithData(placements);

      const { result } = renderHook(() => usePlacements());

      await waitFor(() => {
        expect(result.current.placements).toHaveLength(2);
      });

      // Move 2 plants from p1 to p2
      await act(async () => {
        await result.current.bulkUpdatePlacements([
          { ...placements[0], quantity: 4 },
          { ...placements[1], quantity: 8 },
        ]);
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body) as PlantingPlacement[];

      const p1 = savedData.find((p) => p.id === 'p1');
      const p2 = savedData.find((p) => p.id === 'p2');

      expect(p1?.quantity).toBe(4);
      expect(p2?.quantity).toBe(8);
    });
  });
});
