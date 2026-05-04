import Link from 'next/link';
import { redirect } from 'next/navigation';
import { budgetDb } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { ArrowLeft } from 'lucide-react';
import { createContractAction } from '../actions';

export const dynamic = 'force-dynamic';

interface AnalyticAccountRow {
  id: number;
  name: string;
  code: string | null;
  plan_name: string | null;
}

export default async function NewContractPage() {
  const user = await requireBudgetView();
  if (!user.is_admin) {
    redirect('/fmplus/financial/budget/projects');
  }

  // Pull FMPLUS analytic accounts. company_id=1 = FMPLUS per project CLAUDE.md.
  // Plans = "HK Projects", "MEP Projects", "Security Projects", "Mix Projects" etc.
  const sb = budgetDb();
  const { data: accountsRaw } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name, code, plan_name')
    .eq('company_id', 1)
    .order('name')
    .limit(500);
  const accounts = (accountsRaw ?? []) as AnalyticAccountRow[];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <Link href="/fmplus/financial/budget/projects"
          className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1 mb-3">
          <ArrowLeft size={12} /> Back to Project Hub
        </Link>
        <h2 className="text-base font-semibold text-text-primary">+ New Contract</h2>
        <p className="text-xs text-text-secondary mt-1">
          Creates the contract, Y1 (draft, scenario=initial), and one project_year_services row per service line.
          You can edit revenue, manpower, mobilization, and per-service line items in the Editor afterward.
        </p>
      </header>

      <form action={createContractAction} className="space-y-5 bg-bg-tertiary border border-border rounded-lg p-5">
        {/* 1. Odoo analytic account */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase font-semibold text-text-secondary">1. Odoo project (analytic account)</legend>
          <select name="project_id" required defaultValue=""
            className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5">
            <option value="" disabled>— Pick an FMPLUS analytic account —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}{a.code ? ` (${a.code})` : ''}{a.plan_name ? ` — ${a.plan_name}` : ''}
              </option>
            ))}
          </select>
          {accounts.length === 0 && (
            <p className="text-[11px] text-amber-400">
              No FMPLUS analytic accounts found. Run the Odoo sync first.
            </p>
          )}
        </fieldset>

        {/* 2. Customer / dates / value */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase font-semibold text-text-secondary">2. Contract metadata</legend>

          <label className="block">
            <span className="text-xs text-text-secondary">Contract name <span className="text-red-400">*</span></span>
            <input name="name" required placeholder="e.g. AUC, City Gate Y1, Emaar Uptown 2026"
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1" />
          </label>

          <label className="block">
            <span className="text-xs text-text-secondary">Customer</span>
            <input name="customer" placeholder="e.g. AUC, SODIC, Emaar Misr"
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-text-secondary">Start date <span className="text-red-400">*</span></span>
              <input name="start_date" type="date" required
                className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1" />
            </label>
            <label className="block">
              <span className="text-xs text-text-secondary">End date <span className="text-red-400">*</span></span>
              <input name="end_date" type="date" required
                className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-text-secondary">Contract value (EGP)</span>
              <input name="contract_value" type="number" min="0" step="0.01" defaultValue="0"
                className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1 text-right tabular-nums" />
            </label>
            <label className="block">
              <span className="text-xs text-text-secondary">VAT %</span>
              <input name="vat_pct" type="number" min="0" max="100" step="0.1" defaultValue="14"
                className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1 text-right tabular-nums" />
            </label>
          </div>
        </fieldset>

        {/* 3. Year tracking + zones */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase font-semibold text-text-secondary">3. Year tracking + zones</legend>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="year_tracking" value="contract" defaultChecked />
              <span><strong>Contract-anchored</strong> — Y1/Y2/Y3 align to contract dates (e.g. City Gate)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="year_tracking" value="fiscal" />
              <span><strong>Fiscal-year</strong> — years align to calendar fiscal years (e.g. TRIO)</span>
            </label>
          </div>
          <label className="block mt-2">
            <span className="text-xs text-text-secondary">Zones (comma-separated, optional)</span>
            <input name="zones" placeholder="e.g. Zone A, Zone B"
              className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1" />
            <span className="text-[10px] text-text-secondary">Reference only — budget lines aggregate to project total per spec § 4 Q5.</span>
          </label>
        </fieldset>

        {/* 4. Service lines */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase font-semibold text-text-secondary">4. Service lines <span className="text-red-400">*</span></legend>
          <div className="grid grid-cols-2 gap-1.5 text-sm">
            {([
              ['hk', 'Housekeeping'],
              ['mep', 'MEP'],
              ['landscape', 'Landscape'],
              ['security', 'Security'],
              ['pest_ctrl', 'Pest Control'],
              ['waste_mgmt', 'Waste Mgmt'],
              ['back_office', 'Back Office'],
            ] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="checkbox" name="service_line" value={value} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
          <Link href="/fmplus/financial/budget/projects"
            className="text-xs px-3 py-1.5 text-text-secondary border border-border rounded hover:bg-bg-secondary">
            Cancel
          </Link>
          <button type="submit"
            className="text-xs px-4 py-1.5 bg-accent text-white rounded font-semibold">
            Create Contract + Y1
          </button>
        </div>
      </form>
    </div>
  );
}
