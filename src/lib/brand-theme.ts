import type { Domain } from './rules/presets';

// Lime Investments — holding company. Subsidiary brands each carry their
// own visual identity so the dashboard feels like a portfolio cockpit
// rather than one flat tool.
//
// PDFs provided were image-only so color palettes here are rationalized
// from the company names + existing DOMAIN_ACCENTS (keeping brand DNA
// close to what was already on screen while making each subsidiary
// distinctive).

export type DomainTheme = {
  name: string;
  tagline: string;
  // Accent colors used throughout the domain's pages.
  accent: {
    solid: string;        // Tailwind color class: bg-*-600
    solidHover: string;   // bg-*-700
    tint: string;         // bg-*-50
    tintText: string;     // text-*-700
    border: string;       // border-*-200
    text: string;         // text-*-700
    gradientFrom: string; // from-*-500
    gradientTo: string;   // to-*-500
    ring: string;         // ring-*-500
  };
  // Short description shown on the domain card + top of domain page.
  description: string;
  parentNote?: string;    // e.g. "A Lime Investments subsidiary"
};

export const LIME_INVESTMENTS = {
  name: 'Lime Investments',
  short: 'Lime',
  tagline: 'Portfolio operations · Holding company dashboard',
  accent: {
    solid: 'bg-lime-600',
    solidHover: 'bg-lime-700',
    tint: 'bg-lime-50',
    tintText: 'text-lime-700',
    border: 'border-lime-200',
    text: 'text-lime-700',
    gradientFrom: 'from-lime-500',
    gradientTo: 'to-emerald-500',
    ring: 'ring-lime-500',
  },
};

export const DOMAIN_THEMES: Record<Domain, DomainTheme> = {
  personal: {
    name: 'Personal',
    tagline: 'Personal mailbox digests.',
    description: 'Personal inbox aggregations outside any subsidiary.',
    accent: {
      solid: 'bg-slate-700',
      solidHover: 'bg-slate-800',
      tint: 'bg-slate-50',
      tintText: 'text-slate-700',
      border: 'border-slate-200',
      text: 'text-slate-700',
      gradientFrom: 'from-slate-500',
      gradientTo: 'to-slate-700',
      ring: 'ring-slate-500',
    },
  },
  kika: {
    name: 'KIKA',
    tagline: "Women's swimwear · direct-to-consumer.",
    description:
      'kika-swim-wear.myshopify.com storefront + X-Label garments factory + In & Out outsource manufacturing.',
    parentNote: 'A Lime Investments subsidiary',
    accent: {
      solid: 'bg-pink-600',
      solidHover: 'bg-pink-700',
      tint: 'bg-pink-50',
      tintText: 'text-pink-700',
      border: 'border-pink-200',
      text: 'text-pink-700',
      gradientFrom: 'from-pink-500',
      gradientTo: 'to-rose-500',
      ring: 'ring-pink-500',
    },
  },
  lime: {
    name: 'LIME',
    tagline: 'Holding company · portfolio view.',
    description:
      'Lime Investments parent — consolidated reporting across all subsidiaries.',
    accent: {
      solid: 'bg-lime-600',
      solidHover: 'bg-lime-700',
      tint: 'bg-lime-50',
      tintText: 'text-lime-700',
      border: 'border-lime-200',
      text: 'text-lime-700',
      gradientFrom: 'from-lime-500',
      gradientTo: 'to-emerald-500',
      ring: 'ring-lime-500',
    },
  },
  fmplus: {
    name: 'FMPLUS',
    tagline: 'Facility management & property services.',
    description:
      'FMPLUS Property & Facility Management — back-office operations + Odoo tenant host.',
    parentNote: 'A Lime Investments subsidiary',
    accent: {
      solid: 'bg-amber-600',
      solidHover: 'bg-amber-700',
      tint: 'bg-amber-50',
      tintText: 'text-amber-700',
      border: 'border-amber-200',
      text: 'text-amber-700',
      gradientFrom: 'from-amber-500',
      gradientTo: 'to-orange-500',
      ring: 'ring-amber-500',
    },
  },
  voltauto: {
    name: 'VOLTAUTO',
    tagline: 'EV charging & automotive.',
    description:
      'VoltAuto — electric vehicle charging network + automotive retail intelligence.',
    parentNote: 'A Lime Investments subsidiary',
    accent: {
      solid: 'bg-indigo-600',
      solidHover: 'bg-indigo-700',
      tint: 'bg-indigo-50',
      tintText: 'text-indigo-700',
      border: 'border-indigo-200',
      text: 'text-indigo-700',
      gradientFrom: 'from-indigo-500',
      gradientTo: 'to-blue-500',
      ring: 'ring-indigo-500',
    },
  },
  beithady: {
    name: 'BEIT HADY',
    tagline: 'Serviced apartments · short-term rentals.',
    description:
      'Beithady Hospitality (Egypt + FZCO Dubai) + A1HOSPITALITY (BH-435 owner). 91 units across BH-26 · BH-73 · BH-435 · BH-OK · BH-34.',
    parentNote: 'A Lime Investments subsidiary',
    // Palette extracted from BeitHady Branding logos + Door Sign /
    // Room Card branded-item screenshots (Plan v0.3 Q-D):
    //   navy   #1E2D4A → slate-800
    //   blue   #5F7397 → slate-500 (wordmark)
    //   cream  #F5F1E8 → custom var --bh-cream
    //   gold   #D4A93A → yellow-600 (FM+ tag, branded items)
    accent: {
      solid: 'bg-slate-700',
      solidHover: 'bg-slate-800',
      tint: 'bg-slate-50',
      tintText: 'text-slate-700',
      border: 'border-slate-200',
      text: 'text-slate-700',
      gradientFrom: 'from-slate-700',
      gradientTo: 'to-slate-400',
      ring: 'ring-slate-500',
    },
  },
  'boat-rental': {
    name: 'Boat Rental',
    tagline: 'Boat bookings & broker portal.',
    description:
      'Personal-domain sub-app: boat inventory, broker-driven reservations with 2-hour holds, owner portal with WhatsApp notifications.',
    parentNote: 'Under Personal Domain',
    accent: {
      solid: 'bg-cyan-600',
      solidHover: 'bg-cyan-700',
      tint: 'bg-cyan-50',
      tintText: 'text-cyan-700',
      border: 'border-cyan-200',
      text: 'text-cyan-700',
      gradientFrom: 'from-cyan-500',
      gradientTo: 'to-teal-500',
      ring: 'ring-cyan-500',
    },
  },
};

