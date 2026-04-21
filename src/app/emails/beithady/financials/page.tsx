import Link from 'next/link';
import {
  ChevronRight,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
  Wrench,
  Home as HomeIcon,
  AlertTriangle,
  RefreshCcw,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildPnlReport,
  buildPayablesReport,
  resolveFinancePeriod,
  PNL_COMPANY_IDS,
  type PnlReport,
  type PayablesReport,
  type PayablePartnerRow,
} from '@/lib/financials-pnl';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FINANCE_PRESETS: Array<{ id: string; label: string }> = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
];

const fmt = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  return Math.round(v).toLocaleString('en-US');
};

const fmtSigned = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  const rounded = Math.round(v);
  return rounded.toLocaleString('en-US');
};

const pct = (num: number, denom: number): string => {
  if (!denom || denom === 0) return '—';
  return `${((num / denom) * 100).toFixed(1)}%`;
};

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    month?: string;
  }>;
}) {
  const sp = await searchParams;
  // month=YYYY-MM shortcut → use preset=month:YYYY-MM
  const preset = sp.month ? `month:${sp.month}` : sp.preset || 'last_month';
  const period = resolveFinancePeriod(preset, sp.from, sp.to);

  const [pnl, payables, latestSync] = await Promise.all([
    buildPnlReport({
      fromDate: period.fromDate,
      toDate: period.toDate,
      label: period.label,
    }),
    buildPayablesReport({ asOf: period.toDate }),
    getLatestSync(),
  ]);

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">
          Emails
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/beithady" className="ix-link">
          BEITHADY
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Financials</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              BEITHADY · Financials
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Consolidated P&amp;L
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Beithady Hospitality Egypt + FZCO Dubai. Intercompany already
              eliminated at source.
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-1">
            {latestSync ? (
              <>
                <p className="flex items-center gap-1.5 justify-end">
                  <RefreshCcw size={12} />
                  Synced {fmtCairoDateTime(latestSync.finished_at)}
                </p>
                <p className="text-[11px]">
                  {latestSync.move_lines_synced?.toLocaleString() || 0} lines ·{' '}
                  {latestSync.accounts_synced?.toLocaleString() || 0} accounts ·{' '}
                  {latestSync.partners_synced?.toLocaleString() || 0} partners
                </p>
              </>
            ) : (
              <p>No sync yet.</p>
            )}
          </div>
        </header>

        <PeriodFilter activeId={period.id} fromDefault={period.fromDate} toDefault={period.toDate} />

        <PnlSection pnl={pnl} />

        <PayablesBlock payables={payables} />

        {pnl.unclassified.length > 0 && <UnclassifiedPanel pnl={pnl} />}

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          {pnl.line_count.toLocaleString()} move lines aggregated for{' '}
          {period.label}. Companies: {PNL_COMPANY_IDS.join(', ')}. Amounts in
          company currency (EGP), converted at Odoo's weekly FX rate.
        </footer>
      </main>
    </>
  );
}

