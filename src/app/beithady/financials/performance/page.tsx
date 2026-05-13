import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildPnlReport,
  resolveFinancePeriod,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PnlSection, UnclassifiedPanel } from '../_components/PnlSection';
import { FinancialsFilterStrip } from '../_components/FinancialsFilterStrip';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    month?: string;
    scope?: string;
    building?: string;
    lob?: string;
  }>;
}) {
  const sp = await searchParams;
  const preset = sp.month ? `month:${sp.month}` : sp.preset || 'last_month';
  const period = resolveFinancePeriod(preset, sp.from, sp.to);
  const scope: CompanyScope = isCompanyScope(sp.scope) ? sp.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const buildingCode = sp.building && sp.building !== 'all' ? sp.building : undefined;
  const lobLabel = sp.lob && sp.lob !== 'all' ? sp.lob : undefined;

  const pnl = await buildPnlReport({
    fromDate: period.fromDate,
    toDate: period.toDate,
    label: period.label,
    companyIds,
    buildingCode,
    lobLabel,
  });

  return (
    <>
      <TopNav>
        <Link href="/beithady" className="ix-link">
          BEITHADY
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/beithady/financials" className="ix-link">
          Financials
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Performance</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <Link
          href="/beithady/financials"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <header>
          <h1 className="text-2xl font-bold">Performance · {scopeLabel(scope)}</h1>
          <p className="text-sm text-slate-500">{period.label}</p>
        </header>
        <FinancialsFilterStrip
          basePath="/beithady/financials/performance"
          activeScope={scope}
          activePreset={preset.startsWith('month:') ? undefined : preset}
          showPeriodPresets
        />
        <PnlSection
          pnl={pnl}
          scopeLbl={scopeLabel(scope)}
          buildingCode={buildingCode}
          lobLabel={lobLabel}
        />
        {pnl.unclassified.length > 0 && <UnclassifiedPanel pnl={pnl} />}
      </main>
    </>
  );
}
