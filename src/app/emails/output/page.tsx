import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { runRuleAction } from '@/app/admin/rules/actions';

export const dynamic = 'force-dynamic';

type RuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  conditions: any;
  actions: any;
  account: { email: string } | null;
  latest_run: {
    finished_at: string | null;
    status: string;
    output: any;
    input_email_count: number;
  } | null;
};

export default async function RulesOutputListPage() {
  const sb = supabaseAdmin();

  const { data: rules } = await sb
    .from('rules')
    .select('id, name, enabled, conditions, actions, account:accounts(email)')
    .order('priority', { ascending: true });

  const enriched: RuleRow[] = await Promise.all(
    (rules || []).map(async (r: any) => {
      const { data: latest } = await sb
        .from('rule_runs')
        .select('finished_at, status, output, input_email_count')
        .eq('rule_id', r.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...r, latest_run: latest };
    })
  );

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-8">
      <nav className="text-sm">
        <Link href="/emails" className="text-blue-600 hover:underline">
          ← Emails
        </Link>
      </nav>

      <header>
        <h1 className="text-3xl font-bold">Rules output</h1>
        <p className="text-sm text-gray-500">
          Click a rule to see the latest aggregated report.
        </p>
      </header>

      {!enriched.length ? (
        <p className="text-gray-500 text-sm">
          No rules yet.{' '}
          <Link href="/admin/rules/new" className="text-blue-600 underline">
            Create one
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3">
          {enriched.map(r => {
            const out = r.latest_run?.output;
            return (
              <div
                key={r.id}
                className="border rounded p-4 flex items-center justify-between gap-3 flex-wrap"
              >
                <Link
                  href={`/emails/output/${r.id}`}
                  className="flex-1 min-w-0 hover:underline"
                >
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    Account: {r.account?.email || 'all'} · Last{' '}
                    {r.conditions?.time_window_hours ?? 24}h
                  </div>
                </Link>
                <div className="text-right text-sm">
                  {!r.latest_run ? (
                    <span className="text-gray-500 text-xs">No runs yet</span>
                  ) : (
                    <>
                      <div className="font-medium">
                        {out?.order_count ?? 0} orders · {out?.currency || ''}{' '}
                        {(out?.total_amount ?? 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.latest_run.finished_at
                          ? `Last run: ${new Date(r.latest_run.finished_at).toLocaleString()}`
                          : 'Running…'}
                        {r.latest_run.status === 'failed' && ' · failed'}
                      </div>
                    </>
                  )}
                </div>
                <form action={runRuleAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                  >
                    Run
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
