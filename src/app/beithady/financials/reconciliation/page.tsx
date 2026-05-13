import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { buildReconciliation } from '@/lib/beithady/financials/reconciliation';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const sp = await searchParams;
  const sb = supabaseAdmin();

  let snapshotId = sp.snapshot;
  if (!snapshotId) {
    const { data } = await sb
      .from('bh_balance_snapshots')
      .select('id')
      .eq('company_scope', 'consolidated')
      .eq('status', 'frozen')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotId = data?.id;
  }

  if (!snapshotId) {
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
          <span>Reconciliation</span>
        </TopNav>
        <main className="max-w-6xl mx-auto px-6 py-10 flex-1">
          <Link
            href="/beithady/financials"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline mb-4"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Financials
          </Link>
          <p className="text-sm text-slate-500 mt-6">
            No frozen snapshot found.{' '}
            <Link href="/beithady/financials/import" className="underline">
              Import a ledger
            </Link>{' '}
            to create one.
          </p>
        </main>
      </>
    );
  }

  const report = await buildReconciliation({ snapshot_id: snapshotId });

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
        <span>Reconciliation</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <Link
          href="/beithady/financials"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>

        <header>
          <h1 className="text-2xl font-bold">Reconciliation</h1>
          <p className="text-sm text-slate-500">Account balance vs. partner ledger totals</p>
        </header>

        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded bg-slate-100 px-2 py-1">
            With partners:{' '}
            <strong>{report.summary.accounts_with_partners}</strong>
          </span>
          <span className="rounded bg-slate-100 px-2 py-1">
            Awaiting ledger:{' '}
            <strong>{report.summary.accounts_awaiting_ledger}</strong>
          </span>
          <span
            className={`rounded px-2 py-1 ${
              report.summary.open_variance_count
                ? 'bg-red-100 text-red-800'
                : 'bg-green-100 text-green-800'
            }`}
          >
            Open variances:{' '}
            <strong>{report.summary.open_variance_count}</strong>
          </span>
          <span className="rounded bg-slate-100 px-2 py-1">
            Total variance:{' '}
            <strong>
              {Math.round(report.summary.total_variance).toLocaleString('en-US')} EGP
            </strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b font-semibold text-slate-700">
                <td className="py-1 pr-3">Code</td>
                <td className="pr-3">Account</td>
                <td className="text-right pr-3">Account total</td>
                <td className="text-right pr-3">Partner total</td>
                <td className="text-right pr-3">Variance</td>
                <td>Status</td>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-b ${
                    r.variance !== 0 && r.variance_status === 'open' ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="py-1 pr-3">{r.account_code}</td>
                  <td className="pr-3">{r.account_name}</td>
                  <td className="text-right pr-3">
                    {Math.round(r.opening_raw).toLocaleString('en-US')}
                  </td>
                  <td className="text-right pr-3">
                    {r.partner_total == null
                      ? '—'
                      : Math.round(r.partner_total).toLocaleString('en-US')}
                  </td>
                  <td
                    className={`text-right pr-3 ${r.variance !== 0 ? 'text-red-700 font-semibold' : ''}`}
                  >
                    {r.variance === 0 ? '0' : Math.round(r.variance).toLocaleString('en-US')}
                  </td>
                  <td>
                    {r.partner_total == null
                      ? '⏳ Awaiting'
                      : r.variance === 0
                        ? '✓ Clean'
                        : `🔴 ${r.variance_status}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
