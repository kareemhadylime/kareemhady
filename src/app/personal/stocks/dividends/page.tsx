import { supabaseAdmin } from '@/lib/supabase';
import { DividendsChart } from '../_components/dividends-chart';
import { getDividendsByYear } from '@/lib/personal/stocks/queries';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

export default async function DividendsPage() {
  const client = supabaseAdmin();
  const r = await client
    .from('personal_stock_dividends')
    .select('account_id, instrument_id, amount, pay_date, note')
    .order('pay_date', { ascending: false });
  const ins = await client
    .from('personal_stock_instruments')
    .select('id, ticker, name');
  const accs = await client.from('personal_stock_accounts').select('id, code');
  const tick = new Map(
    (ins.data ?? []).map(
      (i: { id: number; ticker: string }) => [i.id, i.ticker] as const,
    ),
  );
  const acct = new Map(
    (accs.data ?? []).map(
      (a: { id: number; code: string }) => [a.id, a.code] as const,
    ),
  );
  const divsByYear = await getDividendsByYear();

  return (
    <div className="space-y-4">
      <DividendsChart data={divsByYear} />
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Pay date</th>
              <th className="px-3 py-2 text-left">Acct</th>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {(r.data ?? []).map((row, i) => (
              <tr
                key={i}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="px-3 py-1.5">{row.pay_date}</td>
                <td className="px-3 py-1.5">
                  {acct.get(row.account_id) ?? '?'}
                </td>
                <td className="px-3 py-1.5">
                  {row.instrument_id ? (
                    (tick.get(row.instrument_id) ?? '?')
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right text-emerald-700">
                  {fmtEgp(Number(row.amount))}
                </td>
                <td className="px-3 py-1.5 text-slate-500 max-w-[260px] truncate">
                  {row.note ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
