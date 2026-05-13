import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildPayablesReport,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PayablesBlock } from '../_components/PayablesBlock';
import { FinancialsFilterStrip } from '../_components/FinancialsFilterStrip';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const scope: CompanyScope = isCompanyScope(sp.scope) ? sp.scope : 'consolidated';
  const asOf = sp.asof || new Date().toISOString().slice(0, 10);
  const companyIds = scopeCompanyIds(scope);
  const payables = await buildPayablesReport({ asOf, companyIds });

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
        <span>Payables</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <Link
          href="/beithady/financials"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <header>
          <h1 className="text-2xl font-bold">Payables · {scopeLabel(scope)}</h1>
          <p className="text-sm text-slate-500">As of {asOf}</p>
        </header>
        <FinancialsFilterStrip
          basePath="/beithady/financials/payables"
          activeScope={scope}
          activeAsOf={asOf}
          showAsOf
        />
        <PayablesBlock
          payables={payables}
          scope={scope}
          asOf={asOf}
          scopeLbl={scopeLabel(scope)}
        />
      </main>
    </>
  );
}
