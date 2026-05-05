import Image from 'next/image';
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
 * Native canvas of the official FM+ assets in /public/brand/fmplus/ (274 × 348).
 * The icon (4-quadrant + lockup) occupies the top ~60%; the FMPLUS wordmark
 * and FACILITY MANAGEMENT tagline occupy the bottom ~40%.
 */
const NATIVE_W = 274;
const NATIVE_H = 348;
const ICON_FRACTION = 0.6;

/**
 * FM+ Logo — official 2025 brand mark. Renders the canonical PNG asset
 * (`/public/brand/fmplus/fmplus-{color,black,mark}.png`) extracted from the
 * FMPlus rebranding pack. Earlier revisions of this component drew the mark
 * with hand-coded `<rect>` and `<polygon>` shapes — that approximation looked
 * off-brand and has been replaced with the real artwork.
 */
export function FmplusLogo({
  size = 'md',
  variant = 'black-on-yellow',
  showWordmark = true,
  className = '',
}: FmplusLogoProps) {
  const w = SIZE_PX[size];
  const fullH = Math.round((w * NATIVE_H) / NATIVE_W);
  const iconH = Math.round(fullH * ICON_FRACTION);

  const { src, background, filter } = resolveStyle(variant);

  const wrapperStyle: React.CSSProperties = {
    width: w,
    height: showWordmark ? fullH : iconH,
    background,
    overflow: 'hidden',
    display: 'inline-block',
    flexShrink: 0,
  };

  const imageStyle: React.CSSProperties | undefined = filter
    ? { filter, display: 'block' }
    : { display: 'block' };

  return (
    <span
      role="img"
      aria-label="FMPLUS — Facility Management"
      className={className}
      style={wrapperStyle}
    >
      <Image
        src={src}
        alt=""
        width={w}
        height={fullH}
        style={imageStyle}
        priority={size === 'lg' || size === 'xl'}
      />
    </span>
  );
}

/** Map a brand-allowed variant to (asset src, background color, optional CSS filter). */
function resolveStyle(variant: FmplusLogoVariant): {
  src: string;
  background: string;
  filter?: string;
} {
  const c = FMPLUS_BRAND.colors;
  const COLOR = '/brand/fmplus/fmplus-color.png';
  const BLACK = '/brand/fmplus/fmplus-black.png';

  switch (variant) {
    case 'black-on-yellow':
      return { src: COLOR, background: c.yellow };
    case 'yellow-on-white':
      // Background is `transparent` (not the strict white #FFFFFF) so the
      // logo can sit on any surface — colored cards, gradients, photos.
      return { src: COLOR, background: 'transparent' };
    case 'white-on-black':
      return { src: BLACK, background: c.black, filter: 'invert(1)' };
    case 'monochrome-black':
      return { src: BLACK, background: 'transparent' };
    case 'monochrome-white':
      return { src: BLACK, background: 'transparent', filter: 'invert(1)' };
  }
}
