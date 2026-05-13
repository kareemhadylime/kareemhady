import Link from 'next/link';
import type { HoldingRow } from '@/lib/personal/stocks/queries';
import { fmtEgp } from './kpi-tile';

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  return (
    <div className="ix-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="text-sm font-semibold">Holdings (top 10)</div>
        <Link
          href="/personal/stocks/portfolio"
          className="text-xs text-emerald-600 hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 dark:text-slate-400 text-left bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Avg Cost</th>
              <th className="px-3 py-2 text-right">Last Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.accountCode}-${r.instrumentId}`}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="px-3 py-2">
                  <div className="font-medium flex items-center gap-1.5">
                    {r.ticker}
                    {r.overridden && (
                      <span
                        title="Position is overridden — qty/avg cost come from a manual override row, not from trades"
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
                      >
                        Override
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">{r.name}</div>
                </td>
                <td className="px-3 py-2">{r.accountCode}</td>
                <td className="px-3 py-2 text-right">
                  {r.qtyHeld.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.avgCost.toFixed(4)}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.lastPrice !== null ? (
                    r.lastPrice.toFixed(4)
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.currentValue !== null ? (
                    fmtEgp(r.currentValue, { compact: true })
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    r.unrealizedPnl !== null && r.unrealizedPnl < 0
                      ? 'text-rose-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {r.unrealizedPnl !== null ? (
                    fmtEgp(r.unrealizedPnl, { compact: true })
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center px-3 py-6 text-slate-400 italic"
                >
                  No open positions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
