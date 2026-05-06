'use client';
import Link from 'next/link';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { VendorRow } from '@/lib/fmplus/performance/types';

export function VendorsPanel({ rows }: { rows: VendorRow[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('vendors');
  if (!visible || rows.length === 0) return null;
  const max = rows[0]?.spend ?? 1;
  return (
    <section id="perf-vendors" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Top 5 Vendors" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <table className="w-full text-sm">
          <tbody>
            {rows.map(r => (
              <tr key={r.partner_id} className="border-t border-slate-700/50">
                <td className="py-2 w-1/3 text-slate-200">{r.partner_name}</td>
                <td className="w-1/2">
                  <div className="h-3 bg-slate-700/40 rounded-full overflow-hidden">
                    <div style={{ width: `${(r.spend / max) * 100}%` }} className="h-full bg-fmplus-yellow" />
                  </div>
                </td>
                <td className="text-right tabular-nums text-fmplus-yellow font-semibold pl-2">{(r.spend / 1e3).toFixed(0)}K</td>
                <td className="text-right tabular-nums text-slate-400 pl-2">{(r.pct_of_period * 100).toFixed(1)}%</td>
                <td className="pl-2"><Link href={r.drill_url} className="text-fmplus-gold hover:text-fmplus-yellow">→</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
