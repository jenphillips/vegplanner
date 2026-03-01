import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlantingCard } from './PlantingCard';
import type { Cultivar, Planting, FrostWindow, Climate } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createFrostWindow = (): FrostWindow => ({
  id: 'test-frost',
  lastSpringFrost: '2025-05-15',
  firstFallFrost: '2025-10-01',
});

const createClimate = (): Climate => ({
  location: 'Test Location',
  coordinates: { lat: 45.0, lon: -75.0 },
  elevation_m: 100,
  source: 'test',
  monthlyAvgC: {
    '1':  { tavg_c: -10, tmin_c: -15, tmax_c: -5,  soil_avg_c: -2,  gdd_base5: 0 },
    '2':  { tavg_c: -8,  tmin_c: -13, tmax_c: -3,  soil_avg_c: -1,  gdd_base5: 0 },
    '3':  { tavg_c: -2,  tmin_c: -7,  tmax_c: 3,   soil_avg_c: 1,   gdd_base5: 0 },
    '4':  { tavg_c: 6,   tmin_c: 1,   tmax_c: 11,  soil_avg_c: 5,   gdd_base5: 30 },
    '5':  { tavg_c: 13,  tmin_c: 6,   tmax_c: 18,  soil_avg_c: 11,  gdd_base5: 180 },
    '6':  { tavg_c: 18,  tmin_c: 11,  tmax_c: 23,  soil_avg_c: 16,  gdd_base5: 400 },
    '7':  { tavg_c: 21,  tmin_c: 14,  tmax_c: 26,  soil_avg_c: 19,  gdd_base5: 650 },
    '8':  { tavg_c: 20,  tmin_c: 13,  tmax_c: 25,  soil_avg_c: 18,  gdd_base5: 900 },
    '9':  { tavg_c: 15,  tmin_c: 8,   tmax_c: 20,  soil_avg_c: 14,  gdd_base5: 1050 },
    '10': { tavg_c: 9,   tmin_c: 3,   tmax_c: 13,  soil_avg_c: 9,   gdd_base5: 1150 },
    '11': { tavg_c: 3,   tmin_c: -2,  tmax_c: 7,   soil_avg_c: 4,   gdd_base5: 1180 },
    '12': { tavg_c: -6,  tmin_c: -11, tmax_c: -1,  soil_avg_c: 0,   gdd_base5: 1180 },
  },
  lastSpringFrost: {
    earliest: '04-25', typical: '05-15', latest: '06-01',
    probability10: '04-28', probability50: '05-15', probability90: '05-28',
  },
  firstFallFrost: {
    earliest: '09-20', typical: '10-01', latest: '10-15',
    probability10: '09-22', probability50: '10-01', probability90: '10-12',
  },
  growingSeasonDays: 140,
  annualGDD: 1180,
  notes: 'Test climate data',
});

const createPlanting = (overrides: Partial<Planting> = {}): Planting => ({
  id: 'planting-1',
  cultivarId: 'cultivar-1',
  label: 'Spinach #1',
  quantity: 10,
  sowDate: '2025-05-15',
  harvestStart: '2025-06-24',
  harvestEnd: '2025-07-15',
  method: 'direct',
  status: 'planned',
  successionNumber: 1,
  createdAt: '2025-01-01',
  ...overrides,
});

const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'cultivar-1',
  crop: 'Spinach',
  variety: 'Bloomsdale',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 40,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  frostSensitive: false,
  maxGrowingTempC: 24,
  harvestDurationDays: 21,
  harvestStyle: 'continuous',
  ...overrides,
});

// ============================================
// Rendering
// ============================================

