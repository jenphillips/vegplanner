import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PlantTypeFilter } from './PlantTypeFilter';

// ============================================
// Tests
// ============================================

describe('PlantTypeFilter', () => {
  describe('rendering', () => {
    it('renders all three filter options', () => {
      render(<PlantTypeFilter value="all" onChange={vi.fn()} />);

      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /vegetables/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /flowers/i })).toBeInTheDocument();
    });

    it('renders buttons with type="button"', () => {
      render(<PlantTypeFilter value="all" onChange={vi.fn()} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('type', 'button');
      });
    });
  });

  describe('active state', () => {
    it('marks "All" as active when value is "all"', () => {
      render(<PlantTypeFilter value="all" onChange={vi.fn()} />);

      const allButton = screen.getByRole('button', { name: /all/i });
      expect(allButton.className).toContain('active');

      const vegetablesButton = screen.getByRole('button', { name: /vegetables/i });
      expect(vegetablesButton.className).not.toContain('active');

      const flowersButton = screen.getByRole('button', { name: /flowers/i });
      expect(flowersButton.className).not.toContain('active');
    });

    it('marks "Vegetables" as active when value is "vegetable"', () => {
      render(<PlantTypeFilter value="vegetable" onChange={vi.fn()} />);

      const allButton = screen.getByRole('button', { name: /all/i });
      expect(allButton.className).not.toContain('active');

      const vegetablesButton = screen.getByRole('button', { name: /vegetables/i });
      expect(vegetablesButton.className).toContain('active');

      const flowersButton = screen.getByRole('button', { name: /flowers/i });
      expect(flowersButton.className).not.toContain('active');
    });

    it('marks "Flowers" as active when value is "flower"', () => {
      render(<PlantTypeFilter value="flower" onChange={vi.fn()} />);

      const allButton = screen.getByRole('button', { name: /all/i });
      expect(allButton.className).not.toContain('active');

      const vegetablesButton = screen.getByRole('button', { name: /vegetables/i });
      expect(vegetablesButton.className).not.toContain('active');

      const flowersButton = screen.getByRole('button', { name: /flowers/i });
      expect(flowersButton.className).toContain('active');
    });
  });

  describe('click behavior', () => {
    it('calls onChange with "all" when All button clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PlantTypeFilter value="vegetable" onChange={onChange} />);

      await user.click(screen.getByRole('button', { name: /all/i }));

      expect(onChange).toHaveBeenCalledWith('all');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChange with "vegetable" when Vegetables button clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PlantTypeFilter value="all" onChange={onChange} />);

      await user.click(screen.getByRole('button', { name: /vegetables/i }));

      expect(onChange).toHaveBeenCalledWith('vegetable');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChange with "flower" when Flowers button clicked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PlantTypeFilter value="all" onChange={onChange} />);

      await user.click(screen.getByRole('button', { name: /flowers/i }));

      expect(onChange).toHaveBeenCalledWith('flower');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChange even when clicking already active option', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PlantTypeFilter value="all" onChange={onChange} />);

      await user.click(screen.getByRole('button', { name: /all/i }));

      expect(onChange).toHaveBeenCalledWith('all');
    });
  });

  describe('keyboard navigation', () => {
    it('allows keyboard activation of buttons', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PlantTypeFilter value="all" onChange={onChange} />);

      const vegetablesButton = screen.getByRole('button', { name: /vegetables/i });
      vegetablesButton.focus();

      await user.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith('vegetable');
    });

    it('allows space key activation of buttons', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PlantTypeFilter value="all" onChange={onChange} />);

      const flowersButton = screen.getByRole('button', { name: /flowers/i });
      flowersButton.focus();

      await user.keyboard(' ');

      expect(onChange).toHaveBeenCalledWith('flower');
    });
  });

  describe('prop updates', () => {
    it('updates active state when value prop changes', () => {
      const { rerender } = render(<PlantTypeFilter value="all" onChange={vi.fn()} />);

      let allButton = screen.getByRole('button', { name: /all/i });
      expect(allButton.className).toContain('active');

      rerender(<PlantTypeFilter value="vegetable" onChange={vi.fn()} />);

      allButton = screen.getByRole('button', { name: /all/i });
      expect(allButton.className).not.toContain('active');

      const vegetablesButton = screen.getByRole('button', { name: /vegetables/i });
      expect(vegetablesButton.className).toContain('active');
    });
  });

  describe('multiple clicks', () => {
    it('handles rapid clicking correctly', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<PlantTypeFilter value="all" onChange={onChange} />);

      const vegetablesButton = screen.getByRole('button', { name: /vegetables/i });
      const flowersButton = screen.getByRole('button', { name: /flowers/i });

      await user.click(vegetablesButton);
      await user.click(flowersButton);
      await user.click(vegetablesButton);

      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange).toHaveBeenNthCalledWith(1, 'vegetable');
      expect(onChange).toHaveBeenNthCalledWith(2, 'flower');
      expect(onChange).toHaveBeenNthCalledWith(3, 'vegetable');
    });
  });

  describe('accessibility', () => {
    it('has accessible button labels', () => {
      render(<PlantTypeFilter value="all" onChange={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Vegetables' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Flowers' })).toBeInTheDocument();
    });
  });
});
