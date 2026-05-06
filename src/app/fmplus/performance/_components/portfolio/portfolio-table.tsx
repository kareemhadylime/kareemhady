import Link from 'next/link';
import type { PortfolioContractRow } from '@/lib/fmplus/performance/types';

const HEALTH: Record<PortfolioContractRow['health'], string> = { good: 'bg-emerald-500', warn: 'bg-orange-500', bad: 'bg-red-500' };

export function PortfolioTable({ rows }: { rows: PortfolioContractRow[] }) {
  return (
    <section className="ix-card p-6 overflow-x-auto">
      <h2 className="text-base font-semibold tracking-tight font-serif mb-3">All Contracts</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-fmplus-gold uppercase">
          <tr>
            <th className="text-left py-1">Project</th>
            <th className="text-left">Customer</th>
            <th className="text-right">Year</th>
            <th className="text-right">Expense</th>
            <th className="text-right">GP %</th>
            <th className="text-right">Variance %</th>
            <th>Health</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.contract_id} className="border-t border-slate-700/50 hover:bg-slate-800/40">
              <td className="py-2 text-slate-200 font-semibold">{r.contract_name}</td>
              <td className={r.customer ? 'text-slate-300' : 'text-slate-400'}>{r.customer ?? '—'}</td>
              <td className="text-right tabular-nums text-slate-300">Y{r.current_year_index}</td>
              <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(r.expense / 1e6).toFixed(2)}M</td>
              <td className="text-right tabular-nums text-slate-300">{(r.gp_pct * 100).toFixed(1)}%</td>
              <td className={`text-right tabular-nums ${r.health === 'bad' ? 'text-red-300' : r.health === 'warn' ? 'text-orange-300' : 'text-emerald-300'}`}>{(r.variance_pct * 100).toFixed(1)}%</td>
              <td><span className={`inline-block w-2 h-2 rounded-full ${HEALTH[r.health]}`} /></td>
              <td><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
