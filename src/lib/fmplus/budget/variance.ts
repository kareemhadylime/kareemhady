import type { Season, AccountMapJsonT } from './schema';

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

export function matchAccountToCategory(
  accountCode: string,
  map: AccountMapJsonT,
): string | null {
  for (const entry of map) {
    for (const pattern of entry.code_patterns) {
      if (new RegExp(pattern).test(accountCode)) return entry.category;
    }
  }
  return null;
}

export type MoveLineForAgg = {
  date: string;
  balance: number;
  account_code: string;
};

export type AggregatedActualCell = {
  segment_id: number;
  category: string;
  month: number;
  actual: number;
};

export function aggregateActualsByMonth(
  moveLines: MoveLineForAgg[],
  map: AccountMapJsonT,
  segmentId: number,
): { cells: AggregatedActualCell[]; unmappedTotal: number } {
  const buckets = new Map<string, number>();
  let unmappedTotal = 0;
  for (const ml of moveLines) {
    const month = new Date(ml.date).getUTCMonth() + 1;
    const cat = matchAccountToCategory(ml.account_code, map);
    if (!cat) {
      unmappedTotal += Number(ml.balance);
      continue;
    }
    const k = `${cat}|${month}`;
    buckets.set(k, (buckets.get(k) ?? 0) + Number(ml.balance));
  }
  const cells: AggregatedActualCell[] = [];
  for (const [k, actual] of buckets.entries()) {
    const [category, monthStr] = k.split('|');
    cells.push({ segment_id: segmentId, category, month: Number(monthStr), actual });
  }
  return { cells, unmappedTotal };
}

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
