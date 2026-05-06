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
    expect(container.querySelector('svg')).toBeNull();
  });

  test('wrapper is a <div> (not a <span>) so Tailwind hidden/dark:block classes work', () => {
    // Earlier revision used <span> with inline display: 'inline-block', which
    // overrode `hidden` (display: none) and caused both light + dark variants
    // to render side-by-side in the FM+ hero.
    const { container } = render(<FmplusLogo />);
    expect(container.querySelector('span[role="img"]')).toBeNull();
    const wrap = container.querySelector('div[role="img"]');
    expect(wrap).not.toBeNull();
    expect((wrap as HTMLElement).style.display).toBe('');
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

  test('2xl size = 200px wide (used in FM+ hero)', () => {
    const { container } = render(<FmplusLogo size="2xl" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe('200');
  });

  test('showWordmark=false clips the wrapper to the icon-only portion', () => {
    const { container: full } = render(<FmplusLogo size="lg" showWordmark />);
    const { container: icon } = render(<FmplusLogo size="lg" showWordmark={false} />);
    const fullWrap = full.querySelector('div[role="img"]') as HTMLElement;
    const iconWrap = icon.querySelector('div[role="img"]') as HTMLElement;
    const fullH = parseInt(fullWrap.style.height, 10);
    const iconH = parseInt(iconWrap.style.height, 10);
    expect(iconH).toBeLessThan(fullH);
    expect(fullWrap.style.overflow).toBe('hidden');
  });

  test('variant=yellow-on-white uses transparent bg + the COLOR asset', () => {
    const { container } = render(<FmplusLogo variant="yellow-on-white" />);
    const wrap = container.querySelector('div[role="img"]') as HTMLElement;
    const img = container.querySelector('img')!;
    expect(wrap.style.background).toMatch(/transparent|rgba\(0,\s*0,\s*0,\s*0\)/i);
    expect(img.getAttribute('src')).toContain('fmplus-color.png');
  });

  test('variant=black-on-yellow uses the FM+ yellow bg + the BLACK asset', () => {
    // Brand combo: black foreground on yellow background. The COLOR asset's
    // yellow tiles would blend into a yellow surface, so this variant pulls
    // from the BLACK lockup.
    const { container } = render(<FmplusLogo variant="black-on-yellow" />);
    const wrap = container.querySelector('div[role="img"]') as HTMLElement;
    const img = container.querySelector('img')!;
    expect(wrap.style.background).toMatch(/#FDCF00|rgb\(253,\s*207,\s*0\)/i);
    expect(img.getAttribute('src')).toContain('fmplus-black.png');
  });

  test('variant=monochrome-black uses transparent background and the black asset', () => {
    const { container } = render(<FmplusLogo variant="monochrome-black" />);
    const wrap = container.querySelector('div[role="img"]') as HTMLElement;
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
    const wrap = container.querySelector('div[role="img"]')!;
    expect(wrap.getAttribute('aria-label')).toBe('FMPLUS — Facility Management');
  });
});
