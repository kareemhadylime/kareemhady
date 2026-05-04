import Link from 'next/link';
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { AnomalyBanner } from './_components/anomaly-banner';

export const dynamic = 'force-dynamic';

interface OverviewPageProps {
  searchParams: Promise<{ service?: string }>;
}

const SERVICE_VALUES: ServiceLine[] = ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];

export default async function OverviewPage(props: OverviewPageProps) {
  const sp = await props.searchParams;
  await requireBudgetView();

  const serviceLine = SERVICE_VALUES.includes(sp.service as ServiceLine)
    ? (sp.service as ServiceLine) : undefined;

  const cards = await buildPortfolio({ service_line: serviceLine });

  // Compute health for each card by running variance — best-effort, in parallel
  type CardWithHealth = (typeof cards)[number] & { ytd_budget: number; ytd_actual: number; gm_pct: number | null; var_pct: number | null };
  const enriched: CardWithHealth[] = await Promise.all(cards.map(async c => {
    if (c.current_year_index === 0) {
      return { ...c, ytd_budget: 0, ytd_actual: 0, gm_pct: null, var_pct: null };
    }
    try {
      const r = await buildBudgetVarianceV2({
        contractId: c.contract_id,
        yearIndex: c.current_year_index,
        scenario: 'initial',
        serviceLine,
      });
      const gm = r.total_budget > 0
        ? ((c.current_year_revenue - r.total_budget) / Math.max(c.current_year_revenue, 1)) * 100
        : null;
      let health: 'green' | 'amber' | 'red' = 'green';
      if (r.total_variance_pct != null) {
        const pct = r.total_variance_pct * 100;
        if (Math.abs(pct) <= 5) health = 'green';
        else if (pct > 15) health = 'red';
        else health = 'amber';
      }
      return {
        ...c,
        health,
        ytd_budget: r.total_budget,
        ytd_actual: r.total_actual,
        gm_pct: gm,
        var_pct: r.total_variance_pct,
      };
    } catch {
      return { ...c, ytd_budget: 0, ytd_actual: 0, gm_pct: null, var_pct: null };
    }
  }));

  // KPI tiles (portfolio-level rollup)
  const totalBudget = enriched.reduce((a, c) => a + c.ytd_budget, 0);
  const totalActual = enriched.reduce((a, c) => a + c.ytd_actual, 0);
  const portfolioVariancePct = totalBudget > 0 ? ((totalActual - totalBudget) / totalBudget) : null;
  const projectsBudgeted = enriched.filter(c => c.current_year_index > 0).length;

  // Anomalies: top 3 worst-variance projects this year
  const anomalies = [...enriched]
    .filter(c => c.var_pct != null && c.var_pct * 100 > 15)
    .sort((a, b) => (b.var_pct ?? 0) - (a.var_pct ?? 0))
    .slice(0, 3);

  // Action-needed: contracts in scope (have Odoo activity) but no published year
  const actionNeeded = enriched
    .filter(c => c.current_year_status === 'draft' && c.current_year_index > 0)
    .map(c => ({
      contract_id: c.contract_id,
      name: c.project_name,
      reason: 'latest year still draft — review & publish',
    }));

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-base font-semibold text-text-primary">Overview</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Portfolio rollup across all FMPLUS contracts{serviceLine ? ` · filtered to ${serviceLine.toUpperCase()}` : ''}
        </p>
      </header>

      {/* Service-line filter */}
      <div className="flex gap-1.5 flex-wrap text-xs">
        <Link href="?"
          className={`px-3 py-1 rounded-full font-semibold ${
            !serviceLine ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary border border-border hover:text-text-primary'
          }`}>
          All
        </Link>
        {SERVICE_VALUES.map(sl => (
          <Link key={sl} href={`?service=${sl}`}
            className={`px-3 py-1 rounded-full font-semibold ${
              sl === serviceLine ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary border border-border hover:text-text-primary'
            }`}>
            {sl.toUpperCase()}
          </Link>
        ))}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Projects Budgeted" value={projectsBudgeted.toString()} />
        <Tile label="YTD Budget" value={`${(totalBudget / 1_000_000).toFixed(2)} M`} />
        <Tile label="YTD Actual" value={`${(totalActual / 1_000_000).toFixed(2)} M`} />
        <Tile label="Portfolio Variance %" value={portfolioVariancePct != null ? `${(portfolioVariancePct * 100).toFixed(1)}%` : '—'}
          color={
            portfolioVariancePct == null ? undefined :
            Math.abs(portfolioVariancePct * 100) <= 5 ? 'text-green-400' :
            (portfolioVariancePct * 100) > 15 ? 'text-red-400' : 'text-amber-400'
          } />
      </div>

      <AnomalyBanner anomalies={anomalies} />

      {/* Project table */}
      {enriched.length === 0 ? (
        <div className="border border-border rounded-lg p-6 text-xs text-text-secondary italic text-center">
          No contracts. <Link href="/fmplus/financial/budget/projects/new" className="text-accent">Create a contract</Link>.
        </div>
      ) : (
        <div className="bg-bg-tertiary border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg-secondary border-b border-border text-[10px] text-text-secondary uppercase">
                  <th className="px-3 py-2 text-left">Project</th>
                  <th className="px-2 py-2 text-left">Year</th>
                  <th className="px-2 py-2 text-right">Budget YTD</th>
                  <th className="px-2 py-2 text-right">Actual YTD</th>
                  <th className="px-2 py-2 text-right">Variance %</th>
                  <th className="px-2 py-2 text-right">GM %</th>
                  <th className="px-2 py-2 text-center">Health</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(c => (
                  <tr key={c.contract_id} className="border-b border-border hover:bg-bg-tertiary/40">
                    <td className="px-3 py-1.5">
                      <Link href={`/fmplus/financial/budget/variance?contract=${c.contract_id}&year=${c.current_year_index || 1}`}
                        className="text-accent hover:underline font-medium">
                        {c.project_name}
                      </Link>
                      {c.customer && <div className="text-[10px] text-text-secondary">{c.customer}</div>}
                    </td>
                    <td className="px-2 py-1.5">{c.current_year_label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.ytd_budget > 0 ? (c.ytd_budget / 1_000_000).toFixed(2) + ' M' : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.ytd_actual > 0 ? (c.ytd_actual / 1_000_000).toFixed(2) + ' M' : '—'}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${
                      c.var_pct == null ? '' :
                      Math.abs(c.var_pct * 100) <= 5 ? 'text-green-400' :
                      (c.var_pct * 100) > 15 ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {c.var_pct != null ? `${(c.var_pct * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.gm_pct != null ? `${c.gm_pct.toFixed(1)}%` : '—'}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        c.health === 'green' ? 'bg-green-500' :
                        c.health === 'amber' ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={c.current_year_status === 'published' ? 'text-green-400' : 'text-amber-400'}>
                        {c.current_year_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action needed */}
      {actionNeeded.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
          <strong className="text-sm text-text-primary">Action needed ({actionNeeded.length})</strong>
          <ul className="mt-2 space-y-1 text-xs text-text-secondary">
            {actionNeeded.slice(0, 5).map(a => (
              <li key={a.contract_id}>
                <Link href={`/fmplus/financial/budget/edit?contract=${a.contract_id}`}
                  className="text-accent hover:underline font-medium">
                  {a.name}
                </Link>
                {' '}— {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-tertiary border border-border rounded p-3">
      <div className="text-[10px] text-text-secondary uppercase">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${color ?? 'text-text-primary'}`}>{value}</div>
    </div>
  );
}
