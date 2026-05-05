import Link from 'next/link';
import { FileText, ChevronRight } from 'lucide-react';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ContractRow {
  id: number;
  name: string;
  customer: string | null;
  start_date: string;
  end_date: string;
  contract_value: number;
}

export default async function ReportLandingPage() {
  await requireBudgetView();

  const sb = supabaseAdmin();
  const { data: contracts } = await sb
    .from('project_contracts')
    .select('id, name, customer, start_date, end_date, contract_value')
    .order('name');

  const rows = (contracts ?? []) as ContractRow[];

  if (rows.length === 0) {
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-12 text-center">
        <FileText size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">No contracts yet</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Create a contract from{' '}
          <Link href="/fmplus/financial/budget/projects" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            Project Hub
          </Link>{' '}
          to generate a report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select a Contract</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Choose a project to view its on-screen report or export a PDF.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((c) => {
          const startYear = new Date(c.start_date).getFullYear();
          const endYear = new Date(c.end_date).getFullYear();
          const valueM = (c.contract_value / 1_000_000).toFixed(2);

          return (
            <Link
              key={c.id}
              href={`/fmplus/financial/budget/report/${c.id}`}
              className="group block border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-fmplus-gold/50 hover:bg-fmplus-yellow/5 dark:hover:bg-fmplus-gold/5 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-serif truncate group-hover:text-fmplus-gold dark:group-hover:text-fmplus-yellow transition-colors">
                    {c.name}
                  </h3>
                  {c.customer && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{c.customer}</p>
                  )}
                </div>
                <ChevronRight size={14} className="text-slate-400 dark:text-slate-600 shrink-0 mt-0.5 group-hover:text-fmplus-gold dark:group-hover:text-fmplus-yellow transition-colors" />
              </div>

              <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                <span>{startYear}–{endYear}</span>
                <span>·</span>
                <span className="text-fmplus-gold dark:text-fmplus-yellow font-medium">{valueM} M EGP</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
