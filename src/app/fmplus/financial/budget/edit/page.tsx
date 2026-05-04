import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { YearTabs } from './_components/year-tabs';
import { ServiceTabs } from './_components/service-tabs';
import { SectionAccordion } from './_components/section-accordion';
import { SavePublishButtons } from './_components/save-publish-buttons';

export const dynamic = 'force-dynamic';

interface EditPageProps {
  searchParams: Promise<{
    contract?: string;
    year?: string;
    service?: string;
    section?: string;
  }>;
}

const SERVICE_VALUES: ServiceLine[] = [
  'hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office',
];

export default async function EditPage(props: EditPageProps) {
  const sp = await props.searchParams;
  const user = await requireBudgetView();
  const sb = budgetDb();

  const contractId = Number(sp.contract);
  if (!Number.isFinite(contractId) || contractId <= 0) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <h3 className="text-sm font-semibold text-text-primary mb-2">No contract selected</h3>
        <p className="text-xs text-text-secondary mb-4">
          Pick a contract from the Project Hub to start editing.
        </p>
        <Link href="/fmplus/financial/budget/projects"
          className="text-xs px-3 py-1.5 bg-accent text-white rounded font-semibold inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Project Hub
        </Link>
      </div>
    );
  }

  // Load contract + services + all initial-scenario years
  const { data: contract } = await sb
    .from(TABLES.contracts)
    .select(`id, project_id, name, customer, year_tracking, contract_value, vat_pct, start_date, end_date, duration_months,
      project_services ( service_line, template_version ),
      project_years ( id, year_index, fiscal_year, scenario, status, start_month, published_at )`)
    .eq('id', contractId)
    .single();

  if (!contract) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Contract not found</h3>
        <Link href="/fmplus/financial/budget/projects" className="text-xs text-accent">← Back to Project Hub</Link>
      </div>
    );
  }

  const services = (((contract as any).project_services ?? []) as Array<{ service_line: ServiceLine; template_version: number }>);
  const allYears = (((contract as any).project_years ?? []) as Array<any>)
    .filter(y => y.scenario === 'initial')
    .sort((a, b) => a.year_index - b.year_index);

  const targetYearIndex = Number(sp.year) || (allYears[allYears.length - 1]?.year_index ?? 1);
  const currentYear = allYears.find(y => y.year_index === targetYearIndex) ?? allYears[allYears.length - 1] ?? null;

  if (!currentYear) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <h3 className="text-sm font-semibold text-text-primary mb-2">No years yet</h3>
        <p className="text-xs text-text-secondary">
          Contract <strong>{(contract as any).name}</strong> has no draft years. The new-contract wizard creates Y1 automatically — try recreating.
        </p>
      </div>
    );
  }

  // Service tab — defaults to first service if none selected
  const targetService = SERVICE_VALUES.includes(sp.service as ServiceLine)
    ? (sp.service as ServiceLine)
    : (services[0]?.service_line ?? 'hk');

  // Lines for (year, service)
  const { data: lineRows } = await sb
    .from(TABLES.lines)
    .select('*')
    .eq('year_id', currentYear.id)
    .eq('service_line', targetService)
    .order('category')
    .order('line_code');

  // Year-service summary (revenue)
  const { data: yearServiceRow } = await sb
    .from(TABLES.year_services)
    .select('monthly_revenue, vat_pct')
    .eq('year_id', currentYear.id)
    .eq('service_line', targetService)
    .maybeSingle();

  // Get template for this service to render section accordion
  const template = getTemplate(targetService, 1);

  // KPI summary computed from lines
  const totalCost = (lineRows ?? []).reduce(
    (a: number, l: any) => a + Number(l.qty) * Number(l.unit_cost) * 12, 0
  );
  const annualRevenue = Number(yearServiceRow?.monthly_revenue ?? 0) * 12;
  const gmPct = annualRevenue > 0 ? ((annualRevenue - totalCost) / annualRevenue * 100) : null;
  const headcount = (lineRows ?? [])
    .filter((l: any) => l.category === 'manning')
    .reduce((a: number, l: any) => a + Number(l.qty), 0);

  return (
    <div className="space-y-3">
      {/* Header with breadcrumb + status */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <Link href="/fmplus/financial/budget/projects"
            className="text-[11px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1 mb-1">
            <ArrowLeft size={11} /> Project Hub
          </Link>
          <h2 className="text-sm font-semibold text-text-primary">
            {(contract as any).name}
            <span className="ml-2 text-[11px] text-text-secondary font-normal">
              · {(contract as any).customer ?? '—'} · {(((contract as any).contract_value ?? 0) / 1_000_000).toFixed(1)} M EGP
            </span>
          </h2>
          <div className="text-[11px] text-text-secondary mt-0.5">
            Status: <span className={currentYear.status === 'published' ? 'text-green-400 font-semibold' : 'text-amber-400 font-semibold'}>{currentYear.status}</span>
            {' · '}
            Scenario: <strong>{currentYear.scenario}</strong>
            {' · '}
            {currentYear.fiscal_year ? `FY ${currentYear.fiscal_year}` : `Y${currentYear.year_index}`}
          </div>
        </div>
        <SavePublishButtons
          yearId={currentYear.id}
          yearIndex={currentYear.year_index}
          status={currentYear.status as 'draft' | 'published'}
          canEdit={Boolean(user.is_admin)}
        />
      </header>

      {/* Year tabs */}
      <YearTabs
        contractId={contractId}
        years={allYears.map(y => ({ year_index: y.year_index, fiscal_year: y.fiscal_year, status: y.status }))}
        activeYearIndex={currentYear.year_index}
      />

      {/* Service tabs */}
      <ServiceTabs
        contractId={contractId}
        yearIndex={currentYear.year_index}
        services={services.map(s => s.service_line)}
        activeService={targetService}
      />

      {/* KPI strip */}
      <div className="bg-bg-tertiary border border-border rounded-lg px-4 py-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div><span className="text-text-secondary">Y{currentYear.year_index} {targetService.toUpperCase()} Revenue:</span> <strong className="tabular-nums">{annualRevenue > 0 ? (annualRevenue / 1_000_000).toFixed(2) + ' M' : '—'}</strong></div>
        <div><span className="text-text-secondary">Cost:</span> <strong className="tabular-nums">{totalCost > 0 ? (totalCost / 1_000_000).toFixed(2) + ' M' : '—'}</strong></div>
        <div><span className="text-text-secondary">GM:</span> <strong className={gmPct != null && gmPct > 15 ? 'text-green-400' : gmPct != null && gmPct >= 0 ? 'text-amber-400' : 'text-text-primary'}>{gmPct != null ? gmPct.toFixed(1) + '%' : '—'}</strong></div>
        <div><span className="text-text-secondary">Headcount:</span> <strong className="tabular-nums">{headcount.toFixed(0)}</strong></div>
        <div><span className="text-text-secondary">Lines:</span> <strong className="tabular-nums">{(lineRows ?? []).length}</strong></div>
      </div>

      {/* Section accordion */}
      <SectionAccordion
        template={template}
        lines={(lineRows ?? []) as any[]}
        canEdit={Boolean(user.is_admin) && currentYear.status !== 'published'}
        openSection={sp.section}
        contractId={contractId}
        yearId={currentYear.id}
        yearIndex={currentYear.year_index}
        serviceLine={targetService}
      />
    </div>
  );
}
