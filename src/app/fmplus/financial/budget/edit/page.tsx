import { supabaseAdmin } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { ProjectPicker } from './_components/project-picker';
import { ServiceLinePicker } from './_components/service-line-picker';
import { EditorForm } from './_components/editor-form';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import { ServiceLineSchema, ScenarioSchema } from '@/lib/fmplus/budget/schema';

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; year?: string; scenario?: string; service_line?: string }>;
}) {
  const sp = await searchParams;
  const projectId = Number(sp.project ?? 0);
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const scenarioParse = ScenarioSchema.safeParse(sp.scenario ?? 'initial');
  const scenario: Scenario = scenarioParse.success ? scenarioParse.data : 'initial';
  const slParse = ServiceLineSchema.safeParse(sp.service_line);
  const serviceLine: ServiceLine | null = slParse.success ? slParse.data : null;

  const sb = supabaseAdmin();

  if (!projectId) {
    const { data: projects } = await sb
      .from('odoo_analytic_accounts')
      .select(`id, name, plan_id, odoo_analytic_plans!inner(name)`)
      .eq('active', true)
      .order('name');
    type AA = { id: number; name: string; odoo_analytic_plans: { name: string } };
    return <ProjectPicker projects={(projects ?? []) as unknown as AA[]} year={year} scenario={scenario} />;
  }

  const { data: project } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name, balance, plan_id, odoo_analytic_plans!inner(name)')
    .eq('id', projectId).maybeSingle();
  if (!project) redirect('/fmplus/financial/budget/edit');

  if (!serviceLine) {
    return <ServiceLinePicker
      projectId={projectId}
      projectName={(project as { name: string }).name}
      year={year} scenario={scenario}
    />;
  }

  const tpl = getTemplate(serviceLine, 1);
  const { data: budget } = await sb
    .from('project_budgets')
    .select('id, status, start_month, notes')
    .eq('project_id', projectId).eq('fiscal_year', year).eq('scenario', scenario)
    .maybeSingle();
  let segmentLines: Array<{ sub_location: string | null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number; notes: string | null }> = [];
  let budgetId: number | null = null;
  let segmentId: number | null = null;
  let status: 'draft' | 'published' = 'draft';
  let startMonth = 1;
  if (budget) {
    const b = budget as { id: number; status: 'draft'|'published'; start_month: number; notes: string | null };
    budgetId = b.id; status = b.status; startMonth = b.start_month;
    const { data: seg } = await sb
      .from('project_budget_segments').select('id').eq('budget_id', b.id).eq('service_line', serviceLine).maybeSingle();
    if (seg) {
      segmentId = (seg as { id: number }).id;
      const { data: lines } = await sb
        .from('budget_lines')
        .select('sub_location, category, line_code, season, qty, unit_cost, notes')
        .eq('segment_id', segmentId);
      segmentLines = (lines ?? []) as typeof segmentLines;
    }
  }

  return (
    <EditorForm
      projectId={projectId}
      projectName={(project as { name: string }).name}
      year={year}
      scenario={scenario}
      serviceLine={serviceLine}
      template={tpl}
      budgetId={budgetId}
      status={status}
      startMonth={startMonth}
      initialLines={segmentLines}
    />
  );
}
