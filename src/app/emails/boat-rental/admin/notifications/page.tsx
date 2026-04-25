import { RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { BackToAdminMenu } from '../_components/back-to-menu';
import { retryNotificationAction } from './actions';

export const dynamic = 'force-dynamic';

type Row = {
  id: number;
  reservation_id: string | null;
  to_phone: string;
  to_role: string;
  template_key: string;
  language: string;
  rendered_body: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

type SearchParams = Promise<{ status?: string }>;

export default async function NotificationsLog({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const sb = supabaseAdmin();
  let q = sb
    .from('boat_rental_notifications')
    .select('id, reservation_id, to_phone, to_role, template_key, language, rendered_body, status, error, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (sp.status) q = q.eq('status', sp.status);
  const { data } = await q;
  const rows = ((data as unknown) as Row[] | null) || [];

  const failedCount = rows.filter(r => r.status === 'failed').length;

  return (
    <>
      <BackToAdminMenu />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-slate-500 mt-1">
          WhatsApp messages dispatched via Green-API.
          {failedCount > 0 && (
            <span className="ml-1 text-rose-700">{failedCount} failed.</span>
          )}
        </p>
      </header>

      <section className="mt-8">
        <form method="get" className="flex items-end gap-3 mb-4">
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Status</span>
            <select name="status" defaultValue={sp.status || ''} className="ix-input mt-1">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <button type="submit" className="ix-btn-secondary">Filter</button>
        </form>

        <div className="space-y-2">
          {rows.length === 0 && (
            <div className="ix-card p-6 text-sm text-slate-500 text-center">No notifications match.</div>
          )}
          {rows.map(r => (
            <div key={r.id} className="ix-card p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon status={r.status} />
                  <span className="font-medium">{r.template_key}</span>
                  <span className="text-xs text-slate-500">→ {r.to_role}</span>
                  <span className="text-xs text-slate-400">+{r.to_phone}</span>
                  <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {r.language}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString()}
                  {r.sent_at && ` · sent ${new Date(r.sent_at).toLocaleTimeString()}`}
                </div>
              </div>
              <pre className="mt-3 text-xs whitespace-pre-wrap font-sans text-slate-700 bg-slate-50 border border-slate-200 rounded p-3">
                {r.rendered_body}
              </pre>
              {r.error && (
                <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                  {r.error}
                </div>
              )}
              {r.status !== 'sent' && (
                <form action={retryNotificationAction} className="mt-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1">
                    <RefreshCw size={12} /> {r.status === 'failed' ? 'Retry' : 'Send now'}
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'sent') return <CheckCircle2 size={14} className="text-emerald-600" />;
  if (status === 'failed') return <XCircle size={14} className="text-rose-600" />;
  return <Clock size={14} className="text-amber-600" />;
}
