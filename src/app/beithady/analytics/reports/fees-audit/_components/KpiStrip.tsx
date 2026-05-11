'use client';

import { DollarSign, Sparkles, Percent, Calendar, AlertCircle, AlertTriangle, Building2 } from 'lucide-react';
import type { FeeAuditData } from '@/lib/beithady/fees-audit/types';
import { STATUS_COLORS } from '@/lib/beithady/theme';

const fmtUsd = (n: number | null): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
const fmtPct = (n: number | null): string =>
  n == null ? '—' : `${n.toFixed(1)}%`;

// BH brand palette — uses canonical CSS tokens from globals.css
//   --bh-ink     #003462  Pantone 108-16 U  Deep Navy
//   --bh-steel   #6077a6  Pantone 105-13 U  Steel Blue
//   --bh-gold    #D4A93A                   Brand Gold accent
//   --bh-cream   #F5F1E8                   Page background
//   --bh-lavender #eae9f3                  Pale Lavender (page bg alt)
// Status colors come from the shared STATUS_COLORS token.
const BH = {
  ink: 'var(--bh-ink)',
  steel: 'var(--bh-steel)',
  gold: 'var(--bh-gold)',
  ...STATUS_COLORS,
};

export function KpiStrip({ data }: { data: FeeAuditData }) {
  const t = data.totals;
  const cards = [
    {
      label: 'Physical Units',
      value: `${t.physical_units}${t.slt_children_excluded > 0 ? ` · ${t.slt_children_excluded} rolled up` : ''}`,
      icon: Building2,
      accent: BH.ink,
    },
    { label: 'Avg Daily Rate', value: fmtUsd(t.avg_daily_rate_usd), icon: DollarSign, accent: BH.gold },
    { label: 'Avg Cleaning', value: fmtUsd(t.avg_cleaning_usd), icon: Sparkles, accent: BH.green },
    { label: 'Avg Tax %', value: fmtPct(t.avg_total_tax_pct), icon: Percent, accent: BH.amber },
    { label: 'Avg Min Nights', value: t.avg_min_nights != null ? t.avg_min_nights.toFixed(1) : '—', icon: Calendar, accent: BH.steel },
    {
      label: 'Missing Data',
      value: String(t.listings_with_missing_data),
      icon: AlertCircle,
      accent: t.listings_with_missing_data > 0 ? BH.red : BH.green,
    },
    {
      label: 'Anomalies',
      value: `${t.anomaly_count_by_severity.critical} 🔴 · ${t.anomaly_count_by_severity.warning} 🟡`,
      icon: AlertTriangle,
      accent: t.anomaly_count_by_severity.critical > 0 ? BH.red : BH.amber,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          className="p-3 flex flex-col gap-1 rounded-lg shadow-sm transition hover:shadow"
          style={{
            background: 'var(--bh-cream)',
            border: '1px solid var(--bh-mute)',
            borderLeft: `4px solid ${c.accent}`,
          }}
        >
          <div
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--bh-steel)', fontWeight: 600, letterSpacing: '0.08em' }}
          >
            <c.icon size={11} /> {c.label}
          </div>
          <div
            className="text-lg font-bold tabular-nums"
            style={{
              color: c.accent,
              fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
              fontSize: 22,
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
