import type { ReportData } from '../types';
import { HeroBlock } from './sections/hero-block';
import { ProjectDetails } from './sections/project-details';
import { ServiceLineSummary } from './sections/service-line-summary';
import { ManningSummary } from './sections/manning-summary';
import { BudgetBreakdownMatrix } from './sections/budget-breakdown-matrix';
import { Mobilization } from './sections/mobilization';
import { PaymentTerms } from './sections/payment-terms';
import { ChangeVsInitial } from './sections/change-vs-initial';
import { VarianceSnapshot } from './sections/variance-snapshot';
import { SignOffBlock } from './sections/sign-off-block';
import { ContractRollup } from './sections/contract-rollup';

interface OnScreenReportProps {
  data: ReportData;
}

/**
 * Top-level on-screen report renderer. Takes a fully-built and visibility-stripped
 * ReportData and renders all sections in spec order as a continuous-scroll page.
 * Sections whose data is null are automatically omitted.
 */
export function OnScreenReport({ data }: OnScreenReportProps) {
  return (
    <div className="space-y-5 max-w-5xl" dir={data.meta.lang === 'ar' ? 'rtl' : undefined}>
      {/* 1. Cover / KPI Hero */}
      <HeroBlock data={data} />

      {/* 2. Project Details */}
      <ProjectDetails data={data} />

      {/* 3. Service Line Summary */}
      <ServiceLineSummary data={data} />

      {/* 4. Manning Detail */}
      <ManningSummary data={data} />

      {/* 5. Budget Breakdown Matrix — hidden in customer mode (cells === null) */}
      <BudgetBreakdownMatrix data={data} />

      {/* 6. Mobilization — omitted when null */}
      <Mobilization data={data} />

      {/* 7. Payment Terms — omitted when null */}
      <PaymentTerms data={data} />

      {/* 8. Change vs Initial — only when scenario != initial and not customer mode */}
      <ChangeVsInitial data={data} />

      {/* 9. Variance Snapshot — only in snapshot mode */}
      <VarianceSnapshot data={data} />

      {/* 10. Sign-off Block */}
      <SignOffBlock data={data} />

      {/* 11. Contract Rollup — only for multi-year contracts */}
      <ContractRollup data={data} />
    </div>
  );
}
