import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LayoutCalendarView } from './LayoutCalendarView';
import type { Planting, Cultivar, FrostWindow, Climate } from '@/lib/types';

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

const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'test-cultivar',
  crop: 'Tomato',
  variety: 'Test Variety',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 60,
  maturityBasis: 'from_transplant',
  sowMethod: 'transplant',
  harvestStyle: 'continuous',
  frostSensitive: true,
  ...overrides,
});

const createPlanting = (overrides: Partial<Planting> = {}): Planting => ({
  id: 'test-planting-1',
  cultivarId: 'test-cultivar',
  label: 'Tomato #1',
  sowDate: '2025-04-01',
  transplantDate: '2025-05-20',
  harvestStart: '2025-07-15',
  harvestEnd: '2025-09-30',
  method: 'transplant',
  status: 'planned',
  successionNumber: 1,
  quantity: 4,
  createdAt: '2025-01-01',
  ...overrides,
});

// ============================================
// Tests
// ============================================

describe('LayoutCalendarView', () => {
  describe('empty state', () => {
    it('shows empty state when no plantings provided', () => {
      render(
        <LayoutCalendarView
          plantings={[]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText(/no plantings scheduled yet/i)).toBeInTheDocument();
    });

    it('suggests adding plantings in Timeline tab', () => {
      render(
        <LayoutCalendarView
          plantings={[]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText(/add plantings in the timeline tab/i)).toBeInTheDocument();
    });
  });

  describe('no plantings in ground', () => {
    it('shows message when no plantings are in ground on selected date', () => {
      // Create a planting that is NOT in ground on the selected date
      const planting = createPlanting({
        sowDate: '2025-04-01',
        harvestStart: '2025-07-15',
        harvestEnd: '2025-07-30', // Ends before selected date
      });

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-09-01" // After harvest ends
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText(/no plantings in ground on/i)).toBeInTheDocument();
    });
  });

  describe('rendering plantings', () => {
    it('renders plantings that are in ground on selected date', () => {
      const planting = createPlanting({
        label: 'Tomato Roma',
        sowDate: '2025-04-01',
        harvestStart: '2025-07-15',
        harvestEnd: '2025-09-30',
      });

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01" // During harvest period
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText('Tomato Roma')).toBeInTheDocument();
    });

    it('renders planting quantity', () => {
      const planting = createPlanting({
        label: 'Tomato',
        quantity: 6,
      });

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText('6')).toBeInTheDocument();
    });

    it('renders dash for plantings without quantity', () => {
      const planting = createPlanting({
        label: 'Tomato',
        quantity: undefined,
      });

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // Should show em dash for unset quantity
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('renders multiple plantings', () => {
      const plantings = [
        createPlanting({ id: '1', label: 'Tomato #1', cultivarId: 'cultivar-1' }),
        createPlanting({ id: '2', label: 'Pepper #1', cultivarId: 'cultivar-2' }),
        createPlanting({ id: '3', label: 'Basil #1', cultivarId: 'cultivar-3' }),
      ];

      const cultivars = [
        createCultivar({ id: 'cultivar-1', crop: 'Tomato' }),
        createCultivar({ id: 'cultivar-2', crop: 'Pepper' }),
        createCultivar({ id: 'cultivar-3', crop: 'Basil' }),
      ];

      render(
        <LayoutCalendarView
          plantings={plantings}
          cultivars={cultivars}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText('Tomato #1')).toBeInTheDocument();
      expect(screen.getByText('Pepper #1')).toBeInTheDocument();
      expect(screen.getByText('Basil #1')).toBeInTheDocument();
    });

    it('does not render plantings without matching cultivar', () => {
      const planting = createPlanting({
        label: 'Orphan Planting',
        cultivarId: 'non-existent',
      });

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar({ id: 'different-cultivar' })]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.queryByText('Orphan Planting')).not.toBeInTheDocument();
    });
  });

  describe('DateScrubberTimeline integration', () => {
    it('renders DateScrubberTimeline component', () => {
      const planting = createPlanting();

      const { container } = render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // DateScrubberTimeline renders a track element
      const track = container.querySelector('[class*="track"]');
      expect(track).toBeInTheDocument();
    });

    it('passes correct planting count to DateScrubberTimeline', () => {
      const plantings = [
        createPlanting({ id: '1', cultivarId: 'cultivar-1' }),
        createPlanting({ id: '2', cultivarId: 'cultivar-2' }),
      ];

      const cultivars = [
        createCultivar({ id: 'cultivar-1' }),
        createCultivar({ id: 'cultivar-2' }),
      ];

      render(
        <LayoutCalendarView
          plantings={plantings}
          cultivars={cultivars}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // The planting count is displayed by DateScrubberTimeline
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('PlantingTimeline integration', () => {
    it('renders PlantingTimeline for each planting', () => {
      const planting = createPlanting();

      const { container } = render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // PlantingTimeline renders bar elements
      const barElements = container.querySelectorAll('[class*="bar"]');
      expect(barElements.length).toBeGreaterThan(0);
    });

    it('passes selectedDate to PlantingTimeline', () => {
      const planting = createPlanting();

      const { container } = render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // PlantingTimeline should render a selected date indicator
      const selectedIndicator = container.querySelector('[class*="selectedDateIndicator"]');
      expect(selectedIndicator).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('sorts plantings by effective sow date', () => {
      const plantings = [
        createPlanting({
          id: '1',
          label: 'Late Planting',
          sowDate: '2025-05-01',
          cultivarId: 'cultivar-1',
        }),
        createPlanting({
          id: '2',
          label: 'Early Planting',
          sowDate: '2025-03-15',
          cultivarId: 'cultivar-2',
        }),
        createPlanting({
          id: '3',
          label: 'Middle Planting',
          sowDate: '2025-04-15',
          cultivarId: 'cultivar-3',
        }),
      ];

      const cultivars = [
        createCultivar({ id: 'cultivar-1' }),
        createCultivar({ id: 'cultivar-2' }),
        createCultivar({ id: 'cultivar-3' }),
      ];

      const { container } = render(
        <LayoutCalendarView
          plantings={plantings}
          cultivars={cultivars}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // Get the planting rows and extract their labels
      const plantingRows = container.querySelectorAll('[class*="plantingRow"]');
      const labelTexts = Array.from(plantingRows).map((row) => {
        const label = row.querySelector('[class*="label"]');
        return label?.textContent;
      });

      // Should be sorted by sow date: Early, Middle, Late
      expect(labelTexts[0]).toBe('Early Planting');
      expect(labelTexts[1]).toBe('Middle Planting');
      expect(labelTexts[2]).toBe('Late Planting');
    });

    it('uses sowDateOverride for sorting when present', () => {
      const plantings = [
        createPlanting({
          id: '1',
          label: 'With Override',
          sowDate: '2025-05-01',
          sowDateOverride: '2025-03-01', // Overridden to be earlier
          cultivarId: 'cultivar-1',
        }),
        createPlanting({
          id: '2',
          label: 'Without Override',
          sowDate: '2025-04-01',
          cultivarId: 'cultivar-2',
        }),
      ];

      const cultivars = [
        createCultivar({ id: 'cultivar-1' }),
        createCultivar({ id: 'cultivar-2' }),
      ];

      const { container } = render(
        <LayoutCalendarView
          plantings={plantings}
          cultivars={cultivars}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // Get the planting rows and extract their labels
      const plantingRows = container.querySelectorAll('[class*="plantingRow"]');
      const labelTexts = Array.from(plantingRows).map((row) => {
        const label = row.querySelector('[class*="label"]');
        return label?.textContent;
      });

      // Should be sorted by effective sow date: With Override (Mar 1), Without Override (Apr 1)
      expect(labelTexts[0]).toBe('With Override');
      expect(labelTexts[1]).toBe('Without Override');
    });
  });

  describe('filtering by in-ground date', () => {
    it('filters to only show plantings in ground on selected date', () => {
      const plantings = [
        createPlanting({
          id: '1',
          label: 'In Ground',
          sowDate: '2025-04-01',
          harvestStart: '2025-07-01',
          harvestEnd: '2025-09-30', // In ground during August
          cultivarId: 'cultivar-1',
        }),
        createPlanting({
          id: '2',
          label: 'Harvested',
          sowDate: '2025-03-01',
          harvestStart: '2025-05-01',
          harvestEnd: '2025-06-30', // Harvested before August
          cultivarId: 'cultivar-2',
        }),
      ];

      const cultivars = [
        createCultivar({ id: 'cultivar-1' }),
        createCultivar({ id: 'cultivar-2' }),
      ];

      render(
        <LayoutCalendarView
          plantings={plantings}
          cultivars={cultivars}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText('In Ground')).toBeInTheDocument();
      expect(screen.queryByText('Harvested')).not.toBeInTheDocument();
    });

    it('includes plantings that start on selected date', () => {
      const planting = createPlanting({
        label: 'Starting Today',
        sowDate: '2025-08-01', // Starts on selected date
        harvestEnd: '2025-10-01',
      });

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText('Starting Today')).toBeInTheDocument();
    });

    it('includes plantings that end on selected date', () => {
      const planting = createPlanting({
        label: 'Ending Today',
        sowDate: '2025-04-01',
        harvestEnd: '2025-08-01', // Ends on selected date
      });

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      expect(screen.getByText('Ending Today')).toBeInTheDocument();
    });
  });

  describe('climate data', () => {
    it('passes climate data to child components', () => {
      const planting = createPlanting();

      const { container } = render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          climate={createClimate()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // With climate data, frost ranges should be rendered
      const frostRanges = container.querySelectorAll('[class*="frostRange"]');
      expect(frostRanges.length).toBeGreaterThan(0);
    });

    it('works without climate data', () => {
      const planting = createPlanting();

      const { container } = render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // Without climate data, frost markers should be rendered
      const frostMarkers = container.querySelectorAll('[class*="frostMarker"]');
      expect(frostMarkers.length).toBeGreaterThan(0);
    });
  });

  describe('callback handling', () => {
    it('passes onDateChange to DateScrubberTimeline', () => {
      const onDateChange = vi.fn();
      const planting = createPlanting();

      const { container } = render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[createCultivar()]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={onDateChange}
        />
      );

      // The onDateChange should be wired up through DateScrubberTimeline
      const track = container.querySelector('[class*="track"]');
      expect(track).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles plantings with same sow date', () => {
      const plantings = [
        createPlanting({
          id: '1',
          label: 'First',
          sowDate: '2025-04-15',
          cultivarId: 'cultivar-1',
        }),
        createPlanting({
          id: '2',
          label: 'Second',
          sowDate: '2025-04-15',
          cultivarId: 'cultivar-2',
        }),
      ];

      const cultivars = [
        createCultivar({ id: 'cultivar-1' }),
        createCultivar({ id: 'cultivar-2' }),
      ];

      render(
        <LayoutCalendarView
          plantings={plantings}
          cultivars={cultivars}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // Both should be rendered
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
    });

    it('handles empty cultivars array', () => {
      const planting = createPlanting();

      render(
        <LayoutCalendarView
          plantings={[planting]}
          cultivars={[]}
          frost={createFrostWindow()}
          selectedDate="2025-08-01"
          onDateChange={vi.fn()}
        />
      );

      // Should not crash, planting without cultivar should not render
      expect(screen.queryByText('Tomato #1')).not.toBeInTheDocument();
    });
  });
});
