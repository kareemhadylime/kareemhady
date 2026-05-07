'use client';

import { DollarSign, Sparkles, Percent, Calendar, AlertCircle, AlertTriangle } from 'lucide-react';
import type { FeeAuditData } from '@/lib/beithady/fees-audit/types';

const fmtUsd = (n: number | null): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
const fmtPct = (n: number | null): string =>
  n == null ? '—' : `${n.toFixed(1)}%`;

export function KpiStrip({ data }: { data: FeeAuditData }) {
  const t = data.totals;
  const cards = [
    { label: 'Avg Daily Rate', value: fmtUsd(t.avg_daily_rate_usd), icon: DollarSign, accent: '#1e3a5f' },
    { label: 'Avg Cleaning', value: fmtUsd(t.avg_cleaning_usd), icon: Sparkles, accent: '#15803d' },
    { label: 'Avg Tax %', value: fmtPct(t.avg_total_tax_pct), icon: Percent, accent: '#b45309' },
    { label: 'Avg Min Nights', value: t.avg_min_nights != null ? t.avg_min_nights.toFixed(1) : '—', icon: Calendar, accent: '#7c3aed' },
    {
      label: 'Missing Data',
      value: String(t.listings_with_missing_data),
      icon: AlertCircle,
      accent: t.listings_with_missing_data > 0 ? '#b91c1c' : '#15803d',
    },
    {
      label: 'Anomalies',
      value: `${t.anomaly_count_by_severity.critical} 🔴 · ${t.anomaly_count_by_severity.warning} 🟡`,
      icon: AlertTriangle,
      accent: t.anomaly_count_by_severity.critical > 0 ? '#b91c1c' : '#b45309',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          className="ix-card p-3 flex flex-col gap-1"
          style={{ borderLeft: `3px solid ${c.accent}` }}
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
            <c.icon size={11} /> {c.label}
          </div>
          <div className="text-lg font-bold tabular-nums" style={{ color: c.accent }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
