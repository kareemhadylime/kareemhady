import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import {
  classifyParsedRows,
  type ParseResult,
} from '@/lib/beithady/financials/xlsx-import';
import type { OdooPartnerWithFlags } from '@/lib/beithady/financials/account-kinds';
import type { PartnerKind } from '@/lib/beithady/financials/types';
import { commitUpload } from './actions';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<PartnerKind, string> = {
  supplier: 'Suppliers',
  owner: 'Owners',
  customer: 'Customers',
  landlord: 'Landlords',
  employee: 'Employees',
  noteholder: 'Noteholders',
  unallocated: 'Unallocated',
};

const KIND_COLOR: Record<PartnerKind, string> = {
  supplier: 'border-blue-300 bg-blue-50/40 text-blue-900',
  owner: 'border-purple-300 bg-purple-50/40 text-purple-900',
  customer: 'border-emerald-300 bg-emerald-50/40 text-emerald-900',
  landlord: 'border-amber-300 bg-amber-50/40 text-amber-900',
  employee: 'border-cyan-300 bg-cyan-50/40 text-cyan-900',
  noteholder: 'border-rose-300 bg-rose-50/40 text-rose-900',
  unallocated: 'border-slate-300 bg-slate-50/40 text-slate-700',
};

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

  // Auto-classify so the operator sees the per-kind breakdown BEFORE
  // committing. For shared accounts (e.g. 227002), classify splits one
  // xlsx into supplier + owner rows automatically.
  const { data: partners } = await sb
    .from('odoo_partners')
    .select('id, name, supplier_rank, customer_rank, is_owner, is_employee');

  const parsed: ParseResult = {
    rows,
    errors,
    total: Math.round(total * 100) / 100,
  };
  const classified = classifyParsedRows(parsed, {
    account_code: up.account_code as string,
    odoo_partners: (partners ?? []) as OdooPartnerWithFlags[],
  });
  const breakdownEntries = (
    Object.entries(classified.breakdown) as Array<
      [PartnerKind, { count: number; total: number }]
    >
  ).sort((a, b) => b[1].count - a[1].count);
  const matchedCount = classified.rows.filter(
    (r) => r.confidence !== 'unmatched',
  ).length;
  const unmatchedCount = classified.rows.length - matchedCount;

  // Build a quick (raw -> partner_kind) map for the parsed rows table.
  const kindByRaw = new Map<string, PartnerKind>(
    classified.rows.map((r) => [r.raw, r.partner_kind]),
  );
  const matchedConfByRaw = new Map<string, MatchConf>(
    classified.rows.map((r) => [r.raw, r.confidence]),
  );

  return (
    <BeithadyShell breadcrumbs={[{label: 'Financials', href: '/beithady/financials'}, {label: 'Import', href: '/beithady/financials/import'}, {label: upload_id.slice(0, 8) + '…'}]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title={`Review · ${up.account_code as string}`}
        subtitle={`Account ${up.account_code as string} · ${rows.length} rows`}
      />

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

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Detected partner kinds
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Each row was matched against Odoo partners and routed to its
            kind from{' '}
            <code className="text-[10px]">
              is_owner / supplier_rank / customer_rank / is_employee
            </code>
            . Owner wins over Supplier on shared account 227002.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {breakdownEntries.length === 0 ? (
              <div className="text-xs text-slate-500">No rows.</div>
            ) : (
              breakdownEntries.map(([k, b]) => (
                <div
                  key={k}
                  className={`rounded-lg border p-3 ${KIND_COLOR[k]}`}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide">
                    {KIND_LABEL[k]}
                  </div>
                  <div className="text-base font-semibold">
                    {b.count} {b.count === 1 ? 'partner' : 'partners'}
                  </div>
                  <div className="text-xs">
                    {Math.round(b.total).toLocaleString('en-US')} EGP
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 text-xs text-slate-600">
            <strong>{matchedCount}</strong> matched to Odoo ·{' '}
            <strong>{unmatchedCount}</strong> unmatched{' '}
            {unmatchedCount > 0
              ? '(routed to the account fallback kind — review names if needed)'
              : ''}
          </div>
        </section>

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
          <form
            action={commitUpload}
            className="flex items-center gap-3 flex-wrap"
          >
            <input type="hidden" name="upload_id" value={upload_id} />
            <button
              type="submit"
              className="px-4 py-1.5 bg-slate-900 text-white rounded text-sm hover:bg-slate-700"
            >
              Commit {classified.rows.length} rows
              {breakdownEntries.length > 1
                ? ` (${breakdownEntries
                    .map(([k, b]) => `${b.count} ${KIND_LABEL[k].toLowerCase()}`)
                    .join(' + ')})`
                : ''}
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
                  <td className="py-1 pr-3">#</td>
                  <td className="pr-3">Partner</td>
                  <td className="pr-3">Kind</td>
                  <td className="pr-3">Match</td>
                  <td className="text-right">Balance</td>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const k = kindByRaw.get(r.partner_name_raw);
                  const conf = matchedConfByRaw.get(r.partner_name_raw);
                  return (
                    <tr
                      key={i}
                      className={`border-b ${
                        conf === 'unmatched' ? 'bg-yellow-50/60' : ''
                      }`}
                    >
                      <td className="py-1 pr-3 text-slate-500">
                        {r.source_row}
                      </td>
                      <td className="pr-3">{r.partner_name_raw}</td>
                      <td className="pr-3">
                        {k ? (
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_COLOR[k]}`}
                          >
                            {KIND_LABEL[k]}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="pr-3">
                        {conf === 'exact' ? (
                          <span className="text-green-700">exact</span>
                        ) : conf === 'fuzzy' ? (
                          <span className="text-amber-700">fuzzy</span>
                        ) : (
                          <span className="text-yellow-700 font-semibold">
                            unmatched
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {Math.round(r.balance).toLocaleString('en-US')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
    </BeithadyShell>
  );
}

type MatchConf = 'exact' | 'fuzzy' | 'unmatched';
