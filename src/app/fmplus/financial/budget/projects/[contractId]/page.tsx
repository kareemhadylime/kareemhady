import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { EditContractForm } from './_components/edit-contract-form';

export const dynamic = 'force-dynamic';

interface ContractDetailProps {
  params: Promise<{ contractId: string }>;
}

const ALL_SERVICES: ServiceLine[] = [
  'hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office',
];

export default async function ContractDetailPage(props: ContractDetailProps) {
  const { contractId: rawId } = await props.params;
  const user = await requireBudgetView();
  const contractId = Number(rawId);

  if (!Number.isFinite(contractId) || contractId <= 0) notFound();

  const sb = budgetDb();
  const { data: contract } = await sb.from(TABLES.contracts)
    .select(`
      *,
      project_services ( service_line ),
      project_years ( year_index, scenario, status )
    `)
    .eq('id', contractId)
    .single();

  if (!contract) notFound();

  const services: ServiceLine[] = ((contract as any).project_services ?? []).map((s: any) => s.service_line);
  const availableServices = ALL_SERVICES.filter(s => !services.includes(s));
  const initialYears = (((contract as any).project_years ?? []) as any[])
    .filter(y => y.scenario === 'initial')
    .sort((a: any, b: any) => a.year_index - b.year_index);
  const publishedYears = initialYears.filter((y: any) => y.status === 'published').length;

  // Get analytic account info
  const { data: analyticAccount } = await sb.from('odoo_analytic_accounts')
    .select('id, name, code, plan_name')
    .eq('id', (contract as any).project_id)
    .single();

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <Link href="/fmplus/financial/budget/projects"
          className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1 mb-2">
          <ArrowLeft size={11} /> Project Hub
        </Link>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {(contract as any).name}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Edit contract metadata, manage service lines, or delete the entire contract.
          {!user.is_admin && <span className="ml-1 text-amber-600 dark:text-amber-400">View-only — admin role required.</span>}
        </p>
      </header>

      {/* Read-only header strip */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Odoo project</div>
            <div className="font-medium text-slate-900 dark:text-slate-100 truncate" title={analyticAccount?.name}>
              {analyticAccount?.name ?? `#${(contract as any).project_id}`}
            </div>
            {analyticAccount?.code && (
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{analyticAccount.code}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Years</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{initialYears.length}</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              {publishedYears} published · {initialYears.length - publishedYears} draft
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Services</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{services.length}</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">{services.map((s: ServiceLine) => s.toUpperCase()).join(', ')}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Duration</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{(contract as any).duration_months} mo</div>
          </div>
        </div>
      </section>

      <EditContractForm
        contract={{
          id: (contract as any).id,
          name: (contract as any).name,
          customer: (contract as any).customer,
          start_date: String((contract as any).start_date).slice(0, 10),
          end_date: String((contract as any).end_date).slice(0, 10),
          contract_value: Number((contract as any).contract_value),
          vat_pct: Number((contract as any).vat_pct),
          year_tracking: (contract as any).year_tracking,
          zones: Array.isArray((contract as any).zones) ? (contract as any).zones : [],
          notes: (contract as any).notes,
        }}
        services={services}
        availableServices={availableServices}
        canEdit={Boolean(user.is_admin)}
        hasYears={initialYears.length > 0}
      />
    </div>
  );
}
