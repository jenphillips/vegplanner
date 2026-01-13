import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DateScrubberTimeline } from './DateScrubberTimeline';
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

describe('DateScrubberTimeline', () => {
  describe('rendering', () => {
    it('renders the timeline container', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const containerEl = container.querySelector('[class*="container"]');
      expect(containerEl).toBeInTheDocument();
    });

    it('renders the track element', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]');
      expect(track).toBeInTheDocument();
    });

    it('renders week bands for visual structure', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const weekBands = container.querySelectorAll('[class*="weekBand"]');
      expect(weekBands.length).toBeGreaterThan(0);
    });

    it('renders month tick marks', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const monthTicks = container.querySelectorAll('[class*="monthTick"]');
      expect(monthTicks.length).toBeGreaterThan(0);
    });

    it('renders month labels', () => {
      render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      expect(screen.getByText('Mar')).toBeInTheDocument();
      expect(screen.getByText('Jun')).toBeInTheDocument();
      expect(screen.getByText('Sep')).toBeInTheDocument();
      expect(screen.getByText('Nov')).toBeInTheDocument();
    });

    it('renders the date marker', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const dateMarker = container.querySelector('[class*="dateMarker"]');
      expect(dateMarker).toBeInTheDocument();
    });
  });

  describe('selected date display', () => {
    it('displays the formatted selected date', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      // Should show formatted date like "Sun, Jun 15" in the dateValue element
      const dateLabel = container.querySelector('[class*="dateValue"]');
      expect(dateLabel).toBeInTheDocument();
      expect(dateLabel?.textContent).toMatch(/jun/i);
    });

    it('displays the planting count', () => {
      render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('displays zero planting count', () => {
      render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={0}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('frost indicators', () => {
    it('renders frost markers without climate data', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const frostMarkers = container.querySelectorAll('[class*="frostMarker"]');
      // Should have spring and fall frost markers
      expect(frostMarkers.length).toBe(2);
    });

    it('renders frost ranges with climate data', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          climate={createClimate()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const frostRanges = container.querySelectorAll('[class*="frostRange"]');
      expect(frostRanges.length).toBeGreaterThan(0);

      const frostTypical = container.querySelectorAll('[class*="frostTypical"]');
      expect(frostTypical.length).toBeGreaterThan(0);
    });
  });

  describe('date marker positioning', () => {
    it('positions date marker based on selected date', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const dateMarker = container.querySelector('[class*="dateMarker"]') as HTMLElement;
      expect(dateMarker).toBeInTheDocument();

      // Should have a left style set as percentage
      const leftStyle = dateMarker.style.left;
      expect(leftStyle).toMatch(/\d+(\.\d+)?%/);
    });

    it('clamps date marker to start of range', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-01-01" // Before March
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const dateMarker = container.querySelector('[class*="dateMarker"]') as HTMLElement;
      const leftValue = parseFloat(dateMarker.style.left);

      // Should be clamped to 0%
      expect(leftValue).toBeCloseTo(0, 0);
    });

    it('clamps date marker to end of range', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-12-31" // After November
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const dateMarker = container.querySelector('[class*="dateMarker"]') as HTMLElement;
      const leftValue = parseFloat(dateMarker.style.left);

      // Should be clamped to 100%
      expect(leftValue).toBeCloseTo(100, 0);
    });
  });

  describe('drag interaction', () => {
    it('calls onDateChange when track is clicked', () => {
      const onDateChange = vi.fn();
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      // Mock getBoundingClientRect
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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      fireEvent.mouseDown(track, { clientX: 250 });

      expect(onDateChange).toHaveBeenCalledWith(expect.any(String));
    });

    it('adds dragging class during drag', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      // Mock getBoundingClientRect to prevent invalid date errors
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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      fireEvent.mouseDown(track, { clientX: 250 });

      expect(track.className).toContain('Dragging');
    });

    it('removes dragging class on mouseup', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      // Mock getBoundingClientRect to prevent invalid date errors
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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      fireEvent.mouseDown(track, { clientX: 250 });
      expect(track.className).toContain('Dragging');

      fireEvent.mouseUp(document);
      expect(track.className).not.toContain('trackDragging');
    });

    it('calls onDateChange during drag movement', () => {
      const onDateChange = vi.fn();
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      // Mock getBoundingClientRect
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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Start drag
      fireEvent.mouseDown(track, { clientX: 100 });
      expect(onDateChange).toHaveBeenCalledTimes(1);

      // Move during drag
      fireEvent.mouseMove(document, { clientX: 200 });
      expect(onDateChange).toHaveBeenCalledTimes(2);

      // End drag
      fireEvent.mouseUp(document);
    });

    it('stops calling onDateChange after mouseup', () => {
      const onDateChange = vi.fn();
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      // Mock getBoundingClientRect to prevent invalid date errors
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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Start and end drag
      fireEvent.mouseDown(track, { clientX: 100 });
      fireEvent.mouseUp(document);

      const callCountAfterDrag = onDateChange.mock.calls.length;

      // Move after drag ended
      fireEvent.mouseMove(document, { clientX: 300 });

      // Should not have been called again
      expect(onDateChange).toHaveBeenCalledTimes(callCountAfterDrag);
    });
  });

  describe('date conversion', () => {
    it('converts click position to date within range', () => {
      const onDateChange = vi.fn();
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      // Mock getBoundingClientRect for predictable positioning
      const mockRect = {
        left: 0,
        right: 275, // 275 days from March 1 to Nov 30
        width: 275,
        top: 0,
        bottom: 30,
        height: 30,
        x: 0,
        y: 0,
        toJSON: () => {},
      };
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Click at 50% position (approximately mid-July)
      fireEvent.mouseDown(track, { clientX: 137.5 });

      expect(onDateChange).toHaveBeenCalled();
      const calledDate = onDateChange.mock.calls[0][0];

      // Should be roughly mid-season (around July)
      expect(calledDate).toMatch(/2025-0[67]-/);
    });

    it('clamps date to start of range for clicks before track', () => {
      const onDateChange = vi.fn();
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      const mockRect = {
        left: 100,
        right: 600,
        width: 500,
        top: 0,
        bottom: 30,
        height: 30,
        x: 100,
        y: 0,
        toJSON: () => {},
      };
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Click before track starts
      fireEvent.mouseDown(track, { clientX: 50 });

      expect(onDateChange).toHaveBeenCalled();
      const calledDate = onDateChange.mock.calls[0][0];

      // Should be clamped to March 1
      expect(calledDate).toBe('2025-03-01');
    });

    it('clamps date to end of range for clicks after track', () => {
      const onDateChange = vi.fn();
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Click way past track end
      fireEvent.mouseDown(track, { clientX: 1000 });

      expect(onDateChange).toHaveBeenCalled();
      const calledDate = onDateChange.mock.calls[0][0];

      // Should be clamped to November 30
      expect(calledDate).toBe('2025-11-30');
    });
  });

  describe('edge cases', () => {
    it('handles different frost window years', () => {
      const frost = createFrostWindow('2024-05-15', '2024-10-01');
      const { container } = render(
        <DateScrubberTimeline
          frost={frost}
          selectedDate="2024-06-15"
          onDateChange={vi.fn()}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]');
      expect(track).toBeInTheDocument();
    });

    it('renders correctly with zero planting count', () => {
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={vi.fn()}
          plantingCount={0}
        />
      );

      const track = container.querySelector('[class*="track"]');
      expect(track).toBeInTheDocument();
    });

    it('handles rapid date changes', () => {
      const onDateChange = vi.fn();
      const { container } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Simulate rapid dragging
      fireEvent.mouseDown(track, { clientX: 100 });
      fireEvent.mouseMove(document, { clientX: 150 });
      fireEvent.mouseMove(document, { clientX: 200 });
      fireEvent.mouseMove(document, { clientX: 250 });
      fireEvent.mouseMove(document, { clientX: 300 });
      fireEvent.mouseUp(document);

      // Should have been called multiple times
      expect(onDateChange.mock.calls.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('cleanup', () => {
    it('removes event listeners on unmount', () => {
      const onDateChange = vi.fn();
      const { container, unmount } = render(
        <DateScrubberTimeline
          frost={createFrostWindow()}
          selectedDate="2025-06-15"
          onDateChange={onDateChange}
          plantingCount={5}
        />
      );

      const track = container.querySelector('[class*="track"]') as HTMLElement;

      // Mock getBoundingClientRect to prevent invalid date errors
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
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(mockRect);

      // Start dragging
      fireEvent.mouseDown(track, { clientX: 100 });

      // Unmount while dragging
      unmount();

      // Should not throw errors when mouse events occur after unmount
      fireEvent.mouseMove(document, { clientX: 200 });
      fireEvent.mouseUp(document);
    });
  });
});
