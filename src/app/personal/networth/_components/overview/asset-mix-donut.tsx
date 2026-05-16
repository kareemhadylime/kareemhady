'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#94a3b8'];
const LABEL_OVERRIDES: Record<string, string> = {
  cash: 'Cash',
  real_estate: 'Real Estate',
  vehicle: 'Vehicles',
  gold_jewelry: 'Gold / Jewelry',
  stocks_pipe: 'Stocks',
  other: 'Other',
};

type Slice = { label: string; amountEgp: number; pct: number };

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
    name: LABEL_OVERRIDES[s.label] ?? s.label,
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
