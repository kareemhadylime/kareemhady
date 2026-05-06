// Pure helpers — no React, no server-only. Used by panel components to
// classify percentage/score values into green/amber/red bands and yield
// the matching Tailwind classes (light-tint background + dark text).

export type ColorBand = 'green' | 'amber' | 'red';

/**
 * Classify a percentage in [0, 100] using the dashboard's standard thresholds:
 *  green ≥ 70, amber 40–70, red < 40.
 */
export function bandForOccupancy(pct: number): ColorBand {
  if (pct >= 70) return 'green';
  if (pct >= 40) return 'amber';
  return 'red';
}

/**
 * Tailwind classes for background + text per band. Light theme only —
 * uses tone-100 fills with tone-700 text so the text retains AA contrast
 * against the panel's white surface.
 */
export const BAND_CLASSES: Record<ColorBand, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
};
