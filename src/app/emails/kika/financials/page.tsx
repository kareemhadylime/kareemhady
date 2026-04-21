import Link from 'next/link';
import {
  ChevronRight,
  Calendar,
  TrendingUp,
  TrendingDown,
  Briefcase,
  Factory,
  ShoppingBag,
  Layers,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildKikaPnlReport,
  resolveKikaPeriod,
  kikaSegmentLabel,
  type KikaPnlReport,
  type KikaSegment,
} from '@/lib/kika-financials';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SEGMENT_TABS: Array<{ id: KikaSegment; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'consolidated', label: 'Consolidated', icon: Layers },
  { id: 'kika', label: 'Kika (Shopify)', icon: ShoppingBag },
  { id: 'xlabel', label: 'X Label (Uniforms)', icon: Factory },
  { id: 'inout', label: 'In & Out (Outsource)', icon: Briefcase },
];

const FINANCE_PRESETS: Array<{ id: string; label: string }> = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
];

const fmtSigned = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  return Math.round(v).toLocaleString('en-US');
};
const pct = (num: number, denom: number): string =>
  !denom || denom === 0 ? '—' : `${((num / denom) * 100).toFixed(1)}%`;

function isKikaSegment(s: string | undefined): s is KikaSegment {
  return s === 'consolidated' || s === 'kika' || s === 'xlabel' || s === 'inout';
}

export default async function KikaFinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    month?: string;
    segment?: string;
  }>;
}) {
  const sp = await searchParams;
  const preset = sp.month ? `month:${sp.month}` : sp.preset || 'last_month';
  const period = resolveKikaPeriod(preset, sp.from, sp.to);
  const segment: KikaSegment = isKikaSegment(sp.segment) ? sp.segment : 'consolidated';
  const pnl = await buildKikaPnlReport({
    fromDate: period.fromDate,
    toDate: period.toDate,
    label: period.label,
    segment,
  });

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">
          Emails
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/kika" className="ix-link">
          KIKA
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Financials</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            KIKA · Financials
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {kikaSegmentLabel(segment)}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Odoo company <strong>X Label for Tailoring Kika</strong>. Segments
            split by analytic account (Kika / X-Label / In &amp; Out).
          </p>
        </header>

        <SegmentTabs active={segment} preset={preset} />

        <PeriodFilter activeId={period.id} segment={segment} fromDefault={period.fromDate} toDefault={period.toDate} />

        <PnlSection pnl={pnl} />

        {pnl.unclassified.length > 0 && (
          <section className="ix-card p-4 bg-amber-50/40 border-amber-200">
            <p className="text-sm text-amber-800">
              {pnl.unclassified.length} unclassified accounts — inspect via the
              raw Supabase tables if the P&amp;L looks off.
            </p>
          </section>
        )}

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          {pnl.line_count.toLocaleString()} move lines aggregated for{' '}
          {period.label}. Draft + posted entries. Analytic segment:{' '}
          {segment === 'consolidated' ? 'all' : segment}.
        </footer>
      </main>
    </>
  );
}

