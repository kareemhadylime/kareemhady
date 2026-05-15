// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BHDashboardShell } from './bh-dashboard-shell';

// jsdom does not implement matchMedia — stub it as desktop (matches: false for
// the mobile query) so the component's useEffect doesn't throw.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

// jsdom default media query is desktop (>=768px). Sets the rail visible by
// default. matchMedia('(max-width: 767px)') returns matches:false unless
// explicitly stubbed, so these tests cover desktop layout. Mobile collapse
// behaviour is covered by the in-shell useEffect, which is integration-tested
// via manual smoke in Task 15.

describe('BHDashboardShell', () => {
  test('renders titleBar, rail, and children in the right slots', () => {
    const { getByTestId } = render(
      <BHDashboardShell
        titleBar={<div data-testid="tb">title</div>}
        rail={<div data-testid="rl">rail</div>}
      >
        <div data-testid="main">main</div>
      </BHDashboardShell>,
    );
    expect(getByTestId('tb')).toBeTruthy();
    expect(getByTestId('rl')).toBeTruthy();
    expect(getByTestId('main')).toBeTruthy();
  });

  test('renders drawer when provided', () => {
    const { getByTestId } = render(
      <BHDashboardShell
        titleBar={<div>tb</div>}
        rail={<div>rl</div>}
        drawer={<div data-testid="dr">drawer</div>}
      >
        <div>main</div>
      </BHDashboardShell>,
    );
    expect(getByTestId('dr')).toBeTruthy();
  });

  test('omits drawer when prop is undefined', () => {
    const { queryByTestId } = render(
      <BHDashboardShell titleBar={<div>tb</div>} rail={<div>rl</div>}>
        <div>main</div>
      </BHDashboardShell>,
    );
    expect(queryByTestId('dr')).toBeNull();
  });

  test('renders mobileFilterSheet sibling when provided', () => {
    const { getByTestId } = render(
      <BHDashboardShell
        titleBar={<div>tb</div>}
        rail={<div>rl</div>}
        mobileFilterSheet={<div data-testid="mfs">mobile-sheet</div>}
      >
        <div>main</div>
      </BHDashboardShell>,
    );
    expect(getByTestId('mfs')).toBeTruthy();
  });
});
