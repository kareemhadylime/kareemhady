import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import { TopNav } from '@/app/_components/brand';
import { supabaseAdmin } from '@/lib/supabase';
import { commitUpload } from './actions';

export const dynamic = 'force-dynamic';

export default async function UploadReviewPage({
  params,
}: {
  params: Promise<{ upload_id: string }>;
}) {
  const { upload_id } = await params;
  const sb = supabaseAdmin();

  const { data: up } = await sb
    .from('bh_balance_snapshot_uploads')
    .select('*')
    .eq('id', upload_id)
    .maybeSingle();
  if (!up) notFound();

  const rows =
    (up.raw_rows as Array<{
      source_row: number;
      partner_name_raw: string;
      balance: number;
    }>) ?? [];
  const total = rows.reduce((s, r) => s + r.balance, 0);
  const errors =
    (up.parse_errors as Array<{ row: number; error: string }>) ?? [];

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
        <Link href="/beithady/financials/import" className="ix-link">
          Import
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span className="truncate max-w-[200px]">{up.filename as string}</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <Link
          href="/beithady/financials/import"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Import
        </Link>

        <header>
          <h1 className="text-2xl font-bold">{up.filename as string}</h1>
          <p className="text-xs text-slate-500 mt-1">
            Target: snapshot {up.period_end as string} · {up.company_scope as string} · account{' '}
            {up.account_code as string} · {rows.length} partners · ledger total{' '}
            <strong>{Math.round(total).toLocaleString('en-US')} EGP</strong>
          </p>
        </header>

        {errors.length > 0 ? (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-xs">
            <p className="font-semibold text-red-800 mb-1">
              Parse errors ({errors.length})
            </p>
            <ul className="space-y-0.5 text-red-700">
              {errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {up.parse_status === 'committed' ? (
          <div className="rounded border border-green-300 bg-green-50 p-3 text-xs text-green-800 font-semibold">
            ✓ Already committed to snapshot. View{' '}
            <Link href="/beithady/financials/reconciliation" className="underline">
              Reconciliation
            </Link>{' '}
            or{' '}
            <Link href="/beithady/financials/ledgers" className="underline">
              Ledgers
            </Link>
            .
          </div>
        ) : (
          <form action={commitUpload} className="flex items-center gap-3 flex-wrap">
            <input type="hidden" name="upload_id" value={upload_id} />
            <label className="text-sm font-medium">Partner kind:</label>
            <select
              name="partner_kind"
              required
              className="border border-slate-200 rounded px-2 py-1 text-sm"
            >
              <option value="supplier">supplier</option>
              <option value="owner">owner</option>
              <option value="customer">customer</option>
              <option value="landlord">landlord</option>
              <option value="employee">employee</option>
              <option value="noteholder">noteholder</option>
            </select>
            <button
              type="submit"
              className="px-4 py-1.5 bg-slate-900 text-white rounded text-sm hover:bg-slate-700"
            >
              Commit to snapshot
            </button>
          </form>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Parsed rows ({rows.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b font-semibold text-slate-700">
                  <td className="py-1 pr-3">Source row</td>
                  <td className="pr-3">Partner</td>
                  <td className="text-right">Balance</td>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-1 pr-3 text-slate-500">{r.source_row}</td>
                    <td className="pr-3">{r.partner_name_raw}</td>
                    <td className="text-right">
                      {Math.round(r.balance).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
