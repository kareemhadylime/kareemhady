# FM+ Brand Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wrong navy+amber FM+ branding currently in the codebase with the real 2025 brand (yellow `#FDCF00`, gold `#EEB91D`, geometric 4-quadrant "+" monogram, Lalezar/DM Serif Display/Lato fonts).

**Architecture:** Token-driven — define brand colors and fonts once in `src/lib/fmplus/brand.ts` and Tailwind v4 `@theme`, then update the two shared FM+ components (`fmplus-logo.tsx` rebuild + `fmplus-hero.tsx` retrofit). All downstream pages will inherit via the shared components in Phase B.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · TypeScript strict · `next/font/google` · `@react-pdf/renderer` (Font.register for PDF use later in Phase C)

**Reference spec:** `docs/superpowers/specs/2026-05-05-fmplus-project-report-design.md` §9, §11

**Reference brand assets:** `C:/kareemhady/.claude/FMPLUS/Branding/`

---

## File Structure (this plan)

| Path | Action | Responsibility |
|---|---|---|
| `src/lib/fmplus/brand.ts` | Create | Single source of truth for FM+ brand tokens (colors, fonts, logo aspect) |
| `src/app/layout.tsx` | Modify | Register Lalezar/DM Serif Display/Lato Google Fonts via `next/font/google` |
| `src/app/globals.css` | Modify | Tailwind v4 `@theme` block — expose tokens as `--color-fmplus-*` and `--font-*` CSS vars |
| `src/app/fmplus/_components/fmplus-logo.tsx` | Rewrite | Geometric 4-quadrant "+" monogram replacing the wrong "FM"+"+" letterform |
| `src/app/fmplus/_components/fmplus-logo.test.tsx` | Create | Rendering + aspect ratio + variant tests |
| `src/app/fmplus/_components/fmplus-hero.tsx` | Modify | Swap amber palette to FM+ yellow/gold tokens |

---

## Task A1: Install Google Fonts (Lalezar, DM Serif Display, Lato) via `next/font/google`

**Files:**
- Modify: `src/app/layout.tsx`
- Test: smoke-test by viewing dev server at `/fmplus` (font is loaded if `<html>` has the CSS variable on it)

- [ ] **Step 1: Read the current layout.tsx to find the existing font setup**

Run: `grep -n "next/font" src/app/layout.tsx`
Expected: Find existing `Geist` or similar font import. Identify the line where fonts are imported and the line where the variables are added to `<html className=...>`.

- [ ] **Step 2: Add the three FM+ font imports + variables**

Modify `src/app/layout.tsx`. After the existing font imports, add:

```ts
import { Lalezar, DM_Serif_Display, Lato } from 'next/font/google';

const lalezar = Lalezar({
  subsets: ['latin', 'arabic'],
  weight: '400',
  variable: '--font-lalezar',
  display: 'swap',
});

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif',
  display: 'swap',
});

const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-lato',
  display: 'swap',
});
```

In the `<html>` element, add the three CSS variable classes alongside the existing font variable. Example (your exact existing class string will differ — append, don't replace):

```tsx
<html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${lalezar.variable} ${dmSerif.variable} ${lato.variable}`}>
```

- [ ] **Step 3: Run dev server + verify fonts load**

Run: `npm run dev` (in background)
Then: open browser to `http://localhost:3000/fmplus`. Open DevTools → Elements → check `<html>` has `font-lalezar`, `font-dm-serif`, `font-lato` classes (the CSS variable sentinels).

Expected: `<html>` element shows all three CSS variable class names. Network tab shows three Google Fonts CSS files fetched, no 404s.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E "src/app/layout" | head -5`
Expected: No errors related to layout.tsx.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(fmplus-brand): register Lalezar + DM Serif Display + Lato Google Fonts"
```

---

## Task A2: Create `src/lib/fmplus/brand.ts` with token export

**Files:**
- Create: `src/lib/fmplus/brand.ts`

