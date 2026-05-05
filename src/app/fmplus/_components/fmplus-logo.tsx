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
      // Background is `transparent` (not the white #FFFFFF from the brand combo) so
      // the logo can sit on any surface — colored cards, gradients, photos. Pages
      // that need the strict yellow-on-white combo can wrap in their own white box.
      return { foregroundIcon: c.yellow, foregroundWordmark: c.yellow,  foregroundTagline: c.greyDark, background: 'transparent' };
    case 'white-on-black':
      return { foregroundIcon: '#FFFFFF', foregroundWordmark: '#FFFFFF', foregroundTagline: c.greyLight, background: c.black };
    case 'monochrome-black':
      return { foregroundIcon: c.black, foregroundWordmark: c.black,    foregroundTagline: c.black,    background: 'transparent' };
    case 'monochrome-white':
      return { foregroundIcon: '#FFFFFF', foregroundWordmark: '#FFFFFF', foregroundTagline: '#FFFFFF',  background: 'transparent' };
  }
}
