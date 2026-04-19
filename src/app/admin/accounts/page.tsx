import Link from 'next/link';
import { Mail, Plus, RefreshCw, ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const sb = supabaseAdmin();
  const [{ data: accounts }, { data: runs }, { data: emails }] = await Promise.all([
    sb.from('accounts').select('*').order('created_at'),
    sb.from('runs').select('*').order('started_at', { ascending: false }).limit(10),
    sb.from('email_logs').select('*').order('received_at', { ascending: false }).limit(50),
  ]);

  return (
    <>
      <TopNav>
        <Link href="/admin" className="ix-link">Admin</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Connected emails</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10 flex-1">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Admin · Connected emails
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Mailboxes</h1>
            <p className="text-sm text-slate-500 mt-1">
              Ingested daily at 9 AM Cairo via cron.
            </p>
          </div>
          <div className="flex gap-3">
            <a href="/api/auth/google/start" className="ix-btn-primary">
              <Plus size={16} /> Connect Gmail
            </a>
            <form action="/api/run-now" method="POST">
              <button type="submit" className="ix-btn-secondary">
                <RefreshCw size={16} /> Run now
              </button>
            </form>
          </div>
        </header>

        <section>
          <h2 className="text-lg font-semibold mb-3">
            Accounts ({accounts?.length || 0})
          </h2>
          <div className="space-y-2">
            {accounts?.map((a: any) => (
              <div key={a.id} className="ix-card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 inline-flex items-center justify-center">
                  <Mail size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium font-mono text-sm truncate">{a.email}</div>
                  <div className="text-xs text-slate-500">
                    Last synced:{' '}
                    {a.last_synced_at
                      ? new Date(a.last_synced_at).toLocaleString()
                      : 'never'}
                  </div>
                </div>
              </div>
            ))}
            {!accounts?.length && (
              <p className="text-slate-500 text-sm">
                No accounts yet. Click &ldquo;Connect Gmail&rdquo; to add one.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Recent ingest runs</h2>
          <div className="ix-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Started</th>
                  <th className="text-left px-4 font-medium">Trigger</th>
                  <th className="text-left px-4 font-medium">Status</th>
                  <th className="text-right px-4 font-medium">Emails</th>
                  <th className="text-left px-4 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs?.map((r: any) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="px-4">{r.trigger}</td>
                    <td className="px-4">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 text-right tabular-nums">{r.emails_fetched}</td>
                    <td className="px-4 text-xs text-rose-700 max-w-xs truncate">
                      {r.error || ''}
                    </td>
                  </tr>
                ))}
                {!runs?.length && (
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-slate-500">
                      No runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Recent emails (last 50)</h2>
          <div className="ix-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Received</th>
                  <th className="text-left px-4 font-medium">From</th>
                  <th className="text-left px-4 font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {emails?.map((e: any) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2.5 px-4 whitespace-nowrap text-slate-600">
                      {e.received_at
                        ? new Date(e.received_at).toLocaleString()
                        : '-'}
                    </td>
                    <td className="px-4 truncate max-w-xs">{e.from_address}</td>
                    <td className="px-4 truncate max-w-lg">{e.subject}</td>
                  </tr>
                ))}
                {!emails?.length && (
                  <tr>
                    <td colSpan={3} className="py-3 px-4 text-slate-500">
                      No emails logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
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