function PeriodFilter({
  activeId,
  fromDefault,
  toDefault,
}: {
  activeId: string;
  fromDefault: string;
  toDefault: string;
}) {
  // Build "last 12 months" list for a month dropdown.
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
        {FINANCE_PRESETS.map(p => {
          const href = `?preset=${p.id}`;
          const active = activeId === p.id;
          return (
            <Link
              key={p.id}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">
            Specific month
          </span>
          <form className="flex gap-2 items-center" action="" method="get">
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
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Go
            </button>
          </form>
        </label>

        <form className="flex items-end gap-2" action="" method="get">
          <input type="hidden" name="preset" value="custom" />
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700">From</span>
            <input
              type="date"
              name="from"
              defaultValue={fromDefault}
              className="ix-input w-[160px]"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700">To</span>
            <input
              type="date"
              name="to"
              defaultValue={toDefault}
              className="ix-input w-[160px]"
            />
          </label>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Apply
          </button>
        </form>
      </div>
    </section>
  );
}

function PnlSection({ pnl }: { pnl: PnlReport }) {
  const t = pnl.totals;
  const rev = t.revenue || 1; // avoid /0 in %
  const toPctOfRev = (x: number) => pct(x, rev);

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Profit &amp; Loss · {pnl.period.label}
          </h2>
          <p className="text-xs text-slate-500">
            Consolidated Beithady Egypt + FZCO Dubai. Draft entries included.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Net Profit</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              t.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
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
            <SectionRows
              section={pnl.sections.revenue}
              emphasis="revenue"
              totalPct={toPctOfRev}
            />
            <SectionRows
              section={pnl.sections.cost_of_revenue}
              emphasis="expense"
              totalPct={toPctOfRev}
            />
            <SubtotalRow
              label="Sub Gross Profit"
              value={t.sub_gross_profit}
              pct={toPctOfRev(t.sub_gross_profit)}
              tone="neutral"
            />
            <SectionRows
              section={pnl.sections.home_owner_cut}
              emphasis="expense"
              totalPct={toPctOfRev}
            />
            <SubtotalRow
              label="Gross Profit"
              value={t.gross_profit}
              pct={toPctOfRev(t.gross_profit)}
              tone={t.gross_profit < 0 ? 'negative' : 'positive'}
            />
            <SectionRows
              section={pnl.sections.general_expenses}
              emphasis="expense"
              totalPct={toPctOfRev}
            />
            <SubtotalRow
              label="EBITDA"
              value={t.ebitda}
              pct={toPctOfRev(t.ebitda)}
              tone={t.ebitda < 0 ? 'negative' : 'positive'}
            />
            <SectionRows
              section={pnl.sections.interest_tax_dep}
              emphasis="expense"
              totalPct={toPctOfRev}
            />
            <tr className="bg-slate-900 text-white font-bold">
              <td colSpan={2} className="px-5 py-3 text-base">
                Net Profit
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-base">
                {fmtSigned(t.net_profit)}
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-base">
                {toPctOfRev(t.net_profit)}
              </td>
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
  totalPct,
}: {
  section: PnlReport['sections'][keyof PnlReport['sections']];
  emphasis: 'revenue' | 'expense';
  totalPct: (n: number) => string;
}) {
  const headerTone =
    emphasis === 'revenue' ? 'text-emerald-700 bg-emerald-50/60' : 'text-slate-800 bg-slate-50';
  return (
    <>
      <tr className={`${headerTone} font-semibold`}>
        <td className="px-5 py-2" colSpan={2}>
          {section.label}
        </td>
        <td className="px-5 py-2 text-right tabular-nums">
          {fmtSigned(section.total)}
        </td>
        <td className="px-5 py-2 text-right tabular-nums">
          {totalPct(section.total)}
        </td>
      </tr>
      {section.subgroups.map(sg => (
        <SubgroupRows key={sg.key} sg={sg} totalPct={totalPct} />
      ))}
    </>
  );
}

function SubgroupRows({
  sg,
  totalPct,
}: {
  sg: PnlReport['sections'][keyof PnlReport['sections']]['subgroups'][number];
  totalPct: (n: number) => string;
}) {
  if (sg.total === 0 && sg.accounts.length === 0) return null;
  return (
    <>
      <tr className="border-t border-slate-100 bg-slate-50/40 text-slate-700 font-medium">
        <td className="px-5 py-1.5" colSpan={2}>
          <span className="text-[11px] text-slate-400 mr-2">{sg.key}xxx</span>
          {sg.label}
        </td>
        <td className="px-5 py-1.5 text-right tabular-nums">
          {fmtSigned(sg.total)}
        </td>
        <td className="px-5 py-1.5 text-right tabular-nums text-slate-500">
          {totalPct(sg.total)}
        </td>
      </tr>
      {sg.accounts.map(a => (
        <tr key={a.code} className="text-slate-600">
          <td className="px-5 py-1 text-[11px] text-slate-400 font-mono">
            {a.code}
          </td>
          <td className="px-5 py-1">{a.name}</td>
          <td className="px-5 py-1 text-right tabular-nums">
            {fmtSigned(a.balance)}
          </td>
          <td className="px-5 py-1 text-right tabular-nums text-slate-400 text-[11px]">
            {totalPct(a.balance)}
          </td>
        </tr>
      ))}
    </>
  );
}

function SubtotalRow({
  label,
  value,
  pct,
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
    <tr className="border-t-2 border-slate-200 bg-slate-100 font-bold">
      <td className="px-5 py-2.5" colSpan={2}>
        <span className="inline-flex items-center gap-2">
          {Icon && <Icon size={14} />}
          {label}
        </span>
      </td>
      <td className={`px-5 py-2.5 text-right tabular-nums ${toneClass}`}>
        {fmtSigned(value)}
      </td>
      <td className={`px-5 py-2.5 text-right tabular-nums ${toneClass}`}>
        {pct}
      </td>
    </tr>
  );
}

function PayablesBlock({ payables }: { payables: PayablesReport }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <PayablesCard
        title="Vendors Payables"
        icon={<Wrench size={16} className="text-amber-600" />}
        accent="amber"
        data={payables.vendors}
      />
      <PayablesCard
        title="Employee Payables"
        icon={<Users size={16} className="text-indigo-600" />}
        accent="indigo"
        data={payables.employees}
      />
      <PayablesCard
        title="Owners Payables"
        icon={<HomeIcon size={16} className="text-rose-600" />}
        accent="rose"
        data={payables.owners}
      />
    </section>
  );
}

function PayablesCard({
  title,
  icon,
  accent,
  data,
}: {
  title: string;
  icon: React.ReactNode;
  accent: 'amber' | 'indigo' | 'rose';
  data: { total: number; partners: PayablePartnerRow[] };
}) {
  const tint =
    accent === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : accent === 'indigo'
        ? 'bg-indigo-50 text-indigo-700'
        : 'bg-rose-50 text-rose-700';
  return (
    <div className="ix-card p-5 space-y-3 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${tint}`}>
          {data.partners.length}{' '}
          {data.partners.length === 1 ? 'partner' : 'partners'}
        </span>
      </div>
      <p className="text-3xl font-bold tabular-nums">{fmt(data.total)}</p>
      <div className="text-[11px] text-slate-500">
        Net outstanding (residual amount, company currency)
      </div>
      {data.partners.length === 0 ? (
        <div className="py-4 text-center text-slate-400 text-sm">
          No outstanding balances.
        </div>
      ) : (
        <div className="overflow-y-auto max-h-[360px] -mx-2">
          <table className="w-full text-sm">
            <tbody>
              {data.partners.slice(0, 40).map(p => (
                <tr key={p.partner_id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 truncate max-w-[200px]" title={p.partner_name}>
                    {p.partner_name}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmt(p.amount)}
                  </td>
                </tr>
              ))}
              {data.partners.length > 40 && (
                <tr>
                  <td colSpan={2} className="px-2 py-2 text-center text-[11px] text-slate-400">
                    …and {data.partners.length - 40} more.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnclassifiedPanel({ pnl }: { pnl: PnlReport }) {
  const total = pnl.unclassified.reduce((s, u) => s + u.balance, 0);
  return (
    <section className="ix-card p-5 space-y-3 bg-amber-50/40 border-amber-200">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          Unclassified accounts ({pnl.unclassified.length}) · {fmtSigned(total)}
        </h3>
      </div>
      <p className="text-xs text-amber-700">
        These accounts don't match any known P&amp;L prefix (400xxx–607xxx).
        Either add a prefix rule or verify the account code/type in Odoo.
      </p>
      <div className="max-h-60 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {pnl.unclassified.map(u => (
              <tr key={u.code} className="border-t border-amber-100">
                <td className="px-2 py-1 font-mono text-[11px] text-amber-800">
                  {u.code || '—'}
                </td>
                <td className="px-2 py-1 text-slate-700">{u.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {fmtSigned(u.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function getLatestSync() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('odoo_sync_runs')
    .select(
      'finished_at, status, move_lines_synced, accounts_synced, partners_synced, invoices_synced'
    )
    .eq('status', 'succeeded')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    finished_at: string;
    status: string;
    move_lines_synced: number;
    accounts_synced: number;
    partners_synced: number;
    invoices_synced: number;
  } | null;
}
