/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerBuildingFilter } from './per-building-filter';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/beithady/ads',
  useSearchParams: () => new URLSearchParams(''),
}));

describe('PerBuildingFilter', () => {
  it('renders All + 5 BH codes + Unattributed', () => {
    render(<PerBuildingFilter />);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('BH-26')).toBeTruthy();
    expect(screen.getByText('BH-73')).toBeTruthy();
    expect(screen.getByText('BH-435')).toBeTruthy();
    expect(screen.getByText('BH-OK')).toBeTruthy();
    expect(screen.getByText('BH-34')).toBeTruthy();
    expect(screen.getByText('Unattributed')).toBeTruthy();
  });
  it('clicking BH-26 pushes ?building=BH-26', () => {
    push.mockClear();
    render(<PerBuildingFilter />);
    fireEvent.click(screen.getByText('BH-26'));
    const last = push.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain('building=BH-26');
  });
  it('clicking All clears the building param', () => {
    push.mockClear();
    render(<PerBuildingFilter />);
    fireEvent.click(screen.getByText('All'));
    const last = push.mock.calls.at(-1)?.[0] as string;
    expect(last).not.toContain('building=');
  });
});
