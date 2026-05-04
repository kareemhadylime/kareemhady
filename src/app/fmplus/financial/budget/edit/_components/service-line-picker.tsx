// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
import Link from 'next/link';
import { SERVICE_LINE_CATALOG } from '@/lib/fmplus/budget/templates';
import type { Scenario } from '@/lib/fmplus/budget/schema';

export function ServiceLinePicker({ projectId, projectName, year, scenario }: {
  projectId: number; projectName: string; year: number; scenario: Scenario;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{projectName} — pick service line</h2>
      <p className="text-sm text-slate-500">A project can carry one or more service lines; each gets its own segment in the budget.</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {SERVICE_LINE_CATALOG.map(sl => (
          <li key={sl.code}>
            <Link href={`/fmplus/financial/budget/edit?project=${projectId}&year=${year}&scenario=${scenario}&service_line=${sl.code}`}
                  className={`block p-3 border rounded ${sl.template_status === 'ready' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 hover:border-amber-600' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{sl.label}</div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sl.template_status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {sl.template_status === 'ready' ? 'Ready' : 'Stub'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{sl.odoo_plan_hint}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
