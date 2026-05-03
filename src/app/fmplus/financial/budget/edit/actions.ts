'use server';
import { revalidatePath } from 'next/cache';
import { commitBudget } from '@/lib/fmplus/budget/commit';
import { writeAuditOnPublishedEdit } from '@/lib/fmplus/budget/audit';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

type ActionArgs = {
  projectId: number;
  year: number;
  scenario: Scenario;
  serviceLine: ServiceLine;
  startMonth: number;
  lines: Array<{ sub_location: string|null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }>;
};

async function loadExistingLines(budgetId: number, segmentServiceLine: ServiceLine) {
  const sb = supabaseAdmin();
  const { data: seg } = await sb
    .from('project_budget_segments').select('id').eq('budget_id', budgetId).eq('service_line', segmentServiceLine).maybeSingle();
  if (!seg) return [];
  const { data } = await sb.from('budget_lines')
    .select('sub_location, category, line_code, season, qty, unit_cost')
    .eq('segment_id', (seg as { id: number }).id);
  return (data ?? []) as Array<{ sub_location: string|null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }>;
}

async function runAction(args: ActionArgs, publish: boolean): Promise<{ ok: boolean; linesWritten: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !user.is_admin) return { ok: false, linesWritten: 0, error: 'Admin only.' };
  try {
    const sb = supabaseAdmin();
    const { data: project } = await sb.from('odoo_analytic_accounts').select('name').eq('id', args.projectId).maybeSingle();
    if (!project) return { ok: false, linesWritten: 0, error: 'Unknown project.' };
    const projectName = (project as { name: string }).name;

    const { data: existing } = await sb
      .from('project_budgets').select('id, status')
      .eq('project_id', args.projectId).eq('fiscal_year', args.year).eq('scenario', args.scenario)
      .maybeSingle();
    let auditBefore: Awaited<ReturnType<typeof loadExistingLines>> = [];
    if (existing && (existing as { status: 'draft'|'published' }).status === 'published') {
      auditBefore = await loadExistingLines((existing as { id: number }).id, args.serviceLine);
    }

    const flatRows = args.lines.map(l => ({
      project: projectName, service_line: args.serviceLine,
      sub_location: l.sub_location, category: l.category,
      line_code: l.line_code, season: l.season,
      qty: l.qty, unit_cost: l.unit_cost, notes: null,
    }));

    const result = await commitBudget({
      projectId: args.projectId, fiscalYear: args.year, scenario: args.scenario,
      startMonth: args.startMonth, rows: flatRows,
      publish, publishedBy: user.id, notes: null,
    });

    if (auditBefore.length > 0) {
      await writeAuditOnPublishedEdit({
        budgetId: result.budgetId, changedBy: user.id,
        before: auditBefore, after: args.lines,
      });
    }

    revalidatePath('/fmplus/financial/budget', 'layout');
    return { ok: true, linesWritten: result.segmentsUpserted.find(s => s.service_line === args.serviceLine)?.lines ?? 0 };
  } catch (err) {
    return { ok: false, linesWritten: 0, error: (err as Error).message };
  }
}

export async function saveBudgetAction(args: ActionArgs) {
  return runAction(args, false);
}
export async function publishBudgetAction(args: ActionArgs) {
  return runAction(args, true);
}
