import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlantingTimeline } from './PlantingTimeline';
import type { Planting, FrostWindow, Climate, Cultivar } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createFrostWindow = (
  lastSpring: string = '2025-05-15',
  firstFall: string = '2025-10-01'
): FrostWindow => ({
  id: 'test-frost',
  lastSpringFrost: lastSpring,
  firstFallFrost: firstFall,
});

const createClimate = (): Climate => ({
  location: 'Test Location',
  coordinates: { lat: 45.0, lon: -75.0 },
  elevation_m: 100,
  source: 'test',
  monthlyAvgC: {
    '1': { tavg_c: -10, tmin_c: -15, tmax_c: -5, soil_avg_c: -2, gdd_base5: 0 },
    '2': { tavg_c: -8, tmin_c: -13, tmax_c: -3, soil_avg_c: -1, gdd_base5: 0 },
    '3': { tavg_c: -2, tmin_c: -7, tmax_c: 3, soil_avg_c: 1, gdd_base5: 0 },
    '4': { tavg_c: 6, tmin_c: 1, tmax_c: 11, soil_avg_c: 5, gdd_base5: 30 },
    '5': { tavg_c: 13, tmin_c: 6, tmax_c: 18, soil_avg_c: 11, gdd_base5: 180 },
    '6': { tavg_c: 18, tmin_c: 11, tmax_c: 23, soil_avg_c: 16, gdd_base5: 400 },
    '7': { tavg_c: 21, tmin_c: 14, tmax_c: 26, soil_avg_c: 19, gdd_base5: 650 },
    '8': { tavg_c: 20, tmin_c: 13, tmax_c: 25, soil_avg_c: 18, gdd_base5: 900 },
    '9': { tavg_c: 15, tmin_c: 8, tmax_c: 20, soil_avg_c: 14, gdd_base5: 1050 },
    '10': { tavg_c: 9, tmin_c: 3, tmax_c: 13, soil_avg_c: 9, gdd_base5: 1150 },
    '11': { tavg_c: 3, tmin_c: -2, tmax_c: 7, soil_avg_c: 4, gdd_base5: 1180 },
    '12': { tavg_c: -6, tmin_c: -11, tmax_c: -1, soil_avg_c: 0, gdd_base5: 1180 },
  },
  lastSpringFrost: {
    earliest: '04-25',
    typical: '05-15',
    latest: '06-01',
    probability10: '04-28',
    probability50: '05-15',
    probability90: '05-28',
  },
  firstFallFrost: {
    earliest: '09-20',
    typical: '10-01',
    latest: '10-15',
    probability10: '09-22',
    probability50: '10-01',
    probability90: '10-12',
  },
  growingSeasonDays: 140,
  annualGDD: 1180,
  notes: 'Test climate data',
});

const createPlanting = (overrides: Partial<Planting> = {}): Planting => ({
  id: 'test-planting-1',
  cultivarId: 'test-cultivar',
  label: 'Test Planting',
  sowDate: '2025-04-15',
  harvestStart: '2025-07-15',
  harvestEnd: '2025-09-15',
  method: 'direct',
  status: 'planned',
  successionNumber: 1,
  createdAt: '2025-01-01',
  ...overrides,
});

const createTransplantPlanting = (overrides: Partial<Planting> = {}): Planting =>
  createPlanting({
    method: 'transplant',
    sowDate: '2025-03-15',
    transplantDate: '2025-05-20',
    harvestStart: '2025-07-20',
    harvestEnd: '2025-09-30',
    ...overrides,
  });

const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'test-cultivar',
  crop: 'Test Crop',
  variety: 'Test Variety',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 60,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  harvestStyle: 'continuous',
  frostSensitive: true,
  ...overrides,
});

const createTransplantCultivar = (overrides: Partial<Cultivar> = {}): Cultivar =>
  createCultivar({
    sowMethod: 'transplant',
    maturityBasis: 'from_transplant',
    indoorLeadWeeksMin: 4,
    indoorLeadWeeksMax: 8,
    transplantAfterLsfDays: 0,
    ...overrides,
  });

const createEitherCultivar = (overrides: Partial<Cultivar> = {}): Cultivar =>
  createCultivar({
    sowMethod: 'either',
    indoorLeadWeeksMin: 4,
    indoorLeadWeeksMax: 6,
    directAfterLsfDays: -7,
    transplantAfterLsfDays: 0,
    ...overrides,
  });

