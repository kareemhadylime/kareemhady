import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { buildLedgerReport } from '@/lib/beithady/financials/ledgers';
import type { CompanyScope, PartnerKind } from '@/lib/beithady/financials/types';
import { PartnerLedgerTable } from '../_components/PartnerLedgerTable';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KINDS: Array<{ id: PartnerKind | 'all'; label: string }> = [
  { id: 'supplier', label: 'Suppliers' },
  { id: 'owner', label: 'Owners' },
  { id: 'customer', label: 'Customers' },
  { id: 'landlord', label: 'Landlords' },
  { id: 'employee', label: 'Employees' },
  { id: 'noteholder', label: 'Noteholders' },
  { id: 'all', label: 'All' },
];

function isPartnerKind(s: string): s is PartnerKind | 'all' {
  return KINDS.some((k) => k.id === s);
}

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function LedgersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; scope?: string; asof?: string }>;
}) {
  const sp = await searchParams;
  const kind: PartnerKind | 'all' =
    sp.kind && isPartnerKind(sp.kind) ? sp.kind : 'supplier';
  const scope: CompanyScope = isCompanyScope(sp.scope) ? sp.scope : 'consolidated';
  const asOf = sp.asof || new Date().toISOString().slice(0, 10);

  const report = await buildLedgerReport({ kind, scope, as_of: asOf });
  const sum = report.rows.reduce((s, r) => s + r.current_balance, 0);

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
        <span>Partner Ledgers</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <Link
          href="/beithady/financials"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>

        <header>
          <h1 className="text-2xl font-bold">Partner Ledgers · {scope}</h1>
          <p className="text-sm text-slate-500">As of {asOf}</p>
        </header>

        <nav className="flex flex-wrap gap-1 text-xs">
          {KINDS.map((k) => (
            <Link
              key={k.id}
              href={`/beithady/financials/ledgers?kind=${k.id}&scope=${scope}&asof=${asOf}`}
              className={`px-2 py-1 rounded border ${
                k.id === kind
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-slate-200 hover:bg-slate-100'
              }`}
            >
              {k.label}
            </Link>
          ))}
        </nav>

        <p className="text-xs text-slate-500">
          Opening from snapshot{' '}
          <strong>{report.opening_period_end ?? '—'}</strong> · as of {asOf}
        </p>

        <PartnerLedgerTable rows={report.rows} />

        {report.rows.length > 0 ? (
          <p className="text-xs text-right text-slate-500">
            Sum:{' '}
            <strong>{Math.round(sum).toLocaleString('en-US')} EGP</strong>
          </p>
        ) : null}
      </main>
    </>
  );
}
