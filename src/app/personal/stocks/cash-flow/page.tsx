import { supabaseAdmin } from '@/lib/supabase';
import { BalanceLinesChart } from '../_components/balance-lines-chart';
import { getAccountBalanceSeries } from '@/lib/personal/stocks/queries';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

export default async function CashFlowPage() {
  const client = supabaseAdmin();
  const r = await client
    .from('personal_stock_cash_movements')
    .select('kind, amount, occurred_at, account_id')
    .in('kind', ['deposit', 'withdrawal'])
    .order('occurred_at', { ascending: false })
    .limit(1000);
  const accs = await client.from('personal_stock_accounts').select('id, code');
  const acct = new Map(
    (accs.data ?? []).map(
      (a: { id: number; code: string }) => [a.id, a.code] as const,
    ),
  );

  const totals = (r.data ?? []).reduce(
    (acc, row) => {
      const k = row.kind as 'deposit' | 'withdrawal';
      acc[k] += Number(row.amount);
      return acc;
    },
    { deposit: 0, withdrawal: 0 },
  );

  const balanceSeries = await getAccountBalanceSeries();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="ix-card p-3">
          <div className="text-[10px] uppercase text-slate-500">
            Total cash in (bank deposits)
          </div>
          <div className="text-xl font-semibold text-emerald-700">
            {fmtEgp(totals.deposit)}
          </div>
        </div>
        <div className="ix-card p-3">
          <div className="text-[10px] uppercase text-slate-500">
            Total cash out (bank withdrawals)
          </div>
          <div className="text-xl font-semibold text-rose-700">
            {fmtEgp(totals.withdrawal)}
          </div>
        </div>
      </div>

      <BalanceLinesChart data={balanceSeries} />

      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Acct</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(r.data ?? []).map((row, i) => (
              <tr
                key={i}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="px-3 py-1.5">{row.occurred_at}</td>
                <td className="px-3 py-1.5">{acct.get(row.account_id) ?? '?'}</td>
                <td className="px-3 py-1.5 uppercase text-[10px]">{row.kind}</td>
                <td
                  className={`px-3 py-1.5 text-right ${row.kind === 'deposit' ? 'text-emerald-700' : 'text-rose-700'}`}
                >
                  {fmtEgp(Number(row.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
