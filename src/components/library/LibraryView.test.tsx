import { render, screen } from '@testing-library/react';
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
  plantType: 'vegetable',
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

const defaultProps = {
  baselines: [] as Cultivar[],
  loading: false,
  onAddToPlan: vi.fn(),
  onRemoveFromPlan: vi.fn(),
};

// ============================================
// Tests
// ============================================

describe('LibraryView', () => {
  describe('loading state', () => {
    it('shows loading message when loading', () => {
      render(
        <LibraryView cultivars={[]} plans={[]} {...defaultProps} loading={true} />
      );

      expect(screen.getByText('Loading library...')).toBeInTheDocument();
    });

    it('does not show loading message when not loading', () => {
      render(
        <LibraryView cultivars={[]} plans={[]} {...defaultProps} />
      );

      expect(screen.queryByText('Loading library...')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no cultivars', () => {
      render(
        <LibraryView cultivars={[]} plans={[]} {...defaultProps} />
      );

      expect(screen.getByText('No cultivars in library')).toBeInTheDocument();
    });

    it('shows filter message when filters result in no matches', async () => {
      const user = userEvent.setup();
      const cultivar = createCultivar({ crop: 'Tomato' });

      render(
        <LibraryView cultivars={[cultivar]} plans={[]} {...defaultProps} />
      );

      await user.type(screen.getByPlaceholderText('Search crops and varieties...'), 'Zucchini');

      expect(screen.getByText('No cultivars match your filters')).toBeInTheDocument();
    });
  });

  describe('rendering crop groups', () => {
    it('renders crop rows for each unique crop', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
        createCultivar({ id: 'c2', crop: 'Tomato', variety: 'Cherokee Purple' }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      expect(screen.getByText('Spinach')).toBeInTheDocument();
      expect(screen.getByText('Tomato')).toBeInTheDocument();
    });

    it('groups multiple varieties under one crop', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
        createCultivar({ id: 'c2', crop: 'Spinach', variety: 'Giant' }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      expect(screen.getByText('Spinach')).toBeInTheDocument();
      expect(screen.getByText('2 varieties')).toBeInTheDocument();
    });

    it('shows cultivar details when crop row is expanded', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
        createCultivar({ id: 'c2', crop: 'Spinach', variety: 'Giant' }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      // Varieties hidden when collapsed
      expect(screen.queryByText('Bloomsdale')).not.toBeInTheDocument();

      // Expand the Spinach row
      await user.click(screen.getByText('Spinach'));

      // Now varieties are visible
      expect(screen.getByText('Bloomsdale')).toBeInTheDocument();
      expect(screen.getByText('Giant')).toBeInTheDocument();
    });

    it('sorts crop groups alphabetically', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Tomato', variety: 'Roma' }),
        createCultivar({ id: 'c2', crop: 'Spinach', variety: 'Bloomsdale' }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      const buttons = screen.getAllByRole('button', { expanded: false });
      const cropHeaders = buttons.filter((b) => b.textContent?.includes('variet'));
      expect(cropHeaders[0].textContent).toContain('Spinach');
      expect(cropHeaders[1].textContent).toContain('Tomato');
    });
  });

  describe('plan status', () => {
    it('shows in-plan summary on crop row', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
        createCultivar({ id: 'c2', crop: 'Spinach', variety: 'Giant' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView cultivars={cultivars} plans={plans} {...defaultProps} />
      );

      expect(screen.getByText('1 in plan')).toBeInTheDocument();
    });

    it('shows correct counts in status filter', () => {
      const cultivars = [
        createCultivar({ id: 'c1' }),
        createCultivar({ id: 'c2' }),
        createCultivar({ id: 'c3' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView cultivars={cultivars} plans={plans} {...defaultProps} />
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
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      await user.type(screen.getByPlaceholderText('Search crops and varieties...'), 'Spinach');

      expect(screen.getByText('Spinach')).toBeInTheDocument();
      expect(screen.queryByText('Tomato')).not.toBeInTheDocument();
    });

    it('auto-expands crop rows when searching', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      await user.type(screen.getByPlaceholderText('Search crops and varieties...'), 'Bloom');

      expect(screen.getByText('Bloomsdale')).toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      const cultivar = createCultivar({ crop: 'Tomato' });

      render(
        <LibraryView cultivars={[cultivar]} plans={[]} {...defaultProps} />
      );

      await user.type(screen.getByPlaceholderText('Search crops and varieties...'), 'TOMATO');

      expect(screen.getByText('Tomato')).toBeInTheDocument();
    });
  });

  describe('status filter', () => {
    it('filters to show only in-plan crop groups', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach' }),
        createCultivar({ id: 'c2', crop: 'Tomato' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView cultivars={cultivars} plans={plans} {...defaultProps} />
      );

      await user.click(screen.getByText('In Plan (1)'));

      expect(screen.getByText('Spinach')).toBeInTheDocument();
      expect(screen.queryByText('Tomato')).not.toBeInTheDocument();
    });

    it('filters to show only not-in-plan crop groups', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach' }),
        createCultivar({ id: 'c2', crop: 'Tomato' }),
      ];
      const plans = [createPlan({ cultivarId: 'c1' })];

      render(
        <LibraryView cultivars={cultivars} plans={plans} {...defaultProps} />
      );

      await user.click(screen.getByText('Not in Plan (1)'));

      expect(screen.queryByText('Spinach')).not.toBeInTheDocument();
      expect(screen.getByText('Tomato')).toBeInTheDocument();
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
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      await user.click(screen.getByText('Flowers'));

      expect(screen.queryByText('Spinach')).not.toBeInTheDocument();
      expect(screen.getByText('Zinnia')).toBeInTheDocument();
    });
  });

  describe('default entry support', () => {
    it('uses baseline cultivar data for crop header details', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
      ];
      const baselines = [
        createCultivar({ id: 'baseline-spinach', crop: 'Spinach', variety: 'Baseline', maturityDays: 40 }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} baselines={baselines} />
      );

      // Baseline data is used to display header details like maturity days
      expect(screen.getByText('40d')).toBeInTheDocument();
    });

    it('shows cultivar cards when expanded (no separate default section)', async () => {
      const user = userEvent.setup();
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
      ];
      const baselines = [
        createCultivar({ id: 'baseline-spinach', crop: 'Spinach', variety: 'Baseline' }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} baselines={baselines} />
      );

      await user.click(screen.getByText('Spinach'));

      // Cultivar cards are shown directly, no "Default" section
      expect(screen.getByText('Bloomsdale')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onAddToPlan when add button clicked inside expanded crop row', async () => {
      const user = userEvent.setup();
      const onAddToPlan = vi.fn().mockResolvedValue(undefined);
      const cultivar = createCultivar({ id: 'test-cultivar' });

      render(
        <LibraryView
          cultivars={[cultivar]}
          plans={[]}
          {...defaultProps}
          onAddToPlan={onAddToPlan}
        />
      );

      await user.click(screen.getByText('Spinach'));
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
          {...defaultProps}
          onRemoveFromPlan={onRemoveFromPlan}
        />
      );

      await user.click(screen.getByText('Spinach'));
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onRemoveFromPlan).toHaveBeenCalledWith('test-cultivar');
    });
  });

  describe('nested crop families', () => {
    const pepperCultivars = [
      createCultivar({ id: 'p1', crop: 'Pepper (Bell)', variety: 'California Wonder' }),
      createCultivar({ id: 'p2', crop: 'Pepper (Bell)', variety: 'King of the North' }),
      createCultivar({ id: 'p3', crop: 'Pepper (Hot)', variety: 'Cayenne' }),
      createCultivar({ id: 'p4', crop: 'Pepper (Sweet)', variety: 'Shishito' }),
    ];

    it('renders a family header for crops with multiple sub-groups', () => {
      render(
        <LibraryView cultivars={pepperCultivars} plans={[]} {...defaultProps} />
      );

      // Should show "Pepper" as the family header with total count
      expect(screen.getByText('Pepper')).toBeInTheDocument();
      expect(screen.getByText('4 varieties')).toBeInTheDocument();
    });

    it('shows sub-group headers when family is expanded', async () => {
      const user = userEvent.setup();

      render(
        <LibraryView cultivars={pepperCultivars} plans={[]} {...defaultProps} />
      );

      // Sub-groups hidden when collapsed
      expect(screen.queryByText('Bell')).not.toBeInTheDocument();

      // Expand the Pepper family
      await user.click(screen.getByText('Pepper'));

      // Sub-group headers should appear with qualifier names
      expect(screen.getByText('Bell')).toBeInTheDocument();
      expect(screen.getByText('Hot')).toBeInTheDocument();
      expect(screen.getByText('Sweet')).toBeInTheDocument();
    });

    it('shows cultivar cards when sub-group is expanded', async () => {
      const user = userEvent.setup();

      render(
        <LibraryView cultivars={pepperCultivars} plans={[]} {...defaultProps} />
      );

      // Expand family, then expand Bell sub-group
      await user.click(screen.getByText('Pepper'));
      await user.click(screen.getByText('Bell'));

      expect(screen.getByText('California Wonder')).toBeInTheDocument();
      expect(screen.getByText('King of the North')).toBeInTheDocument();
      // Hot varieties should still be hidden
      expect(screen.queryByText('Cayenne')).not.toBeInTheDocument();
    });

    it('keeps single-sub-group crops as flat rows', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Spinach', variety: 'Bloomsdale' }),
        ...pepperCultivars,
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      // Spinach should be a flat row (no nesting)
      expect(screen.getByText('Spinach')).toBeInTheDocument();
      expect(screen.getByText('1 variety')).toBeInTheDocument();

      // Pepper should be a family row
      expect(screen.getByText('Pepper')).toBeInTheDocument();
      expect(screen.getByText('4 varieties')).toBeInTheDocument();
    });

    it('shows total in-plan count on family header', () => {
      const plans = [
        createPlan({ cultivarId: 'p1' }),
        createPlan({ cultivarId: 'p3' }),
      ];

      render(
        <LibraryView cultivars={pepperCultivars} plans={plans} {...defaultProps} />
      );

      expect(screen.getByText('2 in plan')).toBeInTheDocument();
    });

    it('auto-expands both levels when searching', async () => {
      const user = userEvent.setup();

      render(
        <LibraryView cultivars={pepperCultivars} plans={[]} {...defaultProps} />
      );

      // Search for a term that matches cultivars across multiple sub-groups
      await user.type(screen.getByPlaceholderText('Search crops and varieties...'), 'Pepper');

      // Family header, sub-groups, and cultivar cards should all be visible
      expect(screen.getByText('Pepper')).toBeInTheDocument();
      expect(screen.getByText('Bell')).toBeInTheDocument();
      expect(screen.getByText('Hot')).toBeInTheDocument();
      expect(screen.getByText('Sweet')).toBeInTheDocument();
      expect(screen.getByText('California Wonder')).toBeInTheDocument();
      expect(screen.getByText('Cayenne')).toBeInTheDocument();
    });

    it('sorts families alphabetically alongside flat crops', () => {
      const cultivars = [
        createCultivar({ id: 'c1', crop: 'Tomato', variety: 'Roma' }),
        ...pepperCultivars,
        createCultivar({ id: 'c2', crop: 'Arugula', variety: 'Roquette' }),
      ];

      render(
        <LibraryView cultivars={cultivars} plans={[]} {...defaultProps} />
      );

      const buttons = screen.getAllByRole('button', { expanded: false });
      const cropHeaders = buttons.filter((b) => b.textContent?.includes('variet'));
      expect(cropHeaders[0].textContent).toContain('Arugula');
      expect(cropHeaders[1].textContent).toContain('Pepper');
      expect(cropHeaders[2].textContent).toContain('Tomato');
    });
  });
});