describe('PlantingCard', () => {
  describe('rendering', () => {
    it('renders the planting label', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByText('Spinach #1')).toBeTruthy();
    });

    it('renders the quantity', () => {
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 25 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByText('25')).toBeTruthy();
    });

    it('renders a dash when quantity is unset', () => {
      render(
        <PlantingCard
          planting={createPlanting({ quantity: undefined })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByText('—')).toBeTruthy();
    });

    it('renders formatted date range', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      // "May 15 → Jul 15"
      expect(screen.getByText(/May 15/)).toBeTruthy();
      expect(screen.getByText(/Jul 15/)).toBeTruthy();
    });

    it('uses sowDateOverride for display when set', () => {
      render(
        <PlantingCard
          planting={createPlanting({ sowDateOverride: '2025-05-10' })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByText(/May 10/)).toBeTruthy();
    });

    it('renders notes when present', () => {
      render(
        <PlantingCard
          planting={createPlanting({ notes: 'Under row cover' })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByText('Under row cover')).toBeTruthy();
    });

    it('does not render notes section when absent', () => {
      const { container } = render(
        <PlantingCard
          planting={createPlanting({ notes: undefined })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(container.querySelector('.notes')).toBeNull();
    });
  });

  // ============================================
  // Delete
  // ============================================

  describe('delete', () => {
    it('calls onDelete with planting id when delete button clicked', () => {
      const onDelete = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={onDelete}
        />
      );
      fireEvent.click(screen.getByTitle('Delete planting'));
      expect(onDelete).toHaveBeenCalledWith('planting-1');
    });
  });

  // ============================================
  // Selection
  // ============================================

  describe('selection', () => {
    it('calls onSelect with planting id when info area clicked', () => {
      const onSelect = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          onSelect={onSelect}
        />
      );
      fireEvent.click(screen.getByText('Spinach #1'));
      expect(onSelect).toHaveBeenCalledWith('planting-1');
    });

    it('makes info area keyboard-accessible when onSelect provided', () => {
      const onSelect = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          onSelect={onSelect}
        />
      );
      const info = screen.getByRole('button', { name: /Spinach #1/ });
      expect(info).toBeTruthy();
      fireEvent.keyDown(info, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith('planting-1');
    });

    it('info area has no button role when onSelect not provided', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: /Spinach #1/ })).toBeNull();
    });
  });

  // ============================================
  // Method Toggle
  // ============================================

  describe('method toggle', () => {
    it('shows method toggle only for cultivars with sowMethod "either"', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar({ sowMethod: 'either' })}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.getByTitle('Direct sow outdoors')).toBeTruthy();
      expect(screen.getByTitle('Start indoors, transplant later')).toBeTruthy();
    });

    it('does not show method toggle for direct-only cultivars', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar({ sowMethod: 'direct' })}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.queryByTitle('Direct sow outdoors')).toBeNull();
    });

    it('calls onUpdate with new method and dates on viable method switch', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ method: 'direct' })}
          cultivar={createCultivar({
            sowMethod: 'either',
            indoorLeadWeeksMin: 3,
            maturityBasis: 'from_sow',
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTitle('Start indoors, transplant later'));
      expect(onUpdate).toHaveBeenCalledWith(
        'planting-1',
        expect.objectContaining({
          method: 'transplant',
          transplantDate: expect.any(String),
          sowDate: expect.any(String),
          harvestStart: expect.any(String),
          harvestEnd: expect.any(String),
        })
      );
    });

    it('does nothing when clicking the already-active method', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ method: 'direct' })}
          cultivar={createCultivar({ sowMethod: 'either' })}
          frost={createFrostWindow()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );
      // DS button is the current method — clicking it should be a no-op
      fireEvent.click(screen.getByTitle('Direct sow outdoors'));
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('shows notice when method switch is not viable', () => {
      // Use a frost-sensitive cultivar with high cold threshold and long maturity.
      // In the test climate, tavg only reaches 19°C in Jul-Aug. A 60-day maturity
      // crop can't complete its growing period before temps drop, making direct sow
      // genuinely non-viable (similar to squash in a cold climate).
      render(
        <PlantingCard
          planting={createPlanting({
            method: 'transplant',
            sowDate: '2025-05-25',
            transplantDate: '2025-06-15',
            harvestStart: '2025-07-24',
            harvestEnd: '2025-08-14',
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            frostSensitive: true,
            minGrowingTempC: 18,
            maxGrowingTempC: 32,
            maturityDays: 60,
            harvestDurationDays: 21,
            directAfterLsfDays: 14,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      // Direct sow is genuinely non-viable — no 60-day window with tavg >= 19°C
      fireEvent.click(screen.getByTitle('Direct sow outdoors'));
      expect(screen.getByText(/Can't switch method/)).toBeTruthy();
    });

    it('dismiss button clears the notice', () => {
      render(
        <PlantingCard
          planting={createPlanting({
            method: 'transplant',
            sowDate: '2025-05-25',
            transplantDate: '2025-06-15',
            harvestStart: '2025-07-24',
            harvestEnd: '2025-08-14',
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            frostSensitive: true,
            minGrowingTempC: 18,
            maxGrowingTempC: 32,
            maturityDays: 60,
            harvestDurationDays: 21,
            directAfterLsfDays: 14,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTitle('Direct sow outdoors'));
      expect(screen.getByText(/Can't switch method/)).toBeTruthy();

      fireEvent.click(screen.getByText('Dismiss'));
      expect(screen.queryByText(/Can't switch method/)).toBeNull();
    });

    it('clears previous notice on successful method switch', () => {
      const onUpdate = vi.fn();
      const { rerender } = render(
        <PlantingCard
          planting={createPlanting({
            method: 'transplant',
            sowDate: '2025-05-25',
            transplantDate: '2025-06-15',
            harvestStart: '2025-07-24',
            harvestEnd: '2025-08-14',
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            frostSensitive: true,
            minGrowingTempC: 18,
            maxGrowingTempC: 32,
            maturityDays: 60,
            harvestDurationDays: 21,
            directAfterLsfDays: 14,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      // First trigger a non-viable switch to get a notice
      fireEvent.click(screen.getByTitle('Direct sow outdoors'));
      expect(screen.getByText(/Can't switch method/)).toBeTruthy();

      // Now re-render with a planting that CAN switch (early season, no heat issue)
      rerender(
        <PlantingCard
          planting={createPlanting({
            method: 'direct',
            sowDate: '2025-05-15',
            harvestStart: '2025-06-24',
            harvestEnd: '2025-07-15',
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            maxGrowingTempC: 30, // High heat tolerance
            indoorLeadWeeksMin: 3,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTitle('Start indoors, transplant later'));
      // Successful switch should clear notice
      expect(screen.queryByText(/Can't switch method/)).toBeNull();
    });
  });

  // ============================================
  // Reorder notice
  // ============================================

  describe('method change reorder notice', () => {
    it('shows reorder notice when succession number changes after method switch', () => {
      const onUpdate = vi.fn();
      const { rerender } = render(
        <PlantingCard
          planting={createPlanting({
            method: 'direct',
            successionNumber: 2,
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            indoorLeadWeeksMin: 3,
            maxGrowingTempC: 30,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      // Trigger method switch (direct → transplant)
      fireEvent.click(screen.getByTitle('Start indoors, transplant later'));
      expect(onUpdate).toHaveBeenCalled();

      // Simulate parent re-rendering with new succession number (reordered)
      rerender(
        <PlantingCard
          planting={createPlanting({
            method: 'transplant',
            successionNumber: 1, // Changed from 2 → 1
            sowDate: '2025-04-24',
            transplantDate: '2025-05-15',
            harvestStart: '2025-06-24',
            harvestEnd: '2025-07-15',
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            indoorLeadWeeksMin: 3,
            maxGrowingTempC: 30,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByText(/reordered/i)).toBeTruthy();
    });

    it('does not show reorder notice when succession number stays the same', () => {
      const onUpdate = vi.fn();
      const { rerender } = render(
        <PlantingCard
          planting={createPlanting({
            method: 'direct',
            successionNumber: 1,
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            indoorLeadWeeksMin: 3,
            maxGrowingTempC: 30,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTitle('Start indoors, transplant later'));

      // Re-render with same succession number
      rerender(
        <PlantingCard
          planting={createPlanting({
            method: 'transplant',
            successionNumber: 1, // Same number
            sowDate: '2025-04-24',
            transplantDate: '2025-05-15',
            harvestStart: '2025-06-24',
            harvestEnd: '2025-07-15',
          })}
          cultivar={createCultivar({
            sowMethod: 'either',
            indoorLeadWeeksMin: 3,
            maxGrowingTempC: 30,
          })}
          frost={createFrostWindow()}
          climate={createClimate()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );

      expect(screen.queryByText(/reordered/i)).toBeNull();
    });
  });

  // ============================================
  // Quantity editing
  // ============================================

  describe('quantity editing', () => {
    it('enters edit mode when quantity is clicked', () => {
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      fireEvent.click(screen.getByText('10'));
      expect(screen.getByRole('spinbutton')).toBeTruthy();
      expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('10');
    });

    it('commits value on blur', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );
      fireEvent.click(screen.getByText('10'));
      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '15' } });
      fireEvent.blur(input);
      expect(onUpdate).toHaveBeenCalledWith('planting-1', { quantity: 15 });
    });

    it('commits value on Enter', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );
      fireEvent.click(screen.getByText('10'));
      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '20' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onUpdate).toHaveBeenCalledWith('planting-1', { quantity: 20 });
    });

    it('cancels on Escape without saving', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );
      fireEvent.click(screen.getByText('10'));
      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '99' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onUpdate).not.toHaveBeenCalled();
      // Should exit edit mode
      expect(screen.queryByRole('spinbutton')).toBeNull();
    });

    it('does not call onUpdate when value is unchanged', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );
      fireEvent.click(screen.getByText('10'));
      const input = screen.getByRole('spinbutton');
      fireEvent.blur(input); // blur without changing
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('clamps value to placedQuantity minimum', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
          placedQuantity={8}
        />
      );
      fireEvent.click(screen.getByText('10'));
      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);
      expect(onUpdate).toHaveBeenCalledWith('planting-1', { quantity: 8 });
    });

    it('clamps value to 1 when no placedQuantity', () => {
      const onUpdate = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
        />
      );
      fireEvent.click(screen.getByText('10'));
      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '0' } });
      fireEvent.blur(input);
      expect(onUpdate).toHaveBeenCalledWith('planting-1', { quantity: 1 });
    });

    it('does not trigger onSelect when quantity is clicked', () => {
      const onSelect = vi.fn();
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          onSelect={onSelect}
        />
      );
      fireEvent.click(screen.getByText('10'));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('shows placement tooltip when placedQuantity is provided', () => {
      render(
        <PlantingCard
          planting={createPlanting({ quantity: 10 })}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          placedQuantity={6}
        />
      );
      expect(screen.getByTitle('6 placed in garden beds')).toBeTruthy();
    });
  });

  // ============================================
  // Placement indicator
  // ============================================

  describe('placement indicator', () => {
    it('shows map pin icon when placementDetails are provided', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          placementDetails={[{ bedName: 'Raised Bed 1', quantity: 4 }]}
        />
      );
      expect(screen.getByTitle('Raised Bed 1: 4')).toBeTruthy();
    });

    it('does not show map pin icon when no placementDetails', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.queryByTitle(/Raised Bed/)).toBeNull();
    });

    it('does not show map pin icon for empty placementDetails', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          placementDetails={[]}
        />
      );
      expect(screen.queryByTitle(/Raised Bed/)).toBeNull();
    });

    it('shows all bed names and quantities in tooltip', () => {
      render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          placementDetails={[
            { bedName: 'Raised Bed 1', quantity: 4 },
            { bedName: 'Side Bed 2', quantity: 6 },
          ]}
        />
      );
      const indicator = screen.getByTitle(/Raised Bed 1: 4/);
      expect(indicator.getAttribute('title')).toContain('Side Bed 2: 6');
    });
  });

  // ============================================
  // Selected state
  // ============================================

  describe('selected state', () => {
    it('applies selected class when isSelected is true', () => {
      const { container } = render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          isSelected={true}
        />
      );
      expect(container.firstElementChild?.className).toContain('Selected');
    });

    it('does not apply selected class when isSelected is false', () => {
      const { container } = render(
        <PlantingCard
          planting={createPlanting()}
          cultivar={createCultivar()}
          frost={createFrostWindow()}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          isSelected={false}
        />
      );
      expect(container.firstElementChild?.className).not.toContain('Selected');
    });
  });
});