export function getDomainTheme(d: Domain | null | undefined): DomainTheme {
  if (d && DOMAIN_THEMES[d]) return DOMAIN_THEMES[d];
  return DOMAIN_THEMES.lime; // default = parent palette
}

// X-Label · KIKA report theme — used by the Kika Daily Performance Report
// (email body, hosted HTML token page, A4 PDF). The report represents the
// vertically-integrated brand: X-Label garments factory on the outside chrome
// (white wordmark on slate hero band), KIKA editorial accents inside the
// e-commerce content (cream sections, gold flourish, pink only as a sparing
// brand mark for KIKA-specific callouts). Raw hex codes — render-html.tsx
// and render-pdf.tsx need them, Tailwind classes don't survive into PDF.
//
// Logos are checked in at /public/brand/xlabel/ (mirrored from xlabel.net
// and thekikastore.com) so PDF renders, email bodies, and OG previews are
// not at the mercy of either CDN.
export const XLABEL_REPORT_THEME = {
  // Outer chrome — XLabel
  primary: '#0F172A',          // slate-900 hero band (XLabel white logo sits on this)
  primaryHover: '#1E293B',
  ink: '#0B0B0B',              // body text
  ink2: '#374151',             // muted body text
  muted: '#737373',             // captions, footnotes
  paper: '#FFFFFF',            // page bg
  cream: '#FAF7F2',             // KIKA editorial section bg
  rule: '#E5E5E5',              // hairline borders
  // KIKA accents (used sparingly for product/brand callouts)
  kikaPink: '#EC4899',         // pink-500 — single accent
  gold: '#C9A961',              // KIKA warm metallic flourish
  // Comparison color buckets (±5% threshold)
  upGreen: '#15803D',           // ▲ green-700
  downRed: '#B91C1C',           // ▼ red-700
  flat: '#737373',              // — neutral
  amber: '#B45309',             // warning yellow (anomaly banner)
  // Logo paths (resolved from /public — pinned at deploy time)
  logos: {
    xlabelWhite: '/brand/xlabel/xlabel-white.png',
    kikaBlack: '/brand/xlabel/kika-black.png',
  },
} as const;

