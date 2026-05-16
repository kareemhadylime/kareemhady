'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { AssetMixSlice } from '@/lib/personal/networth/queries';
import type { AssetKind } from '@/lib/personal/networth/types';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#94a3b8'];

// Exhaustive label resolver for AssetKind | 'stocks_pipe'.
// TypeScript will fail to compile if a new asset kind is added without a
// matching case here.
function assetLabel(key: AssetKind | 'stocks_pipe'): string {
  switch (key) {
    case 'cash': return 'Cash';
    case 'real_estate': return 'Real Estate';
    case 'vehicle': return 'Vehicles';
    case 'gold_jewelry': return 'Gold / Jewelry';
    case 'other': return 'Other';
    case 'stocks_pipe': return 'Stocks';
  }
}

type Slice = AssetMixSlice;

export function AssetMixDonut({ slices }: { slices: Slice[] }) {
  if (slices.length === 0) {
    return (
      <div className="ix-card p-5">
        <div className="text-sm font-semibold mb-2">Asset Mix</div>
        <p className="text-sm text-slate-500">No assets yet.</p>
      </div>
    );
  }
  const data = slices.map(s => ({
    name: assetLabel(s.label),
    value: s.amountEgp,
    pct: s.pct,
  }));
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-2">Asset Mix</div>
      <div className="h-64">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(v: number, _name, item) => {
                const pct = (item?.payload as { pct?: number })?.pct ?? 0;
                return [`EGP ${Number(v).toLocaleString()} (${pct}%)`, item?.payload?.name ?? ''];
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
