import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildBalanceSheet,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { BalanceSheetSection } from '../_components/BalanceSheetSection';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const scope: CompanyScope = isCompanyScope(sp.scope) ? sp.scope : 'consolidated';
  const asOf = sp.asof || new Date().toISOString().slice(0, 10);
  const companyIds = scopeCompanyIds(scope);
  const bs = await buildBalanceSheet({ asOf, companyIds });

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
        <span>Balance Sheet</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <Link
          href="/beithady/financials"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <header>
          <h1 className="text-2xl font-bold">Balance Sheet · {scopeLabel(scope)}</h1>
          <p className="text-sm text-slate-500">As of {asOf}</p>
        </header>
        <BalanceSheetSection bs={bs} />
      </main>
    </>
  );
}
