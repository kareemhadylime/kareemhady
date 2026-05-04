import Link from 'next/link';
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { ContractCard } from './_components/contract-card';
import { ProjectsToolbar } from './_components/projects-toolbar';

export const dynamic = 'force-dynamic';

interface ProjectsPageProps {
  searchParams: Promise<{ q?: string; service?: string }>;
}

const SERVICE_VALUES: ServiceLine[] = [
  'hk', 'mep', 'landscape', 'security', 'pest_ctrl', 'waste_mgmt', 'back_office',
];

export default async function ProjectsPage(props: ProjectsPageProps) {
  const sp = await props.searchParams;
  const user = await requireBudgetView();

  const service_line = SERVICE_VALUES.includes(sp.service as ServiceLine)
    ? (sp.service as ServiceLine) : undefined;

  const cards = await buildPortfolio({ q: sp.q, service_line });

  // Action-needed: contracts with Odoo actuals but no published years yet,
  // OR multi-year contracts where the latest year is still draft.
  // Cheap derivation from existing card data:
  const actionNeeded = cards
    .filter(c => c.current_year_status === 'draft')
    .map(c => ({
      contract_id: c.contract_id,
      project_name: c.project_name,
      reason: c.current_year_index === 0
        ? 'No year created yet — start with Y1'
        : `Y${c.current_year_index} is still draft — review & publish`,
    }));

  // Also surface analytic accounts that have move-line activity but NO contract.
  // Skipped for now (deferred to a Task 17.x — would query odoo_move_line_analytics).

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {user.is_admin && (
          <Link
            href="/fmplus/financial/budget/projects/new"
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold flex items-center gap-1"
          >
            + New Contract
          </Link>
        )}
      </div>

      <ProjectsToolbar
        currentSearch={{ q: sp.q ?? '', service: service_line ?? '' }}
      />

      {cards.length === 0 ? (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-12 text-center">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">No contracts yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {sp.q || service_line
              ? 'No matches for current filters. Try clearing them.'
              : 'Use the + New Contract button (admin) to seed the first project.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map(c => <ContractCard key={c.contract_id} card={c} />)}
        </div>
      )}

      {actionNeeded.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
          <strong className="text-sm text-slate-900 dark:text-slate-100">&#9888; Action needed ({actionNeeded.length})</strong>
          <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {actionNeeded.slice(0, 5).map(a => (
              <li key={a.contract_id}>
                <Link
                  href={`/fmplus/financial/budget/edit?contract=${a.contract_id}`}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  {a.project_name}
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
