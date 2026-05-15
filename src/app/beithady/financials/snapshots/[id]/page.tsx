import { Download } from 'lucide-react';
import { notFound } from 'next/navigation';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { getSnapshot } from '@/lib/beithady/financials/snapshots';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function SnapshotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snap = await getSnapshot(id);
  if (!snap) notFound();

  const sb = supabaseAdmin();
  const { data: accounts } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, account_name, opening_raw, partner_total, variance')
    .eq('snapshot_id', id)
    .order('account_code');

  const { data: partners } = await sb
    .from('bh_balance_snapshot_partners')
    .select('account_code, partner_kind, partner_name_raw, opening_balance, is_synthetic')
    .eq('snapshot_id', id)
    .order('account_code');

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Financials', href: '/beithady/financials' },
        { label: 'Snapshots', href: '/beithady/financials/snapshots' },
        { label: `${snap.period_end} v${snap.version}` },
      ]}
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title={`Snapshot · ${snap.period_end} v${snap.version}`}
        subtitle={`Status: ${snap.status}${snap.frozen_at ? ' · frozen ' + snap.frozen_at.slice(0, 10) : ''}`}
        right={
          <a
            href={`/api/beithady/financials/snapshots/${id}/xlsx`}
            className="inline-flex items-center gap-1.5 rounded border border-lime-300 bg-lime-50 px-3 py-1.5 text-xs font-semibold text-lime-800 hover:bg-lime-100"
          >
            <Download className="h-3.5 w-3.5" /> Export xlsx
          </a>
        }
      />

      <section>
        <h2 className="text-sm font-semibold mb-2">
          Account-level ({accounts?.length ?? 0})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b font-semibold text-slate-700">
                <td className="py-1 pr-3">Code</td>
                <td className="pr-3">Name</td>
                <td className="text-right pr-3">Opening</td>
                <td className="text-right pr-3">Partner total</td>
                <td className="text-right">Variance</td>
              </tr>
            </thead>
            <tbody>
              {(accounts ?? []).map((a, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1 pr-3">{a.account_code}</td>
                  <td className="pr-3">{a.account_name}</td>
                  <td className="text-right pr-3">
                    {Number(a.opening_raw).toLocaleString('en-US')}
                  </td>
                  <td className="text-right pr-3">
                    {a.partner_total == null
                      ? '—'
                      : Number(a.partner_total).toLocaleString('en-US')}
                  </td>
                  <td
                    className={`text-right ${Number(a.variance) !== 0 ? 'text-red-700 font-semibold' : ''}`}
                  >
                    {Number(a.variance).toLocaleString('en-US')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">
          Partner-level ({partners?.length ?? 0})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b font-semibold text-slate-700">
                <td className="py-1 pr-3">Account</td>
                <td className="pr-3">Kind</td>
                <td className="pr-3">Partner</td>
                <td className="text-right">Balance</td>
              </tr>
            </thead>
            <tbody>
              {(partners ?? []).map((p, i) => (
                <tr key={i} className={`border-b ${p.is_synthetic ? 'bg-red-50' : ''}`}>
                  <td className="py-1 pr-3">{p.account_code}</td>
                  <td className="pr-3">{p.partner_kind}</td>
                  <td className="pr-3">
                    {p.is_synthetic ? (
                      <span className="text-red-700 font-semibold mr-1">⚠</span>
                    ) : null}
                    {p.partner_name_raw}
                  </td>
                  <td className="text-right">
                    {Number(p.opening_balance).toLocaleString('en-US')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </BeithadyShell>
  );
}
