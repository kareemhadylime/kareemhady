// src/app/fmplus/performance/[contractId]/page.tsx
import { notFound } from 'next/navigation';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildContractDashboard } from '@/lib/fmplus/performance/build-dashboard';
import { resolvePeriod } from '@/lib/fmplus/performance/period';
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { PerformanceSidebar } from '../_components/performance-sidebar';
import { ContractHero } from '../_components/contract-hero';
import { KpiStripPanel } from '../_components/panels/kpi-strip';
import { ServiceLinesPanel } from '../_components/panels/service-lines';
import { VarianceRankingPanel } from '../_components/panels/variance-ranking';
import { ManningPanel } from '../_components/panels/manning';
import { CategoriesPanel } from '../_components/panels/categories';
import { UnmappedPanel } from '../_components/panels/unmapped';
import { ForecastPanel } from '../_components/panels/forecast';
import { VendorsPanel } from '../_components/panels/vendors';
import { ArAgingPanel } from '../_components/panels/ar-aging';
import { OvertimePanel } from '../_components/panels/overtime';
import { MobilizationPanel } from '../_components/panels/mobilization';
import { SignoffPanel } from '../_components/panels/signoff';
import { YoyArcPanel } from '../_components/panels/yoy-arc';
import { AnomaliesPanel } from '../_components/panels/anomalies';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

export const dynamic = 'force-dynamic';

const JUMP = [
  { id: 'perf-kpi', label: 'KPIs' },
  { id: 'perf-service-lines', label: 'Service Lines' },
  { id: 'perf-variance', label: 'Variance' },
  { id: 'perf-manning', label: 'Manning' },
  { id: 'perf-categories', label: 'Categories' },
  { id: 'perf-unmapped', label: 'Unmapped' },
  { id: 'perf-forecast', label: 'Forecast' },
  { id: 'perf-vendors', label: 'Vendors' },
  { id: 'perf-ar-aging', label: 'AR Aging' },
  { id: 'perf-overtime', label: 'Overtime' },
  { id: 'perf-mobilization', label: 'Mobilization' },
  { id: 'perf-signoff', label: 'Sign-off' },
  { id: 'perf-yoy', label: 'Year-over-Year' },
  { id: 'perf-anomalies', label: 'Anomalies' },
];

interface Props {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ chip?: string; from?: string; to?: string; compare?: string }>;
}

/**
 * Count whole calendar months touched by [from, to]. Mirrors the
 * `periodMonthNumbers` semantics used inside build-dashboard for slicing
 * (any month with any overlap counts).
 */
function countMonthsInRange(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  let n = 0;
  while (cursor.getTime() <= end.getTime()) {
    n += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return n;
}

export default async function PerformanceContractPage(props: Props) {
  await requireBudgetView();
  const { contractId } = await props.params;
  const sp = await props.searchParams;
  const id = Number(contractId);
  if (!Number.isFinite(id)) notFound();

  const period = resolvePeriod({
    chip: (sp.chip as PeriodChip) ?? 'prev-month',
    from: sp.from,
    to: sp.to,
  });

  const [data, allContracts] = await Promise.all([
    buildContractDashboard({
      contract_id: id,
      period,
      compare: sp.compare === '1',
    }),
    buildPortfolio({}),
  ]);

  const sidebarContracts = allContracts.map(c => ({
    id: c.contract_id,
    name: c.project_name,
    customer: c.customer,
  }));

  const monthsElapsed = countMonthsInRange(period.from, period.to);
  const monthsTotal = 12;

  return (
    <>
      <PerformanceSidebar
        resolvedPeriodLabel={`${period.label} · Y${data.meta.current_year_index}`}
        contextLine={`${data.meta.contract_name}${data.meta.customer ? ` · ${data.meta.customer}` : ''}`}
        jumpAnchors={JUMP}
        contracts={sidebarContracts}
        currentContractId={id}
      />
      <div className="flex-1 px-6 py-6 space-y-4 max-w-6xl mx-auto">
        <ContractHero
          contractId={id}
          contractName={data.meta.contract_name}
          customer={data.meta.customer}
          periodLabel={period.label}
          currentYearIndex={data.meta.current_year_index}
          monthsElapsed={monthsElapsed}
          monthsTotal={monthsTotal}
          contracts={sidebarContracts}
        />
        <KpiStripPanel kpis={data.kpis} />
        <ServiceLinesPanel rows={data.service_lines} />
        <VarianceRankingPanel rows={data.variance_ranked} />
        <ManningPanel rows={data.manning} />
        <CategoriesPanel rows={data.categories} unmapped={data.unmapped} />
        <UnmappedPanel lines={data.unmapped} periodTotal={data.kpis.find(k => k.id === 'expense')?.value ?? 0} />
        <ForecastPanel block={data.forecast} />
        <VendorsPanel rows={data.vendors} />
        <ArAgingPanel block={data.ar_aging} contractId={id} />
        <OvertimePanel block={data.overtime} />
        <MobilizationPanel rows={data.mobilization} />
        <SignoffPanel block={data.signoff} />
        <YoyArcPanel rows={data.yoy} />
        <AnomaliesPanel rows={data.anomalies} />
      </div>
    </>
  );
}
