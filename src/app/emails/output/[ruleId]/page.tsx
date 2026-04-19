import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  ShoppingBag,
  DollarSign,
  Package,
  Mail,
  Play,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';
import { Stat } from '@/app/_components/stat';
import { runRuleAction } from '@/app/admin/rules/actions';

export const dynamic = 'force-dynamic';

export default async function RuleOutputDetailPage({
  params,
}: {
  params: Promise<{ ruleId: string }>;
}) {
  const { ruleId } = await params;
  const sb = supabaseAdmin();

  const [{ data: rule }, { data: runs }] = await Promise.all([
    sb.from('rules').select('*, account:accounts(email)').eq('id', ruleId).single(),
    sb
      .from('rule_runs')
      .select('*')
      .eq('rule_id', ruleId)
      .order('started_at', { ascending: false })
      .limit(20),
  ]);
  if (!rule) notFound();

  const latest = runs?.[0];
  const out = latest?.output as any;
  const orders = out?.order_count ?? 0;
  const total = out?.total_amount ?? 0;
  const currency = out?.currency || (rule.actions?.currency as string) || '';
  const products = out?.products || [];
  const orderList = out?.orders || [];

  const maxQty = Math.max(1, ...products.map((p: any) => p.total_quantity || 0));

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/output" className="ix-link">Rules output</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span className="truncate max-w-[200px]">{rule.name}</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Emails · Rules output
            </p>
            <h1 className="text-3xl font-bold tracking-tight">{rule.name}</h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Mail size={14} /> {(rule as any).account?.email || 'all accounts'}
              </span>
              <span>·</span>
              <span>last {rule.conditions?.time_window_hours ?? 24}h</span>
              <span>·</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                {rule.actions?.type}
              </span>
              {latest && (
                <>
                  <span>·</span>
                  <span>
                    Last run{' '}
                    {latest.finished_at
                      ? new Date(latest.finished_at).toLocaleString()
                      : '…'}
                  </span>
                </>
              )}
            </p>
          </div>
          <form action={runRuleAction}>
            <input type="hidden" name="id" value={rule.id} />
            <button type="submit" className="ix-btn-primary">
              <Play size={16} /> Run now
            </button>
          </form>
        </header>

        {!latest ? (
          <div className="ix-card p-10 text-center">
            <p className="text-slate-500 mb-4">No runs yet. Click &ldquo;Run now&rdquo; to evaluate.</p>
          </div>
        ) : (
          <>
            {latest.status === 'failed' && (
              <div className="ix-card p-4 border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-start gap-2">
                <XCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Last run failed</div>
                  <div className="text-xs mt-0.5">{latest.error}</div>
                </div>
              </div>
            )}

            {out?.parse_errors > 0 && (
              <div className="ix-card p-4 border-amber-200 bg-amber-50 text-amber-800 text-sm">
                {out.parse_errors} email(s) could not be parsed and were skipped.
              </div>
            )}

            {typeof out?.marked_read === 'number' && out.marked_read > 0 && (
              <div className="ix-card p-4 border-emerald-200 bg-emerald-50 text-emerald-800 text-sm flex items-center gap-2">
                <CheckCircle2 size={16} />
                Marked {out.marked_read} email(s) as read in Gmail.
                {out.mark_errors > 0 && (
                  <span className="text-amber-700">
                    {' '}({out.mark_errors} could not be marked — re-Connect the
                    mailbox to grant gmail.modify scope.)
                  </span>
                )}
              </div>
            )}

            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat
                label="Orders"
                value={orders.toLocaleString()}
                Icon={ShoppingBag}
                accent="violet"
              />
              <Stat
                label={`Total ${currency}`}
                value={total.toLocaleString()}
                Icon={DollarSign}
                accent="emerald"
              />
              <Stat
                label="Products"
                value={products.length.toLocaleString()}
                Icon={Package}
                accent="indigo"
              />
              <Stat
                label="Emails matched"
                value={(latest.input_email_count ?? 0).toLocaleString()}
                Icon={Mail}
                accent="amber"
              />
            </section>

            <section className="ix-card p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-semibold">Top products</h2>
                  <p className="text-xs text-slate-500">By units sold in window</p>
                </div>
              </div>
              {!products.length ? (
                <p className="text-sm text-slate-500">No products in matched orders.</p>
              ) : (
                <div className="space-y-3">
                  {products.slice(0, 12).map((p: any) => {
                    const pct = Math.round((p.total_quantity / maxQty) * 100);
                    return (
                      <div key={p.name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-slate-500 tabular-nums shrink-0 ml-3">
                            <span className="font-semibold text-slate-900">
                              {p.total_quantity}
                            </span>{' '}
                            unit{p.total_quantity !== 1 ? 's' : ''} · {currency}{' '}
                            {p.total_revenue.toLocaleString()}
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="ix-card overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold">Orders ({orderList.length})</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left py-2.5 px-6 font-medium">Order #</th>
                    <th className="text-left px-6 font-medium">Customer</th>
                    <th className="text-right px-6 font-medium">Total ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {orderList.map((o: any, i: number) => (
                    <tr key={`${o.order_number}-${i}`} className="border-t border-slate-100">
                      <td className="py-2.5 px-6 font-mono text-indigo-600">
                        {o.order_number}
                      </td>
                      <td className="px-6">{o.customer_name}</td>
                      <td className="px-6 text-right tabular-nums font-medium">
                        {o.total_amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {!orderList.length && (
                    <tr>
                      <td colSpan={3} className="py-3 px-6 text-slate-500">
                        No orders matched.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            <section className="ix-card overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold">Run history</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left py-2.5 px-6 font-medium">Started</th>
                    <th className="text-left px-6 font-medium">Status</th>
                    <th className="text-right px-6 font-medium">Emails</th>
                    <th className="text-right px-6 font-medium">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {runs?.map(r => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-2.5 px-6 whitespace-nowrap">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="px-6">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-6 text-right tabular-nums">{r.input_email_count}</td>
                      <td className="px-6 text-right tabular-nums">
                        {(r.output as any)?.order_count ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
    running: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  const cls = map[status] || 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}
