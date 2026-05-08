// Shared brand tokens for Beithady client components.
//
// PDF/email renderers must use raw hex (Tailwind / CSS vars don't
// survive into PDF rendering) — see `src/lib/brand-theme.ts` for
// those, and the BEITHADY_PDF_THEME constant when it lands in
// Phase B.
//
// This file is the canonical home for token constants used at
// runtime by Beithady client components.

/**
 * Semantic status colors used across Performance dashboard panels and
 * the fees-audit KPI strip. Hoisted from 4 redeclarations
 * (panel-frame.tsx, panels/hero-kpi.tsx, panels/daily-activity.tsx,
 * fees-audit/_components/KpiStrip.tsx) on 2026-05-08 audit follow-up.
 */
export const STATUS_COLORS = {
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;