function SegmentTabs({ active, preset }: { active: KikaSegment; preset: string }) {
  return (
    <section className="ix-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={16} className="text-violet-600" />
        <h2 className="text-sm font-semibold">Segment</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {SEGMENT_TABS.map(t => {
          const Icon = t.icon;
          const activeClass =
            active === t.id
              ? 'bg-violet-600 text-white shadow-sm hover:bg-violet-700'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50';
          return (
            <Link
              key={t.id}
              href={`?segment=${t.id}&preset=${preset}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition inline-flex items-center gap-2 ${activeClass}`}
            >
              <Icon size={14} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function PeriodFilter({
  activeId,
  segment,
  fromDefault,
  toDefault,
}: {
  activeId: string;
  segment: KikaSegment;
  fromDefault: string;
  toDefault: string;
}) {
  const now = new Date();
  const months: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    months.push({ value, label });
  }
  return (
    <section className="ix-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-indigo-600" />
        <h2 className="text-sm font-semibold">Period</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {FINANCE_PRESETS.map(p => (
          <Link
            key={p.id}
            href={`?preset=${p.id}&segment=${segment}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              activeId === p.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form action="" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="segment" value={segment} />
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">Specific month</span>
          <select
            name="month"
            defaultValue={activeId.startsWith('month-') ? activeId.replace('month-', '') : ''}
            className="ix-input w-[180px]"
          >
            <option value="">Pick a month…</option>
            {months.map(m => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Go
        </button>
      </form>
      <form action="" method="get" className="flex items-end gap-2">
        <input type="hidden" name="segment" value={segment} />
        <input type="hidden" name="preset" value="custom" />
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">From</span>
          <input type="date" name="from" defaultValue={fromDefault} className="ix-input w-[160px]" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">To</span>
          <input type="date" name="to" defaultValue={toDefault} className="ix-input w-[160px]" />
        </label>
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Apply
        </button>
      </form>
    </section>
  );
}

function PnlSection({ pnl }: { pnl: KikaPnlReport }) {
  const t = pnl.totals;
  const rev = t.revenue || 1;
  const toPctOfRev = (x: number) => pct(x, rev);

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Briefcase size={18} className="text-violet-600" />
            Profit &amp; Loss · {pnl.period.label}
          </h2>
          <p className="text-xs text-slate-500">
            Company 6 · {pnl.segment === 'consolidated' ? 'all segments' : pnl.segment}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Net Profit</p>
          <p className={`text-2xl font-bold tabular-nums ${t.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {fmtSigned(t.net_profit)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-2 w-20">Code</th>
              <th className="text-left px-5 py-2">Account</th>
              <th className="text-right px-5 py-2 w-32">Balance</th>
              <th className="text-right px-5 py-2 w-20">% Rev</th>
            </tr>
          </thead>
          <tbody>
            <SectionRows section={pnl.sections.revenue} emphasis="revenue" pctFn={toPctOfRev} />
            <SectionRows section={pnl.sections.cost_of_revenue} emphasis="expense" pctFn={toPctOfRev} />
            <SubtotalRow label="Gross Profit" value={t.gross_profit} pct={toPctOfRev(t.gross_profit)} tone={t.gross_profit < 0 ? 'negative' : 'positive'} />
            <SectionRows section={pnl.sections.general_expenses} emphasis="expense" pctFn={toPctOfRev} />
            <SubtotalRow label="EBITDA" value={t.ebitda} pct={toPctOfRev(t.ebitda)} tone={t.ebitda < 0 ? 'negative' : 'positive'} />
            <SectionRows section={pnl.sections.interest_tax_dep} emphasis="expense" pctFn={toPctOfRev} />
            <tr className="bg-slate-900 text-white font-bold">
              <td colSpan={2} className="px-5 py-3 text-base">
                Net Profit
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-base">{fmtSigned(t.net_profit)}</td>
              <td className="px-5 py-3 text-right tabular-nums text-base">{toPctOfRev(t.net_profit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectionRows({
  section,
  emphasis,
  pctFn,
}: {
  section: KikaPnlReport['sections'][keyof KikaPnlReport['sections']];
  emphasis: 'revenue' | 'expense';
  pctFn: (n: number) => string;
}) {
  const tone =
    emphasis === 'revenue' ? 'text-emerald-700 bg-emerald-50/60' : 'text-slate-800 bg-slate-50';
  return (
    <>
      <tr className={`${tone} font-semibold`}>
        <td className="px-5 py-2" colSpan={2}>
          {section.label}
        </td>
        <td className="px-5 py-2 text-right tabular-nums">{fmtSigned(section.total)}</td>
        <td className="px-5 py-2 text-right tabular-nums">{pctFn(section.total)}</td>
      </tr>
      {section.subgroups.map(sg => {
        if (sg.total === 0 && sg.accounts.length === 0) return null;
        return (
          <>
            <tr key={sg.key} className="border-t border-slate-100 bg-slate-50/40 text-slate-700 font-medium">
              <td className="px-5 py-1.5" colSpan={2}>{sg.label}</td>
              <td className="px-5 py-1.5 text-right tabular-nums">{fmtSigned(sg.total)}</td>
              <td className="px-5 py-1.5 text-right tabular-nums text-slate-500">{pctFn(sg.total)}</td>
            </tr>
            {sg.accounts.map((a, i) => (
              <tr key={`${a.code}:${i}`} className="text-slate-600">
                <td className="px-5 py-1 text-[11px] text-slate-400 font-mono">{a.code}</td>
                <td className="px-5 py-1">{a.name}</td>
                <td className="px-5 py-1 text-right tabular-nums">{fmtSigned(a.balance)}</td>
                <td className="px-5 py-1 text-right tabular-nums text-slate-400 text-[11px]">{pctFn(a.balance)}</td>
              </tr>
            ))}
          </>
        );
      })}
    </>
  );
}

function SubtotalRow({
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
    tone === 'negative' ? 'text-rose-600' : tone === 'positive' ? 'text-emerald-600' : 'text-slate-800';
  const Icon = tone === 'negative' ? TrendingDown : tone === 'positive' ? TrendingUp : null;
  return (
    <tr className="border-t-2 border-slate-200 bg-slate-100 font-bold">
      <td className="px-5 py-2.5" colSpan={2}>
        <span className="inline-flex items-center gap-2">
          {Icon && <Icon size={14} />}
          {label}
        </span>
      </td>
      <td className={`px-5 py-2.5 text-right tabular-nums ${toneClass}`}>{fmtSigned(value)}</td>
      <td className={`px-5 py-2.5 text-right tabular-nums ${toneClass}`}>{pctStr}</td>
    </tr>
  );
}
