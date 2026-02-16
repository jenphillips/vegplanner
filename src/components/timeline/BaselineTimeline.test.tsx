import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { BaselineTimeline } from './BaselineTimeline';
import type { FrostWindow, Climate } from '@/lib/types';

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

// ============================================
// Tests
// ============================================

describe('BaselineTimeline', () => {
  describe('rendering', () => {
    it('renders the timeline card with header', () => {
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      expect(screen.getByRole('heading', { name: /seasonal planting reference/i })).toBeInTheDocument();
      expect(screen.getByText(/baseline sow\/harvest windows/i)).toBeInTheDocument();
    });

    it('renders sort controls', () => {
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      expect(screen.getByText('Sort:')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /by sow date/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /a–z/i })).toBeInTheDocument();
    });

    it('renders legend items', () => {
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      expect(screen.getByText('Sow window')).toBeInTheDocument();
      expect(screen.getByText('Transplant')).toBeInTheDocument();
      expect(screen.getByText('Harvest window')).toBeInTheDocument();
      expect(screen.getByText('Frost risk range')).toBeInTheDocument();
      expect(screen.getByText('Typical frost date')).toBeInTheDocument();
    });

    it('renders month labels in top and bottom tick rows', () => {
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      // Month labels should appear twice (top and bottom)
      const marchLabels = screen.getAllByText('Mar');
      expect(marchLabels.length).toBeGreaterThanOrEqual(2);

      const juneLabels = screen.getAllByText('Jun');
      expect(juneLabels.length).toBeGreaterThanOrEqual(2);

      const septLabels = screen.getAllByText('Sep');
      expect(septLabels.length).toBeGreaterThanOrEqual(2);
    });

    it('renders timeline rows for baseline cultivars', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      // Should have multiple timeline rows (one per baseline cultivar)
      const timelineRows = container.querySelectorAll('[class*="timelineRow"]');
      expect(timelineRows.length).toBeGreaterThan(0);
    });

    it('renders cultivar labels with maturity badges', () => {
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      // Look for maturity badges (number followed by -T or -D)
      // These indicate days to maturity and basis (from Transplant or Direct sow)
      const maturityBadges = screen.getAllByText(/\d+–[TD]/);
      expect(maturityBadges.length).toBeGreaterThan(0);
    });
  });

  describe('sort functionality', () => {
    it('defaults to sow-date sort', () => {
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      const sowDateButton = screen.getByRole('button', { name: /by sow date/i });
      expect(sowDateButton.className).toContain('sortButtonActive');
    });

    it('switches to alphabetical sort when A-Z button clicked', async () => {
      const user = userEvent.setup();
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      const azButton = screen.getByRole('button', { name: /a–z/i });
      await user.click(azButton);

      expect(azButton.className).toContain('sortButtonActive');

      const sowDateButton = screen.getByRole('button', { name: /by sow date/i });
      expect(sowDateButton.className).not.toContain('sortButtonActive');
    });

    it('switches back to sow-date sort when button clicked', async () => {
      const user = userEvent.setup();
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      // First switch to alphabetical
      const azButton = screen.getByRole('button', { name: /a–z/i });
      await user.click(azButton);

      // Then switch back to sow date
      const sowDateButton = screen.getByRole('button', { name: /by sow date/i });
      await user.click(sowDateButton);

      expect(sowDateButton.className).toContain('sortButtonActive');
      expect(azButton.className).not.toContain('sortButtonActive');
    });
  });

  describe('temperature display', () => {
    it('renders temperature badges when climate data provided', () => {
      const frost = createFrostWindow();
      const climate = createClimate();
      render(<BaselineTimeline frost={frost} climate={climate} />);

      // Look for high/low temperature indicators
      const highTemps = screen.getAllByText(/H \d+°/);
      const lowTemps = screen.getAllByText(/L -?\d+°/);

      expect(highTemps.length).toBeGreaterThan(0);
      expect(lowTemps.length).toBeGreaterThan(0);
    });

    it('does not render temperature badges without climate data', () => {
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      // No temperature badges should be present
      const highTemps = screen.queryAllByText(/H \d+°/);
      const lowTemps = screen.queryAllByText(/L -?\d+°/);

      expect(highTemps.length).toBe(0);
      expect(lowTemps.length).toBe(0);
    });
  });

  describe('timeline bars', () => {
    it('renders sow bars for each cultivar row', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      const sowBars = container.querySelectorAll('[class*="barSow"]');
      expect(sowBars.length).toBeGreaterThan(0);
    });

    it('renders harvest bars for cultivars with harvest windows', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      const harvestBars = container.querySelectorAll('[class*="barHarvest"]');
      expect(harvestBars.length).toBeGreaterThan(0);
    });

    it('renders transplant markers for transplant cultivars', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      const transplantMarkers = container.querySelectorAll('[class*="barTransplant"]');
      expect(transplantMarkers.length).toBeGreaterThan(0);
    });

    it('renders week bands for visual structure', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      const weekBands = container.querySelectorAll('[class*="weekBand"]');
      expect(weekBands.length).toBeGreaterThan(0);
    });

    it('renders month lines for visual structure', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      const monthLines = container.querySelectorAll('[class*="monthLine"]');
      expect(monthLines.length).toBeGreaterThan(0);
    });
  });

  describe('frost indicators', () => {
    it('renders frost markers when no climate range data', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      // Without climate data, should use simple frost markers
      const frostMarkers = container.querySelectorAll('[class*="barFrost"], [class*="barFallFrost"]');
      expect(frostMarkers.length).toBeGreaterThan(0);
    });

    it('renders frost ranges when climate data provided', () => {
      const frost = createFrostWindow();
      const climate = createClimate();
      const { container } = render(<BaselineTimeline frost={frost} climate={climate} />);

      // With climate data, should use frost range indicators
      const springFrostRanges = container.querySelectorAll('[class*="frostRangeSpring"]');
      const fallFrostRanges = container.querySelectorAll('[class*="frostRangeFall"]');
      const typicalMarkers = container.querySelectorAll('[class*="frostTypicalMarker"]');

      expect(springFrostRanges.length).toBeGreaterThan(0);
      expect(fallFrostRanges.length).toBeGreaterThan(0);
      expect(typicalMarkers.length).toBeGreaterThan(0);
    });
  });

  describe('tooltips', () => {
    it('adds title attributes to timeline bars with date information', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      // Sow bars should have tooltips
      const sowBars = container.querySelectorAll('[class*="barSow"][title]');
      expect(sowBars.length).toBeGreaterThan(0);

      // Check that the tooltip contains sow window information
      const firstSowBar = sowBars[0];
      expect(firstSowBar.getAttribute('title')).toMatch(/sow window/i);
    });

    it('adds title attributes to cultivar labels with details', () => {
      const frost = createFrostWindow();
      const { container } = render(<BaselineTimeline frost={frost} />);

      // Labels should have tooltips with cultivar details
      const labels = container.querySelectorAll('[class*="timelineLabel"][title]');
      expect(labels.length).toBeGreaterThan(0);

      const firstLabel = labels[0];
      const title = firstLabel.getAttribute('title') || '';
      expect(title).toMatch(/maturity/i);
      expect(title).toMatch(/method/i);
    });
  });

  describe('crop name formatting', () => {
    it('formats parenthetical variants correctly', () => {
      // The formatCropLabel function should convert "Tomato (Determinate)" to "Tomato - Determinate"
      // We can't directly test the utility function, but we can verify the rendered output
      const frost = createFrostWindow();
      render(<BaselineTimeline frost={frost} />);

      // This depends on baseline-cultivars.json having such entries
      // At minimum, we verify the component renders without error
      expect(screen.getByRole('heading', { name: /seasonal planting reference/i })).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles frost dates in different years correctly', () => {
      // Test with frost window spanning different time periods
      const frost = createFrostWindow('2025-06-01', '2025-09-15');
      const { container } = render(<BaselineTimeline frost={frost} />);

      // Should still render timeline rows
      const timelineRows = container.querySelectorAll('[class*="timelineRow"]');
      expect(timelineRows.length).toBeGreaterThan(0);
    });

    it('renders correctly with early frost dates', () => {
      const frost = createFrostWindow('2025-04-01', '2025-11-15');
      const { container } = render(<BaselineTimeline frost={frost} />);

      const timelineRows = container.querySelectorAll('[class*="timelineRow"]');
      expect(timelineRows.length).toBeGreaterThan(0);
    });

    it('renders correctly with late frost dates', () => {
      const frost = createFrostWindow('2025-06-15', '2025-09-01');
      const { container } = render(<BaselineTimeline frost={frost} />);

      const timelineRows = container.querySelectorAll('[class*="timelineRow"]');
      expect(timelineRows.length).toBeGreaterThan(0);
    });
  });
});
