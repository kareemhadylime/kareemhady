'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { SecurityResult } from '@/lib/beithady/hc-estimator-types';

function KPICard({ label, onShift, toHire, color }: {
  label: string; onShift: number; toHire: number; color: string;
}) {
  return (
    <div className={`ix-card p-4 border-l-4 ${color}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: 'var(--bh-navy)' }}>{toHire}</p>
      <p className="text-xs text-slate-500 mt-0.5">On shift: {onShift}</p>
    </div>
  );
}

export function SecurityDashboard({ result }: { result: SecurityResult }) {
  const barData = result.buildings.map(b => ({
    name: b.building,
    Day: b.dayOnShift,
    Night: b.nightOnShift,
    '24hr': b.allDayBodies,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Day Guards"   onShift={result.portfolioDayOnShift}   toHire={result.portfolioDayToHire}   color="border-cyan-500" />
        <KPICard label="Night Guards" onShift={result.portfolioNightOnShift} toHire={result.portfolioNightToHire} color="border-sky-400" />
        <KPICard label="24hr Bodies"  onShift={result.portfolioAllDayBodies} toHire={result.portfolioAllDayToHire} color="border-violet-400" />
        <KPICard label="Grand Total"  onShift={result.portfolioTotalOnShift} toHire={result.portfolioTotalToHire} color="border-amber-400" />
      </div>
      <div className="ix-card p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Per-Building Breakdown</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData} barSize={24}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Day"   fill="#06b6d4" stackId="a" />
            <Bar dataKey="Night" fill="#38bdf8" stackId="a" />
            <Bar dataKey="24hr"  fill="#a78bfa" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
