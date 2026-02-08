import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { LibraryView } from './LibraryView';
import type { Cultivar, PlantingPlan } from '@/lib/types';

// ============================================
// Test Fixtures
// ============================================

const createCultivar = (overrides: Partial<Cultivar> = {}): Cultivar => ({
  id: 'cultivar-1',
  crop: 'Spinach',
  variety: 'Bloomsdale',
  germDaysMin: 5,
  germDaysMax: 10,
  maturityDays: 40,
  maturityBasis: 'from_sow',
  sowMethod: 'direct',
  ...overrides,
});

const createPlan = (overrides: Partial<PlantingPlan> = {}): PlantingPlan => ({
  id: 'plan-1',
  cultivarId: 'cultivar-1',
  season: 'spring',
  frostWindowId: 'frost-1',
  ...overrides,
});

// ============================================
// Tests
// ============================================

describe('LibraryView', () => {
  describe('loading state', () => {
    it('shows loading message when loading', () => {
      render(
        <LibraryView
          cultivars={[]}
          plans={[]}
          loading={true}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('Loading library...')).toBeInTheDocument();
    });

    it('does not show loading message when not loading', () => {
      render(
        <LibraryView
          cultivars={[]}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.queryByText('Loading library...')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no cultivars', () => {
      render(
        <LibraryView
          cultivars={[]}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('No cultivars in library')).toBeInTheDocument();
    });

    it('shows filter message when filters result in no matches', async () => {
      const user = userEvent.setup();
      const cultivar = createCultivar({ crop: 'Tomato' });

      render(
        <LibraryView
          cultivars={[cultivar]}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search cultivars...'), 'Spinach');

      expect(screen.getByText('No cultivars match your filters')).toBeInTheDocument();
    });
  });

  describe('rendering cultivars', () => {
    it('renders all cultivars', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
        createCultivar({ id: 'c2', crop: 'Tomato', variety: 'Cherokee Purple' }),
      ];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText(/Spinach — Bloomsdale/)).toBeInTheDocument();
      expect(screen.getByText(/Tomato — Cherokee Purple/)).toBeInTheDocument();
    });

    it('sorts cultivars alphabetically by crop then variety', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Tomato', variety: 'Roma' }),
        createCultivar({ id: 'c2', crop: 'Spinach', variety: 'Giant' }),
        createCultivar({ id: 'c3', crop: 'Spinach', variety: 'Bloomsdale' }),
      ];

      const { container } = render(
        <LibraryView
          cultivars={cultivars}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      const cards = container.querySelectorAll('[class*="card"]');
      const texts = Array.from(cards).map((card) => card.textContent);

      // Should be ordered: Spinach Bloomsdale, Spinach Giant, Tomato Roma
      expect(texts[0]).toContain('Spinach — Bloomsdale');
      expect(texts[1]).toContain('Spinach — Giant');
      expect(texts[2]).toContain('Tomato — Roma');
    });
  });

  describe('plan status', () => {
    it('marks cultivars in plan correctly', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach' }),
        createCultivar({ id: 'c2', crop: 'Tomato' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={plans}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      // Spinach should show "Remove from Plan" button
      const spinachSection = screen.getByText(/Spinach/).closest('[class*="card"]');
      expect(within(spinachSection!).getByText('In Plan')).toBeInTheDocument();

      // Tomato should show "Add to Plan" button
      const tomatoSection = screen.getByText(/Tomato/).closest('[class*="card"]');
      expect(within(tomatoSection!).queryByText('In Plan')).not.toBeInTheDocument();
    });

    it('shows correct counts in status filter', () => {
      const cultivars = [
        createCultivar({ id: 'c1' }),
        createCultivar({ id: 'c2' }),
        createCultivar({ id: 'c3' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={plans}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      expect(screen.getByText('All (3)')).toBeInTheDocument();
      expect(screen.getByText('In Plan (1)')).toBeInTheDocument();
      expect(screen.getByText('Not in Plan (2)')).toBeInTheDocument();
    });
  });

  describe('search filter', () => {
    it('filters by crop name', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach' }),
        createCultivar({ id: 'c2', crop: 'Tomato' }),
      ];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search cultivars...'), 'Spinach');

      expect(screen.getByText(/Spinach/)).toBeInTheDocument();
      expect(screen.queryByText(/Tomato/)).not.toBeInTheDocument();
    });

    it('filters by variety name', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', variety: 'Bloomsdale' }),
        createCultivar({ id: 'c2', variety: 'Roma' }),
      ];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search cultivars...'), 'Roma');

      expect(screen.getByText(/Roma/)).toBeInTheDocument();
      expect(screen.queryByText(/Bloomsdale/)).not.toBeInTheDocument();
    });

    it('filters by notes', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', notes: 'Heat tolerant' }),
        createCultivar({ id: 'c2', crop: 'Lettuce', notes: 'Bolt resistant' }),
      ];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search cultivars...'), 'heat');

      expect(screen.getByText(/Spinach/)).toBeInTheDocument();
      expect(screen.queryByText(/Lettuce/)).not.toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      const cultivar = createCultivar({ crop: 'Tomato' });

      render(
        <LibraryView
          cultivars={[cultivar]}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.type(screen.getByPlaceholderText('Search cultivars...'), 'TOMATO');

      expect(screen.getByText(/Tomato/)).toBeInTheDocument();
    });
  });

  describe('status filter', () => {
    it('filters to show only in-plan cultivars', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach' }),
        createCultivar({ id: 'c2', crop: 'Tomato' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={plans}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.click(screen.getByText('In Plan (1)'));

      expect(screen.getByText(/Spinach/)).toBeInTheDocument();
      expect(screen.queryByText(/Tomato/)).not.toBeInTheDocument();
    });

    it('filters to show only not-in-plan cultivars', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach' }),
        createCultivar({ id: 'c2', crop: 'Tomato' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={plans}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.click(screen.getByText('Not in Plan (1)'));

      expect(screen.queryByText(/Spinach/)).not.toBeInTheDocument();
      expect(screen.getByText(/Tomato/)).toBeInTheDocument();
    });

    it('shows all when All clicked', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach' }),
        createCultivar({ id: 'c2', crop: 'Tomato' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={plans}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      // First filter to in-plan only
      await user.click(screen.getByText('In Plan (1)'));
      expect(screen.queryByText(/Tomato/)).not.toBeInTheDocument();

      // Then click All
      await user.click(screen.getByText('All (2)'));

      expect(screen.getByText(/Spinach/)).toBeInTheDocument();
      expect(screen.getByText(/Tomato/)).toBeInTheDocument();
    });
  });

  describe('plant type filter', () => {
    it('filters by plant type', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', plantType: 'vegetable' }),
        createCultivar({ id: 'c2', crop: 'Zinnia', plantType: 'flower' }),
      ];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      // Click on flower filter
      await user.click(screen.getByText('Flowers'));

      expect(screen.queryByText(/Spinach/)).not.toBeInTheDocument();
      expect(screen.getByText(/Zinnia/)).toBeInTheDocument();
    });

    it('defaults undefined plantType to vegetable', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', plantType: undefined }),
        createCultivar({ id: 'c2', crop: 'Zinnia', plantType: 'flower' }),
      ];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={[]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      // Click on vegetable filter
      await user.click(screen.getByText('Vegetables'));

      expect(screen.getByText(/Spinach/)).toBeInTheDocument();
      expect(screen.queryByText(/Zinnia/)).not.toBeInTheDocument();
    });
  });

  describe('combined filters', () => {
    it('applies multiple filters together', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
        createCultivar({ id: 'c2', crop: 'Spinach', variety: 'Giant' }),
        createCultivar({ id: 'c3', crop: 'Tomato', variety: 'Roma' }),
      ];
      const plans = [
        createPlan({ id: 'p1', cultivarId: 'c1' }),
        createPlan({ id: 'p2', cultivarId: 'c3' }),
      ];

      render(
        <LibraryView
          cultivars={cultivars}
          plans={plans}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={vi.fn()}
        />
      );

      // Search for Spinach
      await user.type(screen.getByPlaceholderText('Search cultivars...'), 'Spinach');
      // Filter to in-plan only
      await user.click(screen.getByText('In Plan (2)'));

      // Only Spinach Bloomsdale should match (in plan + matches search)
      expect(screen.getByText(/Bloomsdale/)).toBeInTheDocument();
      expect(screen.queryByText(/Giant/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Roma/)).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onAddToPlan when add button clicked', async () => {
      const user = userEvent.setup();
      const onAddToPlan = vi.fn().mockResolvedValue(undefined);
      const cultivar = createCultivar({ id: 'test-cultivar' });

      render(
        <LibraryView
          cultivars={[cultivar]}
          plans={[]}
          loading={false}
          onAddToPlan={onAddToPlan}
          onRemoveFromPlan={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Add to Plan' }));

      expect(onAddToPlan).toHaveBeenCalledWith('test-cultivar');
    });

    it('calls onRemoveFromPlan when remove button clicked', async () => {
      const user = userEvent.setup();
      const onRemoveFromPlan = vi.fn().mockResolvedValue(undefined);
      const cultivar = createCultivar({ id: 'test-cultivar' });
      const plan = createPlan({ cultivarId: 'test-cultivar' });

      render(
        <LibraryView
          cultivars={[cultivar]}
          plans={[plan]}
          loading={false}
          onAddToPlan={vi.fn()}
          onRemoveFromPlan={onRemoveFromPlan}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Remove from Plan' }));

      expect(onRemoveFromPlan).toHaveBeenCalledWith('test-cultivar');
    });
  });
});
