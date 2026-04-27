import type { ComparisonChip, ToplineKpi, TopProductRow, WhyAttribution } from './types';

// "Why" attribution — when a comparison is dramatic (default: |Δ%|≥20% AND
// |ΔEGP|≥5,000), append a plain-English reason linking the move to the
// dominant cause: usually a hero SKU. Up to 2 explanations per report (one
// for net revenue, one for orders) so the digest stays concise.
//
// Triggers off `topline.comparisons` and the top-products list.

export const WHY_PCT_THRESHOLD = 20;
export const WHY_ABS_THRESHOLD_EGP = 5_000;
export const WHY_ABS_THRESHOLD_ORDERS = 5;

const fmtEgp = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `EGP ${Math.round(n / 1000)}k`;
  return `EGP ${Math.round(n).toLocaleString('en-US')}`;
};

function pickBigChip(
  comparisons: ToplineKpi['comparisons']['net_revenue'],
  unit: 'egp' | 'orders'
): {
  comparison: 'vs_prior_day' | 'vs_prior_weekday' | 'vs_mtd_prior_month';
  chip: ComparisonChip;
} | null {
  const candidates: Array<{
    comparison: 'vs_prior_day' | 'vs_prior_weekday' | 'vs_mtd_prior_month';
    chip: ComparisonChip | null;
  }> = [
    { comparison: 'vs_prior_weekday', chip: comparisons.vs_prior_weekday },
    { comparison: 'vs_prior_day', chip: comparisons.vs_prior_day },
    { comparison: 'vs_mtd_prior_month', chip: comparisons.vs_mtd_prior_month },
  ];
  const absThreshold =
    unit === 'egp' ? WHY_ABS_THRESHOLD_EGP : WHY_ABS_THRESHOLD_ORDERS;
  // Pick the LARGEST move that crosses BOTH the % AND abs thresholds.
  let best: { comparison: typeof candidates[number]['comparison']; chip: ComparisonChip } | null = null;
  for (const c of candidates) {
    if (!c.chip || c.chip.pct === null) continue;
    if (Math.abs(c.chip.pct) < WHY_PCT_THRESHOLD) continue;
    if (Math.abs(c.chip.abs) < absThreshold) continue;
    if (!best || Math.abs(c.chip.abs) > Math.abs(best.chip.abs)) {
      best = { comparison: c.comparison, chip: c.chip };
    }
  }
  return best;
}

const COMPARISON_LABEL: Record<
  'vs_prior_day' | 'vs_prior_weekday' | 'vs_mtd_prior_month',
  string
> = {
  vs_prior_day: 'vs the day before',
  vs_prior_weekday: 'vs the same weekday last week',
  vs_mtd_prior_month: 'vs same period last month',
};

export function composeWhyAttribution(args: {
  topline: ToplineKpi;
  topProducts: TopProductRow[];
}): WhyAttribution[] {
  const out: WhyAttribution[] = [];

  // Net revenue mover
  const revMove = pickBigChip(args.topline.comparisons.net_revenue, 'egp');
  if (revMove) {
    const direction = revMove.chip.pct! > 0 ? '▲' : '▼';
    const sign = revMove.chip.pct! > 0 ? '+' : '';
    let driver = '';
    if (args.topProducts.length > 0 && args.topline.net_revenue_egp > 0) {
      const top = args.topProducts[0];
      if (top.share_of_day_pct >= 15) {
        driver = ` — driven by ${top.title}${
          top.variant_label ? ` (${top.variant_label})` : ''
        } at ${top.units} units / ${fmtEgp(top.revenue_egp)}`;
      }
    }
    out.push({
      metric: 'net_revenue',
      comparison: revMove.comparison,
      text: `Net revenue ${direction} ${sign}${revMove.chip.pct!.toFixed(0)}% (${fmtEgp(revMove.chip.abs)}) ${COMPARISON_LABEL[revMove.comparison]}${driver}.`,
    });
  }

  // Orders mover (only if it doesn't duplicate the revenue story)
  const ordMove = pickBigChip(args.topline.comparisons.orders, 'orders');
  if (ordMove && (!revMove || ordMove.comparison !== revMove.comparison)) {
    const direction = ordMove.chip.pct! > 0 ? '▲' : '▼';
    const sign = ordMove.chip.pct! > 0 ? '+' : '';
    out.push({
      metric: 'orders',
      comparison: ordMove.comparison,
      text: `Orders ${direction} ${sign}${ordMove.chip.pct!.toFixed(0)}% (${ordMove.chip.abs > 0 ? '+' : ''}${ordMove.chip.abs.toFixed(0)}) ${COMPARISON_LABEL[ordMove.comparison]}.`,
    });
  }

  return out;
}