This is the single source of truth for FM+ brand tokens. Anywhere in the app that needs colors, fonts, or logo proportions imports from here.

- [ ] **Step 1: Write the file**

Create `src/lib/fmplus/brand.ts`:

```ts
/**
 * FM+ Brand Tokens — Single source of truth.
 *
 * Source: FMPlus rebranding.pdf (2025 guidelines), brand assets folder
 * `C:/kareemhady/.claude/FMPLUS/Branding/`.
 *
 * Tailwind v4 mirror of these tokens lives in src/app/globals.css under
 * `@theme`. PDF document themes import from here (NOT from globals.css)
 * since `@react-pdf/renderer` uses StyleSheet.create rather than CSS
 * variables.
 */

export const FMPLUS_BRAND = {
  /** Color palette — exactly per brand guidelines section "Brand Colors" */
  colors: {
    /** Primary — vibrant yellow. Optimism, clarity, innovation. */
    yellow:    '#FDCF00',
    /** Accent — deeper golden shade. Hierarchy, hover, contrast. */
    gold:      '#EEB91D',
    /** Anchor — black. Maximum contrast for headlines + icons. */
    black:     '#000000',
    /** Supportive contrast — warm taupe-grey. Body emphasis. */
    greyDark:  '#8A867F',
    /** Neutral base — light grey. Backgrounds, dividers, secondary text. */
    greyLight: '#D4D4D4',
  },

  /** Typography — exactly per brand guidelines section "Typography". */
  fonts: {
    /** Lalezar — bold display headlines, distinctive presence. */
    display: 'Lalezar',
    /** DM Serif Display — primary text + subheadings, elegant. */
    serif:   'DM Serif Display',
    /** Lato — body text, clean and readable. */
    body:    'Lato',
    /** NotoSansArabic — fallback for Arabic glyphs not in Lato. */
    arabic:  'NotoSansArabic',
  },

  /** Logo proportions are LOCKED per brand guidelines (page 11): aspect 4.19 : 5.19. */
  logo: {
    aspect: 4.19 / 5.19,
  },

  /** Allowed color combinations per guidelines (page 10).
   *  Use these names when picking a logo variant. */
  combos: {
    /** Modern/corporate — professional. */
    whiteOnCharcoal: { fg: '#FFFFFF', bg: '#8A867F' },
    /** Bold, eye-catching — high-visibility. */
    blackOnYellow:   { fg: '#000000', bg: '#FDCF00' },
    /** Soft, approachable. */
    greyOnYellow:    { fg: '#8A867F', bg: '#FDCF00' },
    /** Clean, minimal — digital/large-scale. */
    yellowOnWhite:   { fg: '#FDCF00', bg: '#FFFFFF' },
  },
} as const;

export type FmplusColor = keyof typeof FMPLUS_BRAND.colors;
export type FmplusComboName = keyof typeof FMPLUS_BRAND.combos;
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep "src/lib/fmplus/brand" | head -5`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fmplus/brand.ts
git commit -m "feat(fmplus-brand): add brand tokens export at src/lib/fmplus/brand.ts"
```

---

## Task A3: Add `@theme` block in `globals.css` with FM+ tokens

**Files:**
- Modify: `src/app/globals.css`

Tailwind v4 reads token definitions from `@theme` directive in CSS. Adds `bg-fmplus-yellow`, `text-fmplus-gold`, `font-display`, etc. utilities.

- [ ] **Step 1: Read the current globals.css**

Run: `head -60 src/app/globals.css`
Identify whether there's an existing `@theme` block. (Tailwind v4 projects usually have one for primary tokens.)

- [ ] **Step 2: Add the FM+ theme block**

If `@theme` block exists, add the FM+ entries to it. If not, add a new `@theme` block. Insert AFTER any existing `@import 'tailwindcss';` line.

Add this content (modify, don't replace existing tokens):

```css
@theme {
  /* FM+ brand colors — see src/lib/fmplus/brand.ts */
  --color-fmplus-yellow:     #FDCF00;
  --color-fmplus-gold:       #EEB91D;
  --color-fmplus-black:      #000000;
  --color-fmplus-grey-dark:  #8A867F;
  --color-fmplus-grey-light: #D4D4D4;

  /* FM+ font families — Google Fonts registered in src/app/layout.tsx */
  --font-display: var(--font-lalezar), 'Lalezar', system-ui, sans-serif;
  --font-serif:   var(--font-dm-serif), 'DM Serif Display', Georgia, serif;
  --font-body:    var(--font-lato), 'Lato', system-ui, sans-serif;
}
```

- [ ] **Step 3: Verify the new utilities work**

Run: `npm run dev` (if not already running)
Open browser DevTools console at `http://localhost:3000` and run:

