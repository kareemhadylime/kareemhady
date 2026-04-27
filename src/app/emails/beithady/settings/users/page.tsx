import { redirect, notFound } from 'next/navigation';
import { Trash2, UserPlus } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission, BEITHADY_ROLES } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { assignRoleAction, revokeRoleAction } from './actions';

export const dynamic = 'force-dynamic';

type AppUserRow = {
  id: string;
  username: string;
  role: string;
  last_login_at: string | null;
};
type RoleRow = { user_id: string; role: string; granted_at: string };

export default async function BeithadyUsersSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/emails/beithady/settings/users');
  // Only app-admins or Beithady-admins can manage roles. Other Beithady
  // roles see the page but can't make changes (form actions re-check).
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'settings', 'full'));
  if (!allowed) notFound();

  const sb = supabaseAdmin();
  const [usersRes, rolesRes] = await Promise.all([
    sb.from('app_users').select('id, username, role, last_login_at').order('username'),
    sb.from('beithady_user_roles').select('user_id, role, granted_at'),
  ]);

  const users = (usersRes.data as AppUserRow[] | null) || [];
  const roles = (rolesRes.data as RoleRow[] | null) || [];
  const rolesByUser = new Map<string, RoleRow[]>();
  for (const r of roles) {
    const arr = rolesByUser.get(r.user_id) || [];
    arr.push(r);
    rolesByUser.set(r.user_id, arr);
  }

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'Users & roles' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · Users"
        title="Users & roles"
        subtitle="Five-role permission matrix for Beit Hady. App-admins get every role implicitly."
      />

      <div className="ix-card p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-slate-700">
              <th className="py-2">User</th>
              <th className="py-2">App role</th>
              <th className="py-2">Beit Hady roles</th>
              <th className="py-2">Last login</th>
              <th className="py-2 w-[280px]">Grant role</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const granted = (rolesByUser.get(u.id) || []).map(r => r.role);
              const ungrantable = BEITHADY_ROLES.filter(r => !granted.includes(r));
              return (
                <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                  <td className="py-3">
                    <div className="font-medium">{u.username}</div>
                  </td>
                  <td className="py-3">
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {u.role || 'viewer'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {granted.length === 0 && (
                        <span className="text-xs text-slate-400">none</span>
                      )}
                      {granted.map(r => (
                        <form action={revokeRoleAction} key={r} className="inline-flex items-center">
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="role" value={r} />
                          <button
                            type="submit"
                            className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-rose-50 hover:text-rose-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-rose-950 dark:hover:text-rose-300 transition inline-flex items-center gap-1"
                            title="Revoke role"
                          >
                            {r}
                            <Trash2 size={10} />
                          </button>
                        </form>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 text-xs text-slate-500">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3">
                    {ungrantable.length === 0 ? (
                      <span className="text-xs text-slate-400">all roles granted</span>
                    ) : (
                      <form action={assignRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="user_id" value={u.id} />
                        <select name="role" className="ix-input text-xs flex-1" defaultValue={ungrantable[0]}>
                          {ungrantable.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <button type="submit" className="ix-btn-primary text-xs">
                          <UserPlus size={12} /> Grant
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Permission matrix at a glance — guest_relations: CRM + Communication +
        Gallery; finance: Financial + read elsewhere; ops: Analytics + CRM +
        Communication + Gallery; manager: everything except integration
        credentials; admin: full access including credentials.
      </p>
    </BeithadyShell>
  );
}
