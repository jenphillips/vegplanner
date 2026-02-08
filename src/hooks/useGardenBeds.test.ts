import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGardenBeds } from './useGardenBeds';
import type { GardenBed } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createGardenBed = (overrides: Partial<GardenBed> = {}): GardenBed => ({
  id: 'bed-1',
  name: 'Main Bed',
  shape: 'bed',
  widthCm: 120,
  lengthCm: 240,
  sunExposure: 'full',
  notes: 'Near the shed',
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

const setupMockWithData = (data: GardenBed[]) => {
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

describe('useGardenBeds', () => {
  describe('data loading', () => {
    it('returns beds from useDataFile', async () => {
      const beds = [
        createGardenBed({ id: 'b1', name: 'Bed 1' }),
        createGardenBed({ id: 'b2', name: 'Bed 2' }),
      ];
      setupMockWithData(beds);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.beds).toEqual(beds);
    });

    it('fetches from garden-beds collection', async () => {
      setupMockWithData([]);

      renderHook(() => useGardenBeds());

      expect(mockFetch).toHaveBeenCalledWith('/api/data/garden-beds');
    });

    it('returns loading state', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useGardenBeds());

      expect(result.current.loading).toBe(true);
    });

    it('returns error state', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch garden-beds');
      });
    });
  });

  describe('addBed', () => {
    it('adds bed with generated id', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let addedBed: GardenBed | undefined;
      await act(async () => {
        addedBed = await result.current.addBed({
          name: 'New Bed',
          shape: 'bed',
          widthCm: 100,
          lengthCm: 200,
          sunExposure: 'partial',
        });
      });

      expect(addedBed?.id).toBe('new-uuid-123');
      expect(addedBed?.name).toBe('New Bed');
      expect(addedBed?.widthCm).toBe(100);
    });

    it('persists the new bed', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addBed({
          name: 'New Bed',
          shape: 'bed',
          widthCm: 100,
          lengthCm: 200,
          sunExposure: 'full',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/data/garden-beds',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('supports container shape', async () => {
      setupMockWithData([]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let addedBed: GardenBed | undefined;
      await act(async () => {
        addedBed = await result.current.addBed({
          name: 'Pot',
          shape: 'container',
          widthCm: 40, // diameter for container
          lengthCm: 40,
          sunExposure: 'full',
        });
      });

      expect(addedBed?.shape).toBe('container');
      expect(addedBed?.widthCm).toBe(40);
    });
  });

  describe('updateBed', () => {
    it('updates bed by id', async () => {
      const bed = createGardenBed({ id: 'b1', name: 'Original' });
      setupMockWithData([bed]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.beds).toHaveLength(1);
      });

      await act(async () => {
        await result.current.updateBed('b1', { name: 'Updated' });
      });

      expect(result.current.beds[0].name).toBe('Updated');
    });

    it('preserves other fields when updating', async () => {
      const bed = createGardenBed({
        id: 'b1',
        name: 'Original',
        widthCm: 100,
        sunExposure: 'full',
      });
      setupMockWithData([bed]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateBed('b1', { name: 'Updated' });
      });

      const updated = result.current.beds[0];
      expect(updated.name).toBe('Updated');
      expect(updated.widthCm).toBe(100);
      expect(updated.sunExposure).toBe('full');
    });

    it('updates position', async () => {
      const bed = createGardenBed({ id: 'b1', positionX: 0, positionY: 0 });
      setupMockWithData([bed]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateBed('b1', { positionX: 100, positionY: 200 });
      });

      const updated = result.current.beds[0];
      expect(updated.positionX).toBe(100);
      expect(updated.positionY).toBe(200);
    });
  });

  describe('deleteBed', () => {
    it('removes bed by id', async () => {
      const beds = [
        createGardenBed({ id: 'b1' }),
        createGardenBed({ id: 'b2' }),
      ];
      setupMockWithData(beds);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.beds).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteBed('b1');
      });

      expect(result.current.beds).toHaveLength(1);
      expect(result.current.beds[0].id).toBe('b2');
    });

    it('persists deletion', async () => {
      const bed = createGardenBed({ id: 'b1' });
      setupMockWithData([bed]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteBed('b1');
      });

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1].body);

      expect(savedData).toEqual([]);
    });
  });

  describe('bed types', () => {
    it('handles rectangular beds', async () => {
      const bed = createGardenBed({
        shape: 'bed',
        widthCm: 120,
        lengthCm: 240,
      });
      setupMockWithData([bed]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.beds[0].shape).toBe('bed');
      expect(result.current.beds[0].widthCm).toBe(120);
      expect(result.current.beds[0].lengthCm).toBe(240);
    });

    it('handles circular containers', async () => {
      const container = createGardenBed({
        shape: 'container',
        widthCm: 50, // diameter
        lengthCm: 50, // ignored for containers
      });
      setupMockWithData([container]);

      const { result } = renderHook(() => useGardenBeds());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.beds[0].shape).toBe('container');
    });
  });

  describe('sun exposure', () => {
    it.each(['full', 'partial', 'shade'] as const)(
      'supports %s sun exposure',
      async (exposure) => {
        const bed = createGardenBed({ sunExposure: exposure });
        setupMockWithData([bed]);

        const { result } = renderHook(() => useGardenBeds());

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        expect(result.current.beds[0].sunExposure).toBe(exposure);
      }
    );
  });
});
