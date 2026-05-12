import type {
  ActivityRow,
  ActivityKind,
} from '@/lib/personal/stocks/queries';
import { fmtEgp } from './kpi-tile';

const BADGE: Record<ActivityKind, { label: string; cls: string }> = {
  buy: { label: 'BUY', cls: 'bg-blue-100 text-blue-800' },
  sell: { label: 'SELL', cls: 'bg-rose-100 text-rose-800' },
  dividend: { label: 'DIV', cls: 'bg-emerald-100 text-emerald-800' },
  deposit: { label: 'DEP', cls: 'bg-indigo-100 text-indigo-800' },
  withdrawal: { label: 'WD', cls: 'bg-rose-100 text-rose-800' },
  transfer_in: { label: 'TRF IN', cls: 'bg-violet-100 text-violet-800' },
  transfer_out: { label: 'TRF OUT', cls: 'bg-violet-100 text-violet-800' },
  fee: { label: 'FEE', cls: 'bg-slate-200 text-slate-700' },
  interest_charge: { label: 'INT-', cls: 'bg-amber-100 text-amber-800' },
  interest_credit: { label: 'INT+', cls: 'bg-amber-100 text-amber-800' },
  correction: { label: 'CORR', cls: 'bg-slate-200 text-slate-700' },
};

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="ix-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Recent activity</div>
        <a
          href="/personal/stocks/transactions"
          className="text-xs text-emerald-600 hover:underline"
        >
          View all →
        </a>
      </div>
      <div className="text-xs space-y-1.5">
        {rows.map((r, i) => {
          const b = BADGE[r.kind];
          return (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5 last:border-0"
            >
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${b.cls}`}
              >
                {b.label}
              </span>
              <div className="flex-1 min-w-0">
                {r.instrumentTicker && (
                  <span className="font-medium">{r.instrumentTicker}</span>
                )}
                {r.qty !== undefined && (
                  <span>
                    {' '}
                    {r.qty.toLocaleString()} @{r.price?.toFixed(3)}
                  </span>
                )}
                {!r.instrumentTicker && r.note && (
                  <span className="text-slate-600">
                    {r.note.slice(0, 38)}
                    {r.note.length > 38 ? '…' : ''}
                  </span>
                )}
                <span className="text-slate-400">
                  {' '}
                  · {r.occurredAt} · {r.accountCode}
                </span>
              </div>
              <div className="font-medium shrink-0">
                {fmtEgp(r.amount, { compact: true })}
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <div className="text-slate-400 italic">No recent activity.</div>
        )}
      </div>
    </div>
  );
}
