export interface MobLineLite {
  category: string;
  total_cost: number;
  amortization: 'straight_line' | 'flat';
  amortization_months: number;
}

/**
 * Amortize a list of mobilization lines into a per-month spend map.
 *
 * Returns a Map keyed by `"YYYY-MM"` strings with EGP values.
 * - 'straight_line' lines spread `total_cost` equally over the next
 *   `amortization_months` months starting at `contractStart`.
 *   Months beyond `contractEnd` are silently dropped.
 * - 'flat' lines put `total_cost` entirely in the contract's start month.
 *
 * Multiple lines in the same month accumulate.
 */
export function amortizeMobilization(
  lines: MobLineLite[],
  contractStart: string,
  contractEnd: string,
): Map<string, number> {
  const map = new Map<string, number>();
  const start = new Date(contractStart);
  const end = new Date(contractEnd);

  for (const line of lines) {
    if (line.amortization === 'flat') {
      const key = monthKey(start);
      map.set(key, (map.get(key) ?? 0) + line.total_cost);
      continue;
    }
    // straight_line
    const monthly = line.total_cost / line.amortization_months;
    const cursor = new Date(start);
    for (let i = 0; i < line.amortization_months; i++) {
      if (cursor > end) break;
      const key = monthKey(cursor);
      map.set(key, (map.get(key) ?? 0) + monthly);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return map;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
