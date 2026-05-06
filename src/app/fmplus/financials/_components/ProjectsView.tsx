import Link from 'next/link';
import { TrendingUp, DollarSign, Percent, AlertTriangle, ArrowRight, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FmplusProjectRankings, ProjectRanking } from '@/lib/fmplus/project-rankings';

const fmt = (n: number): string => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return Math.round(v).toLocaleString();
};
const fmtPct = (n: number | null): string => {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
};

type BuildHref = (overrides?: Partial<Record<string, string | undefined>>) => string;

type Tone = 'emerald' | 'indigo' | 'amber' | 'rose';
const TONE: Record<Tone, {
  iconBg: string;
  iconText: string;
  gradFrom: string;
  gradTo: string;
  badge: string;
}> = {
  emerald: { iconBg: 'bg-emerald-50 dark:bg-emerald-950', iconText: 'text-emerald-700 dark:text-emerald-300', gradFrom: 'from-emerald-400', gradTo: 'to-emerald-600', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  indigo:  { iconBg: 'bg-indigo-50 dark:bg-indigo-950',   iconText: 'text-indigo-700 dark:text-indigo-300',   gradFrom: 'from-indigo-400',  gradTo: 'to-indigo-600',  badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' },
  amber:   { iconBg: 'bg-amber-50 dark:bg-amber-950',     iconText: 'text-amber-700 dark:text-amber-300',     gradFrom: 'from-amber-400',   gradTo: 'to-amber-600',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  rose:    { iconBg: 'bg-rose-50 dark:bg-rose-950',       iconText: 'text-rose-700 dark:text-rose-300',       gradFrom: 'from-rose-400',    gradTo: 'to-rose-600',    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
};

export function ProjectsView({
  rankings,
  buildHref,
  selectedPlanSlug,
}: {
  rankings: FmplusProjectRankings;
  buildHref: BuildHref;
  selectedPlanSlug: string | null;
}) {
  const sectionContext = selectedPlanSlug
    ? `under ${selectedPlanSlug.toUpperCase()} Projects`
    : 'across all FMPLUS service lines';

  if (rankings.totalProjects === 0) {
    return (
      <section className="ix-card p-10 text-center">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-slate-50 dark:bg-slate-900 mb-3">
          <Building2 size={22} className="text-slate-400 dark:text-slate-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No project activity in this period</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {selectedPlanSlug
            ? `No projects under ${selectedPlanSlug.toUpperCase()} Projects had revenue or COGS in the selected period.`
            : 'Try a wider period or a different service line.'}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3">
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          Showing {rankings.totalProjects} active project{rankings.totalProjects === 1 ? '' : 's'} {sectionContext}.
          Click any project to filter the P&amp;L for it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankingCard
          title="Top Revenue"
          subtitle="Highest invoiced revenue this period"
          Icon={DollarSign}
          tone="emerald"
          rows={rankings.topRevenue}
          metric="revenue"
          buildHref={buildHref}
        />
        <RankingCard
          title="Best by Gross Profit"
          subtitle="Highest absolute GP — Revenue − COGS"
          Icon={TrendingUp}
          tone="indigo"
          rows={rankings.bestByGp}
          metric="gp"
          buildHref={buildHref}
        />
        <RankingCard
          title="Best by Margin %"
          subtitle="Highest GP/Revenue ratio (revenue ≥ 1k)"
          Icon={Percent}
          tone="amber"
          rows={rankings.bestByMargin}
          metric="margin"
          buildHref={buildHref}
        />
        <RankingCard
          title="Worst by Margin %"
          subtitle="Lowest GP/Revenue — review pricing or cost overruns"
          Icon={AlertTriangle}
          tone="rose"
          rows={rankings.worstByMargin}
          metric="margin"
          buildHref={buildHref}
        />
      </div>
    </div>
  );
}

function RankingCard({
  title,
  subtitle,
  Icon,
  tone,
  rows,
  metric,
  buildHref,
}: {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  tone: Tone;
  rows: ProjectRanking[];
  metric: 'revenue' | 'gp' | 'margin';
  buildHref: BuildHref;
}) {
  const t = TONE[tone];

  return (
    <section className="group relative ix-card p-5 overflow-hidden">
      <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-br ${t.gradFrom} ${t.gradTo} opacity-[0.08] blur-2xl pointer-events-none`} />

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ${t.iconBg}`}>
            <Icon size={20} strokeWidth={2.2} className={t.iconText} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${t.badge}`}>
          Top {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm italic">
          No data for this period.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <th className="text-left font-medium pb-2 w-6">#</th>
              <th className="text-left font-medium pb-2">Project</th>
              <th className="text-right font-medium pb-2 w-[70px]">Revenue</th>
              <th className="text-right font-medium pb-2 w-[60px]">GP</th>
              <th className="text-right font-medium pb-2 w-[55px]">Margin</th>
              <th className="w-4 pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const planSlugForLink = r.plan_slug ?? '';
              const href = buildHref({
                view: 'pnl',
                plan: planSlugForLink,
                account: String(r.analytic_account_id),
                accounts: '',
                multi: '',
              });
              const highlighted =
                metric === 'revenue' ? 'revenue' :
                metric === 'gp' ? 'gp' :
                'margin';
              return (
                <tr
                  key={r.analytic_account_id}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 group/row"
                >
                  <td className="py-2 text-[11px] text-slate-400 dark:text-slate-500 font-medium tabular-nums">{i + 1}</td>
                  <td className="py-2 truncate max-w-[180px]">
                    <Link
                      href={href}
                      className="text-slate-800 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-300 truncate block"
                      title={r.name}
                    >
                      {r.name}
                    </Link>
                    {r.plan_name && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate">{r.plan_name}</span>
                    )}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${highlighted === 'revenue' ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
                    {fmt(r.revenue)}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${
                    highlighted === 'gp' ? 'font-semibold' : ''
                  } ${r.gross_profit < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                    {fmt(r.gross_profit)}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${
                    highlighted === 'margin' ? 'font-semibold' : ''
                  } ${
                    r.margin_pct == null ? 'text-slate-400 dark:text-slate-500' :
                    r.margin_pct >= 20 ? 'text-emerald-600 dark:text-emerald-400' :
                    r.margin_pct >= 5  ? 'text-amber-600 dark:text-amber-400' :
                                         'text-rose-600 dark:text-rose-400'
                  }`}>
                    {fmtPct(r.margin_pct)}
                  </td>
                  <td className="py-2 text-right">
                    <ArrowRight size={12} className="text-slate-300 dark:text-slate-600 opacity-0 group-hover/row:opacity-100 transition" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
