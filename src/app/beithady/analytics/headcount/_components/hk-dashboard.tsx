'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { HKMonthResult } from '@/lib/beithady/hc-estimator-types';

function KPICard({
  label, onShift, toHire, color,
}: {
  label: string;
  onShift: number;
  toHire: number;
  color: string;
}) {
  return (
    <div className={`ix-card p-4 border-l-4 ${color}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: 'var(--bh-navy)' }}>{toHire}</p>
      <p className="text-xs text-slate-500 mt-0.5">On shift: {onShift}</p>
    </div>
  );
}

export function HKDashboard({ result }: { result: HKMonthResult }) {
  const barData = result.weeks.map(w => ({
    name: `W${w.week}`,
    hks: w.dayHKs,
    isPeak: w.week === result.peakWeek,
  }));

  const total = result.grandTotalOnShift;
  const segments = [
    { label: 'Day HKs',     value: result.dayHKsOnShift,     color: 'bg-cyan-500' },
    { label: 'Night HKs',   value: result.nightHKsOnShift,   color: 'bg-sky-400' },
    { label: 'Supervisors', value: result.supervisorsOnShift, color: 'bg-slate-400' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Day HKs"     onShift={result.dayHKsOnShift}     toHire={result.dayHKsToHire}     color="border-cyan-500" />
        <KPICard label="Night HKs"   onShift={result.nightHKsOnShift}   toHire={result.nightHKsToHire}   color="border-sky-400" />
        <KPICard label="Supervisors" onShift={result.supervisorsOnShift} toHire={result.supervisorsToHire} color="border-slate-400" />
        <KPICard label="Grand Total" onShift={result.grandTotalOnShift}  toHire={result.grandTotalToHire}  color="border-amber-400" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="ix-card p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Day HKs by Week</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} barSize={32}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="hks" name="Day HKs">
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.isPeak ? '#f59e0b' : '#06b6d4'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="ix-card p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff Composition (on-shift)</p>
          {segments.map(seg => (
            <div key={seg.label} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>{seg.label}</span>
                <span className="font-semibold">{seg.value}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${seg.color}`}
                  style={{ width: total > 0 ? `${(seg.value / total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
