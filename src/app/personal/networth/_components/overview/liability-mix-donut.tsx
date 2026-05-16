'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
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

function fmtEgp(n: number): string {
  return `EGP ${Math.round(n).toLocaleString()}`;
}

type Slice = LiabilityMixSlice;

export function LiabilityMixDonut({ slices }: { slices: Slice[] }) {
  if (slices.length === 0) {
    return (
      <div className="ix-card p-5">
        <div className="text-sm font-semibold mb-2">Liability Mix</div>
        <p className="text-sm text-slate-500">No liabilities yet &mdash; you&rsquo;re debt-free!</p>
      </div>
    );
  }
  // Sort descending by amount so the legend reads largest-first.
  const data = slices
    .map(s => ({ name: liabilityLabel(s.label), value: s.amountEgp, pct: s.pct }))
    .sort((a, b) => b.value - a.value);
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-3">Liability Mix</div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-4 items-center">
        <div className="h-56 min-w-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={86}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, _name, item) => {
                  const pct = (item?.payload as { pct?: number })?.pct ?? 0;
                  return [`${fmtEgp(Number(v))} (${pct}%)`, item?.payload?.name ?? ''];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2 text-sm">
          {data.map((s, i) => (
            <li key={s.name} className="flex items-start gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block mt-1.5 flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                  {s.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {fmtEgp(s.value)} <span className="text-slate-400">·</span> {s.pct}%
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