```js
getComputedStyle(document.documentElement).getPropertyValue('--color-fmplus-yellow')
```

Expected output: `#FDCF00` (or `rgb(253, 207, 0)` depending on browser).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(fmplus-brand): expose FM+ color + font tokens via Tailwind v4 @theme"
```

---

## Task A4: Rebuild `fmplus-logo.tsx` as geometric 4-quadrant "+" monogram

**Files:**
- Modify (full rewrite): `src/app/fmplus/_components/fmplus-logo.tsx`

Reference: `C:/kareemhady/.claude/FMPLUS/Branding/Asset 4 (1).png` shows the canonical yellow+black logo. The icon is a `+` shape made of 4 quadrant tiles, each containing a stylized letter cut. Below the icon: `FMPLUS` wordmark in Lato Black + `FACILITY MANAGEMENT` tagline in Lato Light. Locked aspect 4.19 × 5.19 per guidelines.

This task ONLY rewrites the component. Tests come in Task A5.

- [ ] **Step 1: Read the current (wrong) logo to understand the API**

Run: `cat src/app/fmplus/_components/fmplus-logo.tsx`
Note the existing prop signature `{ size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string; }` — we keep it and ADD a `variant` prop.

- [ ] **Step 2: Write the new logo component**

Replace the entire contents of `src/app/fmplus/_components/fmplus-logo.tsx` with:

```tsx
import { FMPLUS_BRAND } from '@/lib/fmplus/brand';

export type FmplusLogoVariant =
  | 'black-on-yellow'   /* primary, bold, high-visibility */
  | 'yellow-on-white'   /* clean, minimal — digital/large-scale */
  | 'white-on-black'    /* reverse — for dark surfaces */
  | 'monochrome-black'  /* pure black, single-color print */
  | 'monochrome-white'; /* pure white — for dark backgrounds, headers */

export interface FmplusLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: FmplusLogoVariant;
  /** Show the FMPLUS wordmark + FACILITY MANAGEMENT tagline below the icon */
  showWordmark?: boolean;
  className?: string;
}

const SIZE_PX: Record<NonNullable<FmplusLogoProps['size']>, number> = {
  sm: 32,
  md: 56,
  lg: 88,
  xl: 144,
};

/**
 * FM+ Logo — geometric 4-quadrant "+" monogram per official 2025 brand guidelines.
 *
 * The icon is composed of 4 square tiles arranged in a 2×2 grid forming a "+" shape.
 * Each tile contains a stylized letter cut (rotated 90° per quadrant). Locked aspect
 * 4.19 : 5.19 — width 4.19u, height 5.19u (icon ~4.19u + wordmark band ~1u).
 *
 * Reference: C:/kareemhady/.claude/FMPLUS/Branding/Asset 4 (1).png
 */
