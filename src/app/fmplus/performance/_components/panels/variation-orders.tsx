'use client';
import { GitBranch } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { VariationOrdersBlock } from '@/lib/fmplus/performance/types';

function fmtEgp(n: number) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

export function VariationOrdersPanel({ block }: { block: VariationOrdersBlock | null }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('variation_orders');
  if (!visible || !block || block.rows.length === 0) return null;
  const max = Math.max(1, ...block.rows.map(r => r.amount));
  return (
    <section id="perf-variation-orders" className="ix-card p-6 scroll-mt-20">
      <PanelHeader
        title={<span className="flex items-center gap-2"><GitBranch size={16} /> Variation Orders</span>}
        subtitle={`${fmtEgp(block.total_amount)} EGP across ${block.total_lines} line${block.total_lines === 1 ? '' : 's'} — out-of-scope work billed separately from base contract`}
        collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide}
      />
      {!collapsed && (
        <table className="w-full text-sm">
          <tbody>
            {block.rows.map(r => (
              <tr key={r.category} className="border-t border-slate-700/50">
                <td className="py-2 w-1/4 text-slate-200">{r.category_label}</td>
                <td className="w-1/2">
                  <div className="h-3 bg-slate-700/40 rounded-full overflow-hidden">
                    <div style={{ width: `${(r.amount / max) * 100}%` }} className="h-full bg-fmplus-yellow" />
                  </div>
                </td>
                <td className="text-right tabular-nums text-fmplus-yellow font-semibold pl-2">{fmtEgp(r.amount)}</td>
                <td className="text-right tabular-nums text-slate-400 pl-3 w-16">{r.lines} lines</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
