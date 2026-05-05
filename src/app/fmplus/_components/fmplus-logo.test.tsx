// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FmplusLogo } from './fmplus-logo';

// next/image rendering is jsdom-incompatible — stub it as a plain <img> so
// asserts on src / dimensions still work without the runtime image optimizer.
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe('FmplusLogo', () => {
  test('renders the official PNG asset (not a hand-drawn SVG)', () => {
    const { container } = render(<FmplusLogo />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toMatch(/\/brand\/fmplus\/fmplus-(color|black)\.png$/);
    // The earlier revision rendered an inline <svg> with a hand-coded mark.
    // Make sure that approximation has been removed.
    expect(container.querySelector('svg')).toBeNull();
  });

  test('default size = md (56px wide)', () => {
    const { container } = render(<FmplusLogo size="md" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe('56');
  });

  test('xl size = 144px wide', () => {
    const { container } = render(<FmplusLogo size="xl" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe('144');
  });

  test('showWordmark=false clips the wrapper to the icon-only portion', () => {
    const { container: full } = render(<FmplusLogo size="lg" showWordmark />);
    const { container: icon } = render(<FmplusLogo size="lg" showWordmark={false} />);
    const fullWrap = full.querySelector('span[role="img"]') as HTMLElement;
    const iconWrap = icon.querySelector('span[role="img"]') as HTMLElement;
    const fullH = parseInt(fullWrap.style.height, 10);
    const iconH = parseInt(iconWrap.style.height, 10);
    expect(iconH).toBeLessThan(fullH);
    expect(fullWrap.style.overflow).toBe('hidden');
  });

  test('variant=black-on-yellow uses the FM+ yellow background and color asset', () => {
    const { container } = render(<FmplusLogo variant="black-on-yellow" />);
    const wrap = container.querySelector('span[role="img"]') as HTMLElement;
    const img = container.querySelector('img')!;
    // Accept hex (#FDCF00) or rgb formats jsdom may serialize to.
    expect(wrap.style.background).toMatch(/#FDCF00|rgb\(253,\s*207,\s*0\)/i);
    expect(img.getAttribute('src')).toContain('fmplus-color.png');
  });

  test('variant=monochrome-black uses transparent background and the black asset', () => {
    const { container } = render(<FmplusLogo variant="monochrome-black" />);
    const wrap = container.querySelector('span[role="img"]') as HTMLElement;
    const img = container.querySelector('img')!;
    expect(wrap.style.background).toMatch(/transparent|rgba\(0,\s*0,\s*0,\s*0\)/i);
    expect(img.getAttribute('src')).toContain('fmplus-black.png');
  });

  test('variant=monochrome-white inverts the black asset via CSS filter', () => {
    const { container } = render(<FmplusLogo variant="monochrome-white" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.style.filter).toMatch(/invert\(1\)/);
  });

  test('aria-label declares the brand name', () => {
    const { container } = render(<FmplusLogo />);
    const wrap = container.querySelector('span[role="img"]')!;
    expect(wrap.getAttribute('aria-label')).toBe('FMPLUS — Facility Management');
  });
});
