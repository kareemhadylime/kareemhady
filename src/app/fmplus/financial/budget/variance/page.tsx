import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { VarianceGrid } from './_components/variance-grid';

export const dynamic = 'force-dynamic';

interface VariancePageProps {
  searchParams: Promise<{
    contract?: string;
    year?: string;
    scenario?: string;
    service?: string;
  }>;
}

const SERVICE_VALUES: ServiceLine[] = ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];

export default async function VariancePage(props: VariancePageProps) {
  const sp = await props.searchParams;
  await requireBudgetView();

  const contractId = Number(sp.contract);
  const yearIndex = Number(sp.year) || 1;

  if (!Number.isFinite(contractId) || contractId <= 0) {
    // No contract — show contract picker
    const sb = budgetDb();
    const { data: contracts } = await sb.from(TABLES.contracts)
      .select('id, name, customer')
      .order('name');
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-text-primary">Variance</h2>
        <div className="border border-border rounded-lg p-6">
          <p className="text-sm text-text-secondary mb-3">
            Pick a contract to view its variance report.
          </p>
          <ul className="space-y-1">
            {(contracts ?? []).map(c => (
              <li key={c.id}>
                <Link href={`/fmplus/financial/budget/variance?contract=${c.id}&year=1`}
                  className="text-accent text-sm hover:underline">
                  {c.name}{(c as any).customer ? ` — ${(c as any).customer}` : ''}
                </Link>
              </li>
            ))}
            {(contracts ?? []).length === 0 && (
              <li className="text-text-secondary text-xs italic">No contracts yet. Create one from Project Hub.</li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  const serviceLine = SERVICE_VALUES.includes(sp.service as ServiceLine)
    ? (sp.service as ServiceLine) : undefined;

  let report: Awaited<ReturnType<typeof buildBudgetVarianceV2>> | undefined;
  let error: string | null = null;
  try {
    report = await buildBudgetVarianceV2({
      contractId,
      yearIndex,
      scenario: (sp.scenario as 'initial' | 'revised' | 'reforecast') ?? 'initial',
      serviceLine,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !report) {
    return (
      <div className="space-y-4">
        <Link href="/fmplus/financial/budget/projects"
          className="text-[11px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
          <ArrowLeft size={11} /> Project Hub
        </Link>
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
          <strong className="text-sm text-text-primary">Could not build variance</strong>
          <p className="text-xs text-text-secondary mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // KPI strip
  const variancePctDisplay = report.total_variance_pct != null
    ? `${(report.total_variance_pct * 100).toFixed(1)}%`
    : '—';
  const varianceColor = report.total_variance_pct == null
    ? 'text-text-primary'
    : Math.abs(report.total_variance_pct * 100) <= 5
      ? 'text-green-400'
      : (report.total_variance_pct * 100) > 15
        ? 'text-red-400'
        : 'text-amber-400';

  return (
    <div className="space-y-4">
      {/* Breadcrumb + header */}
      <header>
        <Link href="/fmplus/financial/budget/projects"
          className="text-[11px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1 mb-1">
          <ArrowLeft size={11} /> Project Hub
        </Link>
        <h2 className="text-sm font-semibold text-text-primary">
          {report.contract_name} <span className="text-text-secondary text-[11px] font-normal ml-1">· Y{report.year_index}{report.fiscal_year ? ` (FY ${report.fiscal_year})` : ''} · {report.scenario}</span>
        </h2>
        <div className="text-[11px] text-text-secondary mt-0.5">
          Status: <span className={report.status === 'published' ? 'text-green-400' : 'text-amber-400'}>{report.status}</span>
          {' · '}
          Generated: {new Date(report.generated_at).toLocaleString()}
        </div>
      </header>

      {/* Export buttons */}
      <div className="flex gap-2">
        <a href={`/api/fmplus/budget/variance-xlsx?contract=${contractId}&year=${report.year_index}&scenario=${report.scenario}${serviceLine ? `&service=${serviceLine}` : ''}`}
          className="text-[11px] px-3 py-1.5 bg-bg-secondary border border-border rounded text-text-primary hover:bg-bg-tertiary inline-flex items-center gap-1">
          📊 XLSX
        </a>
        <a href={`/api/fmplus/budget/variance-pdf?contract=${contractId}&year=${report.year_index}&scenario=${report.scenario}${serviceLine ? `&service=${serviceLine}` : ''}`}
          className="text-[11px] px-3 py-1.5 bg-bg-secondary border border-border rounded text-text-primary hover:bg-bg-tertiary inline-flex items-center gap-1">
          📄 PDF
        </a>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="YTD Budget" value={(report.total_budget / 1_000_000).toFixed(2) + ' M EGP'} />
        <Kpi label="YTD Actual" value={(report.total_actual / 1_000_000).toFixed(2) + ' M EGP'} />
        <Kpi label="Variance" value={((report.total_actual - report.total_budget) / 1_000_000).toFixed(2) + ' M'} color={varianceColor} />
        <Kpi label="Variance %" value={variancePctDisplay} color={varianceColor} />
      </div>

      {/* Year/scenario picker (simple links) */}
      <div className="text-[11px] text-text-secondary flex gap-2 flex-wrap">
        <span>Year:</span>
        {[1,2,3].map(yi => (
          <Link key={yi} href={`?contract=${contractId}&year=${yi}`}
            className={yi === report!.year_index ? 'text-accent font-semibold' : 'hover:text-text-primary'}>
            Y{yi}
          </Link>
        ))}
        <span className="ml-3">Service:</span>
        <Link href={`?contract=${contractId}&year=${report.year_index}`}
          className={!serviceLine ? 'text-accent font-semibold' : 'hover:text-text-primary'}>All</Link>
        {report.segments.map(s => (
          <Link key={s.service_line}
            href={`?contract=${contractId}&year=${report!.year_index}&service=${s.service_line}`}
            className={serviceLine === s.service_line ? 'text-accent font-semibold' : 'hover:text-text-primary'}>
            {s.service_line.toUpperCase()}
          </Link>
        ))}
      </div>

      {/* Per-segment grids */}
      {report.segments.length === 0 ? (
        <div className="border border-border rounded-lg p-4 text-xs text-text-secondary italic">
          No segments to display. Use the Editor to add lines first.
        </div>
      ) : (
        <div className="space-y-4">
          {report.segments.map(seg => (
            <VarianceGrid key={seg.service_line}
              segment={seg}
              contractId={contractId}
              yearIndex={report!.year_index}
              scenario={report!.scenario}
              bilingual={report!.bilingual} />
          ))}
        </div>
      )}

      {/* Unmapped warning */}
      {report.unmapped_actuals > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 text-xs">
          <strong className="text-text-primary">Unmapped actuals: {(report.unmapped_actuals / 1_000_000).toFixed(2)} M EGP</strong>
          <span className="text-text-secondary ml-2">
            Account codes that did not match any template&apos;s account_map_json. Update Settings to capture these.
          </span>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-tertiary border border-border rounded p-3">
      <div className="text-[10px] text-text-secondary uppercase">{label}</div>
      <div className={`text-base font-semibold tabular-nums mt-0.5 ${color ?? 'text-text-primary'}`}>{value}</div>
    </div>
  );
}