export function FmplusLogo({
  size = 'md',
  variant = 'black-on-yellow',
  showWordmark = true,
  className = '',
}: FmplusLogoProps) {
  const w = SIZE_PX[size];
  const h = Math.round(w * (5.19 / 4.19));

  const colors = resolveColors(variant);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 419 519"
      width={w}
      height={h}
      role="img"
      aria-label="FMPLUS — Facility Management"
      className={className}
      style={{ background: colors.background }}
    >
      {/* === Icon: 4 quadrant tiles forming a "+"  === */}
      {/* Top-left tile (rotated F) */}
      <g fill={colors.foregroundIcon}>
        <rect x="40"  y="40"  width="80"  height="120" />
        <rect x="40"  y="40"  width="160" height="40" />
        <rect x="40"  y="100" width="120" height="40" />
      </g>
      {/* Top-right tile (rotated L) */}
      <g fill={colors.foregroundIcon}>
        <rect x="219" y="40"  width="160" height="40" />
        <rect x="299" y="40"  width="80"  height="120" />
      </g>
      {/* Bottom-left tile (L mirrored) */}
      <g fill={colors.foregroundIcon}>
        <rect x="40"  y="219" width="80"  height="120" />
        <rect x="40"  y="299" width="160" height="40" />
      </g>
      {/* Bottom-right tile (M, the bold anchor letter) */}
      <g fill={colors.foregroundIcon}>
        <rect x="219" y="219" width="40" height="160" />
        <rect x="339" y="219" width="40" height="160" />
        <rect x="259" y="219" width="40" height="40"  />
        <rect x="299" y="259" width="40" height="40"  />
        {/* The diagonal stem cut into the M */}
        <polygon points="259,259 299,259 319,299 279,299" />
      </g>

      {showWordmark && (
        <>
          {/* "FMPLUS" wordmark — Lato Black, large and bold */}
          <text
            x="210"
            y="445"
            textAnchor="middle"
            fontFamily="Lato, system-ui, sans-serif"
            fontWeight="900"
            fontSize="68"
            fill={colors.foregroundWordmark}
            letterSpacing="4"
          >
            FMPLUS
          </text>
          {/* "FACILITY MANAGEMENT" tagline — Lato Light/Regular */}
          <text
            x="210"
            y="490"
            textAnchor="middle"
            fontFamily="Lato, system-ui, sans-serif"
            fontWeight="400"
            fontSize="22"
            fill={colors.foregroundTagline}
            letterSpacing="6"
          >
            FACILITY MANAGEMENT
          </text>
        </>
      )}
    </svg>
  );
}

