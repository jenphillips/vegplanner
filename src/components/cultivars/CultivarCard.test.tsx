import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CultivarCard } from './CultivarCard';
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

const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'spinach-1',
  crop: 'Spinach',
  variety: 'Bloomsdale',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 40,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  directAfterLsfDays: -28,
  frostSensitive: false,
  minGrowingTempC: 4,
  maxGrowingTempC: 24,
  harvestDurationDays: 21,
  harvestStyle: 'continuous',
  ...overrides,
});

const createPlanting = (overrides: Partial<Planting> = {}): Planting => ({
  id: 'planting-1',
  cultivarId: 'spinach-1',
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

const defaultProps = () => ({
  frost: createFrostWindow(),
  climate: createClimate(),
  plantings: [] as Planting[],
  onAddPlanting: vi.fn(),
  onAddMultiplePlantings: vi.fn(),
  onUpdatePlanting: vi.fn(),
  onDeletePlanting: vi.fn(),
});

// ============================================
// Header rendering
// ============================================

describe('CultivarCard', () => {
  describe('header', () => {
    it('renders crop name and variety', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} />
      );
      expect(screen.getByText('Spinach — Bloomsdale')).toBeTruthy();
    });

    it('shows maturity info for annuals', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} />
      );
      expect(screen.getByText(/40 days from direct sow/)).toBeTruthy();
    });

    it('shows temperature range when both min and max set', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({ minGrowingTempC: 4, maxGrowingTempC: 24 })}
          {...defaultProps()}
        />
      );
      expect(screen.getByText(/4–24°C/)).toBeTruthy();
    });

    it('shows method badge', () => {
      render(
        <CultivarCard cultivar={createCultivar({ sowMethod: 'transplant' })} {...defaultProps()} />
      );
      expect(screen.getByText('Transplant')).toBeTruthy();
    });

    it('shows planting count badge when plantings exist', () => {
      const props = defaultProps();
      props.plantings = [createPlanting(), createPlanting({ id: 'planting-2', successionNumber: 2 })];
      render(
        <CultivarCard cultivar={createCultivar()} {...props} />
      );
      expect(screen.getByText('2 plantings')).toBeTruthy();
    });

    it('shows perennial badge for perennial cultivars', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({ isPerennial: true, perennialHarvestStartDaysAfterLSF: 14 })}
          {...defaultProps()}
        />
      );
      expect(screen.getByText('Perennial')).toBeTruthy();
    });
  });

  // ============================================
  // Expand / Collapse
  // ============================================

  describe('expand and collapse', () => {
    it('starts collapsed by default', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} />
      );
      expect(screen.queryByText(/Initial plants/)).toBeNull();
    });

    it('expands on header click', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} />
      );
      fireEvent.click(screen.getByText('Spinach — Bloomsdale'));
      expect(screen.getByText(/Initial plants/)).toBeTruthy();
    });

    it('starts expanded when forceExpanded is true', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} forceExpanded={true} />
      );
      expect(screen.getByText(/Initial plants/)).toBeTruthy();
    });
  });

  // ============================================
  // Growing constraints display
  // ============================================

  describe('growing constraints', () => {
    it('shows "Can\'t grow outdoors" label for heat-sensitive crops', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({ maxGrowingTempC: 21 })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      // Spinach with maxGrowingTempC 21 will have hot constraints in summer
      expect(screen.getByText("Can't grow outdoors:")).toBeTruthy();
    });

    it('shows hot constraint periods with "too hot" label', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({ maxGrowingTempC: 21 })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      expect(screen.getByText(/too hot/)).toBeTruthy();
    });

    it('shows cold constraint periods with "too cold" label', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({ minGrowingTempC: 10, maxGrowingTempC: 35, frostSensitive: true })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      // Frost-sensitive crop with minGrowingTempC 10 will have cold constraints in winter
      // May have multiple cold periods (early + late winter)
      expect(screen.getAllByText(/too cold/).length).toBeGreaterThan(0);
    });

    it('shows both hot and cold constraints for sensitive crops', () => {
      // A crop that's both frost-sensitive AND heat-sensitive
      render(
        <CultivarCard
          cultivar={createCultivar({
            minGrowingTempC: 10,
            maxGrowingTempC: 21,
            frostSensitive: true,
          })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      expect(screen.getByText(/too hot/)).toBeTruthy();
      expect(screen.getAllByText(/too cold/).length).toBeGreaterThan(0);
    });

    it('does not show constraints for heat-tolerant crops', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({
            minGrowingTempC: undefined,
            maxGrowingTempC: 35,
            frostSensitive: false,
          })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      expect(screen.queryByText("Can't grow outdoors:")).toBeNull();
    });

    it('renders constraint date ranges in readable format', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({ maxGrowingTempC: 21 })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      // Hot constraint should span summer months — check for month abbreviations
      const constraintText = screen.getByText(/too hot/)?.parentElement?.textContent;
      // Date range should use "Mon D" format (e.g. "Jun 15 – Sep 3")
      expect(constraintText).toMatch(/[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+/);
    });
  });

  // ============================================
  // Planting actions
  // ============================================

  describe('planting actions', () => {
    it('shows "Generate Initial Planting" when no plantings exist', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} forceExpanded={true} />
      );
      expect(screen.getByText('Generate Initial Planting')).toBeTruthy();
    });

    it('shows "Add Succession" when plantings exist', () => {
      const props = defaultProps();
      props.plantings = [createPlanting()];
      render(
        <CultivarCard cultivar={createCultivar()} {...props} forceExpanded={true} />
      );
      expect(screen.getByText('+ Add Succession')).toBeTruthy();
    });

    it('calls onAddPlanting when "Generate Initial Planting" is clicked', () => {
      const props = defaultProps();
      render(
        <CultivarCard cultivar={createCultivar()} {...props} forceExpanded={true} />
      );
      fireEvent.click(screen.getByText('Generate Initial Planting'));
      expect(props.onAddPlanting).toHaveBeenCalledWith(
        expect.objectContaining({
          cultivarId: 'spinach-1',
          method: 'direct',
        })
      );
    });

    it('hides succession button for perennial cultivars', () => {
      const props = defaultProps();
      props.plantings = [createPlanting({ cultivarId: 'perennial-1' })];
      render(
        <CultivarCard
          cultivar={createCultivar({ id: 'perennial-1', isPerennial: true, perennialHarvestStartDaysAfterLSF: 14 })}
          {...props}
          forceExpanded={true}
        />
      );
      expect(screen.queryByText('+ Add Succession')).toBeNull();
    });

    it('disables "Generate Initial Planting" when no windows available', () => {
      // Use a cultivar with impossible temperature requirements
      render(
        <CultivarCard
          cultivar={createCultivar({
            minGrowingTempC: 25,
            maxGrowingTempC: 26,
            frostSensitive: true,
          })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      const button = screen.getByText('Generate Initial Planting');
      expect(button).toHaveProperty('disabled', true);
    });
  });

  // ============================================
  // Remove from plan
  // ============================================

  describe('remove from plan', () => {
    it('does not render remove button when onRemoveFromPlan is not provided', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} forceExpanded={true} />
      );
      expect(screen.queryByLabelText('Remove from plan')).toBeNull();
    });

    it('renders trash icon button when onRemoveFromPlan is provided', () => {
      const props = defaultProps();
      render(
        <CultivarCard
          cultivar={createCultivar()}
          {...props}
          onRemoveFromPlan={vi.fn()}
          forceExpanded={true}
        />
      );
      expect(screen.getByLabelText('Remove from plan')).toBeTruthy();
    });

    it('does not render remove button when card is collapsed', () => {
      render(
        <CultivarCard
          cultivar={createCultivar()}
          {...defaultProps()}
          onRemoveFromPlan={vi.fn()}
        />
      );
      expect(screen.queryByLabelText('Remove from plan')).toBeNull();
    });

    it('calls onRemoveFromPlan when confirmed', () => {
      const onRemove = vi.fn();
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      const props = defaultProps();
      render(
        <CultivarCard
          cultivar={createCultivar()}
          {...props}
          onRemoveFromPlan={onRemove}
          forceExpanded={true}
        />
      );
      fireEvent.click(screen.getByLabelText('Remove from plan'));
      expect(onRemove).toHaveBeenCalledWith('spinach-1');
    });

    it('does not call onRemoveFromPlan when cancelled', () => {
      const onRemove = vi.fn();
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      const props = defaultProps();
      render(
        <CultivarCard
          cultivar={createCultivar()}
          {...props}
          onRemoveFromPlan={onRemove}
          forceExpanded={true}
        />
      );
      fireEvent.click(screen.getByLabelText('Remove from plan'));
      expect(onRemove).not.toHaveBeenCalled();
    });

    it('confirm message mentions planting count when plantings exist', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const props = defaultProps();
      props.plantings = [
        createPlanting(),
        createPlanting({ id: 'planting-2', successionNumber: 2 }),
      ];
      render(
        <CultivarCard
          cultivar={createCultivar()}
          {...props}
          onRemoveFromPlan={vi.fn()}
          forceExpanded={true}
        />
      );
      fireEvent.click(screen.getByLabelText('Remove from plan'));
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('2 plantings')
      );
    });

    it('confirm message does not mention plantings when none exist', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const props = defaultProps();
      render(
        <CultivarCard
          cultivar={createCultivar()}
          {...props}
          onRemoveFromPlan={vi.fn()}
          forceExpanded={true}
        />
      );
      fireEvent.click(screen.getByLabelText('Remove from plan'));
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.not.stringContaining('planting')
      );
    });
  });

  // ============================================
  // Diagnostic warning
  // ============================================

  describe('diagnostic warning', () => {
    it('shows diagnostic when no planting windows available', () => {
      render(
        <CultivarCard
          cultivar={createCultivar({
            minGrowingTempC: 25,
            maxGrowingTempC: 26,
            frostSensitive: true,
          })}
          {...defaultProps()}
          forceExpanded={true}
        />
      );
      expect(screen.getByText('No planting windows available:')).toBeTruthy();
    });

    it('does not show diagnostic when windows exist', () => {
      render(
        <CultivarCard cultivar={createCultivar()} {...defaultProps()} forceExpanded={true} />
      );
      expect(screen.queryByText('No planting windows available:')).toBeNull();
    });
  });
});
