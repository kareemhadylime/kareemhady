// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
'use server';
import { isRichAucStyleWorkbook, parseRichAucStyleXlsx } from '@/lib/fmplus/budget/parsers/rich-auc-style';
import { parseFlatBudgetXlsx, type FlatRow } from '@/lib/fmplus/budget/parsers/flat-template';
import { commitBudget } from '@/lib/fmplus/budget/commit';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import type { Scenario } from '@/lib/fmplus/budget/schema';

export async function previewImportAction(args: {
  fileBase64: string;
  projectId: number | null;
  fiscalYear: number;
  scenario: Scenario;
}): Promise<
  | { ok: true; format: 'rich'|'flat'; rows: FlatRow[]; warnings: string[]; totals: { byCategory: Record<string, { high: number; low: number }>; high: number; low: number } }
  | { ok: false; error: string; details?: unknown }
> {
  const buf = Buffer.from(args.fileBase64, 'base64');
  const isRich = await isRichAucStyleWorkbook(buf);
  if (isRich) {
    if (!args.projectId) return { ok: false, error: 'Pick a project before uploading a rich AUC-style sheet.' };
    const sb = supabaseAdmin();
    const { data: project } = await sb.from('odoo_analytic_accounts').select('name').eq('id', args.projectId).maybeSingle();
    if (!project) return { ok: false, error: 'Unknown project' };
    const result = await parseRichAucStyleXlsx(buf, { project: (project as { name: string }).name });
    return summarize('rich', result.rows, result.errors.map(e => `${e.sheet} row ${e.row}: ${e.message}`));
  }
  const flat = await parseFlatBudgetXlsx(buf);
  return summarize('flat', flat.rows, flat.errors.map(e => `Row ${e.row} · ${e.field}: ${e.message}`));
}

function summarize(format: 'rich'|'flat', rows: FlatRow[], errs: string[]) {
  const byCat: Record<string, { high: number; low: number }> = {};
  let hi = 0, lo = 0;
  for (const r of rows) {
    const m = r.qty * r.unit_cost;
    if (!byCat[r.category]) byCat[r.category] = { high: 0, low: 0 };
    if (r.season === 'high') { byCat[r.category].high += m; hi += m; }
    else                     { byCat[r.category].low  += m; lo += m; }
  }
  return { ok: true as const, format, rows, warnings: errs, totals: { byCategory: byCat, high: hi, low: lo } };
}

export async function commitImportAction(args: {
  rows: FlatRow[];
  projectId: number;
  fiscalYear: number;
  scenario: Scenario;
  startMonth: number;
  publish: boolean;
}): Promise<{ ok: boolean; budgetId?: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !user.is_admin) return { ok: false, error: 'Admin only.' };
  try {
    const result = await commitBudget({
      projectId: args.projectId, fiscalYear: args.fiscalYear,
      scenario: args.scenario, startMonth: args.startMonth,
      rows: args.rows, publish: args.publish, publishedBy: user.id,
    });
    revalidatePath('/fmplus/financial/budget', 'layout');
    return { ok: true, budgetId: result.budgetId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
