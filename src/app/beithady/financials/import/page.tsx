import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadXlsx } from './actions';

export const dynamic = 'force-dynamic';

const TARGET_ACCOUNTS: Array<{ code: string; name: string; kind: string }> = [
  { code: '227002', name: 'Suppliers', kind: 'supplier' },
  { code: '227002', name: 'Owner Payables', kind: 'owner' },
  { code: '122001', name: 'Customers', kind: 'customer' },
  { code: '113002', name: 'Contract Insurance Guarantee', kind: 'landlord' },
  { code: '124005', name: 'Loans for employees', kind: 'employee' },
  { code: '124006', name: 'Salaries in advance', kind: 'employee' },
  { code: '223001', name: 'Accrued Salaries', kind: 'employee' },
  { code: '221001', name: 'Notes Payable holders', kind: 'noteholder' },
];

export default async function ImportPage() {
  const sb = supabaseAdmin();

  const { data: snap } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existing } = await sb
    .from('bh_balance_snapshot_partners')
    .select('account_code, partner_kind')
    .eq(
      'snapshot_id',
      snap?.id ?? '00000000-0000-0000-0000-000000000000',
    );

  const haveSet = new Set(
    (existing ?? []).map((e) => `${e.account_code}:${e.partner_kind}`),
  );

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
        <span>Import</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <Link
          href="/beithady/financials"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>

        <header>
          <h1 className="text-2xl font-bold">Import partner ledgers</h1>
          <p className="text-sm text-slate-500">
            Upload an Odoo xlsx partner-ledger export to populate the balance snapshot.
          </p>
        </header>

        <form action={uploadXlsx} className="border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <label className="block">
              <div className="text-xs text-slate-500 mb-1">Account code</div>
              <input
                name="account_code"
                required
                className="border border-slate-200 rounded px-2 py-1 w-full text-sm"
                defaultValue="227002"
              />
            </label>
            <label className="block">
              <div className="text-xs text-slate-500 mb-1">Period end</div>
              <input
                name="period_end"
                type="date"
                required
                className="border border-slate-200 rounded px-2 py-1 w-full text-sm"
                defaultValue="2025-12-31"
              />
            </label>
            <label className="block">
              <div className="text-xs text-slate-500 mb-1">Scope</div>
              <select
                name="company_scope"
                className="border border-slate-200 rounded px-2 py-1 w-full text-sm"
                defaultValue="consolidated"
              >
                <option value="consolidated">Consolidated</option>
                <option value="egypt">Egypt</option>
                <option value="dubai">Dubai</option>
              </select>
            </label>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">xlsx file</div>
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-slate-900 text-white rounded text-sm hover:bg-slate-700"
          >
            Upload &amp; parse
          </button>
        </form>

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Import queue · for snapshot {snap?.period_end ?? '—'}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {TARGET_ACCOUNTS.map((t) => {
              const have = haveSet.has(`${t.code}:${t.kind}`);
              return (
                <div
                  key={`${t.code}-${t.kind}`}
                  className={`rounded-lg border p-3 ${
                    have
                      ? 'border-green-300 bg-green-50/40'
                      : 'border-yellow-300 bg-yellow-50/40'
                  }`}
                >
                  <div className="text-xs text-slate-500">{t.code}</div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs mt-1">
                    {have ? '✓ Imported' : '⏳ Awaiting xlsx'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
