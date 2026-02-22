import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { LibraryCultivarCard } from './LibraryCultivarCard';
import type { Cultivar } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'spinach-1',
  crop: 'Spinach',
  variety: 'Bloomsdale',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 40,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  ...overrides,
});

// ============================================
// Tests
// ============================================

describe('LibraryCultivarCard', () => {
  describe('rendering', () => {
    it('renders crop and variety', () => {
      const cultivar = createCultivar({ crop: 'Tomato', variety: 'Cherokee Purple' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('Tomato')).toBeInTheDocument();
      expect(screen.getByText('Cherokee Purple')).toBeInTheDocument();
    });

    it('hides crop name when showCropName is false', () => {
      const cultivar = createCultivar({ crop: 'Tomato', variety: 'Cherokee Purple' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
          showCropName={false}
        />
      );

      expect(screen.queryByText('Tomato')).not.toBeInTheDocument();
      expect(screen.getByText('Cherokee Purple')).toBeInTheDocument();
    });

    it('renders maturity days', () => {
      const cultivar = createCultivar({ maturityDays: 65 });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('65d')).toBeInTheDocument();
    });

    it('renders temperature range when both min and max provided', () => {
      const cultivar = createCultivar({ minGrowingTempC: 10, maxGrowingTempC: 24 });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText(/10–24°C/)).toBeInTheDocument();
    });

    it('does not render temperature range when values missing', () => {
      const cultivar = createCultivar({ minGrowingTempC: null, maxGrowingTempC: null });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.queryByText(/°C/)).not.toBeInTheDocument();
    });
  });

  describe('sow method badge', () => {
    it('shows Direct sow for direct method', () => {
      const cultivar = createCultivar({ sowMethod: 'direct' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('Direct sow')).toBeInTheDocument();
    });

    it('shows Transplant for transplant method', () => {
      const cultivar = createCultivar({ sowMethod: 'transplant' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('Transplant')).toBeInTheDocument();
    });

    it('shows both Direct sow and Transplant badges for either method', () => {
      const cultivar = createCultivar({ sowMethod: 'either' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('Direct sow')).toBeInTheDocument();
      expect(screen.getByText('Transplant')).toBeInTheDocument();
    });
  });

  describe('harvest style badge', () => {
    it('shows Continuous badge for continuous harvest', () => {
      const cultivar = createCultivar({ harvestStyle: 'continuous' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('Continuous')).toBeInTheDocument();
    });

    it('does not show Continuous badge for single harvest', () => {
      const cultivar = createCultivar({ harvestStyle: 'single' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.queryByText('Continuous')).not.toBeInTheDocument();
    });
  });

  describe('plan status', () => {
    it('shows In Plan badge when in plan', () => {
      const cultivar = createCultivar();

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={true}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('In Plan')).toBeInTheDocument();
    });

    it('does not show In Plan badge when not in plan', () => {
      const cultivar = createCultivar();

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.queryByText('In Plan')).not.toBeInTheDocument();
    });

    it('shows Add to Plan button when not in plan', () => {
      const cultivar = createCultivar();

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: 'Add to Plan' })).toBeInTheDocument();
    });

    it('shows Remove button when in plan', () => {
      const cultivar = createCultivar();

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={true}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onAddToPlan when Add button clicked', async () => {
      const user = userEvent.setup();
      const onAddToPlan = vi.fn();
      const cultivar = createCultivar({ id: 'test-id' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={false}
          onAddToPlan={onAddToPlan}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Add to Plan' }));

      expect(onAddToPlan).toHaveBeenCalledWith('test-id');
    });

    it('calls onRemoveFromPlan when Remove button clicked', async () => {
      const user = userEvent.setup();
      const onRemoveFromPlan = vi.fn();
      const cultivar = createCultivar({ id: 'test-id' });

      render(
        <LibraryCultivarCard
          cultivar={cultivar}
          inPlan={true}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={onRemoveFromPlan}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onRemoveFromPlan).toHaveBeenCalledWith('test-id');
    });
  });
});
