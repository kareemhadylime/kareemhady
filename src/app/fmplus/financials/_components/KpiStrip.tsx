import { ArrowUp, ArrowDown, DollarSign, TrendingUp, Activity, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardKpi } from '@/lib/fmplus/types';

const fmt = (n: number): string => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return Math.round(v).toLocaleString();
};

type Tone = 'indigo' | 'emerald' | 'amber' | 'rose';

const TONE: Record<Tone, {
  iconBg: string;
  iconText: string;
  gradFrom: string;
  gradTo: string;
  spark: string;
  border: string;
}> = {
  indigo:  { iconBg: 'bg-indigo-50 dark:bg-indigo-950',   iconText: 'text-indigo-700 dark:text-indigo-300',   gradFrom: 'from-indigo-400',  gradTo: 'to-indigo-600',  spark: '#6366f1', border: 'hover:border-indigo-400' },
  emerald: { iconBg: 'bg-emerald-50 dark:bg-emerald-950', iconText: 'text-emerald-700 dark:text-emerald-300', gradFrom: 'from-emerald-400', gradTo: 'to-emerald-600', spark: '#10b981', border: 'hover:border-emerald-400' },
  amber:   { iconBg: 'bg-amber-50 dark:bg-amber-950',     iconText: 'text-amber-700 dark:text-amber-300',     gradFrom: 'from-amber-400',   gradTo: 'to-amber-600',   spark: '#f59e0b', border: 'hover:border-amber-400' },
  rose:    { iconBg: 'bg-rose-50 dark:bg-rose-950',       iconText: 'text-rose-700 dark:text-rose-300',       gradFrom: 'from-rose-400',    gradTo: 'to-rose-600',    spark: '#f43f5e', border: 'hover:border-rose-400' },
};

export function KpiStrip({ kpis }: { kpis: { revenue: DashboardKpi; grossProfit: DashboardKpi; ebitda: DashboardKpi; netProfit: DashboardKpi } }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard label="Revenue"      kpi={kpis.revenue}     tone="indigo"  Icon={DollarSign}  />
      <KpiCard label="Gross Profit" kpi={kpis.grossProfit} tone="emerald" Icon={TrendingUp}  />
      <KpiCard label="EBITDA"       kpi={kpis.ebitda}      tone="amber"   Icon={Activity}    />
      <KpiCard label="Net Profit"   kpi={kpis.netProfit}   tone="rose"    Icon={Target}      />
    </div>
  );
}

function KpiCard({ label, kpi, tone, Icon }: { label: string; kpi: DashboardKpi; tone: Tone; Icon: LucideIcon }) {
  const t = TONE[tone];
  const isUp = kpi.deltaPct >= 0;
  const valueClr = kpi.current >= 0 ? 'text-slate-900 dark:text-slate-50' : 'text-rose-700 dark:text-rose-400';
  return (
    <div className={`group relative ix-card p-5 overflow-hidden transition border ${t.border}`}>
      <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gradient-to-br ${t.gradFrom} ${t.gradTo} opacity-[0.10] blur-2xl pointer-events-none`} />
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 rounded-xl inline-flex items-center justify-center ${t.iconBg}`}>
          <Icon size={20} strokeWidth={2.2} className={t.iconText} />
        </div>
        <span
          className={`text-[11px] inline-flex items-center gap-0.5 font-medium px-2 py-0.5 rounded-full ${
            isUp ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                 : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
          }`}
        >
          {isUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          {Math.abs(kpi.deltaPct).toFixed(1)}%
        </span>
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">{label}</p>
      <p className={`text-3xl font-bold tabular-nums leading-tight mt-0.5 ${valueClr}`}>{fmt(kpi.current)}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">vs prior period</p>
      <Sparkline values={kpi.sparkline} stroke={t.spark} />
    </div>
  );
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 100, H = 28;
  const xStep = W / (values.length - 1);
  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * xStep).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`)
    .join(' ');
  // Add a faint area-fill under the line for richer reading
  const area = `${path} L${W},${H} L0,${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="mt-3" preserveAspectRatio="none">
      <path d={area} fill={stroke} fillOpacity={0.08} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