// ============================================
// Tests
// ============================================

describe('PlantingTimeline', () => {
  describe('rendering', () => {
    it('renders timeline track', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
        />
      );

      const track = container.querySelector('[class*="track"]');
      expect(track).toBeInTheDocument();
    });

    it('renders week bands for visual structure', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
        />
      );

      const weekBands = container.querySelectorAll('[class*="weekBand"]');
      expect(weekBands.length).toBeGreaterThan(0);
    });

    it('renders month tick marks', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
        />
      );

      const monthTicks = container.querySelectorAll('[class*="monthTick"]');
      expect(monthTicks.length).toBeGreaterThan(0);
    });

    it('renders sow bar for direct sow planting', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
        />
      );

      const sowBar = container.querySelector('[class*="barSow"]');
      expect(sowBar).toBeInTheDocument();
    });

    it('renders growing bar', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      expect(growingBar).toBeInTheDocument();
    });

    it('renders harvest bar', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
        />
      );

      const harvestBar = container.querySelector('[class*="barHarvest"]');
      expect(harvestBar).toBeInTheDocument();
    });

    it('renders transplant marker for transplant planting', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createTransplantPlanting()}
          frost={createFrostWindow()}
        />
      );

      const transplantMarker = container.querySelector('[class*="markerTransplant"]');
      expect(transplantMarker).toBeInTheDocument();
    });

    it('does not render transplant marker for direct sow planting', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct', transplantDate: undefined })}
          frost={createFrostWindow()}
        />
      );

      const transplantMarker = container.querySelector('[class*="markerTransplant"]');
      expect(transplantMarker).not.toBeInTheDocument();
    });
  });

  describe('frost indicators', () => {
    it('renders frost markers without climate data', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
        />
      );

      const frostMarkers = container.querySelectorAll('[class*="frostMarker"]');
      expect(frostMarkers.length).toBeGreaterThan(0);
    });

    it('renders frost ranges with climate data', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
          climate={createClimate()}
        />
      );

      const frostRanges = container.querySelectorAll('[class*="frostRange"]');
      expect(frostRanges.length).toBeGreaterThan(0);

      const frostTypical = container.querySelectorAll('[class*="frostTypical"]');
      expect(frostTypical.length).toBeGreaterThan(0);
    });
  });

  describe('selected date indicator', () => {
    it('renders selected date indicator when selectedDate provided', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
        />
      );

      const selectedIndicator = container.querySelector('[class*="selectedDateIndicator"]');
      expect(selectedIndicator).toBeInTheDocument();
    });

    it('does not render selected date indicator without selectedDate', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting()}
          frost={createFrostWindow()}
        />
      );

      const selectedIndicator = container.querySelector('[class*="selectedDateIndicator"]');
      expect(selectedIndicator).not.toBeInTheDocument();
    });
  });

  describe('tooltips', () => {
    it('shows sow date in tooltip for direct sow planting', () => {
      const planting = createPlanting({ sowDate: '2025-04-15' });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const sowBar = container.querySelector('[class*="barSow"]');
      expect(sowBar?.getAttribute('title')).toContain('Apr 15');
    });

    it('shows harvest dates in tooltip for harvest bar', () => {
      const planting = createPlanting({
        harvestStart: '2025-07-15',
        harvestEnd: '2025-09-15',
      });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const harvestBar = container.querySelector('[class*="barHarvest"]');
      const title = harvestBar?.getAttribute('title') || '';
      expect(title).toMatch(/Harvest: Jul 15 → Sep 15 \(62d\)/);
    });

    it('shows transplant date in tooltip for transplant marker', () => {
      const planting = createTransplantPlanting({ transplantDate: '2025-05-20' });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const transplantMarker = container.querySelector('[class*="markerTransplant"]');
      expect(transplantMarker?.getAttribute('title')).toContain('Transplant outdoors: May 20');
    });
  });

  describe('direct sow drag functionality', () => {
    it('marks bars as draggable when onShiftPlanting provided', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
          onShiftPlanting={vi.fn()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      expect(growingBar?.className).toContain('Draggable');
    });

    it('does not mark bars as draggable without onShiftPlanting', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      expect(growingBar?.className).not.toContain('Draggable');
    });

    it('adds dragging class during drag', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
          onShiftPlanting={vi.fn()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      expect(growingBar).toBeInTheDocument();

      // Simulate mouse down to start drag
      fireEvent.mouseDown(growingBar!);

      const track = container.querySelector('[class*="track"]');
      expect(track?.className).toContain('Dragging');
    });

    it('shows shift bounds during drag', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
          climate={createClimate()}
          cultivar={createCultivar()}
          onShiftPlanting={vi.fn()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      fireEvent.mouseDown(growingBar!);

      const shiftBounds = container.querySelectorAll('[class*="shiftBounds"]');
      expect(shiftBounds.length).toBeGreaterThan(0);
    });

    it('calls onShiftPlanting on drag completion', () => {
      const onShiftPlanting = vi.fn();
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
          onShiftPlanting={onShiftPlanting}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');

      // Simulate drag sequence
      fireEvent.mouseDown(growingBar!, { clientX: 100 });
      fireEvent.mouseMove(document, { clientX: 200 });
      fireEvent.mouseUp(document);

      expect(onShiftPlanting).toHaveBeenCalledWith('test-planting-1', expect.any(Number));
    });

    it('does not call onShiftPlanting when drag has no shift', () => {
      const onShiftPlanting = vi.fn();
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
          onShiftPlanting={onShiftPlanting}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');

      // Simulate click without movement
      fireEvent.mouseDown(growingBar!, { clientX: 100 });
      fireEvent.mouseUp(document);

      expect(onShiftPlanting).not.toHaveBeenCalled();
    });
  });

  describe('transplant drag functionality', () => {
    it('marks sow bar as draggable for transplant-only crops with onShiftPlanting', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createTransplantPlanting()}
          frost={createFrostWindow()}
          cultivar={createTransplantCultivar()}
          onShiftPlanting={vi.fn()}
        />
      );

      const sowBar = container.querySelector('[class*="barSow"]');
      expect(sowBar?.className).toContain('Draggable');
    });

    it('enters dragging state during transplant-only crop drag', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createTransplantPlanting()}
          frost={createFrostWindow()}
          cultivar={createTransplantCultivar()}
          onShiftPlanting={vi.fn()}
        />
      );

      const sowBar = container.querySelector('[class*="barSow"]');

      fireEvent.mouseDown(sowBar!);

      // Track should have dragging class
      const track = container.querySelector('[class*="track"]');
      expect(track?.className).toContain('Dragging');

      // Clean up drag state
      fireEvent.mouseUp(document);
    });

    it('does not show drag handle for transplant-only crops (uses shift-based drag instead)', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createTransplantPlanting()}
          frost={createFrostWindow()}
          cultivar={createTransplantCultivar()}
          onShiftPlanting={vi.fn()}
        />
      );

      // Drag handle is only for "either" crops in transplant mode (sow date adjustment)
      const dragHandle = container.querySelector('[class*="dragHandle"]');
      expect(dragHandle).not.toBeInTheDocument();
    });

    it('calls onShiftPlanting with shift days on drag completion', () => {
      const onShiftPlanting = vi.fn();
      const { container } = render(
        <PlantingTimeline
          planting={createTransplantPlanting()}
          frost={createFrostWindow()}
          cultivar={createTransplantCultivar()}
          onShiftPlanting={onShiftPlanting}
        />
      );

      const sowBar = container.querySelector('[class*="barSow"]');
      const track = container.querySelector('[class*="track"]');

      // Mock getBoundingClientRect for the track element
      const mockRect = {
        left: 0,
        right: 500,
        width: 500,
        top: 0,
        bottom: 30,
        height: 30,
        x: 0,
        y: 0,
        toJSON: () => {},
      };
      vi.spyOn(track as HTMLElement, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Simulate drag sequence - drag right to shift later
      fireEvent.mouseDown(sowBar!, { clientX: 100 });
      fireEvent.mouseMove(document, { clientX: 200 });
      fireEvent.mouseUp(document);

      expect(onShiftPlanting).toHaveBeenCalledWith(
        'test-planting-1',
        expect.any(Number) // shift days
      );
    });
  });

  describe('either crop shift functionality', () => {
    it('uses shift-based drag for either crops in transplant mode', () => {
      const planting = createTransplantPlanting({ cultivarId: 'either-cultivar' });
      const { container } = render(
        <PlantingTimeline
          planting={planting}
          frost={createFrostWindow()}
          cultivar={createEitherCultivar()}
          onShiftPlanting={vi.fn()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      expect(growingBar?.className).toContain('Draggable');
    });

    it('does not show transplant drag handle for either crops', () => {
      const planting = createTransplantPlanting({ cultivarId: 'either-cultivar' });
      const { container } = render(
        <PlantingTimeline
          planting={planting}
          frost={createFrostWindow()}
          cultivar={createEitherCultivar()}
          onShiftPlanting={vi.fn()}
        />
      );

      // Either crops use shift-based drag, not transplant-specific drag
      const dragHandle = container.querySelector('[class*="dragHandle"]');
      expect(dragHandle).not.toBeInTheDocument();
    });

    it('calls onShiftPlanting for either crops in transplant mode', () => {
      const onShiftPlanting = vi.fn();
      const planting = createTransplantPlanting({ cultivarId: 'either-cultivar' });
      const { container } = render(
        <PlantingTimeline
          planting={planting}
          frost={createFrostWindow()}
          cultivar={createEitherCultivar()}
          onShiftPlanting={onShiftPlanting}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');

      fireEvent.mouseDown(growingBar!, { clientX: 100 });
      fireEvent.mouseMove(document, { clientX: 200 });
      fireEvent.mouseUp(document);

      expect(onShiftPlanting).toHaveBeenCalledWith(
        planting.id,
        expect.any(Number)
      );
    });
  });

  describe('sow date override', () => {
    it('uses sowDateOverride for display when provided', () => {
      const planting = createPlanting({
        sowDate: '2025-04-15',
        sowDateOverride: '2025-04-10',
      });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const sowBar = container.querySelector('[class*="barSow"]');
      const title = sowBar?.getAttribute('title') || '';
      expect(title).toContain('Apr 10');
      expect(title).toContain('adjusted');
    });
  });

  describe('bar positioning', () => {
    it('positions sow bar within track bounds', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ sowDate: '2025-04-15' })}
          frost={createFrostWindow()}
        />
      );

      const sowBar = container.querySelector('[class*="barSow"]') as HTMLElement;
      const leftStyle = sowBar.style.left;
      const widthStyle = sowBar.style.width;

      // Should have percentage-based positioning
      expect(leftStyle).toMatch(/\d+(\.\d+)?%/);
      expect(widthStyle).toMatch(/\d+(\.\d+)?%/);
    });

    it('positions harvest bar after growing bar', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({
            harvestStart: '2025-07-15',
            harvestEnd: '2025-09-15',
          })}
          frost={createFrostWindow()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]') as HTMLElement;
      const harvestBar = container.querySelector('[class*="barHarvest"]') as HTMLElement;

      const growingLeft = parseFloat(growingBar.style.left);
      const harvestLeft = parseFloat(harvestBar.style.left);

      expect(harvestLeft).toBeGreaterThanOrEqual(growingLeft);
    });

    it('positions transplant marker at transplant date', () => {
      const planting = createTransplantPlanting({ transplantDate: '2025-05-20' });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const transplantMarker = container.querySelector('[class*="markerTransplant"]') as HTMLElement;
      const leftStyle = transplantMarker.style.left;

      expect(leftStyle).toMatch(/\d+(\.\d+)?%/);
    });
  });

  describe('edge cases', () => {
    it('handles planting at start of timeline range', () => {
      const planting = createPlanting({
        sowDate: '2025-03-01',
        harvestStart: '2025-05-01',
        harvestEnd: '2025-06-01',
      });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const sowBar = container.querySelector('[class*="barSow"]') as HTMLElement;
      expect(parseFloat(sowBar.style.left)).toBeCloseTo(0, 0);
    });

    it('handles planting at end of timeline range', () => {
      const planting = createPlanting({
        sowDate: '2025-10-01',
        harvestStart: '2025-11-15',
        harvestEnd: '2025-11-30',
      });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const harvestBar = container.querySelector('[class*="barHarvest"]') as HTMLElement;
      const leftPct = parseFloat(harvestBar.style.left);
      const widthPct = parseFloat(harvestBar.style.width);

      // Should be near the end of the track (left + width near 100%)
      expect(leftPct + widthPct).toBeGreaterThan(90);
    });

    it('handles very short harvest window', () => {
      const planting = createPlanting({
        harvestStart: '2025-07-15',
        harvestEnd: '2025-07-16',
      });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      const harvestBar = container.querySelector('[class*="barHarvest"]') as HTMLElement;
      // Should still render with minimum width
      expect(parseFloat(harvestBar.style.width)).toBeGreaterThan(0);
    });

    it('handles missing transplant date for direct sow', () => {
      const planting = createPlanting({
        method: 'direct',
        transplantDate: undefined,
      });
      const { container } = render(
        <PlantingTimeline planting={planting} frost={createFrostWindow()} />
      );

      // Should render without error
      const track = container.querySelector('[class*="track"]');
      expect(track).toBeInTheDocument();
    });
  });

  describe('drag callbacks', () => {
    it('calls onDragConstraintHit when dragging past succession bound', () => {
      const onDragConstraintHit = vi.fn();
      const planting = createPlanting({
        method: 'direct',
        sowDate: '2025-06-15',
        harvestStart: '2025-08-15',
        harvestEnd: '2025-09-15',
      });

      const { container } = render(
        <PlantingTimeline
          planting={planting}
          frost={createFrostWindow()}
          cultivar={createCultivar({ frostSensitive: false })}
          climate={createClimate()}
          previousHarvestEnd="2025-08-10"
          onShiftPlanting={vi.fn()}
          onDragConstraintHit={onDragConstraintHit}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      const track = container.querySelector('[class*="track"]');

      // Mock getBoundingClientRect so pixel-to-days calculation works
      const mockRect = {
        left: 0, right: 500, width: 500,
        top: 0, bottom: 30, height: 30,
        x: 0, y: 0, toJSON: () => {},
      };
      vi.spyOn(track as HTMLElement, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Drag far to the left (large negative deltaX) to exceed the succession bound
      fireEvent.mouseDown(growingBar!, { clientX: 300 });
      fireEvent.mouseMove(document, { clientX: 0 });

      expect(onDragConstraintHit).toHaveBeenCalledOnce();

      fireEvent.mouseUp(document);
    });

    it('does not call onDragConstraintHit when bound is frost (not succession)', () => {
      const onDragConstraintHit = vi.fn();
      // Frost-sensitive crop with no previousHarvestEnd → bound reason will be frost or season, not succession
      const planting = createPlanting({
        method: 'direct',
        sowDate: '2025-06-01',
        harvestStart: '2025-08-01',
        harvestEnd: '2025-09-15',
      });

      const { container } = render(
        <PlantingTimeline
          planting={planting}
          frost={createFrostWindow()}
          cultivar={createCultivar({ frostSensitive: true, directAfterLsfDays: 0 })}
          climate={createClimate()}
          onShiftPlanting={vi.fn()}
          onDragConstraintHit={onDragConstraintHit}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      const track = container.querySelector('[class*="track"]');

      const mockRect = {
        left: 0, right: 500, width: 500,
        top: 0, bottom: 30, height: 30,
        x: 0, y: 0, toJSON: () => {},
      };
      vi.spyOn(track as HTMLElement, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Drag left past the frost bound
      fireEvent.mouseDown(growingBar!, { clientX: 300 });
      fireEvent.mouseMove(document, { clientX: 0 });

      // Should NOT fire because the binding constraint is frost, not succession
      expect(onDragConstraintHit).not.toHaveBeenCalled();

      fireEvent.mouseUp(document);
    });
  });

  describe('cleanup', () => {
    it('removes event listeners on unmount', () => {
      const onShiftPlanting = vi.fn();
      const { container, unmount } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
          onShiftPlanting={onShiftPlanting}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');
      fireEvent.mouseDown(growingBar!);

      // Unmount while dragging
      unmount();

      // Trigger mouse events after unmount - should not cause errors
      fireEvent.mouseMove(document, { clientX: 200 });
      fireEvent.mouseUp(document);

      // Should not crash and should not have been called after unmount
    });

    it('resets drag state on mouseup', () => {
      const { container } = render(
        <PlantingTimeline
          planting={createPlanting({ method: 'direct' })}
          frost={createFrostWindow()}
          onShiftPlanting={vi.fn()}
        />
      );

      const growingBar = container.querySelector('[class*="barGrowing"]');

      // Start drag
      fireEvent.mouseDown(growingBar!);
      expect(container.querySelector('[class*="Dragging"]')).toBeInTheDocument();

      // End drag
      fireEvent.mouseUp(document);
      expect(container.querySelector('[class*="trackDragging"]')).not.toBeInTheDocument();
    });
  });
});
