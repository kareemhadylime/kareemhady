'use client';

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
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
        <Donut title="Revenue Mix" entries={data.revenueMix} />
        <Donut title="Cost Mix"    entries={data.costMix} />
      </div>
      <MarginBars entries={data.marginByService} />
      <TrendLine points={data.trend} />
      <TopProjects entries={data.topProjects} />
    </div>
  );
}

function Donut({ title, entries }: {
  title: string;
  entries: Array<{ service?: string; label: string; value: number; pct: number }>;
}) {
  if (entries.length === 0) {
    return (
      <section className="ix-card p-4">
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <p className="text-xs text-slate-400">No data for this period.</p>
      </section>
    );
  }
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="h-[260px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={entries}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={1}
            >
              {entries.map((e, i) => (
                <Cell key={i} fill={SVC_COLORS[e.service || 'other'] || '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number | string, n: string | number) => [typeof v === 'number' ? fmtMoney(v) : v, n as string]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="text-xs text-slate-600 grid grid-cols-2 gap-1 mt-2">
        {entries.slice(0, 8).map((e, i) => (
          <li key={i} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: SVC_COLORS[e.service || 'other'] || '#94a3b8' }} />
            <span>
              {e.label}{' '}
              <span className="text-slate-400">({e.pct.toFixed(1)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarginBars({ entries }: { entries: Array<{ service: string; label: string; pct: number }> }) {
  if (entries.length === 0) {
    return (
      <section className="ix-card p-4">
        <h3 className="text-sm font-semibold mb-2">Gross Margin by Service Line</h3>
        <p className="text-xs text-slate-400">No service-line data for this period.</p>
      </section>
    );
  }
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">Gross Margin by Service Line</h3>
      <div className="h-[260px]">
        <ResponsiveContainer>
          <BarChart data={entries} layout="vertical" margin={{ left: 100, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" unit="%" tickFormatter={v => `${Number(v).toFixed(0)}`} />
            <YAxis type="category" dataKey="label" width={100} fontSize={11} />
            <Tooltip formatter={(v: number | string) => `${typeof v === 'number' ? v.toFixed(1) : v}%`} />
            <Bar dataKey="pct">
              {entries.map((e, i) => {
                const c = e.pct >= 20 ? '#10b981' : e.pct >= 5 ? '#f59e0b' : '#f43f5e';
                return <Cell key={i} fill={c} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TrendLine({ points }: { points: DashboardReport['trend'] }) {
  if (points.length === 0) {
    return (
      <section className="ix-card p-4">
        <h3 className="text-sm font-semibold mb-2">12-Period Trend</h3>
        <p className="text-xs text-slate-400">No trend data.</p>
      </section>
    );
  }
  const data = points.map(p => ({
    label: p.period.label,
    Revenue: p.revenue,
    'Gross Profit': p.grossProfit,
    EBITDA: p.ebitda,
    'Net Profit': p.netProfit,
  }));
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">12-Period Trend</h3>
      <div className="h-[300px]">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis tickFormatter={fmtMoney} fontSize={11} />
            <Tooltip formatter={(v: number | string) => typeof v === 'number' ? fmtMoney(v) : v} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Revenue"      stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Gross Profit" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="EBITDA"       stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net Profit"   stroke="#f43f5e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TopProjects({ entries }: { entries: DashboardReport['topProjects'] }) {
  if (entries.length === 0) return null;
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2">Top-10 Active Projects (this period)</h3>
      <div className="h-[300px]">
        <ResponsiveContainer>
          <BarChart data={entries} layout="vertical" margin={{ left: 120, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tickFormatter={fmtMoney} fontSize={11} />
            <YAxis type="category" dataKey="name" width={120} fontSize={11} />
            <Tooltip formatter={(v: number | string) => typeof v === 'number' ? fmtMoney(v) : v} />
            <Bar dataKey="absBalance" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
