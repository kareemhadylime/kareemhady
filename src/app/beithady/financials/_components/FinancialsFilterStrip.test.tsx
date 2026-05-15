// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { FinancialsFilterStrip } from './FinancialsFilterStrip';

describe('FinancialsFilterStrip — Beithady scope row', () => {
  test('renders Consolidated, Egypt, and Dubai pills', () => {
    const { container } = render(
      <FinancialsFilterStrip
        basePath="/beithady/financials/performance"
        activeScope="consolidated"
      />,
    );
    const labels = Array.from(container.querySelectorAll('nav a')).map(
      (a) => a.textContent?.trim() ?? '',
    );
    expect(labels).toContain('Consolidated');
    expect(labels).toContain('Egypt');
    expect(labels).toContain('Dubai');
  });

  test('does NOT render an A1 pill (Beithady scope filters exclude A1)', () => {
    const { container } = render(
      <FinancialsFilterStrip
        basePath="/beithady/financials/performance"
        activeScope="consolidated"
      />,
    );
    const labels = Array.from(container.querySelectorAll('nav a')).map(
      (a) => a.textContent?.trim() ?? '',
    );
    expect(labels).not.toContain('A1');
  });

  test('the scope row contains exactly 3 pills', () => {
    const { container } = render(
      <FinancialsFilterStrip
        basePath="/beithady/financials/performance"
        activeScope="consolidated"
      />,
    );
    // The first <nav> is always the scope row; showPeriodPresets defaults to
    // false here so no second <nav> is rendered.
    const scopeNav = container.querySelector('nav');
    expect(scopeNav).not.toBeNull();
    expect(scopeNav!.querySelectorAll('a').length).toBe(3);
  });
});