/** Map a brand-allowed variant to actual fill/bg colors. */
function resolveColors(variant: FmplusLogoVariant): {
  foregroundIcon:     string;
  foregroundWordmark: string;
  foregroundTagline:  string;
  background:         string;
} {
  const c = FMPLUS_BRAND.colors;
  switch (variant) {
    case 'black-on-yellow':
      return { foregroundIcon: c.black, foregroundWordmark: c.black,    foregroundTagline: c.greyDark, background: c.yellow };
    case 'yellow-on-white':
      return { foregroundIcon: c.yellow, foregroundWordmark: c.yellow,  foregroundTagline: c.greyDark, background: 'transparent' };
    case 'white-on-black':
      return { foregroundIcon: '#FFFFFF', foregroundWordmark: '#FFFFFF', foregroundTagline: c.greyLight, background: c.black };
    case 'monochrome-black':
      return { foregroundIcon: c.black, foregroundWordmark: c.black,    foregroundTagline: c.black,    background: 'transparent' };
    case 'monochrome-white':
      return { foregroundIcon: '#FFFFFF', foregroundWordmark: '#FFFFFF', foregroundTagline: '#FFFFFF',  background: 'transparent' };
  }
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep "fmplus-logo" | head -5`
Expected: No errors.

- [ ] **Step 4: Visual smoke test**

Open the dev server at `http://localhost:3000/fmplus`. The logo currently rendered (if any FmplusHero is on the page) will look DIFFERENT from before — it should now be a geometric `+` monogram with FMPLUS wordmark, NOT the old "FM" + "+" letterform. Don't worry about exact pixel-match to Asset 4 — Task A5 will refine via tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/_components/fmplus-logo.tsx
git commit -m "feat(fmplus-brand): rebuild fmplus-logo.tsx as geometric 4-quadrant + monogram

Replaces the wrong 'FM' + '+' letterform with the official 2025 brand mark
per FMPlus rebranding.pdf and brand asset Asset 4. Locked aspect 4.19:5.19.
Adds variant prop for the 5 brand-allowed color combinations."
```

---

## Task A5: Test `fmplus-logo.tsx` (rendering + aspect ratio + variants)

**Files:**
- Create: `src/app/fmplus/_components/fmplus-logo.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/fmplus/_components/fmplus-logo.test.tsx`:

```tsx
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
    expect(svg.getAttribute('style')).toMatch(/#FDCF00/i); // yellow background
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
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- --run src/app/fmplus/_components/fmplus-logo.test.tsx 2>&1 | tail -15`
Expected: 8 tests pass.

If any fail, the most likely cause is a discrepancy between the geometry/colors in `fmplus-logo.tsx` and what the tests expect. Adjust the implementation (not the tests — the tests encode the brand contract).

- [ ] **Step 3: Run full test suite to ensure no regressions**

Run: `npm test -- --run 2>&1 | tail -10`
Expected: 209 + 8 new = 217 tests passing (or whatever the previous green count was, plus 8).

- [ ] **Step 4: Commit**

```bash
git add src/app/fmplus/_components/fmplus-logo.test.tsx
git commit -m "test(fmplus-brand): add fmplus-logo rendering + aspect + variant tests"
```

---

## Task A6: Retrofit `fmplus-hero.tsx` to use real FM+ brand tokens

**Files:**
- Modify: `src/app/fmplus/_components/fmplus-hero.tsx`

The current `fmplus-hero.tsx` uses `bg-amber-50`, `text-amber-700`, `from-amber-400 to-amber-600` etc. — all wrong. Replace with the FM+ tokens defined in Task A3.

- [ ] **Step 1: Read the current implementation**

Run: `cat src/app/fmplus/_components/fmplus-hero.tsx`

Locate the amber utility classes — they appear in:
- The eyebrow text (currently `text-amber-700 dark:text-amber-400`)
- The icon box background (currently `bg-amber-50 dark:bg-amber-950`)
- The icon foreground (currently `text-amber-700 dark:text-amber-300`)
- The gradient blur element (currently `from-amber-400 to-amber-600`)

- [ ] **Step 2: Replace amber tokens with FM+ tokens**

Modify `src/app/fmplus/_components/fmplus-hero.tsx`. The full replacement of the JSX body is:

```tsx
import type { LucideIcon } from 'lucide-react';
import { FmplusLogo } from './fmplus-logo';

interface FmplusHeroProps {
  /** Eyebrow text, e.g. "FMPLUS · PROJECT BUDGET" */
  eyebrow: string;
  /** Main h1 title, e.g. "Project Budget" */
  title: string;
  /** Subtitle / description paragraph */
  subtitle?: string;
  /** Lucide icon to render in the colored box on the left */
  icon: LucideIcon;
  /** Whether to show the FM+ wordmark on the right side. Default true. */
  showLogo?: boolean;
}

export function FmplusHero({ eyebrow, title, subtitle, icon: Icon, showLogo = true }: FmplusHeroProps) {
  return (
    <header className="relative ix-card p-6 overflow-hidden">
      {/* Brand accent: gradient blur of the FM+ yellow → gold */}
      <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-gradient-to-br from-fmplus-yellow to-fmplus-gold opacity-[0.10] blur-3xl pointer-events-none" />
      <div className="flex items-start gap-4">
        {/* Icon box: yellow-tinted on light, gold-tinted on dark */}
        <div className="w-14 h-14 rounded-xl inline-flex items-center justify-center bg-fmplus-yellow/15 dark:bg-fmplus-gold/20 shrink-0">
          <Icon size={28} strokeWidth={2.2} className="text-fmplus-black dark:text-fmplus-yellow" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-fmplus-gold dark:text-fmplus-yellow font-semibold font-body">{eyebrow}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5 font-serif">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-body">{subtitle}</p>
          )}
        </div>
        {showLogo && (
          <div className="hidden md:flex items-center shrink-0 self-start mt-1.5">
            <FmplusLogo size="lg" variant="monochrome-black" showWordmark={false} className="dark:hidden" />
            <FmplusLogo size="lg" variant="monochrome-white" showWordmark={false} className="hidden dark:block" />
          </div>
        )}
      </div>
    </header>
  );
}
```

Key changes:
- `from-amber-400 to-amber-600` → `from-fmplus-yellow to-fmplus-gold`, opacity bumped from `0.08` to `0.10` (yellow is more vibrant; the slightly higher opacity keeps the visual presence)
- Icon box bg: `bg-amber-50 dark:bg-amber-950` → `bg-fmplus-yellow/15 dark:bg-fmplus-gold/20` (Tailwind v4 alpha syntax)
- Icon foreground: `text-amber-700 dark:text-amber-300` → `text-fmplus-black dark:text-fmplus-yellow` (allowed combo: black-on-yellow / yellow-on-white)
- Eyebrow: `text-amber-700 dark:text-amber-400` → `text-fmplus-gold dark:text-fmplus-yellow`
- Title gets `font-serif` (DM Serif Display) per brand typography
- Body text gets `font-body` (Lato)
- Logo uses the rebuilt `<FmplusLogo>` from Task A4 with the `monochrome-black` (light mode) / `monochrome-white` (dark mode) variants, no wordmark (just the icon — wordmark would be redundant alongside the page title)

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep "fmplus-hero" | head -5`
Expected: No errors.

