import type { ReportData, ReportMode } from './types';

/**
 * Defense-in-depth: strip cost-detail fields from ReportData when mode='customer'.
 *
 * Customer-facing reports must NEVER expose CTC rates, GP %, or per-line cost
 * detail. Even if a renderer has a bug and tries to render those fields, this
 * pass deletes them from the data structure entirely.
 *
 * @returns A NEW ReportData object with the appropriate fields stripped/replaced.
 *          Original input is not mutated.
 */
export function applyVisibility(data: ReportData, mode: ReportMode): ReportData {
  if (mode !== 'customer') return data;

  // Strip service-line cost detail
  const service_lines = data.service_lines.map((s) => ({
    ...s,
    hc_budgeted: null,
    monthly_cost: null,
    gp_pct: null,
    gp_egp: null,
  }));

  // Strip manning per-row cost detail (keep hc_required + position labels)
  const manning_rows = data.manning.rows.map((m) => ({
    ...m,
    hc_budgeted: null,
    ctc_rate: null,
    monthly_cost: null,
  }));

  // Hide Budget Breakdown matrix entirely (cost-leak risk)
  const budget_breakdown = {
    cells: null,
    category_totals: null,
    service_totals: data.budget_breakdown.service_totals, // keep aggregate fees
  };

  // Collapse mobilization to summary
  const mobilization = data.mobilization ? collapseMobilization(data.mobilization) : null;

  // Strip change_vs_initial entirely
  const change_vs_initial = null;

  // Strip variance snapshot
  const variance_snapshot = null;

  return {
    ...data,
    service_lines,
    manning: {
      ...data.manning,
      rows: manning_rows,
      totals_by_service: Object.fromEntries(
        Object.entries(data.manning.totals_by_service).map(([sl, t]) => [
          sl,
          { hc_required: t!.hc_required, hc_budgeted: null },
        ]),
      ) as ReportData['manning']['totals_by_service'],
    },
    budget_breakdown,
    mobilization,
    change_vs_initial,
    variance_snapshot,
  };
}

function collapseMobilization(
  mob: NonNullable<ReportData['mobilization']>,
): ReportData['mobilization'] {
  if ('detail' in mob) {
    const total = mob.detail.reduce((a, l) => a + l.total, 0);
    return {
      summary_text: `Upfront mobilization fee: EGP ${total.toLocaleString()}`,
      total_egp: total,
    };
  }
  return mob;
}
