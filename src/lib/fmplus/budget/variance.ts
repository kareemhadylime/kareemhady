import type { Season } from './schema';

export type AggregatedBudgetCell = {
  segment_id: number;
  category: string;
  month: number;
  budget: number;
};

export type BudgetLineForAgg = {
  segment_id: number;
  category: string;
  season: Season;
  monthly_cost: number;
};

export function aggregateBudgetByMonth(
  lines: BudgetLineForAgg[],
  seasonMonths: { high: number[]; low: number[] },
  startMonth: number,
): AggregatedBudgetCell[] {
  const seasonTotal = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.segment_id}|${l.category}|${l.season}`;
    seasonTotal.set(k, (seasonTotal.get(k) ?? 0) + Number(l.monthly_cost));
  }
  const out: AggregatedBudgetCell[] = [];
  for (const [k, total] of seasonTotal.entries()) {
    const [segIdStr, category, season] = k.split('|');
    const months = season === 'high' ? seasonMonths.high : seasonMonths.low;
    for (const month of months) {
      out.push({
        segment_id: Number(segIdStr),
        category,
        month,
        budget: month >= startMonth ? total : 0,
      });
    }
  }
  return out;
}
