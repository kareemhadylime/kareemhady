import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { ALL_SERVICE_LINES, getTemplate } from '@/lib/fmplus/budget/templates';
import { ThresholdEditor } from './_components/threshold-editor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireBudgetView();
  const sb = budgetDb();

  const { data: settings } = await sb.from(TABLES.settings)
    .select('*')
    .eq('id', 1)
    .single();

  // Build template summary
  const templates = ALL_SERVICE_LINES.map(sl => {
    const tpl = getTemplate(sl, 1);
    const lineCount = tpl.categories.reduce((a, c) => a + (c.lines?.length ?? 0), 0);
    return {
      service_line: sl,
      label_en: sl.toUpperCase(),
      version: tpl.version,
      categories: tpl.categories.length,
      lines: lineCount,
      account_map_categories: (tpl.account_map_json ?? []).length,
    };
  });

  // Unmapped-account detection (cross-template) — pull a sample of recent
  // odoo accounts that have FMPLUS-tagged move-line activity but don't
  // match any template's account_map regex. We sample, not exhaustively scan.
  let unmapped: Array<{ code: string; name: string; sample_amount: number }> = [];
  try {
    const allPatterns: RegExp[] = [];
    for (const sl of ALL_SERVICE_LINES) {
      const tpl = getTemplate(sl, 1);
      for (const m of tpl.account_map_json ?? []) {
        for (const p of m.code_patterns ?? []) allPatterns.push(new RegExp(p));
      }
    }
    // Pull up to 200 distinct FMPLUS-related accounts via a recent move-line sample
    const { data: sampleLines } = await sb.from('odoo_move_lines')
      .select('account:odoo_accounts(code, name), debit, credit')
      .order('id', { ascending: false })
      .limit(200);
    const seen = new Map<string, { code: string; name: string; total: number }>();
    for (const r of (sampleLines ?? []) as any[]) {
      const code = r.account?.code as string | undefined;
      const name = (r.account?.name as string | undefined) ?? '';
      if (!code) continue;
      const matched = allPatterns.some(re => re.test(code));
      if (matched) continue;
      const amount = Number(r.debit ?? 0) - Number(r.credit ?? 0);
      const cur = seen.get(code);
      if (cur) cur.total += amount;
      else seen.set(code, { code, name, total: amount });
    }
    unmapped = [...seen.values()]
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
      .slice(0, 12)
      .map(u => ({ code: u.code, name: u.name, sample_amount: u.total }));
  } catch {
    // sampling is best-effort — skip silently if odoo tables aren't available
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Variance thresholds, default inflation knobs, mobilization amortization, bilingual default, and template overview.
          {!user.is_admin && <span className="ml-1 text-amber-400">View-only — admin role required to edit.</span>}
        </p>
      </header>

      <ThresholdEditor
        initial={{
          green_pct: Number(settings?.green_pct ?? 5),
          amber_pct: Number(settings?.amber_pct ?? 15),
          default_scenario: (settings?.default_scenario ?? 'initial') as 'initial' | 'revised' | 'reforecast',
          default_inflation_revenue: Number(settings?.default_inflation_revenue ?? 7),
          default_inflation_manpower: Number(settings?.default_inflation_manpower ?? 10),
          default_inflation_other: Number(settings?.default_inflation_other ?? 5),
          default_mob_amortization_months: Number(settings?.default_mob_amortization_months ?? 24),
          bilingual_default: (settings?.bilingual_default ?? 'en') as 'en' | 'ar',
        }}
        canEdit={Boolean(user.is_admin)}
      />

      {/* Templates overview */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Service-line templates</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          7 templates registered. Edit individual lines via PR; they&apos;re code-defined for v2.0.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700 text-left">
              <th className="px-2 py-1.5">Service</th>
              <th className="px-2 py-1.5 text-right">Version</th>
              <th className="px-2 py-1.5 text-right">Categories</th>
              <th className="px-2 py-1.5 text-right">Lines</th>
              <th className="px-2 py-1.5 text-right">Account-map cats</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.service_line} className="border-b border-slate-200 dark:border-slate-700">
                <td className="px-2 py-1.5 font-medium text-slate-900 dark:text-slate-100">{t.label_en}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">v{t.version}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.categories}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.lines}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.account_map_categories}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Unmapped accounts warning */}
      {unmapped.length > 0 && (
        <section className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            ⚠ Unmapped accounts ({unmapped.length}) — sample of recent activity
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Odoo account codes with recent move-line activity that don&apos;t match any template&apos;s <code>account_map_json</code> regex.
            These actuals fall into <code>_unmapped</code> on Variance reports. Update the matching template to capture them.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700 text-left">
                <th className="px-2 py-1.5">Code</th>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5 text-right">Recent activity (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {unmapped.map(u => (
                <tr key={u.code} className="border-b border-slate-200 dark:border-slate-700">
                  <td className="px-2 py-1.5 font-mono text-[11px]">{u.code}</td>
                  <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{u.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{u.sample_amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
