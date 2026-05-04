'use client';

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
import { PieChart as PieIcon, BarChart3, TrendingUp, ListOrdered } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardReport } from '@/lib/fmplus/types';

const SVC_COLORS: Record<string, string> = {
  hk: '#10b981',        // emerald
  mep: '#6366f1',       // indigo
  security: '#f59e0b',  // amber
  landscape: '#84cc16', // lime
  pest: '#06b6d4',      // cyan
  waste: '#a855f7',     // purple
  paid: '#f43f5e',      // rose
  vo: '#0ea5e9',        // sky
  other: '#94a3b8',     // slate
};

const fmtMoney = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return Math.round(n).toLocaleString();
};

export function DashboardCharts({ data }: { data: DashboardReport }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Donut title="Revenue Mix" subtitle="Share of revenue by service line"  Icon={PieIcon} entries={data.revenueMix} accent="emerald" />
        <Donut title="Cost Mix"    subtitle="Share of cost of revenue by line" Icon={PieIcon} entries={data.costMix}    accent="rose" />
      </div>
      <MarginBars entries={data.marginByService} />
      <TrendLine points={data.trend} />
      <TopProjects entries={data.topProjects} />
    </div>
  );
}

function ChartHeader({ title, subtitle, Icon, accent }: {
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  accent: 'emerald' | 'rose' | 'amber' | 'indigo';
}) {
  const tint =
    accent === 'emerald' ? { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300' } :
    accent === 'rose'    ? { bg: 'bg-rose-50 dark:bg-rose-950',       text: 'text-rose-700 dark:text-rose-300' } :
    accent === 'amber'   ? { bg: 'bg-amber-50 dark:bg-amber-950',     text: 'text-amber-700 dark:text-amber-300' } :
                           { bg: 'bg-indigo-50 dark:bg-indigo-950',   text: 'text-indigo-700 dark:text-indigo-300' };
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className={`w-8 h-8 rounded-lg inline-flex items-center justify-center ${tint.bg}`}>
        <Icon size={16} strokeWidth={2.2} className={tint.text} />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 italic">
      {message}
    </div>
  );
}

function Donut({ title, subtitle, Icon, accent, entries }: {
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  accent: 'emerald' | 'rose';
  entries: Array<{ service?: string; label: string; value: number; pct: number }>;
}) {
  return (
    <section className="ix-card p-5">
      <ChartHeader title={title} subtitle={subtitle} Icon={Icon} accent={accent} />
      {entries.length === 0 ? (
        <EmptyState message="No data for this period." />
      ) : (
        <>
          <div className="h-[240px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={entries}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={1}
                  stroke="none"
                >
                  {entries.map((e, i) => (
                    <Cell key={i} fill={SVC_COLORS[e.service || 'other'] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'rgb(15 23 42)', border: '1px solid rgb(51 65 85)', borderRadius: 8, color: 'white', fontSize: 12 }}
                  formatter={(v: number | string, n: string | number) => [typeof v === 'number' ? fmtMoney(v) : v, n as string]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="text-xs text-slate-600 dark:text-slate-300 grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3">
            {entries.slice(0, 8).map((e, i) => (
              <li key={i} className="inline-flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SVC_COLORS[e.service || 'other'] || '#94a3b8' }} />
                <span className="truncate">
                  {e.label}
                  <span className="text-slate-400 dark:text-slate-500 ml-1">({e.pct.toFixed(1)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function MarginBars({ entries }: { entries: Array<{ service: string; label: string; pct: number }> }) {
  return (
    <section className="ix-card p-5">
      <ChartHeader title="Gross Margin by Service Line" subtitle="Green ≥ 20%, amber ≥ 5%, rose < 5%" Icon={BarChart3} accent="amber" />
      {entries.length === 0 ? (
        <EmptyState message="No service-line data for this period." />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer>
            <BarChart data={entries} layout="vertical" margin={{ left: 100, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
              <XAxis type="number" unit="%" tickFormatter={v => `${Number(v).toFixed(0)}`} stroke="rgb(148 163 184)" fontSize={11} />
              <YAxis type="category" dataKey="label" width={100} stroke="rgb(148 163 184)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: 'rgb(15 23 42)', border: '1px solid rgb(51 65 85)', borderRadius: 8, color: 'white', fontSize: 12 }}
                formatter={(v: number | string) => `${typeof v === 'number' ? v.toFixed(1) : v}%`}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {entries.map((e, i) => {
                  const c = e.pct >= 20 ? '#10b981' : e.pct >= 5 ? '#f59e0b' : '#f43f5e';
                  return <Cell key={i} fill={c} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function TrendLine({ points }: { points: DashboardReport['trend'] }) {
  return (
    <section className="ix-card p-5">
      <ChartHeader title="12-Period Trend" subtitle="Revenue, GP, EBITDA, Net Profit over time" Icon={TrendingUp} accent="indigo" />
      {points.length === 0 ? (
        <EmptyState message="No trend data." />
      ) : (
        <div className="h-[300px]">
          <ResponsiveContainer>
            <LineChart data={points.map(p => ({
              label: p.period.label,
              Revenue: p.revenue,
              'Gross Profit': p.grossProfit,
              EBITDA: p.ebitda,
              'Net Profit': p.netProfit,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
              <XAxis dataKey="label" stroke="rgb(148 163 184)" fontSize={11} />
              <YAxis tickFormatter={fmtMoney} stroke="rgb(148 163 184)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: 'rgb(15 23 42)', border: '1px solid rgb(51 65 85)', borderRadius: 8, color: 'white', fontSize: 12 }}
                formatter={(v: number | string) => typeof v === 'number' ? fmtMoney(v) : v}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Revenue"      stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Gross Profit" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="EBITDA"       stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Net Profit"   stroke="#f43f5e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function TopProjects({ entries }: { entries: DashboardReport['topProjects'] }) {
  if (entries.length === 0) return null;
  return (
    <section className="ix-card p-5">
      <ChartHeader title="Top-10 Active Projects" subtitle="Highest-balance analytic accounts this period" Icon={ListOrdered} accent="amber" />
      <div className="h-[300px]">
        <ResponsiveContainer>
          <BarChart data={entries} layout="vertical" margin={{ left: 120, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
            <XAxis type="number" tickFormatter={fmtMoney} stroke="rgb(148 163 184)" fontSize={11} />
            <YAxis type="category" dataKey="name" width={120} stroke="rgb(148 163 184)" fontSize={11} />
            <Tooltip
              contentStyle={{ background: 'rgb(15 23 42)', border: '1px solid rgb(51 65 85)', borderRadius: 8, color: 'white', fontSize: 12 }}
              formatter={(v: number | string) => typeof v === 'number' ? fmtMoney(v) : v}
            />
            <Bar dataKey="absBalance" fill="#f59e0b" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
