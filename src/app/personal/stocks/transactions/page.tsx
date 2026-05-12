import { getTransactions } from '@/lib/personal/stocks/queries';
import { PeriodFilter } from '../_components/period-filter';
import { AccountFilter } from '../_components/account-filter';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; account?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.period ?? 'all';
  const account = (sp.account ?? 'all') as 'all' | '001' | '003' | '009';
  const from = period === 'all' ? undefined : `${period}-01-01`;
  const to = period === 'all' ? undefined : `${period}-12-31`;
  const rows = await getTransactions({ account, from, to, limit: 1000 });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodFilter />
        <AccountFilter />
      </div>
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Acct</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Instrument</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
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
                <td className="px-3 py-1.5">{r.accountCode}</td>
                <td className="px-3 py-1.5 uppercase text-[10px]">{r.kind}</td>
                <td className="px-3 py-1.5">{r.instrumentTicker ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.qty?.toLocaleString() ?? '—'}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {r.price?.toFixed(3) ?? '—'}
                </td>
                <td className="px-3 py-1.5 text-right">{fmtEgp(r.amount)}</td>
                <td className="px-3 py-1.5 text-slate-500 max-w-[280px] truncate">
                  {r.note ?? ''}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center px-3 py-6 text-slate-400 italic"
                >
                  No transactions for these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-slate-400 italic">
        CSV export — follow-up enhancement.
      </div>
    </div>
  );
}
