import { Landmark } from 'lucide-react';
import type { BalanceSheetReport, BalanceSheetGroup } from '@/lib/financials-pnl';

const fmt = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  return Math.round(v).toLocaleString('en-US');
};

// Balance Sheet renderer — mirrors the Feb-2026 xlsx template:
//   ASSETS / LIABILITIES / EQUITY / LIABILITIES + EQUITY
// Each section is a <details> that starts OPEN; each group inside it is a
// <details> that starts CLOSED so the operator sees the high-level line
// items first and only expands the groups they want to drill into. All
// native — no client-side React, no JS hydration needed.
export function BalanceSheetSection({ bs }: { bs: BalanceSheetReport }) {
  const delta = bs.assets.total - bs.liabilities_plus_equity;
  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Landmark size={18} className="text-indigo-600" />
            Balance Sheet · as of {bs.as_of}
          </h2>
          <p className="text-xs text-slate-500">
            Posted entries only · all amounts in EGP ·{' '}
            {bs.balanced ? (
              <span className="text-emerald-600 font-medium">✓ Balanced</span>
            ) : (
              <span className="text-amber-600 font-medium">
                ⚠ Unbalanced by {fmt(Math.abs(delta))}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <StatBlock label="Assets" value={bs.assets.total} tone="indigo" />
          <StatBlock
            label="Liab + Equity"
            value={bs.liabilities_plus_equity}
            tone="slate"
          />
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        <BalanceTopSection
          label="ASSETS"
          total={bs.assets.total}
          tone="indigo"
          groups={bs.assets.groups}
        />
        <BalanceTopSection
          label="LIABILITIES"
          total={bs.liabilities.total}
          tone="rose"
          groups={bs.liabilities.groups}
        />
        <BalanceTopSection
          label="EQUITY"
          total={bs.equity.total}
          tone="amber"
          groups={bs.equity.groups}
        />
        <div className="px-5 py-3 flex items-center justify-between text-sm font-bold text-slate-800 bg-slate-50">
          <span>LIABILITIES + EQUITY</span>
          <span className="tabular-nums">{fmt(bs.liabilities_plus_equity)}</span>
        </div>
      </div>
    </section>
  );
}

function BalanceTopSection({
  label,
  total,
  tone,
  groups,
}: {
  label: string;
  total: number;
  tone: 'indigo' | 'rose' | 'amber';
  groups: BalanceSheetGroup[];
}) {
  const toneClass =
    tone === 'indigo'
      ? 'text-indigo-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : 'text-amber-700';
  return (
    <details open className="group">
      <summary
        className={`list-none cursor-pointer select-none px-5 py-3 flex items-center justify-between text-sm font-bold uppercase tracking-wide ${toneClass} hover:bg-slate-50 transition`}
      >
        <span className="inline-flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 transition-transform group-open:rotate-90 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M6.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06-1.06L10.94 10 6.22 5.28a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
          {label}
        </span>
        <span className="tabular-nums">{fmt(total)}</span>
      </summary>
      <div className="pb-2">
        {groups.length === 0 ? (
          <p className="px-5 pb-3 text-xs text-slate-400">No balances.</p>
        ) : (
          groups.map(g => <BalanceGroupCollapsible key={g.key} group={g} />)
        )}
      </div>
    </details>
  );
}

function BalanceGroupCollapsible({ group }: { group: BalanceSheetGroup }) {
  const hasRows = group.accounts.length > 0;
  return (
    <details className="group/sub border-t border-slate-100">
      <summary
        className={`list-none ${
          hasRows ? 'cursor-pointer' : 'cursor-default'
        } select-none pl-10 pr-5 py-2 flex items-center justify-between text-sm font-medium text-slate-800 hover:bg-slate-50/60 transition`}
      >
        <span className="inline-flex items-center gap-2">
          {hasRows && (
            <svg
              className="w-3 h-3 transition-transform group-open/sub:rotate-90 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M6.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06-1.06L10.94 10 6.22 5.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {group.label}
          {group.synthetic && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              derived
            </span>
          )}
        </span>
        <span className="tabular-nums">{fmt(group.total)}</span>
      </summary>
      {hasRows && (
        <table className="w-full text-[12px]">
          <tbody>
            {group.accounts.map((a, i) => (
              <tr
                key={`${group.key}:${a.code}:${a.name}:${i}`}
                className="text-slate-600 border-t border-slate-50"
              >
                <td className="pl-[4.5rem] pr-2 py-1 truncate max-w-[380px]" title={a.name}>
                  {a.code && (
                    <span className="font-mono text-[10px] text-slate-400 mr-2">
                      {a.code}
                    </span>
                  )}
                  {a.name}
                </td>
                <td className="pr-5 py-1 text-right tabular-nums">
                  {fmt(a.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

function StatBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'indigo' | 'slate' | 'rose' | 'amber';
}) {
  const toneClass =
    tone === 'indigo'
      ? 'text-indigo-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : tone === 'amber'
          ? 'text-amber-700'
          : 'text-slate-700';
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${toneClass}`}>{fmt(value)}</p>
    </div>
  );
}
