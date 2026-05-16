/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangeFilter } from './date-range-filter';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push }),
  usePathname: () => '/beithady/ads',
  useSearchParams: () => new URLSearchParams('preset=30d'),
}));

describe('DateRangeFilter', () => {
  it('renders preset chips + custom range + compare toggle', () => {
    render(<DateRangeFilter />);
    expect(screen.getByText('7d')).toBeTruthy();
    expect(screen.getByText('30d')).toBeTruthy();
    expect(screen.getByText('90d')).toBeTruthy();
    expect(screen.getByText('Lifetime')).toBeTruthy();
    expect(screen.getByLabelText(/compare/i)).toBeTruthy();
  });
  it('clicking a preset pushes ?preset=', () => {
    render(<DateRangeFilter />);
    fireEvent.click(screen.getByText('7d'));
    expect(push).toHaveBeenCalled();
    const lastCall = push.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('preset=7d');
  });
  it('toggling compare pushes compare=1', () => {
    push.mockClear();
    render(<DateRangeFilter />);
    fireEvent.click(screen.getByLabelText(/compare/i));
    const lastCall = push.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('compare=1');
  });
});
