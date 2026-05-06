'use client';
import Link from 'next/link';
import { AlertTriangle, AlertOctagon } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { Anomaly } from '@/lib/fmplus/performance/types';

export function AnomaliesPanel({ rows }: { rows: Anomaly[] }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('anomalies');
  if (!visible || rows.length === 0) return null;
  return (
    <section id="perf-anomalies" className="ix-card p-6 scroll-mt-20">
      <PanelHeader title="Anomalies & Suggestions" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <ul className="space-y-2">
          {rows.map((a, i) => {
            const Icon = a.severity === 'red' ? AlertOctagon : AlertTriangle;
            const color = a.severity === 'red' ? 'text-red-400' : 'text-orange-400';
            return (
              <li key={i} className="flex items-start gap-3 p-2 rounded hover:bg-slate-800/40">
                <Icon size={16} className={`${color} shrink-0 mt-0.5`} />
                <span className="flex-1 text-sm text-slate-200">{a.message}</span>
                <Link href={a.action_url} className="text-fmplus-gold hover:text-fmplus-yellow text-sm shrink-0">Take action →</Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
