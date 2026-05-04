// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import { supabaseAdmin } from '@/lib/supabase';
import type { FlatRow } from './parsers/flat-template';
import type { Scenario, ServiceLine } from './schema';
import { getTemplate } from './templates';

export function groupRowsBySegment(rows: FlatRow[]): Map<ServiceLine, FlatRow[]> {
  const out = new Map<ServiceLine, FlatRow[]>();
  for (const r of rows) {
    const key = r.service_line as ServiceLine;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(r);
  }
  return out;
}

export type CommitOpts = {
  projectId: number;
  fiscalYear: number;
  scenario: Scenario;
  startMonth: number;
  rows: FlatRow[];
  publishedBy?: string | null;
  publish?: boolean;
  notes?: string | null;
};

export type CommitResult = {
  budgetId: number;
  segmentsUpserted: Array<{ service_line: ServiceLine; segment_id: number; lines: number }>;
  status: 'draft' | 'published';
};

export async function commitBudget(opts: CommitOpts): Promise<CommitResult> {
  const sb = supabaseAdmin();
  const { projectId, fiscalYear, scenario, startMonth, rows, publishedBy, notes } = opts;
  const publish = opts.publish === true;

  // Upsert project_budgets row.
  const { data: existing } = await sb
    .from('project_budgets')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('fiscal_year', fiscalYear)
    .eq('scenario', scenario)
    .maybeSingle();

  let budgetId: number;
  let status: 'draft' | 'published';
  if (existing) {
    const e = existing as { id: number; status: 'draft' | 'published' };
    budgetId = e.id;
    status = publish ? 'published' : e.status;
    const updates: Record<string, unknown> = {
      start_month: startMonth, notes: notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (publish) {
      updates.status = 'published';
      updates.published_at = new Date().toISOString();
      updates.published_by = publishedBy ?? null;
    }
    await sb.from('project_budgets').update(updates).eq('id', budgetId);
  } else {
    const insertRow: Record<string, unknown> = {
      project_id: projectId, fiscal_year: fiscalYear, scenario,
      start_month: startMonth, notes: notes ?? null,
      status: publish ? 'published' : 'draft',
    };
    if (publish) {
      insertRow.published_at = new Date().toISOString();
      insertRow.published_by = publishedBy ?? null;
    }
    const { data: ins, error } = await sb
      .from('project_budgets').insert(insertRow).select('id, status').single();
    if (error || !ins) throw new Error(`Failed to create budget: ${error?.message}`);
    budgetId = (ins as { id: number }).id;
    status = (ins as { status: 'draft' | 'published' }).status;
  }

  // For each service_line in rows, upsert segment + replace lines.
  const grouped = groupRowsBySegment(rows);
  const summary: CommitResult['segmentsUpserted'] = [];
  for (const [serviceLine, segRows] of grouped.entries()) {
    const tpl = getTemplate(serviceLine, 1);
    const { data: segExisting } = await sb
      .from('project_budget_segments')
      .select('id')
      .eq('budget_id', budgetId)
      .eq('service_line', serviceLine)
      .maybeSingle();
    let segmentId: number;
    if (segExisting) {
      segmentId = (segExisting as { id: number }).id;
      // Wipe previous lines for this segment.
      await sb.from('budget_lines').delete().eq('segment_id', segmentId);
    } else {
      const { data: segIns, error: segErr } = await sb
        .from('project_budget_segments')
        .insert({ budget_id: budgetId, service_line: serviceLine, template_version: tpl.version })
        .select('id').single();
      if (segErr || !segIns) throw new Error(`Failed to create segment: ${segErr?.message}`);
      segmentId = (segIns as { id: number }).id;
    }
    if (segRows.length > 0) {
      const lineRows = segRows.map(r => ({
        segment_id: segmentId, sub_location: r.sub_location,
        category: r.category, line_code: r.line_code, season: r.season,
        qty: r.qty, unit_cost: r.unit_cost, notes: r.notes,
      }));
      await sb.from('budget_lines').insert(lineRows);
    }
    summary.push({ service_line: serviceLine, segment_id: segmentId, lines: segRows.length });
  }

  return { budgetId, segmentsUpserted: summary, status };
}
