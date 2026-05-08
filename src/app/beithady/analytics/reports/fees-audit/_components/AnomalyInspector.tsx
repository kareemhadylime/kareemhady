'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import type { Anomaly } from '@/lib/beithady/fees-audit/types';
import { ANOMALY_LABEL } from '@/lib/beithady/fees-audit/types';

const SEVERITY_META = {
  critical: { icon: AlertCircle, color: '#b91c1c', bg: 'bg-rose-50 dark:bg-rose-900/20', label: 'CRITICAL' },
  warning: { icon: AlertTriangle, color: '#b45309', bg: 'bg-amber-50 dark:bg-amber-900/20', label: 'WARNING' },
  info: { icon: Info, color: '#0891b2', bg: 'bg-cyan-50 dark:bg-cyan-900/20', label: 'INFO' },
} as const;

export function AnomalyInspector({ anomalies }: { anomalies: Anomaly[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (anomalies.length === 0) {
    return (
      <div className="ix-card p-5 bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-600">
        <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          âœ“ No anomalies detected
        </div>
        <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
          Cleaning fees, taxes, channel parity, and min-stay rules all look healthy.
        </div>
      </div>
    );
  }

  // Group by severity
  const grouped = {
    critical: anomalies.filter(a => a.severity === 'critical'),
    warning: anomalies.filter(a => a.severity === 'warning'),
    info: anomalies.filter(a => a.severity === 'info'),
  };

  return (
    <div className="ix-card p-4">
      <h3 className="text-sm font-semibold text-[var(--bh-ink)] dark:text-amber-100 mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600" />
        Anomaly Inspector ({anomalies.length})
      </h3>
      <div className="space-y-3">
        {(['critical', 'warning', 'info'] as const).map(sev => {
          const list = grouped[sev];
          if (list.length === 0) return null;
          const meta = SEVERITY_META[sev];
          return (
            <div key={sev} className={`rounded-lg ${meta.bg} p-3`}>
              <div
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide cursor-pointer"
                style={{ color: meta.color }}
                onClick={() => setExpanded(e => ({ ...e, [sev]: !e[sev] }))}
              >
                {expanded[sev] === false ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <meta.icon size={14} />
                {meta.label} ({list.length})
              </div>
              {expanded[sev] !== false && (
                <ul className="mt-2 space-y-1">
                  {list.map((a, i) => (
                    <li
                      key={i}
                      className="text-xs px-2 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-mono text-slate-500 mt-0.5 min-w-[120px]">
                          [{ANOMALY_LABEL[a.kind]}]
                        </span>
                        <span className="flex-1">{a.message}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
