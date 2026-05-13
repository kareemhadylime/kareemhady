import { TrendingUp, TrendingDown, Briefcase, AlertTriangle } from 'lucide-react';
import type {
  PnlReport,
  PnlSection as PnlSectionType,
} from '@/lib/financials-pnl';

const fmtSigned = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  return Math.round(v).toLocaleString('en-US');
};

const pct = (num: number, denom: number): string =>
  !denom || denom === 0 ? '—' : `${((num / denom) * 100).toFixed(1)}%`;

// P&L renderer — same expand/collapse philosophy as the Balance Sheet.
// Main line items (section totals + subtotals like Sub Gross Profit / Gross
// Profit / EBITDA / Net Profit) are ALWAYS visible. Section rows are
// <details> that start CLOSED — click to drill in to subgroups + leaves.
// Subtotal rows between sections stay flat so the operator reads the
// income-statement cascade at a glance.
export function PnlSection({
  pnl,
  scopeLbl,
  buildingCode,
  lobLabel,
}: {
  pnl: PnlReport & { intercompany_excluded_lines?: number };
  scopeLbl: string;
  buildingCode?: string;
  lobLabel?: string;
}) {
  const t = pnl.totals;
  const rev = t.revenue || 1;
  const toPctOfRev = (x: number) => pct(x, rev);

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Briefcase size={18} className="text-rose-600" />
            Profit &amp; Loss · {pnl.period.label}
          </h2>
          <p className="text-xs text-slate-500">
            {scopeLbl} · Draft + posted entries · amounts in EGP.
            {pnl.intercompany_excluded_lines
              ? ` Intercompany excluded (${pnl.intercompany_excluded_lines} lines).`
              : ''}
            {buildingCode ? ` · Building: ${buildingCode}` : ''}
            {lobLabel ? ` · LOB: ${lobLabel}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Net Profit (EGP)</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              t.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {fmtSigned(t.net_profit)}
          </p>
        </div>
      </div>

      {/* Column key row — lines up with the collapsible section headers below */}
      <div className="px-5 py-2 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide flex items-center gap-3">
        <span className="flex-1">Account</span>
        <span className="w-32 text-right">Balance (EGP)</span>
        <span className="w-20 text-right">% Rev</span>
      </div>

      <div className="divide-y divide-slate-100">
        <PnlSectionBand
          section={pnl.sections.revenue}
          emphasis="revenue"
          totalPct={toPctOfRev}
        />
        <PnlSectionBand
          section={pnl.sections.cost_of_revenue}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <PnlSubtotalRow
          label="Sub Gross Profit"
          value={t.sub_gross_profit}
          pct={toPctOfRev(t.sub_gross_profit)}
          tone="neutral"
        />
        <PnlSectionBand
          section={pnl.sections.home_owner_cut}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <PnlSubtotalRow
          label="Gross Profit"
          value={t.gross_profit}
          pct={toPctOfRev(t.gross_profit)}
          tone={t.gross_profit < 0 ? 'negative' : 'positive'}
        />
        <PnlSectionBand
          section={pnl.sections.general_expenses}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <PnlSubtotalRow
          label="EBITDA"
          value={t.ebitda}
          pct={toPctOfRev(t.ebitda)}
          tone={t.ebitda < 0 ? 'negative' : 'positive'}
        />
        <PnlSectionBand
          section={pnl.sections.interest_tax_dep}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <div className="px-5 py-3 bg-slate-900 text-white flex items-center gap-3 font-bold text-base">
          <span className="flex-1">Net Profit</span>
          <span className="w-32 text-right tabular-nums">{fmtSigned(t.net_profit)}</span>
          <span className="w-20 text-right tabular-nums">{toPctOfRev(t.net_profit)}</span>
        </div>
      </div>
    </section>
  );
}

function PnlSectionBand({
  section,
  emphasis,
  totalPct,
}: {
  section: PnlSectionType;
  emphasis: 'revenue' | 'expense';
  totalPct: (n: number) => string;
}) {
  const hasContent = section.subgroups.some(
    sg => sg.accounts.length > 0 || sg.total !== 0
  );
  const headerTone =
    emphasis === 'revenue'
      ? 'text-emerald-700 bg-emerald-50/60'
      : 'text-slate-800 bg-slate-50';
  return (
    <details className="group/pnl">
      <summary
        className={`list-none ${
          hasContent ? 'cursor-pointer' : 'cursor-default'
        } select-none px-5 py-2 flex items-center gap-3 font-semibold ${headerTone} hover:brightness-[0.98] transition`}
      >
        <span className="flex-1 flex items-center gap-2">
          {hasContent && (
            <svg
              className="w-3.5 h-3.5 transition-transform group-open/pnl:rotate-90 text-slate-400"
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
          <span>{section.label}</span>
        </span>
        <span className="w-32 text-right tabular-nums">{fmtSigned(section.total)}</span>
        <span className="w-20 text-right tabular-nums">{totalPct(section.total)}</span>
      </summary>
      {hasContent && (
        <div className="bg-white">
          {section.subgroups.map(sg => (
            <PnlSubgroupBand key={sg.key} sg={sg} totalPct={totalPct} />
          ))}
        </div>
      )}
    </details>
  );
}

function PnlSubgroupBand({
  sg,
  totalPct,
}: {
  sg: PnlSectionType['subgroups'][number];
  totalPct: (n: number) => string;
}) {
  if (sg.total === 0 && sg.accounts.length === 0) return null;
  const hasLeaves = sg.accounts.length > 0;
  return (
    <details className="group/sub border-t border-slate-100">
      <summary
        className={`list-none ${
          hasLeaves ? 'cursor-pointer' : 'cursor-default'
        } select-none pl-10 pr-5 py-1.5 flex items-center gap-3 bg-slate-50/40 text-slate-700 font-medium text-sm hover:bg-slate-50 transition`}
      >
        <span className="flex-1 flex items-center gap-2">
          {hasLeaves && (
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
          <span>{sg.label}</span>
        </span>
        <span className="w-32 text-right tabular-nums">{fmtSigned(sg.total)}</span>
        <span className="w-20 text-right tabular-nums text-slate-500">
          {totalPct(sg.total)}
        </span>
      </summary>
      {hasLeaves && (
        <table className="w-full text-[12px]">
          <tbody>
            {sg.accounts.map((a, i) => (
              <tr
                key={`${a.code}:${i}`}
                className="text-slate-600 border-t border-slate-50"
              >
                <td className="pl-[4.5rem] pr-3 py-1 font-mono text-[10px] text-slate-400 w-16">
                  {a.code || '—'}
                </td>
                <td className="pr-3 py-1 truncate max-w-[380px]" title={a.name}>
                  {a.name}
                </td>
                <td className="pr-5 py-1 text-right tabular-nums w-32">
                  {fmtSigned(a.balance)}
                </td>
                <td className="pr-5 py-1 text-right tabular-nums text-slate-400 text-[11px] w-20">
                  {totalPct(a.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

function PnlSubtotalRow({
  label,
  value,
  pct: pctStr,
  tone,
}: {
  label: string;
  value: number;
  pct: string;
  tone: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'negative'
      ? 'text-rose-600'
      : tone === 'positive'
        ? 'text-emerald-600'
        : 'text-slate-800';
  const Icon =
    tone === 'negative' ? TrendingDown : tone === 'positive' ? TrendingUp : null;
  return (
    <div className="bg-slate-100 px-5 py-2.5 flex items-center gap-3 font-bold border-t-2 border-slate-200">
      <span className="flex-1 inline-flex items-center gap-2">
        {Icon && <Icon size={14} />}
        {label}
      </span>
      <span className={`w-32 text-right tabular-nums ${toneClass}`}>
        {fmtSigned(value)}
      </span>
      <span className={`w-20 text-right tabular-nums ${toneClass}`}>{pctStr}</span>
    </div>
  );
}

export function UnclassifiedPanel({ pnl }: { pnl: PnlReport }) {
  const total = pnl.unclassified.reduce((s, u) => s + u.balance, 0);
  return (
    <section className="ix-card p-5 space-y-3 bg-amber-50/40 border-amber-200">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          Unclassified accounts ({pnl.unclassified.length}) · {fmtSigned(total)}
        </h3>
      </div>
      <div className="max-h-60 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {pnl.unclassified.map((u, i) => (
              <tr key={`${u.code}:${i}`} className="border-t border-amber-100">
                <td className="px-2 py-1 font-mono text-[11px] text-amber-800">{u.code || '—'}</td>
                <td className="px-2 py-1 text-slate-700">{u.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtSigned(u.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
