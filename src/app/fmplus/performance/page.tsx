// src/app/fmplus/performance/page.tsx
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildPortfolioPerformance } from '@/lib/fmplus/performance/build-portfolio';
import { resolvePeriod } from '@/lib/fmplus/performance/period';
import { PerformanceSidebar } from './_components/performance-sidebar';
import { PortfolioKpiStrip } from './_components/portfolio/portfolio-kpi-strip';
import { PortfolioVarianceBar } from './_components/portfolio/portfolio-variance-bar';
import { PortfolioNeedsAttention } from './_components/portfolio/portfolio-needs-attention';
import { PortfolioTable } from './_components/portfolio/portfolio-table';
import type { PeriodChip } from '@/lib/fmplus/performance/types';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ chip?: string; from?: string; to?: string }>;
}

export default async function PerformancePortfolioPage(props: Props) {
  await requireBudgetView();
  const sp = await props.searchParams;
  const period = resolvePeriod({
    chip: (sp.chip as PeriodChip) ?? 'prev-month',
    from: sp.from,
    to: sp.to,
  });
  const data = await buildPortfolioPerformance({ period });

  return (
    <>
      <PerformanceSidebar resolvedPeriodLabel={period.label} contextLine={`${data.contracts.length} contracts`} />
      <div className="flex-1 px-6 py-6 space-y-4 max-w-6xl mx-auto">
        <PortfolioKpiStrip totals={data.totals} />
        <PortfolioNeedsAttention rows={data.needs_attention} />
        <PortfolioVarianceBar rows={data.contracts} />
        <PortfolioTable rows={data.contracts} />
      </div>
    </>
  );
}
