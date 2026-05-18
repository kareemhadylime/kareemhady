import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  UserCog, UserPlus, Users as UsersIcon,
  Phone as PhoneIcon, Mail as MailIcon, Shield,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { FmplusHero } from '../../_components/fmplus-hero';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { FMPLUS_ROLE_PRESETS, type FmplusPerms, type FmplusRolePreset } from '@/lib/fmplus/setup/roles';
import { createFmplusUserAction } from './actions';
import { FmplusRolePicker } from './_components/fmplus-role-picker';
import { FmplusUserRowEdit } from './_components/fmplus-user-row-edit';

export const dynamic = 'force-dynamic';

type UserRow = {
  id:            string;
  username:      string;
  full_name:     string | null;
  email:         string | null;
  mobile_number: string | null;
  fmplus_role:   FmplusRolePreset | null;
  fmplus_perms:  FmplusPerms | null;
  last_login_at: string | null;
  disabled_at:   string | null;
};

const PRESET_LABEL: Record<FmplusRolePreset, { en: string; ar: string }> = Object.fromEntries(
  FMPLUS_ROLE_PRESETS.map((p) => [p.key, { en: p.labelEn, ar: p.labelAr }] as const),
) as Record<FmplusRolePreset, { en: string; ar: string }>;

export default async function FmplusUsersAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/fmplus/setup/users');
  if (!me.is_admin) notFound();

  const sb = supabaseAdmin();
  const { data: grants } = await sb
    .from('app_user_domain_roles')
    .select('user_id')
    .eq('domain', 'fmplus');
  const userIds = ((grants as Array<{ user_id: string }> | null) || []).map((g) => g.user_id);

  let users: UserRow[] = [];
  if (userIds.length > 0) {
    const { data } = await sb
      .from('app_users')
      .select('id, username, full_name, email, mobile_number, fmplus_role, fmplus_perms, last_login_at, disabled_at')
      .in('id', userIds)
      .order('created_at');
    users = (data as UserRow[] | null) || [];
  }

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="hover:text-fmplus-gold">FMPLUS</Link>
        <span className="text-slate-400">/</span>
        <Link href="/fmplus/setup" className="hover:text-fmplus-gold">Setup</Link>
        <span className="text-slate-400">/</span>
        <span>User Access</span>
      </TopNav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1">
        <FmplusHero
          eyebrow="FMPLUS · SETUP · USER ACCESS"
          title="User Access"
          subtitle="Manage who can sign into FM+ and what they can do."
          icon={UserCog}
          showLogo={false}
        />

        {/* Create user form */}
        <section className="ix-card p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <UserPlus size={16} className="text-fmplus-gold" /> Add FM+ user
          </h2>
          <form action={createFmplusUserAction} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <Field label="Name" required>
              <input name="full_name" type="text" required maxLength={80} className="ix-input w-full" placeholder="e.g. Yasser Ali" />
            </Field>
            <Field label="Username" required>
              <input name="username" type="text" required minLength={3} className="ix-input w-full" placeholder="e.g. yasser" />
            </Field>
            <Field label="Password" required>
              <input name="password" type="password" required minLength={8} className="ix-input w-full" placeholder="min 8 chars" />
            </Field>
            <Field label="WhatsApp number" icon={<PhoneIcon size={11} />}>
              <input name="mobile_number" type="tel" className="ix-input w-full" placeholder="+201234567890" />
            </Field>
            <Field label="Email" icon={<MailIcon size={11} />}>
              <input name="email" type="email" className="ix-input w-full" placeholder="name@example.com" />
            </Field>
            <div className="md:col-span-2">
              <FmplusRolePicker
                nameRole="fmplus_role"
                namePerms="fmplus_perms"
                defaultRole="shift_submitter"
                defaultPerms={null}
              />
            </div>
            <div className="md:col-span-2 flex items-center justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-fmplus-gold text-fmplus-black text-sm font-bold hover:bg-fmplus-yellow inline-flex items-center gap-2 transition"
              >
                <UserPlus size={14} /> Create FM+ user
              </button>
            </div>
          </form>
        </section>

        {/* List of FM+ users */}
        <section className="ix-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <UsersIcon size={16} className="text-fmplus-gold" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {users.length} FM+ user{users.length === 1 ? '' : 's'}
            </h2>
          </div>
          {users.length === 0 ? (
            <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
              No FM+ users yet. Create one above to get started.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {users.map((u) => {
                const presetLabel = u.fmplus_role ? PRESET_LABEL[u.fmplus_role] : null;
                const hasOverrides = u.fmplus_perms && Object.keys(u.fmplus_perms).length > 0;
                return (
                  <div key={u.id} className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold inline-flex items-center gap-2 text-slate-900 dark:text-slate-100">
                          {u.full_name || u.username}
                          {u.full_name && (
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">({u.username})</span>
                          )}
                          {u.id === me.id && (
                            <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                              you
                            </span>
                          )}
                          {u.disabled_at && (
                            <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200">
                              disabled
                            </span>
                          )}
                        </p>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-3 flex-wrap mt-1">
                          {u.mobile_number && (
                            <a href={`https://wa.me/${u.mobile_number.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                              <PhoneIcon size={10} /> {u.mobile_number}
                            </a>
                          )}
                          {u.email && (
                            <a href={`mailto:${u.email}`} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white">
                              <MailIcon size={10} /> {u.email}
                            </a>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 inline-flex items-center gap-2">
                          <Shield size={10} />
                          {presetLabel ? (
                            <>
                              <span className="font-medium">{presetLabel.en}</span>
                              <span className="text-slate-400 dark:text-slate-500">({presetLabel.ar})</span>
                              {hasOverrides && (
                                <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200">
                                  advanced
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="italic text-slate-500 dark:text-slate-400">Role not set</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          {u.last_login_at
                            ? `last login ${new Date(u.last_login_at).toLocaleString('en-US')}`
                            : 'never signed in'}
                        </p>
                      </div>
                      <FmplusUserRowEdit
                        userId={u.id}
                        fullName={u.full_name}
                        mobileNumber={u.mobile_number}
                        email={u.email}
                        fmplusRole={u.fmplus_role}
                        fmplusPerms={u.fmplus_perms}
                        isSelf={u.id === me.id}
                        disabledAt={u.disabled_at}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Field({ label, required, icon, children }: {
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
