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
