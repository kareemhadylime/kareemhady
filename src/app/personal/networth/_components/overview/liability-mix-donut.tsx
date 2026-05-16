'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#ef4444', '#f97316', '#a855f7', '#0ea5e9', '#94a3b8'];
const LABEL_OVERRIDES: Record<string, string> = {
  amortizing_loan: 'Loans',
  bnpl: 'BNPL',
  credit_card: 'Cards',
  overdraft: 'Overdraft',
  other: 'Other',
};

type Slice = { label: string; amountEgp: number; pct: number };

export function LiabilityMixDonut({ slices }: { slices: Slice[] }) {
  if (slices.length === 0) {
    return (
      <div className="ix-card p-5">
        <div className="text-sm font-semibold mb-2">Liability Mix</div>
        <p className="text-sm text-slate-500">No liabilities yet — you&rsquo;re debt-free!</p>
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
      <div className="text-sm font-semibold mb-2">Liability Mix</div>
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
