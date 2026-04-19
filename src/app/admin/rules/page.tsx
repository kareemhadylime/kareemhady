import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { deleteRule, runRuleAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function RulesListPage() {
  const sb = supabaseAdmin();
  const { data: rules } = await sb
    .from('rules')
    .select('*, account:accounts(email)')
    .order('priority', { ascending: true });

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-8">
      <nav className="text-sm">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← Admin
        </Link>
      </nav>

      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Email rules</h1>
          <p className="text-sm text-gray-500">
            Filter incoming emails and produce structured outputs.
          </p>
        </div>
        <Link
          href="/admin/rules/new"
          className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          New rule
        </Link>
      </header>

      <section>
        {!rules?.length ? (
          <p className="text-gray-500 text-sm">
            No rules yet. Create one to start aggregating emails.
          </p>
        ) : (
          <div className="space-y-3">
            {rules.map((r: any) => (
              <div key={r.id} className="border rounded p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/rules/${r.id}`} className="font-semibold hover:underline">
                      {r.name}
                    </Link>
                    {!r.enabled && (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        disabled
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 space-x-2">
                    <span>Account: {r.account?.email || 'all'}</span>
                    <span>· Last {r.conditions?.time_window_hours ?? 24}h</span>
                    {r.conditions?.from_contains && <span>· from~{r.conditions.from_contains}</span>}
                    {r.conditions?.subject_contains && <span>· subject~{r.conditions.subject_contains}</span>}
                    <span>· {r.actions?.type}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={runRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
                    >
                      Run
                    </button>
                  </form>
                  <Link
                    href={`/admin/rules/${r.id}`}
                    className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
                  >
                    Edit
                  </Link>
                  <form action={deleteRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
