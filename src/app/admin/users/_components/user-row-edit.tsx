'use client';

import { useState } from 'react';
import { Pencil, Save, Shield, X, Trash2, Phone, Mail as MailIcon, Briefcase } from 'lucide-react';
import {
  updateUserAction,
  updateUserProfileAction,
  setDomainRolesAction,
  deleteUserAction,
} from '../actions';

type DomainOption = { value: string; label: string };

export function UserRowEdit({
  userId,
  currentRole,
  isAdmin,
  isSelf,
  mobileNumber,
  email,
  position,
  domains,
  domainRoleSet,
}: {
  userId: string;
  currentRole: string;
  isAdmin: boolean;
  isSelf: boolean;
  mobileNumber: string | null;
  email: string | null;
  position: string | null;
  domains: DomainOption[];
  domainRoleSet: Set<string>;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <RoleBadge role={currentRole} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-sm"
        >
          <Pencil size={12} /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 w-full ix-card !bg-slate-50 dark:!bg-slate-800/40 p-4 border-amber-300 dark:border-amber-700">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">
        <Pencil size={11} /> Editing — changes are not saved until you click Save
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="ml-auto inline-flex items-center gap-1 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white"
        >
          <X size={12} /> Cancel
        </button>
      </div>

      {/* Profile fields (mobile / email / position) */}
      <form
        action={updateUserProfileAction}
        className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end"
      >
        <input type="hidden" name="id" value={userId} />
        <Field label="Mobile number" icon={<Phone size={11} />}>
          <input
            name="mobile_number"
            type="tel"
            defaultValue={mobileNumber || ''}
            placeholder="+201234567890"
            className="ix-input !text-xs !py-1.5"
          />
        </Field>
        <Field label="Email" icon={<MailIcon size={11} />}>
          <input
            name="email"
            type="email"
            defaultValue={email || ''}
            placeholder="name@example.com"
            className="ix-input !text-xs !py-1.5"
          />
        </Field>
        <Field label="Position" icon={<Briefcase size={11} />}>
          <input
            name="position"
            type="text"
            defaultValue={position || ''}
            placeholder="e.g. GR Manager"
            maxLength={80}
            className="ix-input !text-xs !py-1.5"
          />
        </Field>
        <div className="md:col-span-3 flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-600 text-white text-xs font-medium hover:bg-lime-700 transition shadow-sm"
          >
            <Save size={12} /> Save profile
          </button>
        </div>
      </form>

      {/* Role + Delete (sibling forms — HTML forms cannot nest) */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-200 dark:border-slate-700">
        <form action={updateUserAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={userId} />
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium">Role</span>
          <select
            name="role"
            defaultValue={currentRole}
            className="ix-input !text-xs !py-1.5 max-w-[180px]"
          >
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-600 text-white text-xs font-medium hover:bg-lime-700 transition shadow-sm"
          >
            <Save size={12} /> Save role
          </button>
        </form>
        {!isSelf && (
          <form action={deleteUserAction} className="ml-auto">
            <input type="hidden" name="id" value={userId} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-300 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950 hover:border-rose-300 dark:hover:border-rose-700 transition"
            >
              <Trash2 size={12} /> Delete user
            </button>
          </form>
        )}
      </div>

      {/* Domain access — only when not admin (admins see all domains by default) */}
      {!isAdmin && (
        <form
          action={setDomainRolesAction}
          className="space-y-2 bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700"
        >
          <input type="hidden" name="user_id" value={userId} />
          <p className="text-[11px] text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1">
            <Shield size={11} /> Domain access — tick any or multiple
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {domains.map(d => (
              <label
                key={d.value}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 cursor-pointer hover:border-lime-400 dark:hover:border-lime-500 transition"
              >
                <input
                  type="checkbox"
                  name={`domain:${d.value}`}
                  value="viewer"
                  defaultChecked={domainRoleSet.has(d.value)}
                />
                <span className="font-medium">{d.label}</span>
              </label>
            ))}
          </div>
          <div className="pt-1">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-600 text-white text-xs font-medium hover:bg-lime-700 transition shadow-sm"
            >
              <Save size={12} /> Save domains
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const r = role.toLowerCase();
  const cls = r === 'admin'
    ? 'bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-200 border-lime-200 dark:border-lime-800'
    : r === 'editor'
      ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
  return (
    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded border ${cls}`}>
      {role}
    </span>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium inline-flex items-center gap-1">
        {icon} {label}
      </span>
      {children}
    </label>
  );
}
