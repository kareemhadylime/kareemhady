'use client';
import Link from 'next/link';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { YoyRow } from '@/lib/fmplus/performance/types';

const HEALTH_COLORS: Record<YoyRow['health'], string> = { good: 'bg-emerald-500', warn: 'bg-orange-500', bad: 'bg-red-500' };

export function YoyArcPanel({ rows }: { rows: YoyRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('yoy');
  if (!visible || rows.length <= 1) return null;
  return (
    <section id="perf-yoy" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Year-over-Year Arc" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <table className="w-full text-sm">
          <thead className="text-xs text-fmplus-gold uppercase">
            <tr>
              <th className="text-left py-1">Year</th>
              <th className="text-left">Status</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Expense</th>
              <th className="text-right">GP</th>
              <th className="text-right">GP %</th>
              <th className="text-right">Var %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.year_id} className="border-t border-slate-700/50">
                <td className="py-2 text-slate-200 font-semibold">Y{r.year_index}{r.fiscal_year ? ` (FY${r.fiscal_year})` : ''}</td>
                <td><span className="text-xs uppercase text-slate-400">{r.status}</span></td>
                <td className="text-right tabular-nums text-slate-400">{(r.revenue / 1e6).toFixed(2)}M</td>
                <td className="text-right tabular-nums text-slate-400">{(r.expense / 1e6).toFixed(2)}M</td>
                <td className="text-right tabular-nums text-fmplus-yellow font-semibold">{(r.gp / 1e6).toFixed(2)}M</td>
                <td className="text-right tabular-nums text-slate-300">{(r.gp_pct * 100).toFixed(1)}%</td>
                <td className="text-right tabular-nums text-slate-300">{(r.variance_pct * 100).toFixed(1)}%</td>
                <td><span className={`inline-block w-2 h-2 rounded-full mr-2 ${HEALTH_COLORS[r.health]}`} /><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
