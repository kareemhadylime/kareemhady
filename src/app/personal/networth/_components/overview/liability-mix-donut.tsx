'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { LiabilityMixSlice } from '@/lib/personal/networth/queries';
import type { LiabilityKind } from '@/lib/personal/networth/types';

const COLORS = ['#ef4444', '#f97316', '#a855f7', '#0ea5e9', '#94a3b8'];

// Exhaustive label resolver for LiabilityKind. TypeScript catches a missing
// case if a new kind is added without updating this switch.
function liabilityLabel(key: LiabilityKind): string {
  switch (key) {
    case 'amortizing_loan': return 'Loans';
    case 'bnpl': return 'BNPL';
    case 'credit_card': return 'Cards';
    case 'overdraft': return 'Overdraft';
    case 'other': return 'Other';
  }
}

type Slice = LiabilityMixSlice;

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
    name: liabilityLabel(s.label),
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
