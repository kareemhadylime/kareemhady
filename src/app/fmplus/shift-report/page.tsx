import Link from 'next/link';
import { ClipboardList, ChevronRight, FileText } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { FmplusHero } from '../_components/fmplus-hero';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ContractRow {
  id:       number;
  name:     string;
  customer: string | null;
}

export default async function ShiftReportLandingPage() {
  const sb = supabaseAdmin();
  const { data: contracts } = await sb
    .from('project_contracts')
    .select('id, name, customer')
    .order('name');

  const rows = (contracts ?? []) as ContractRow[];

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="hover:text-fmplus-gold">FMPLUS</Link>
        <span className="text-slate-400">/</span>
        <span>Shift Reports</span>
      </TopNav>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 flex-1">
        <FmplusHero
          eyebrow="FMPLUS · OPERATIONS"
          title="Shift Reports"
          subtitle="تقارير الوردية اليومية — أمن، نظافة، بيست كنترول، لاندسكيب. Daily morning &amp; night shift reports with auto-WhatsApp delivery."
          icon={ClipboardList}
        />

        {rows.length === 0 ? (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-12 text-center">
            <FileText size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">No projects yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create a project in{' '}
              <Link href="/fmplus/financial/budget/projects" className="text-fmplus-gold hover:underline">
                Project Hub
              </Link>{' '}
              first, then come back to set up daily shift reports.
            </p>
          </div>
        ) : (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select a Project</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pick a project to fill today&apos;s shift report or review history.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rows.map((c) => (
                <Link
                  key={c.id}
                  href={`/fmplus/shift-report/${c.id}`}
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
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
