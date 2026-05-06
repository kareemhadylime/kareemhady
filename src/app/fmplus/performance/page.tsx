// src/app/fmplus/performance/page.tsx
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildPortfolioPerformance } from '@/lib/fmplus/performance/build-portfolio';
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { resolvePeriod } from '@/lib/fmplus/performance/period';
import { PerformanceSidebar } from './_components/performance-sidebar';
import { PortfolioKpiStrip } from './_components/portfolio/portfolio-kpi-strip';
import { PortfolioVarianceBar } from './_components/portfolio/portfolio-variance-bar';
import { PortfolioNeedsAttention } from './_components/portfolio/portfolio-needs-attention';
import { PortfolioTable } from './_components/portfolio/portfolio-table';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    chip?: string;
    from?: string;
    to?: string;
    offset?: string;
    projects?: string;
  }>;
}

export default async function PerformancePortfolioPage(props: Props) {
  await requireBudgetView();
  const sp = await props.searchParams;
  const period = resolvePeriod({
    chip: (sp.chip as PeriodChip) ?? 'prev-month',
    from: sp.from,
    to: sp.to,
    offset: sp.offset ? Number(sp.offset) : undefined,
  });

  // All available contracts for the picker.
  const allContracts = await buildPortfolio({});
  const sidebarContracts = allContracts.map(c => ({
    id: c.contract_id,
    name: c.project_name,
    customer: c.customer,
  }));

  // Decode ?projects=1,2,3 -> filter applied to the aggregator.
  const requestedIds = (sp.projects ?? '')
    .split(',')
    .map((s: string) => Number(s.trim()))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  const allIds = sidebarContracts.map(c => c.id);
  const contract_ids =
    requestedIds.length === 0 || requestedIds.length === allIds.length ? undefined : requestedIds;

  const data = await buildPortfolioPerformance({
    period,
    filters: contract_ids ? { contract_ids } : undefined,
  });

  return (
    <>
      <PerformanceSidebar
        resolvedPeriodLabel={period.label}
        contextLine={`${data.contracts.length} contracts`}
        contracts={sidebarContracts}
      />
      <div className="flex-1 px-6 py-6 space-y-4 max-w-6xl mx-auto">
        <PortfolioKpiStrip totals={data.totals} />
        <PortfolioNeedsAttention rows={data.needs_attention} />
        <PortfolioVarianceBar rows={data.contracts} />
        <PortfolioTable rows={data.contracts} />
      </div>
    </>
  );
}
