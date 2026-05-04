import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { SetupTabs } from '../_components/setup-tabs';
import { readDailyCapFromEnv } from '@/lib/personal-email/cost-guard';
import { RecomputeForm } from './_recompute-form';

export const dynamic = 'force-dynamic';
// The recompute action clears classifications + triggers a fresh ingest
// across the full range; for large ranges this exceeds the 60 s default
// server-action budget. 300 s = Vercel Pro ceiling.
export const maxDuration = 300;

export default async function AiSetupPage() {
  const sb = supabaseAdmin();
  const { data: runs } = await sb
    .from('personal_email_classification_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(30);

  const cap = readDailyCapFromEnv();

  // Default recompute range = last 7 days.
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
  const toDefault = today.toISOString().slice(0, 10);
  const fromDefault = weekAgo.toISOString().slice(0, 10);

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 flex-1">
      <h1 className="text-2xl font-bold">AI</h1>
      <SetupTabs activeTab="ai" />

      <section className="ix-card p-4 space-y-1">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Model</div>
        <div className="font-mono text-sm">claude-haiku-4-5-20251001</div>
        <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold pt-3">Daily cap</div>
        <div className="text-sm">${cap.toFixed(2)} USD/day</div>
        <div className="text-[11px] text-slate-500">
          Override via <code>PERSONAL_EMAIL_DAILY_CAP_USD</code> environment variable. When the cap is hit,
          new emails get rules-only fallback + <em>needs review</em> until the next UTC day.
        </div>
      </section>

      <section className="ix-card p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Recompute</div>
        <p className="text-xs text-slate-500">
          Clears the classification on personal-domain emails received between the dates below
          and runs a fresh ingest. Use after editing rules or category names to apply changes
          retroactively.
        </p>
        <RecomputeForm defaultFromIso={fromDefault} defaultToIso={toDefault} />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide font-semibold text-slate-500 mb-2">Recent runs (last 30)</h2>
        <div className="ix-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left py-2.5 px-3 font-medium">Started</th>
                <th className="text-left px-3 font-medium">Trig</th>
                <th className="text-right px-3 font-medium">Seen</th>
                <th className="text-right px-3 font-medium">Class</th>
                <th className="text-right px-3 font-medium">Rules</th>
                <th className="text-right px-3 font-medium">AI calls</th>
                <th className="text-right px-3 font-medium">AI $</th>
                <th className="text-left px-3 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 px-3 whitespace-nowrap text-xs">{fmtCairoDateTime(r.started_at)}</td>
                  <td className="px-3 text-xs">{r.trigger}</td>
                  <td className="px-3 text-right tabular-nums">{r.emails_seen}</td>
                  <td className="px-3 text-right tabular-nums">{r.emails_classified}</td>
                  <td className="px-3 text-right tabular-nums">{r.rules_matched}</td>
                  <td className="px-3 text-right tabular-nums">{r.ai_calls}</td>
                  <td className="px-3 text-right tabular-nums">${Number(r.ai_cost_usd ?? 0).toFixed(4)}</td>
                  <td className="px-3 text-xs text-rose-700 max-w-xs truncate">
                    {Array.isArray(r.errors) && r.errors.length ? `${r.errors.length} err` : ''}
                  </td>
                </tr>
              ))}
              {!runs?.length && (
                <tr><td colSpan={8} className="p-3 text-slate-500 text-center">No runs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
