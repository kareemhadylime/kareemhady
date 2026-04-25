import { UserPlus, KeyRound, UserMinus } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { BackToAdminMenu } from '../_components/back-to-menu';
import {
  inviteBrokerAction,
  inviteOwnerAction,
  resetPasswordAction,
  removeBoatRoleAction,
} from './actions';

export const dynamic = 'force-dynamic';

type RoleRow = { user_id: string; role: 'admin' | 'broker' | 'owner'; owner_id: string | null };
type UserRow = { id: string; username: string; last_login_at: string | null };
type OwnerLite = { id: string; name: string };

export default async function UsersAdmin() {
  const sb = supabaseAdmin();
  const [rolesRes, ownersRes] = await Promise.all([
    sb.from('boat_rental_user_roles').select('user_id, role, owner_id'),
    sb.from('boat_rental_owners').select('id, name').eq('status', 'active').order('name'),
  ]);
  const roles = ((rolesRes.data as unknown) as RoleRow[] | null) || [];
  const owners = ((ownersRes.data as unknown) as OwnerLite[] | null) || [];

  const userIds = [...new Set(roles.map(r => r.user_id))];
  const usersRes = userIds.length
    ? await sb.from('app_users').select('id, username, last_login_at').in('id', userIds)
    : { data: [] };
  const users = ((usersRes.data as unknown) as UserRow[] | null) || [];
  const userMap = new Map(users.map(u => [u.id, u]));
  const ownerMap = new Map(owners.map(o => [o.id, o]));

  const rolesByUser = new Map<string, RoleRow[]>();
  for (const r of roles) {
    const arr = rolesByUser.get(r.user_id) || [];
    arr.push(r);
    rolesByUser.set(r.user_id, arr);
  }

  return (
    <>
      <BackToAdminMenu />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-slate-500 mt-1">
          Assign brokers and owners. New users get a temporary password; they change it at{' '}
          <code className="text-xs">/account/password</code> after first login.
        </p>
      </header>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="ix-card p-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><UserPlus size={16} /> Invite broker</h2>
          <p className="text-xs text-slate-500 mb-3">
            Brokers are walled off — they can only reach the broker portal, nothing else on Lime.
          </p>
          <form action={inviteBrokerAction} className="space-y-3">
            <label className="text-sm block">
              <span className="text-slate-600 text-xs">Username (lowercase, 3+ chars)</span>
              <input name="username" required minLength={3} className="ix-input mt-1" />
            </label>
            <label className="text-sm block">
              <span className="text-slate-600 text-xs">Temporary password (8+ chars)</span>
              <input name="password" required minLength={8} className="ix-input mt-1" />
            </label>
            <button type="submit" className="ix-btn-primary"><UserPlus size={14} /> Create broker</button>
          </form>
        </div>

        <div className="ix-card p-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><UserPlus size={16} /> Invite owner</h2>
          <p className="text-xs text-slate-500 mb-3">
            Owners see only their own boats and bookings.
          </p>
          {owners.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              Create an owner record on the Owners tab first.
            </p>
          ) : (
            <form action={inviteOwnerAction} className="space-y-3">
              <label className="text-sm block">
                <span className="text-slate-600 text-xs">Link to owner record</span>
                <select name="owner_id" required className="ix-input mt-1">
                  <option value="">Select owner…</option>
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm block">
                <span className="text-slate-600 text-xs">Username</span>
                <input name="username" required minLength={3} className="ix-input mt-1" />
              </label>
              <label className="text-sm block">
                <span className="text-slate-600 text-xs">Temporary password</span>
                <input name="password" required minLength={8} className="ix-input mt-1" />
              </label>
              <button type="submit" className="ix-btn-primary"><UserPlus size={14} /> Create owner</button>
            </form>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold mb-3">Existing boat-rental users</h2>
        {rolesByUser.size === 0 ? (
          <div className="ix-card p-6 text-sm text-slate-500 text-center">No users assigned yet.</div>
        ) : (
          <div className="space-y-3">
            {[...rolesByUser.entries()].map(([uid, userRoles]) => {
              const u = userMap.get(uid);
              if (!u) return null;
              return (
                <div key={uid} className="ix-card p-5">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="font-semibold">{u.username}</div>
                      <div className="text-xs text-slate-500">
                        {u.last_login_at ? `Last login ${new Date(u.last_login_at).toLocaleString()}` : 'Never logged in'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {userRoles.map(r => {
                        const tint =
                          r.role === 'admin'
                            ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                            : r.role === 'broker'
                              ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        const ownerName = r.owner_id ? ownerMap.get(r.owner_id)?.name : null;
                        return (
                          <span
                            key={r.role}
                            className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${tint}`}
                          >
                            {r.role}
                            {ownerName ? ` · ${ownerName}` : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <form action={resetPasswordAction} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={uid} />
                      <input
                        name="new_password"
                        type="text"
                        minLength={8}
                        placeholder="New password (8+)"
                        className="ix-input text-xs"
                      />
                      <button type="submit" className="ix-btn-secondary text-xs">
                        <KeyRound size={12} /> Reset password
                      </button>
                    </form>
                    {userRoles.map(r => (
                      <form key={r.role} action={removeBoatRoleAction}>
                        <input type="hidden" name="user_id" value={uid} />
                        <input type="hidden" name="role" value={r.role} />
                        <button type="submit" className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1">
                          <UserMinus size={12} /> Remove {r.role}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
