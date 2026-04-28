import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ChevronRight,
  UserPlus,
  Users as UsersIcon,
  Activity,
  Phone as PhoneIcon,
  Mail as MailIcon,
  Briefcase,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { SetupTabs } from '@/app/admin/_components/setup-tabs';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { DOMAINS, DOMAIN_LABELS } from '@/lib/rules/presets';
import type { Domain } from '@/lib/rules/presets';
import { createUserAction } from './actions';
import { UserRowEdit } from './_components/user-row-edit';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  username: string;
  role: string;
  last_login_at: string | null;
  created_at: string;
  mobile_number: string | null;
  email: string | null;
  position: string | null;
};
type DomainRoleRow = { user_id: string; domain: string; role: string };
type SessionRow = {
  user_id: string;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  user_agent: string | null;
  ip: string | null;
};

export default async function UsersAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/admin/users');
  if (!me.is_admin) notFound();

  const sb = supabaseAdmin();
  const [usersRes, rolesRes, sessionsRes] = await Promise.all([
    sb
      .from('app_users')
      .select('id, username, role, last_login_at, created_at, mobile_number, email, position')
      .order('created_at'),
    sb.from('app_user_domain_roles').select('user_id, domain, role'),
    // 50 most recent sessions by last_seen so we can surface "who's active".
    sb
      .from('app_sessions')
      .select('user_id, created_at, last_seen_at, expires_at, user_agent, ip')
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(50),
  ]);
  const users = usersRes.data;
  const roles = rolesRes.data;
  const sessions = sessionsRes.data;

  const rolesByUser = new Map<string, DomainRoleRow[]>();
  for (const r of (roles as DomainRoleRow[]) || []) {
    const arr = rolesByUser.get(r.user_id) || [];
    arr.push(r);
    rolesByUser.set(r.user_id, arr);
  }
  const usersById = new Map<string, UserRow>();
  for (const u of (users as UserRow[]) || []) {
    usersById.set(u.id, u);
  }

  const domainOptions = DOMAINS.map(d => ({ value: d, label: DOMAIN_LABELS[d as Domain] }));

  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">
          Home
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/admin" className="ix-link">
          Setup
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Users &amp; Roles</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium">
            Setup · Users
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Users &amp; Domain Roles
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Admins see everything. Non-admins only see the domains they&apos;re granted below. Roles + domain access are locked behind the per-row Edit button to prevent accidental changes.
          </p>
        </header>

        <SetupTabs activeTab="users" />

        <section className="ix-card p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
            <UserPlus size={16} className="text-lime-600" />
            Add user
          </h2>
          <form
            action={createUserAction}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-end"
          >
            <Field label="Username" required>
              <input
                name="username"
                required
                minLength={3}
                className="ix-input w-full"
                placeholder="e.g. yassin"
              />
            </Field>
            <Field label="Password" required>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="ix-input w-full"
                placeholder="min 8 chars"
              />
            </Field>
            <Field label="Role" required>
              <select name="role" defaultValue="viewer" className="ix-input w-full">
                <option value="admin">admin · sees all domains</option>
                <option value="editor">editor · per-domain</option>
                <option value="viewer">viewer · per-domain</option>
              </select>
            </Field>
            <Field label="Mobile number" icon={<PhoneIcon size={11} />}>
              <input
                name="mobile_number"
                type="tel"
                className="ix-input w-full"
                placeholder="+201234567890"
              />
            </Field>
            <Field label="Email address" icon={<MailIcon size={11} />}>
              <input
                name="email"
                type="email"
                className="ix-input w-full"
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Position" icon={<Briefcase size={11} />}>
              <input
                name="position"
                type="text"
                maxLength={80}
                className="ix-input w-full"
                placeholder="e.g. GR Manager"
              />
            </Field>
            <div className="md:col-span-2 lg:col-span-3 flex items-center justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-lime-600 text-white text-sm font-medium hover:bg-lime-700 inline-flex items-center gap-2"
              >
                <UserPlus size={14} /> Create user
              </button>
            </div>
          </form>
        </section>

        <section className="ix-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <UsersIcon size={16} className="text-lime-600" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {users?.length || 0} users
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {(users as UserRow[] | null)?.map(u => {
              const userRoles = rolesByUser.get(u.id) || [];
              const userRoleSet = new Set(userRoles.map(r => r.domain));
              const isAdmin = (u.role || '').toLowerCase() === 'admin';
              return (
                <div key={u.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold inline-flex items-center gap-2 text-slate-900 dark:text-white">
                        {u.username}
                        {isAdmin && (
                          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-200">
                            admin
                          </span>
                        )}
                        {u.id === me.id && (
                          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                            you
                          </span>
                        )}
                      </p>
                      {/* Contact metadata */}
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap mt-1">
                        {u.position && (
                          <span className="inline-flex items-center gap-1"><Briefcase size={10} /> {u.position}</span>
                        )}
                        {u.email && (
                          <a href={`mailto:${u.email}`} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                            <MailIcon size={10} /> {u.email}
                          </a>
                        )}
                        {u.mobile_number && (
                          <a href={`tel:${u.mobile_number}`} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                            <PhoneIcon size={10} /> {u.mobile_number}
                          </a>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        {u.last_login_at
                          ? `last login ${new Date(u.last_login_at).toLocaleString('en-US')}`
                          : 'never signed in'}
                      </p>
                    </div>
                    <UserRowEdit
                      userId={u.id}
                      currentRole={u.role}
                      isAdmin={isAdmin}
                      isSelf={u.id === me.id}
                      mobileNumber={u.mobile_number}
                      email={u.email}
                      position={u.position}
                      domains={domainOptions}
                      domainRoleSet={userRoleSet}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="ix-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
              <Activity size={16} className="text-lime-600" />
              Recent session activity
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              last 50 by last-seen
            </span>
          </div>
          {(!sessions || sessions.length === 0) ? (
            <p className="p-5 text-sm text-slate-500 dark:text-slate-300">
              No active sessions recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left py-2 px-4">User</th>
                    <th className="text-left py-2 px-4">Created</th>
                    <th className="text-left py-2 px-4">Last seen</th>
                    <th className="text-left py-2 px-4">IP</th>
                    <th className="text-left py-2 px-4">User agent</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessions as SessionRow[]).map((s, i) => {
                    const u = usersById.get(s.user_id);
                    const lastSeen = s.last_seen_at
                      ? new Date(s.last_seen_at)
                      : null;
                    const ageMinutes = lastSeen
                      ? (Date.now() - lastSeen.getTime()) / 60_000
                      : null;
                    const isActive = ageMinutes != null && ageMinutes < 30;
                    const expired =
                      new Date(s.expires_at).getTime() < Date.now();
                    return (
                      <tr
                        key={`${s.user_id}:${i}`}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-2 px-4 font-medium text-slate-800 dark:text-slate-100">
                          {u?.username || (
                            <span className="text-slate-400 dark:text-slate-500">
                              [deleted user]
                            </span>
                          )}
                          {isActive && !expired && (
                            <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          )}
                          {expired && (
                            <span className="ml-2 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                              expired
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-[11px] text-slate-500 dark:text-slate-300 tabular-nums">
                          {new Date(s.created_at).toLocaleString('en-US')}
                        </td>
                        <td className="py-2 px-4 text-[11px] text-slate-500 dark:text-slate-300 tabular-nums">
                          {lastSeen
                            ? lastSeen.toLocaleString('en-US')
                            : '—'}
                        </td>
                        <td className="py-2 px-4 text-[11px] text-slate-500 dark:text-slate-300 font-mono">
                          {s.ip || '—'}
                        </td>
                        <td className="py-2 px-4 text-[11px] text-slate-500 dark:text-slate-300 truncate max-w-[340px]">
                          <span title={s.user_agent || ''}>
                            {s.user_agent || '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Field({
  label, required, icon, children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1">
        {icon}{label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
