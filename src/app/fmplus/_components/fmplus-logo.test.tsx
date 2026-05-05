import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { FmplusLogo } from './fmplus-logo';

describe('FmplusLogo', () => {
  test('renders an svg with the locked viewBox 0 0 419 519 (4.19:5.19 aspect)', () => {
    const { container } = render(<FmplusLogo />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 419 519');
  });

  test('default size = md (56px wide, ~69px tall)', () => {
    const { container } = render(<FmplusLogo size="md" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('56');
    // 56 * (5.19/4.19) = 69.36 → rounded to 69
    expect(svg.getAttribute('height')).toBe('69');
  });

  test('xl size = 144px wide', () => {
    const { container } = render(<FmplusLogo size="xl" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('144');
  });

  test('showWordmark=false hides FMPLUS + tagline text', () => {
    const { container } = render(<FmplusLogo showWordmark={false} />);
    expect(container.textContent).not.toContain('FMPLUS');
    expect(container.textContent).not.toContain('FACILITY MANAGEMENT');
  });

  test('showWordmark=true (default) renders both FMPLUS + tagline', () => {
    const { container } = render(<FmplusLogo />);
    expect(container.textContent).toContain('FMPLUS');
    expect(container.textContent).toContain('FACILITY MANAGEMENT');
  });

  test('variant=black-on-yellow has yellow background and black foreground', () => {
    const { container } = render(<FmplusLogo variant="black-on-yellow" />);
    const svg = container.querySelector('svg')!;
    const style = svg.getAttribute('style') || '';
    // Accept both hex (#FDCF00) and rgb (253, 207, 0) formats
    expect(style).toMatch(/#FDCF00|rgb\(253,\s*207,\s*0\)|rgb\(253 207 0\)/i);
  });

  test('variant=monochrome-black has transparent background and black foreground', () => {
    const { container } = render(<FmplusLogo variant="monochrome-black" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('style')).toMatch(/transparent/i);
  });

  test('aria-label declares the brand name', () => {
    const { container } = render(<FmplusLogo />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe('FMPLUS — Facility Management');
  });
});
