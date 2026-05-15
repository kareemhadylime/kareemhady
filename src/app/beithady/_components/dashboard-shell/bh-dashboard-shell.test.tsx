// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { BHDashboardShell } from './bh-dashboard-shell';

// jsdom does not implement matchMedia — stub it as desktop (matches: false for
// the mobile query) so the component's useEffect doesn't throw. Restore after
// the suite so the stub doesn't leak to other test files in the same worker.
const originalMatchMedia = window.matchMedia;
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
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
afterAll(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  } else {
    // @ts-expect-error — deliberately remove the stub when jsdom had no native one
    delete (window as Window & { matchMedia?: unknown }).matchMedia;
  }
});

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
