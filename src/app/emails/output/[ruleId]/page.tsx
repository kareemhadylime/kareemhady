import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
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

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-8">
      <nav className="text-sm">
        <Link href="/emails/output" className="text-blue-600 hover:underline">
          ← Rules output
        </Link>
      </nav>

      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">{rule.name}</h1>
          <p className="text-sm text-gray-500">
            Account: {(rule as any).account?.email || 'all'} · Last{' '}
            {rule.conditions?.time_window_hours ?? 24}h · {rule.actions?.type}
          </p>
        </div>
        <form action={runRuleAction}>
          <input type="hidden" name="id" value={rule.id} />
          <button
            type="submit"
            className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Run now
          </button>
        </form>
      </header>

      {!latest ? (
        <p className="text-gray-500">No runs yet. Click &ldquo;Run now&rdquo; to evaluate.</p>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Orders" value={String(out?.order_count ?? 0)} />
            <Stat
              label={`Total (${out?.currency || ''})`}
              value={(out?.total_amount ?? 0).toLocaleString()}
            />
            <Stat
              label="Emails matched"
              value={String(latest.input_email_count)}
            />
          </section>

          {latest.status === 'failed' && (
            <p className="text-red-700 text-sm border border-red-300 rounded p-3 bg-red-50">
              Last run failed: {latest.error}
            </p>
          )}

          {out?.parse_errors > 0 && (
            <p className="text-amber-700 text-sm">
              {out.parse_errors} email(s) could not be parsed and were skipped.
            </p>
          )}

          <section>
            <h2 className="text-xl font-semibold mb-3">
              Products ({out?.products?.length || 0})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3">Product</th>
                    <th className="text-right px-3">Total qty</th>
                    <th className="text-right px-3">Orders</th>
                    <th className="text-right px-3">
                      Revenue ({out?.currency || ''})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {out?.products?.map((p: any) => (
                    <tr key={p.name} className="border-t">
                      <td className="py-2 px-3">{p.name}</td>
                      <td className="px-3 text-right">{p.total_quantity}</td>
                      <td className="px-3 text-right">{p.order_count}</td>
                      <td className="px-3 text-right">{p.total_revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!out?.products?.length && (
                    <tr>
                      <td colSpan={4} className="py-3 px-3 text-gray-500">
                        No products in matched orders.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              Orders ({out?.orders?.length || 0})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3">Order #</th>
                    <th className="text-left px-3">Customer</th>
                    <th className="text-right px-3">
                      Total ({out?.currency || ''})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {out?.orders?.map((o: any, i: number) => (
                    <tr key={`${o.order_number}-${i}`} className="border-t">
                      <td className="py-2 px-3 font-mono">{o.order_number}</td>
                      <td className="px-3">{o.customer_name}</td>
                      <td className="px-3 text-right">{o.total_amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!out?.orders?.length && (
                    <tr>
                      <td colSpan={3} className="py-3 px-3 text-gray-500">
                        No orders matched.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Run history</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3">Started</th>
                    <th className="text-left px-3">Status</th>
                    <th className="text-right px-3">Emails</th>
                    <th className="text-right px-3">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {runs?.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 px-3 whitespace-nowrap">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="px-3">
                        <span
                          className={
                            r.status === 'succeeded'
                              ? 'text-green-700'
                              : r.status === 'failed'
                              ? 'text-red-700'
                              : 'text-gray-600'
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 text-right">{r.input_email_count}</td>
                      <td className="px-3 text-right">
                        {(r.output as any)?.order_count ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
