/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodDeltaBadge } from './period-delta-badge';

describe('PeriodDeltaBadge', () => {
  it('renders up arrow with emerald tone when current > prior', () => {
    render(<PeriodDeltaBadge current={122} prior={100} />);
    const el = screen.getByTestId('period-delta');
    expect(el.textContent).toContain('↑');
    expect(el.textContent).toContain('22%');
    expect(el.className).toContain('emerald');
  });
  it('renders down arrow with rose tone when current < prior', () => {
    render(<PeriodDeltaBadge current={82} prior={100} />);
    expect(screen.getByTestId('period-delta').className).toContain('rose');
  });
  it('hides badge when both = 0', () => {
    const { container } = render(<PeriodDeltaBadge current={0} prior={0} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders "new" pill when prior=0', () => {
    render(<PeriodDeltaBadge current={5} prior={0} />);
    expect(screen.getByTestId('period-delta').textContent).toBe('new');
  });
  it('inverts tone with reverseColor for CPL-style metrics', () => {
    render(<PeriodDeltaBadge current={80} prior={100} reverseColor />);
    // CPL down 20% is good → emerald
    expect(screen.getByTestId('period-delta').className).toContain('emerald');
  });
});
