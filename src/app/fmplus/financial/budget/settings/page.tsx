import { supabaseAdmin } from '@/lib/supabase';
import { SERVICE_LINE_CATALOG, getTemplate } from '@/lib/fmplus/budget/templates';
import { ThresholdEditor } from './_components/threshold-editor';

export default async function SettingsPage() {
  const sb = supabaseAdmin();
  const { data: settings } = await sb.from('budget_settings').select('*').eq('id', 1).maybeSingle();
  const s = settings as { green_pct: number; amber_pct: number; default_scenario: string } | null;

  // Compute the union of mapped Odoo account-code patterns across all active templates,
  // then list the cost accounts that don't match any pattern (drift detector).
  const tpl = getTemplate('hk', 1);
  const allPatterns = tpl.account_map_json.flatMap(e => e.code_patterns);
  const { data: costAccts } = await sb
    .from('odoo_accounts')
    .select('code, name, account_type')
    .ilike('account_type', 'expense%');
  type Acct = { code: string; name: string; account_type: string };
  const accts = (costAccts ?? []) as Acct[];
  const unmapped = accts.filter(a => !allPatterns.some(p => new RegExp(p).test(a.code)));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Variance thresholds</h2>
        <ThresholdEditor green={s?.green_pct ?? 5} amber={s?.amber_pct ?? 15} />
        <p className="text-xs text-slate-500 mt-2">|var| ≤ green% → green · &gt;amber% overspend → red · everything else amber (incl. underspend &gt; green%, scope-delivery risk).</p>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Service-line templates</h2>
        <table className="text-sm w-full">
          <thead><tr className="bg-slate-50 dark:bg-slate-800 text-left"><th className="p-2">Service line</th><th className="p-2">Status</th><th className="p-2">Template version</th></tr></thead>
          <tbody>
            {SERVICE_LINE_CATALOG.map(c => (
              <tr key={c.code} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-2"><strong>{c.label}</strong> <span className="text-slate-500">({c.code})</span></td>
                <td className="p-2 capitalize">{c.template_status}</td>
                <td className="p-2 text-slate-500">v1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">HK category-account mapping</h2>
        <p className="text-xs text-slate-500 mb-2">Templates today are code-defined and version-locked; edit by changing <code>src/lib/fmplus/budget/templates/hk.ts</code> and shipping a new template version (out of scope for this UI).</p>
        <table className="text-xs w-full">
          <thead><tr className="bg-slate-50 dark:bg-slate-800 text-left"><th className="p-2">Category</th><th className="p-2">Code-pattern regex</th></tr></thead>
          <tbody>
            {tpl.account_map_json.map(e => (
              <tr key={e.category} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-2 capitalize">{e.category}</td>
                <td className="p-2 font-mono text-slate-500">{e.code_patterns.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Unmapped Odoo cost accounts ({unmapped.length})</h2>
        {unmapped.length === 0 ? (
          <p className="text-sm text-emerald-700">All cost accounts mapped — no variance leakage.</p>
        ) : (
          <table className="text-xs w-full">
            <thead><tr className="bg-slate-50 dark:bg-slate-800 text-left"><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Type</th></tr></thead>
            <tbody>
              {unmapped.map(a => (
                <tr key={a.code} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-mono">{a.code}</td>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2 text-slate-500">{a.account_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
