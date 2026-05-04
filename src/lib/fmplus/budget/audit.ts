import { budgetDb, TABLES } from './db';

/**
 * Append a row to budget_audit when a published year is re-edited or
 * republished. The diff_json is the caller's choice — typically
 * `{ trigger: 'republish_after_edit', by, fields: [...] }`.
 */
export async function writeAuditOnPublishedEdit(yearId: number, diffJson: Record<string, unknown>): Promise<void> {
  const sb = budgetDb();
  const { error } = await sb.from(TABLES.audit).insert({
    year_id: yearId,
    diff_json: diffJson,
    changed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// v1 helpers — kept for audit.test.ts; will be removed with v1 cleanup
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LineKey = { sub_location: string | null; category: string; line_code: string; season: 'high'|'low' };
type Line = LineKey & { qty: number; unit_cost: number };

function keyOf(l: LineKey): string {
  return `${l.category}|${l.line_code}|${l.sub_location ?? ''}|${l.season}`;
}

export function computeBudgetDiff(before: Line[], after: Line[]): {
  added: Line[]; removed: Line[]; changed: Array<{ line_code: string; key: string; before: Line; after: Line }>;
} {
  const beforeMap = new Map(before.map(l => [keyOf(l), l]));
  const afterMap  = new Map(after.map(l  => [keyOf(l), l]));
  const added: Line[]   = [];
  const removed: Line[] = [];
  const changed: Array<{ line_code: string; key: string; before: Line; after: Line }> = [];
  for (const [k, a] of afterMap.entries()) {
    const b = beforeMap.get(k);
    if (!b) { added.push(a); continue; }
    if (b.qty !== a.qty || b.unit_cost !== a.unit_cost) changed.push({ line_code: a.line_code, key: k, before: b, after: a });
  }
  for (const [k, b] of beforeMap.entries()) {
    if (!afterMap.has(k)) removed.push(b);
  }
  return { added, removed, changed };
}
