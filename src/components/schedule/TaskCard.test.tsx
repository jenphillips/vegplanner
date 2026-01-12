import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TaskCard } from './TaskCard';
import type { Task } from '@/lib/types';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    plantingId: 'planting-1',
    type: 'sow_indoor',
    date: '2025-03-15',
    title: 'Start Tomato Seeds',
    description: 'Plant seeds in seed trays',
    completed: false,
    ...overrides,
  };
}

describe('TaskCard', () => {
  it('renders task title', () => {
    const task = createTask({ title: 'Start Pepper Seeds' });
    render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    expect(screen.getByText('Start Pepper Seeds')).toBeInTheDocument();
  });

  it('renders task description when provided', () => {
    const task = createTask({ description: 'Use 72-cell trays' });
    render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    expect(screen.getByText('Use 72-cell trays')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const task = createTask({ description: undefined });
    render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    expect(screen.queryByText('Plant seeds in seed trays')).not.toBeInTheDocument();
  });

  it('renders formatted date', () => {
    const task = createTask({ date: '2025-03-15' });
    render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    expect(screen.getByText('Sat, Mar 15')).toBeInTheDocument();
  });

  it.each([
    ['sow_indoor', 'Start Indoors'],
    ['sow_direct', 'Direct Sow'],
    ['harden_off', 'Harden Off'],
    ['transplant', 'Transplant'],
    ['harvest_start', 'Harvest'],
  ] as const)('renders correct label for %s task type', (type, label) => {
    const task = createTask({ type });
    render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('calls onToggleComplete with task id when checkbox clicked', async () => {
    const user = userEvent.setup();
    const onToggleComplete = vi.fn();
    const task = createTask({ id: 'task-123' });
    render(<TaskCard task={task} onToggleComplete={onToggleComplete} />);

    await user.click(screen.getByRole('button', { name: /mark complete/i }));

    expect(onToggleComplete).toHaveBeenCalledWith('task-123');
    expect(onToggleComplete).toHaveBeenCalledTimes(1);
  });

  it('shows checkmark when task is completed', () => {
    const task = createTask({ completed: true });
    render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    expect(screen.getByRole('button', { name: /mark incomplete/i })).toHaveTextContent('✓');
  });

  it('shows empty checkbox when task is not completed', () => {
    const task = createTask({ completed: false });
    render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    expect(screen.getByRole('button', { name: /mark complete/i })).toHaveTextContent('');
  });

  it('applies completed class when task is completed', () => {
    const task = createTask({ completed: true });
    const { container } = render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('completed');
  });

  it('does not apply completed class when task is not completed', () => {
    const task = createTask({ completed: false });
    const { container } = render(<TaskCard task={task} onToggleComplete={vi.fn()} />);

    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain('completed');
  });
});
