import { supabaseAdmin } from '@/lib/supabase';
import { getTransactions } from '@/lib/personal/stocks/queries';
import { fmtEgp } from '../../_components/kpi-tile';
import type { AccountCode } from '@/lib/personal/stocks/types';

export const dynamic = 'force-dynamic';

export default async function AccountDrillPage({
  params,
}: {
  params: Promise<{ code: AccountCode }>;
}) {
  const { code } = await params;
  const rows = await getTransactions({ account: code, limit: 1000 });
  const client = supabaseAdmin();
  const accs = await client
    .from('personal_stock_accounts')
    .select('id, code, kind')
    .eq('code', code)
    .maybeSingle();
  if (!accs.data) return <div className="text-rose-600">Unknown account</div>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Account {code} — full activity</h2>
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Instrument</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="px-3 py-1.5">{r.occurredAt}</td>
                <td className="px-3 py-1.5 uppercase text-[10px]">{r.kind}</td>
                <td className="px-3 py-1.5">{r.instrumentTicker ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">{fmtEgp(r.amount)}</td>
                <td className="px-3 py-1.5 text-slate-500 max-w-[280px] truncate">
                  {r.note ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