- [ ] **Step 4: Visual smoke test**

Open `http://localhost:3000/fmplus` in the browser. The hero should now show:
- Yellow-tinted icon box (NOT amber)
- The geometric FM+ logo on the right (NOT the old "FM" + "+" letterform)
- Eyebrow text in gold (`#EEB91D`)

Toggle dark mode (theme toggle in the top nav) and verify the logo swaps to white and the eyebrow goes yellow.

- [ ] **Step 5: Commit**

```bash
git add src/app/fmplus/_components/fmplus-hero.tsx
git commit -m "style(fmplus-brand): retrofit fmplus-hero.tsx to real FM+ tokens

Swaps amber-* utility classes to fmplus-* tokens:
- Gradient blur: amber-400 → fmplus-yellow → fmplus-gold (opacity 0.10)
- Icon box: amber-50 → fmplus-yellow/15 (light) / fmplus-gold/20 (dark)
- Icon fg: amber-700 → fmplus-black / fmplus-yellow
- Eyebrow: amber-700 → fmplus-gold / fmplus-yellow
- Title now uses font-serif (DM Serif Display)
- Body uses font-body (Lato)
- Logo: rebuilt FmplusLogo with monochrome-black / monochrome-white variants"
```

---

## Phase A Acceptance

After completing all 6 tasks:

- [ ] All 6 tasks committed.
- [ ] `npm test -- --run` shows 209 prior tests + 8 new fmplus-logo tests = 217 passing, 0 failing.
- [ ] `npx tsc --noEmit` shows no fmplus-related errors (the existing unrelated `qrcode` error from another session is acceptable).
- [ ] Visual inspection at `/fmplus`, `/fmplus/financials`, `/fmplus/financial/budget` shows the new yellow/gold + geometric monogram (NOT amber + "FM"+"+" letterform). Pages that don't yet have their own utility-class amber tokens are still on the wrong palette — that's Phase B's job.
- [ ] Final push: `git fetch origin main && git rebase origin/main && git push origin HEAD:main`. Vercel auto-deploys to production.
- [ ] SESSION_HANDOFF.md updated noting Phase A complete.

**This is the foundation.** Phase B (page retrofits) and Phase C (Project Report tab) both depend on Tasks A2 (brand tokens) + A3 (Tailwind tokens) + A4 (logo) + A6 (hero). Do not start Phase B or C until Phase A is fully landed.
