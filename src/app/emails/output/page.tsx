import Link from 'next/link';
import { ChevronRight, Play, ArrowRight, ShoppingBag, ListChecks } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';
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
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Rules output</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Emails · Rules output
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Live dashboards</h1>
          <p className="text-sm text-slate-500 mt-1">
            Latest aggregated reports for each enabled rule.
          </p>
        </header>

        {!enriched.length ? (
          <div className="ix-card p-8 text-center">
            <p className="text-slate-500 text-sm mb-4">
              No rules yet. Create your first one to start aggregating.
            </p>
            <Link href="/admin/rules/new" className="ix-btn-primary">
              Create rule
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {enriched.map(r => {
              const out = r.latest_run?.output;
              const orders = out?.order_count ?? 0;
              const total = out?.total_amount ?? 0;
              const currency = out?.currency || '';
              return (
                <Link
                  key={r.id}
                  href={`/emails/output/${r.id}`}
                  className="group ix-card p-5 hover:shadow-md hover:-translate-y-0.5 transition relative overflow-hidden"
                >
                  <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 opacity-[0.06] blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 inline-flex items-center justify-center">
                          <ShoppingBag size={16} />
                        </div>
                        <h3 className="font-semibold truncate">{r.name}</h3>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {r.account?.email || 'all accounts'} · last{' '}
                        {r.conditions?.time_window_hours ?? 24}h
                      </div>
                    </div>
                    <ArrowRight
                      size={18}
                      className="text-slate-400 group-hover:text-indigo-600 transition shrink-0"
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <MiniStat label="Orders" value={String(orders)} />
                    <MiniStat
                      label={`Total ${currency}`}
                      value={total.toLocaleString()}
                    />
                    <MiniStat
                      label="Products"
                      value={String(out?.products?.length ?? 0)}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {r.latest_run?.finished_at
                        ? `Last run · ${new Date(r.latest_run.finished_at).toLocaleString()}`
                        : 'Not run yet'}
                      {r.latest_run?.status === 'failed' && ' · failed'}
                    </span>
                    <form action={runRuleAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="ix-btn-primary">
                        <Play size={12} /> Run
                      </button>
                    </form>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="text-center text-sm text-slate-500 pt-4">
          Want a new aggregation?{' '}
          <Link href="/admin/rules/new" className="ix-link inline-flex items-center gap-1">
            <ListChecks size={14} /> Create a rule
          </Link>
        </div>
      </main>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
