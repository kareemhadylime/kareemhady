// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { BHRailPill } from './bh-rail-pill';

afterEach(cleanup);

describe('BHRailPill', () => {
  test('renders children as label', () => {
    const { getByRole } = render(<BHRailPill>Today</BHRailPill>);
    expect(getByRole('button').textContent).toBe('Today');
  });

  test('reports active state via aria-pressed', () => {
    const { getByRole } = render(<BHRailPill active>Today</BHRailPill>);
    expect(getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  test('fires onClick when not disabled', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<BHRailPill onClick={onClick}>Today</BHRailPill>);
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<BHRailPill onClick={onClick} disabled>Today</BHRailPill>);
    fireEvent.click(getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
