import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { CompareGrid } from './_components/compare-grid';
import { YoyModeToggle } from './_components/yoy-mode-toggle';

export const dynamic = 'force-dynamic';

interface ComparePageProps {
  searchParams: Promise<{
    mode?: string;
    service?: string;
    contract?: string;
  }>;
}

const SERVICE_VALUES: ServiceLine[] = ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];

export default async function ComparePage(props: ComparePageProps) {
  const sp = await props.searchParams;
  await requireBudgetView();
  const sb = budgetDb();

  const mode = sp.mode === 'yoy' ? 'yoy' : 'projects';
  const serviceLine = SERVICE_VALUES.includes(sp.service as ServiceLine)
    ? (sp.service as ServiceLine) : ('hk' as ServiceLine);

  // Load all contracts (with service rows + years count)
  const { data: contracts } = await sb.from(TABLES.contracts)
    .select(`
      id, name, customer,
      project_services!inner(service_line),
      project_years(year_index, scenario)
    `)
    .order('name');

  if (mode === 'yoy') {
    return <YoyView contracts={contracts ?? []} contractIdParam={sp.contract} serviceLine={serviceLine} />;
  }
  return <ProjectsView contracts={contracts ?? []} serviceLine={serviceLine} />;
}

// ----- Cross-project mode -----

