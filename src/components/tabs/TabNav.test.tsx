import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TabNav, Tab } from './TabNav';

describe('TabNav', () => {
  const tabs: Tab[] = ['vegetables', 'flowers', 'calendar', 'tasks', 'garden'];

  it('renders all tab buttons', () => {
    const onTabChange = vi.fn();
    render(<TabNav activeTab="vegetables" onTabChange={onTabChange} />);

    expect(screen.getByRole('button', { name: /vegetables/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /flowers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /garden/i })).toBeInTheDocument();
  });

  it.each(tabs)('calls onTabChange with "%s" when clicked', async (tab) => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<TabNav activeTab="vegetables" onTabChange={onTabChange} />);

    const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);
    await user.click(screen.getByRole('button', { name: tabName }));

    expect(onTabChange).toHaveBeenCalledWith(tab);
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });

  it.each(tabs)('applies active class to "%s" tab when active', (tab) => {
    const onTabChange = vi.fn();
    render(<TabNav activeTab={tab} onTabChange={onTabChange} />);

    const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);
    const button = screen.getByRole('button', { name: tabName });

    expect(button.className).toContain('active');
  });

  it('only applies active class to the active tab', () => {
    const onTabChange = vi.fn();
    render(<TabNav activeTab="calendar" onTabChange={onTabChange} />);

    const calendarButton = screen.getByRole('button', { name: /calendar/i });
    const vegetablesButton = screen.getByRole('button', { name: /vegetables/i });
    const flowersButton = screen.getByRole('button', { name: /flowers/i });

    expect(calendarButton.className).toContain('active');
    expect(vegetablesButton.className).not.toContain('active');
    expect(flowersButton.className).not.toContain('active');
  });
});
