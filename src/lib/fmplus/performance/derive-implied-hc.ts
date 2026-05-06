export interface ManningRow { qty: number; unit_cost: number; }

export function weightedAvgCtc(rows: ManningRow[]): number | null {
  let totalCost = 0;
  let totalQty = 0;
  for (const r of rows) {
    if (r.qty <= 0) continue;
    totalCost += r.qty * r.unit_cost;
    totalQty += r.qty;
  }
  if (totalQty === 0) return null;
  return totalCost / totalQty;
}

export function impliedHeadcount(actualSpend: number, avgCtc: number | null): number | null {
  if (avgCtc === null || avgCtc <= 0) return null;
  if (actualSpend <= 0) return 0;
  return actualSpend / avgCtc;
}
