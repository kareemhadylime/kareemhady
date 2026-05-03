import { ArrowUp, ArrowDown } from 'lucide-react';
import type { DashboardKpi } from '@/lib/fmplus/types';

const fmt = (n: number): string => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return Math.round(v).toLocaleString();
};

export function KpiStrip({ kpis }: { kpis: { revenue: DashboardKpi; grossProfit: DashboardKpi; ebitda: DashboardKpi; netProfit: DashboardKpi } }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard label="Revenue"      kpi={kpis.revenue}      tone="indigo" />
      <KpiCard label="Gross Profit" kpi={kpis.grossProfit}  tone="emerald" />
      <KpiCard label="EBITDA"       kpi={kpis.ebitda}       tone="amber" />
      <KpiCard label="Net Profit"   kpi={kpis.netProfit}    tone="rose" />
    </div>
  );
}

function KpiCard({ label, kpi, tone }: { label: string; kpi: DashboardKpi; tone: 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  const isUp = kpi.deltaPct >= 0;
  const tint =
    tone === 'indigo'  ? 'border-indigo-200'  :
    tone === 'emerald' ? 'border-emerald-200' :
    tone === 'amber'   ? 'border-amber-200'   :
                         'border-rose-200';
  const valueClr = kpi.current >= 0 ? 'text-slate-900' : 'text-rose-700';
  return (
    <div className={`ix-card p-4 border-2 ${tint}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueClr}`}>{fmt(kpi.current)}</p>
      <p className={`text-[11px] inline-flex items-center gap-0.5 ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
        {isUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
        {Math.abs(kpi.deltaPct).toFixed(1)}% vs prior
      </p>
      <Sparkline values={kpi.sparkline} tone={tone} />
    </div>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100, H = 24;
  const xStep = W / (values.length - 1);
  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * xStep).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`)
    .join(' ');
  const stroke =
    tone === 'indigo'  ? '#6366f1' :
    tone === 'emerald' ? '#10b981' :
    tone === 'amber'   ? '#f59e0b' :
                         '#f43f5e';
  return (
    <svg width={W} height={H} className="mt-2 -mx-1">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
