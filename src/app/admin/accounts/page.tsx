import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const sb = supabaseAdmin();
  const [{ data: accounts }, { data: runs }, { data: emails }] = await Promise.all([
    sb.from('accounts').select('*').order('created_at'),
    sb.from('runs').select('*').order('started_at', { ascending: false }).limit(10),
    sb.from('email_logs').select('*').order('received_at', { ascending: false }).limit(50),
  ]);

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-10">
      <nav className="text-sm">
        <Link href="/admin" className="text-blue-600 hover:underline">
          ← Admin
        </Link>
      </nav>

      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Connected emails</h1>
          <p className="text-sm text-gray-500">
            Mailboxes ingested every 9 AM Cairo via cron.
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/api/auth/google/start"
            className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Connect Gmail account
          </a>
          <form action="/api/run-now" method="POST">
            <button
              type="submit"
              className="px-4 py-2 rounded border font-medium hover:bg-gray-50"
            >
              Run now
            </button>
          </form>
        </div>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          Accounts ({accounts?.length || 0})
        </h2>
        <div className="space-y-2">
          {accounts?.map((a: any) => (
            <div
              key={a.id}
              className="border rounded p-3 flex justify-between items-center"
            >
              <span className="font-mono text-sm">{a.email}</span>
              <span className="text-xs text-gray-500">
                Last synced:{' '}
                {a.last_synced_at
                  ? new Date(a.last_synced_at).toLocaleString()
                  : 'never'}
              </span>
            </div>
          ))}
          {!accounts?.length && (
            <p className="text-gray-500 text-sm">
              No accounts yet. Click &ldquo;Connect Gmail account&rdquo; to add one.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent ingest runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-2 px-3">Started</th>
                <th className="text-left px-3">Trigger</th>
                <th className="text-left px-3">Status</th>
                <th className="text-right px-3">Emails</th>
                <th className="text-left px-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs?.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 px-3 whitespace-nowrap">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                  <td className="px-3">{r.trigger}</td>
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
                  <td className="px-3 text-right">{r.emails_fetched}</td>
                  <td className="px-3 text-xs text-red-700 max-w-xs truncate">
                    {r.error || ''}
                  </td>
                </tr>
              ))}
              {!runs?.length && (
                <tr>
                  <td colSpan={5} className="py-3 px-3 text-gray-500">
                    No runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          Recent emails (last 50)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-2 px-3">Received</th>
                <th className="text-left px-3">From</th>
                <th className="text-left px-3">Subject</th>
              </tr>
            </thead>
            <tbody>
              {emails?.map((e: any) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2 px-3 whitespace-nowrap">
                    {e.received_at
                      ? new Date(e.received_at).toLocaleString()
                      : '-'}
                  </td>
                  <td className="px-3 truncate max-w-xs">{e.from_address}</td>
                  <td className="px-3 truncate max-w-lg">{e.subject}</td>
                </tr>
              ))}
              {!emails?.length && (
                <tr>
                  <td colSpan={3} className="py-3 px-3 text-gray-500">
                    No emails logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
