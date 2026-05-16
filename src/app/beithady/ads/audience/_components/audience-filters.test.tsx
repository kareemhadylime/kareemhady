/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudienceFilters } from './audience-filters';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/beithady/ads/audience',
  useSearchParams: () => new URLSearchParams(''),
}));

const campaigns = [
  { id: 1, name: 'CTWA EG', platform: 'meta' as const },
  { id: 2, name: 'Search SA', platform: 'google' as const },
];

describe('AudienceFilters', () => {
  it('renders a campaign dropdown + platform pills', () => {
    render(<AudienceFilters campaigns={campaigns} />);
    expect(screen.getByLabelText(/campaign/i)).toBeTruthy();
    expect(screen.getByText(/Meta/i)).toBeTruthy();
    expect(screen.getByText(/Google/i)).toBeTruthy();
    expect(screen.getByText(/TikTok/i)).toBeTruthy();
  });
  it('changing campaign pushes ?campaign=', () => {
    push.mockClear();
    render(<AudienceFilters campaigns={campaigns} />);
    fireEvent.change(screen.getByLabelText(/campaign/i), { target: { value: '1' } });
    const last = push.mock.calls.at(-1)?.[0] as string;
    expect(last).toContain('campaign=1');
  });
});
