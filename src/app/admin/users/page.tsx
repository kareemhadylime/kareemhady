import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, UserPlus, Shield, Users as UsersIcon } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { DOMAINS, DOMAIN_LABELS } from '@/lib/rules/presets';
import type { Domain } from '@/lib/rules/presets';
import {
  createUserAction,
  updateUserAction,
  deleteUserAction,
  setDomainRolesAction,
} from './actions';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  username: string;
  role: string;
  last_login_at: string | null;
  created_at: string;
};
type DomainRoleRow = { user_id: string; domain: string; role: string };

export default async function UsersAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/admin/users');
  if (!me.is_admin) notFound();

  const sb = supabaseAdmin();
  const { data: users } = await sb
    .from('app_users')
    .select('id, username, role, last_login_at, created_at')
    .order('created_at');
  const { data: roles } = await sb
    .from('app_user_domain_roles')
    .select('user_id, domain, role');
  const rolesByUser = new Map<string, DomainRoleRow[]>();
  for (const r of (roles as DomainRoleRow[]) || []) {
    const arr = rolesByUser.get(r.user_id) || [];
    arr.push(r);
    rolesByUser.set(r.user_id, arr);
  }

  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">
          Dashboard
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Users &amp; Roles</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Admin · Users
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Users &amp; Domain Roles
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Admins see everything. Non-admins only see the domains they're
            granted below.
          </p>
        </header>

        <section className="ix-card p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <UserPlus size={16} className="text-lime-600" />
            Add user
          </h2>
          <form
            action={createUserAction}
            className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
          >
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-700">Username</span>
              <input name="username" required minLength={3} className="ix-input w-full" placeholder="e.g. yassin" />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-700">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="ix-input w-full"
                placeholder="min 8 chars"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-slate-700">Role</span>
              <select name="role" defaultValue="viewer" className="ix-input w-full">
                <option value="admin">admin · sees all domains</option>
                <option value="editor">editor · per-domain</option>
                <option value="viewer">viewer · per-domain</option>
              </select>
            </label>
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-lime-600 text-white text-sm font-medium hover:bg-lime-700"
            >
              Create
            </button>
          </form>
        </section>

        <section className="ix-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <UsersIcon size={16} className="text-lime-600" />
            <h2 className="text-sm font-semibold">
              {users?.length || 0} users
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(users as UserRow[] | null)?.map(u => {
              const userRoles = rolesByUser.get(u.id) || [];
              const userRoleMap = new Map(userRoles.map(r => [r.domain, r.role]));
              const isAdmin = (u.role || '').toLowerCase() === 'admin';
              return (
                <div key={u.id} className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold inline-flex items-center gap-2">
                        {u.username}
                        {isAdmin && (
                          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-lime-100 text-lime-700">
                            admin
                          </span>
                        )}
                        {u.id === me.id && (
                          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            you
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {u.last_login_at
                          ? `last login ${new Date(u.last_login_at).toLocaleString('en-US')}`
                          : 'never signed in'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={updateUserAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="ix-input text-xs py-1"
                        >
                          <option value="admin">admin</option>
                          <option value="editor">editor</option>
                          <option value="viewer">viewer</option>
                        </select>
                        <button
                          type="submit"
                          className="ml-2 text-[11px] text-slate-600 hover:text-lime-700"
                        >
                          Save role
                        </button>
                      </form>
                      {u.id !== me.id && (
                        <form action={deleteUserAction}>
                          <input type="hidden" name="id" value={u.id} />
                          <button
                            type="submit"
                            className="text-[11px] text-rose-600 hover:text-rose-800"
                          >
                            Delete
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  {!isAdmin && (
                    <form
                      action={setDomainRolesAction}
                      className="space-y-2 bg-slate-50 rounded-lg p-3"
                    >
                      <input type="hidden" name="user_id" value={u.id} />
                      <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                        <Shield size={11} /> Domain access — tick any or
                        multiple
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {DOMAINS.map(d => (
                          <label
                            key={d}
                            className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border border-slate-200 bg-white cursor-pointer hover:border-lime-400 transition"
                          >
                            <input
                              type="checkbox"
                              name={`domain:${d}`}
                              value="viewer"
                              defaultChecked={userRoleMap.has(d)}
                            />
                            <span className="font-medium">{DOMAIN_LABELS[d as Domain]}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="submit"
                        className="text-[11px] text-lime-700 hover:text-lime-900 font-medium"
                      >
                        Save domains
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
