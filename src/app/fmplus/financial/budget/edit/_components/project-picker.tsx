// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
import Link from 'next/link';
import type { Scenario } from '@/lib/fmplus/budget/schema';

export function ProjectPicker({
  projects, year, scenario,
}: {
  projects: Array<{ id: number; name: string; odoo_analytic_plans: { name: string } }>;
  year: number; scenario: Scenario;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Pick a project</h2>
      <p className="text-sm text-slate-500">Each project = one Odoo analytic account. Multi-service projects (e.g. R3) carry one segment per service line.</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {projects.map(p => (
          <li key={p.id}>
            <Link href={`/fmplus/financial/budget/edit?project=${p.id}&year=${year}&scenario=${scenario}`}
                  className="block p-3 border border-slate-200 dark:border-slate-700 rounded hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-slate-500">{p.odoo_analytic_plans.name}</div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
