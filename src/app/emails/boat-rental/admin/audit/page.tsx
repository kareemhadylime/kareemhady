import { History } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { BackToAdminMenu } from '../_components/back-to-menu';

export const dynamic = 'force-dynamic';

type Row = {
  id: number;
  reservation_id: string | null;
  actor_role: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
};
type ActorRow = { id: number; actor_user_id: string | null };
type UserLite = { id: string; username: string };

export default async function AuditLog() {
  const sb = supabaseAdmin();
  const { data: rowsRaw } = await sb
    .from('boat_rental_audit_log')
    .select('id, reservation_id, actor_role, action, from_status, to_status, created_at, payload, actor_user_id')
    .order('created_at', { ascending: false })
    .limit(300);
  const rows = ((rowsRaw as unknown) as Array<Row & { actor_user_id: string | null }> | null) || [];

  const userIds = [...new Set(rows.map(r => r.actor_user_id).filter(Boolean))] as string[];
  const usersRes = userIds.length
    ? await sb.from('app_users').select('id, username').in('id', userIds)
    : { data: [] };
  const users = ((usersRes.data as unknown) as UserLite[] | null) || [];
  const userMap = new Map(users.map(u => [u.id, u.username]));

  return (
    <>
      <BackToAdminMenu />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Every state transition. Useful for disputes.</p>
      </header>

      {/* Mobile: card list */}
      <section className="mt-8 md:hidden space-y-2">
        {rows.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">
            <History size={20} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            No audit entries yet.
          </div>
        )}
        {rows.map(r => (
          <div key={r.id} className="ix-card p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono font-semibold text-slate-900 dark:text-slate-100">{r.action}</code>
              <span className="text-slate-400">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">
              {r.from_status || '—'} → {r.to_status || '—'}
              <span className="ml-2 text-slate-400">
                {r.actor_user_id ? (userMap.get(r.actor_user_id) || r.actor_user_id.slice(0, 6)) : '—'}
                {r.actor_role && ` (${r.actor_role})`}
              </span>
            </div>
            {r.reservation_id && (
              <div className="mt-1 font-mono text-slate-400">res #{r.reservation_id.slice(0, 8)}</div>
            )}
            {r.payload && (
              <details className="mt-1">
                <summary className="text-[10px] text-slate-500 cursor-pointer">Payload</summary>
                <code className="block mt-1 text-[10px] text-slate-500 break-all">
                  {JSON.stringify(r.payload)}
                </code>
              </details>
            )}
          </div>
        ))}
      </section>

      {/* Desktop: table */}
      <section className="mt-8 ix-card overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Actor</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Transition</th>
                <th className="text-left px-4 py-2">Reservation</th>
                <th className="text-left px-4 py-2">Payload</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 px-4 py-6">
                    <History size={20} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    No audit entries yet.
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.actor_user_id ? (userMap.get(r.actor_user_id) || r.actor_user_id.slice(0, 6)) : '—'}
                    {r.actor_role && <span className="ml-1 text-slate-400">({r.actor_role})</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">
                    {r.from_status || '—'} → {r.to_status || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 font-mono">
                    {r.reservation_id?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {r.payload ? <code className="text-[10px]">{JSON.stringify(r.payload)}</code> : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