async function ProjectsView({ contracts, serviceLine }: { contracts: any[]; serviceLine: ServiceLine }) {
  const matchingContracts = contracts.filter(c =>
    (c.project_services ?? []).some((s: any) => s.service_line === serviceLine)
  );

  // Build variance for each contract's latest initial year
  const rows: Array<{
    contract_id: number;
    contract_name: string;
    customer: string | null;
    year_label: string;
    categoryByCode: Record<string, { variance_pct: number | null; color: 'green'|'amber'|'red' }>;
    overall_variance_pct: number | null;
  }> = [];

  for (const c of matchingContracts) {
    const initialYears = (c.project_years ?? [])
      .filter((y: any) => y.scenario === 'initial')
      .sort((a: any, b: any) => a.year_index - b.year_index);
    const latest = initialYears[initialYears.length - 1];
    if (!latest) continue;
    try {
      const report = await buildBudgetVarianceV2({
        contractId: c.id,
        yearIndex: latest.year_index,
        scenario: 'initial',
        serviceLine,
      });
      const segment = report.segments.find(s => s.service_line === serviceLine);
      const categoryByCode: Record<string, { variance_pct: number | null; color: 'green'|'amber'|'red' }> = {};
      for (const cat of segment?.categories ?? []) {
        categoryByCode[cat.category] = {
          variance_pct: cat.ytd_variance_pct,
          color: cat.ytd_color,
        };
      }
      rows.push({
        contract_id: c.id,
        contract_name: c.name,
        customer: c.customer,
        year_label: `Y${latest.year_index}`,
        categoryByCode,
        overall_variance_pct: segment?.segment_variance_pct ?? null,
      });
    } catch {
      // Skip contracts that fail to compute variance (e.g. missing year data)
    }
  }

  // Build category column list (union across all rows)
  const categories = Array.from(new Set(rows.flatMap(r => Object.keys(r.categoryByCode))));

  return (
    <div className="space-y-4">
      <header>
        <Link href="/fmplus/financial/budget/projects"
          className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1 mb-1">
          <ArrowLeft size={11} /> Project Hub
        </Link>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Compare</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Cross-project variance by category</p>
      </header>

      <YoyModeToggle mode="projects" />

      {/* Service-line filter chips */}
      <div className="flex gap-1.5 flex-wrap text-xs">
        {SERVICE_VALUES.map(sl => (
          <Link key={sl} href={`?mode=projects&service=${sl}`}
            className={`px-3 py-1 rounded-full font-semibold ${
              sl === serviceLine
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700'
            }`}>
            {sl.toUpperCase()}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6 text-xs text-slate-500 dark:text-slate-400 italic text-center">
          No contracts have a {serviceLine.toUpperCase()} segment. Try a different service line, or add the service to a contract.
        </div>
      ) : (
        <CompareGrid mode="projects" rows={rows} categories={categories} serviceLine={serviceLine} />
      )}
    </div>
  );
}

// ----- Year-vs-Year mode -----

async function YoyView({ contracts, contractIdParam, serviceLine }: { contracts: any[]; contractIdParam: string | undefined; serviceLine: ServiceLine }) {
  const eligibleContracts = contracts.filter(c => {
    const initialYears = (c.project_years ?? []).filter((y: any) => y.scenario === 'initial');
    return initialYears.length >= 2;
  });

  const contractId = Number(contractIdParam);
  const targetContract = eligibleContracts.find(c => c.id === contractId) ?? eligibleContracts[0];

  if (!targetContract) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Compare — Year vs Year</h2>
        <YoyModeToggle mode="yoy" />
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6 text-xs text-slate-500 dark:text-slate-400 italic text-center">
          No multi-year contracts available. YoY mode needs ≥2 years on the same contract. Use the Editor&apos;s &quot;Copy year&quot; dialog to create Y2.
        </div>
      </div>
    );
  }

  const initialYears = (targetContract.project_years ?? [])
    .filter((y: any) => y.scenario === 'initial')
    .sort((a: any, b: any) => a.year_index - b.year_index);

  // Build variance per year for the selected contract + service
  const yearReports = await Promise.all(initialYears.map(async (y: any) => {
    try {
      const report = await buildBudgetVarianceV2({
        contractId: targetContract.id,
        yearIndex: y.year_index,
        scenario: 'initial',
        serviceLine,
      });
      const seg = report.segments.find(s => s.service_line === serviceLine);
      return { year_index: y.year_index, segment: seg };
    } catch {
      return { year_index: y.year_index, segment: undefined };
    }
  }));

  const yearLabels = yearReports.map(yr => `Y${yr.year_index}`);
  const categories = Array.from(new Set(
    yearReports.flatMap(yr => yr.segment?.categories.map((cat: any) => cat.category) ?? [])
  ));

  const rows = categories.map(cat => {
    const cells: Record<string, { variance_pct: number | null; color: 'green'|'amber'|'red' }> = {};
    for (const yr of yearReports) {
      const c = yr.segment?.categories.find((catRow: any) => catRow.category === cat);
      if (c) {
        cells[`Y${yr.year_index}`] = {
          variance_pct: c.ytd_variance_pct,
          color: c.ytd_color,
        };
      }
    }
    return {
      contract_id: targetContract.id,
      contract_name: cat as string, // category name in row position for YoY mode
      customer: null,
      year_label: '',
      categoryByCode: cells,
      overall_variance_pct: null,
    };
  });

  return (
    <div className="space-y-4">
      <header>
        <Link href="/fmplus/financial/budget/projects"
          className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1 mb-1">
          <ArrowLeft size={11} /> Project Hub
        </Link>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Compare — Year vs Year</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{targetContract.name} · {serviceLine.toUpperCase()}</p>
      </header>

      <YoyModeToggle mode="yoy" />

      <div className="flex gap-2 flex-wrap text-xs">
        <span className="text-slate-500 dark:text-slate-400">Contract:</span>
        {eligibleContracts.map((c: any) => (
          <Link key={c.id} href={`?mode=yoy&contract=${c.id}&service=${serviceLine}`}
            className={c.id === targetContract.id ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'hover:text-slate-900 dark:hover:text-slate-100'}>
            {c.name}
          </Link>
        ))}
        <span className="ml-3 text-slate-500 dark:text-slate-400">Service:</span>
        {SERVICE_VALUES.map(sl => (
          <Link key={sl} href={`?mode=yoy&contract=${targetContract.id}&service=${sl}`}
            className={sl === serviceLine ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'hover:text-slate-900 dark:hover:text-slate-100'}>
            {sl.toUpperCase()}
          </Link>
        ))}
      </div>

      <CompareGrid mode="yoy" rows={rows} categories={yearLabels} serviceLine={serviceLine} />
    </div>
  );
}
