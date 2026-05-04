// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import { supabaseAdmin } from '@/lib/supabase';

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

export async function writeAuditOnPublishedEdit(opts: {
  budgetId: number;
  changedBy: string | null;
  before: Line[];
  after: Line[];
}): Promise<void> {
  const diff = computeBudgetDiff(opts.before, opts.after);
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) return;
  await supabaseAdmin().from('budget_audit').insert({
    budget_id: opts.budgetId,
    changed_by: opts.changedBy,
    diff_json: diff,
  });
}
