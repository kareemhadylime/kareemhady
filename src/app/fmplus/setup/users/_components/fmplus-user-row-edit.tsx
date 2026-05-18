'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  Pencil, Save, X, Phone, Mail as MailIcon, KeyRound, UserX, UserCheck,
  CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import {
  updateFmplusUserProfileStateAction,
  setFmplusUserRoleStateAction,
  resetFmplusPasswordStateAction,
  setFmplusUserDisabledStateAction,
  type FmplusSaveResult,
} from '../actions';
import { FmplusRolePicker } from './fmplus-role-picker';
import type { FmplusPerms, FmplusRolePreset } from '@/lib/fmplus/setup/roles';

const AUTO_CLOSE_MS = 1500;
const SAVED_LABEL: Record<NonNullable<FmplusSaveResult>['saved'], string> = {
  profile:  'Profile saved',
  role:     'Role saved',
  password: 'Password reset',
  disabled: 'Account status updated',
};

interface Props {
  userId:      string;
  fullName:    string | null;
  mobileNumber: string | null;
  email:       string | null;
  fmplusRole:  FmplusRolePreset | null;
  fmplusPerms: FmplusPerms | null;
  isSelf:      boolean;
  disabledAt:  string | null;
}

export function FmplusUserRowEdit({
  userId, fullName, mobileNumber, email,
  fmplusRole, fmplusPerms, isSelf, disabledAt,
}: Props) {
  const [editing, setEditing] = useState(false);

  const [profileState,  profileAction,  profilePending]  = useActionState<FmplusSaveResult | null, FormData>(updateFmplusUserProfileStateAction,  null);
  const [roleState,     roleAction,     rolePending]     = useActionState<FmplusSaveResult | null, FormData>(setFmplusUserRoleStateAction,        null);
  const [passwordState, passwordAction, passwordPending] = useActionState<FmplusSaveResult | null, FormData>(resetFmplusPasswordStateAction,      null);
  const [disabledState, disabledAction, disabledPending] = useActionState<FmplusSaveResult | null, FormData>(setFmplusUserDisabledStateAction,    null);

  // Auto-close on any successful save.
  useEffect(() => {
    if (!editing) return;
    const ok =
      (profileState  && profileState.ok)  ||
      (roleState     && roleState.ok)     ||
      (passwordState && passwordState.ok) ||
      (disabledState && disabledState.ok);
    if (!ok) return;
    const t = setTimeout(() => setEditing(false), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [editing, profileState, roleState, passwordState, disabledState]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-sm"
      >
        <Pencil size={12} /> Edit
      </button>
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

      {/* Profile fields */}
      <form action={profileAction} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
        <input type="hidden" name="id" value={userId} />
        <Field label="Name">
          <input name="full_name" type="text" defaultValue={fullName || ''} maxLength={80} className="ix-input !text-xs !py-1.5" />
        </Field>
        <Field label="WhatsApp number" icon={<Phone size={11} />}>
          <input name="mobile_number" type="tel" defaultValue={mobileNumber || ''} placeholder="+201234567890" className="ix-input !text-xs !py-1.5" />
        </Field>
        <Field label="Email" icon={<MailIcon size={11} />}>
          <input name="email" type="email" defaultValue={email || ''} placeholder="name@example.com" className="ix-input !text-xs !py-1.5" />
        </Field>
        <div className="md:col-span-3 flex items-center justify-end gap-3">
          <ResultPill state={profileState} pending={profilePending} kind="profile" />
          <SaveButton pending={profilePending} label="Save profile" />
        </div>
      </form>

      {/* FM+ Role */}
      <form action={roleAction} className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
        <input type="hidden" name="id" value={userId} />
        <FmplusRolePicker
          nameRole="fmplus_role"
          namePerms="fmplus_perms"
          defaultRole={fmplusRole || 'shift_submitter'}
          defaultPerms={fmplusPerms}
        />
        <div className="flex items-center justify-end gap-3">
          <ResultPill state={roleState} pending={rolePending} kind="role" />
          <SaveButton pending={rolePending} label="Save role" />
        </div>
      </form>

      {/* Reset password */}
      <form action={passwordAction} className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-end gap-2 flex-wrap">
        <input type="hidden" name="id" value={userId} />
        <Field label="Reset password" icon={<KeyRound size={11} />}>
          <input name="new_password" type="password" minLength={8} placeholder="min 8 chars" className="ix-input !text-xs !py-1.5" />
        </Field>
        <SaveButton pending={passwordPending} label="Reset" />
        <ResultPill state={passwordState} pending={passwordPending} kind="password" />
      </form>

      {/* Disable / enable */}
      {!isSelf && (
        <form action={disabledAction} className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 flex-wrap">
          <input type="hidden" name="id" value={userId} />
          <input type="hidden" name="disabled" value={disabledAt ? '0' : '1'} />
          <button
            type="submit"
            disabled={disabledPending}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition shadow-sm ' +
              (disabledAt
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900'
                : 'border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950')
            }
          >
            {disabledPending
              ? <><Loader2 size={12} className="animate-spin" /> …</>
              : disabledAt
                ? <><UserCheck size={12} /> Re-enable account</>
                : <><UserX size={12} /> Disable account</>}
          </button>
          <ResultPill state={disabledState} pending={disabledPending} kind="disabled" />
          {disabledAt && (
            <span className="text-[10px] text-rose-600 dark:text-rose-300">
              Disabled at {new Date(disabledAt).toLocaleString('en-US')}
            </span>
          )}
        </form>
      )}
    </div>
  );
}

function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-600 text-white text-xs font-medium hover:bg-lime-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
    >
      {pending
        ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
        : <><Save size={12} /> {label}</>}
    </button>
  );
}

function ResultPill({
  state, pending, kind,
}: {
  state: FmplusSaveResult | null;
  pending: boolean;
  kind: NonNullable<FmplusSaveResult>['saved'];
}) {
  if (pending) return null;
  if (!state || state.saved !== kind) return null;
  if (state.ok) {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 size={12} /> {SAVED_LABEL[kind]} · closing…
      </span>
    );
  }
  return (
    <span role="alert" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs font-medium border border-rose-200 dark:border-rose-800">
      <XCircle size={12} /> {state.error || 'Save failed'}
    </span>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium inline-flex items-center gap-1">
        {icon} {label}
      </span>
      {children}
    </label>
  );
}
