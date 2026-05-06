import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildProjectReport } from '@/lib/fmplus/budget/report/build-report';
import { loadAllYearsForContract } from '@/lib/fmplus/budget/report/build-report';
import { OnScreenReport } from '@/lib/fmplus/budget/report/on-screen/on-screen-report';
import { ReportModeToggle } from './_components/report-mode-toggle';
import { ReportYearPicker } from './_components/report-year-picker';
import { ReportExportDialog } from './_components/report-export-dialog';
import type { ReportMode, ReportLang } from '@/lib/fmplus/budget/report/types';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

const VALID_MODES: ReportMode[] = ['pre', 'signoff', 'customer', 'snapshot'];
const VALID_LANGS: ReportLang[] = ['en', 'ar', 'both'];

interface ReportContractPageProps {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ mode?: string; year?: string; lang?: string }>;
}

export default async function ReportContractPage(props: ReportContractPageProps) {
  const { contractId: rawId } = await props.params;
  const sp = await props.searchParams;
  const user = await requireBudgetView();

  const contractId = Number(rawId);
  if (!Number.isFinite(contractId) || contractId <= 0) notFound();

  // Resolve mode + lang from URL (with safe defaults)
  const mode: ReportMode = VALID_MODES.includes(sp.mode as ReportMode)
    ? (sp.mode as ReportMode)
    : 'signoff';

  const lang: ReportLang = VALID_LANGS.includes(sp.lang as ReportLang)
    ? (sp.lang as ReportLang)
    : 'en';

  // Load all years to populate the year picker
  let allYears;
  try {
    allYears = await loadAllYearsForContract(contractId);
  } catch {
    notFound();
  }

  if (allYears.length === 0) {
    return (
      <div className="space-y-4">
        <BackLink contractId={contractId} />
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No years have been created for this contract yet.
          </p>
          <Link
            href={`/fmplus/financial/budget/edit?contract=${contractId}`}
            className="mt-3 inline-block text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Go to Editor to create Y1 →
          </Link>
        </div>
      </div>
    );
  }

  // Resolve which year to show
  const yearIdParam = Number(sp.year);
  const targetYear =
    (Number.isFinite(yearIdParam) && allYears.find((y) => y.id === yearIdParam)) ||
    allYears[0];

  if (!targetYear) notFound();

  // Customer-mode + draft gate
  const isDraftCustomer = mode === 'customer' && targetYear.status === 'draft';

  // Build report data
  let data;
  let buildError: string | null = null;
  try {
    data = await buildProjectReport({
      contract_id: contractId,
      year_id: targetYear.id,
      mode,
      lang,
      generated_by: user.username ?? user.id,
    });
  } catch (e) {
    buildError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-4">
      <BackLink contractId={contractId} />

      {/* Toolbar: mode toggle + year picker + export */}
      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<div className="h-8 w-64 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />}>
          <ReportModeToggle current={mode} />
        </Suspense>

        <Suspense fallback={null}>
          <ReportYearPicker years={allYears} currentYearId={targetYear.id} />
        </Suspense>

        <div className="ml-auto">
          <ReportExportDialog
            contractId={contractId}
            yearId={targetYear.id}
            contractName={data?.meta.contract.name ?? `Contract ${contractId}`}
            yearIndex={targetYear.year_index}
            scenario={targetYear.scenario}
            mode={mode}
            isDraftCustomer={isDraftCustomer}
          />
        </div>
      </div>

      {/* Draft + customer warning banner */}
      {isDraftCustomer && (
        <div className="flex items-start gap-2 p-3 border border-amber-500/40 bg-amber-500/8 rounded-lg">
          <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Customer-facing report requires year status = published.</strong>
            {' '}Publish this year in the Editor first, then return to export the PDF.
          </p>
        </div>
      )}

      {/* Error state */}
      {buildError && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
          <strong className="text-sm text-slate-900 dark:text-slate-100">Could not build report</strong>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{buildError}</p>
        </div>
      )}

      {/* Report body */}
      {data && !buildError && (
        <OnScreenReport data={data} />
      )}
    </div>
  );
}

function BackLink({ contractId }: { contractId: number }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/fmplus/financial/budget/report"
        className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1"
      >
        <ArrowLeft size={11} /> All Contracts
      </Link>
      <span className="text-slate-300 dark:text-slate-600 text-[11px]">/</span>
      <Link
        href={`/fmplus/financial/budget/projects/${contractId}`}
        className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        Project Hub
      </Link>
    </div>
  );
}
