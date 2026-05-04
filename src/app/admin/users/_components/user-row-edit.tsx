'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  Pencil,
  Save,
  Shield,
  X,
  Trash2,
  Phone,
  Mail as MailIcon,
  Briefcase,
  CheckCircle2,
  XCircle,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import {
  updateUserProfileStateAction,
  updateUserRoleStateAction,
  setDomainRolesStateAction,
  deleteUserAction,
  sendCredentialsViaWhatsAppStateAction,
  type SaveResult,
} from '../actions';

type DomainOption = { value: string; label: string };

// Auto-collapse delay after a successful save. Long enough for the user to
// read "Profile saved" + the green checkmark, short enough that the panel
// doesn't linger after the work is done.
const AUTO_CLOSE_MS = 1500;

const SAVED_LABEL: Record<'profile' | 'role' | 'domains' | 'wa-creds', string> = {
  profile: 'Profile saved',
  role: 'Role saved',
  domains: 'Domains saved',
  'wa-creds': 'Credentials sent via WhatsApp',
};

// How long the success/error pill on the WhatsApp button stays visible
// before fading out. Long enough to read, short enough to retry quickly.
const WA_FEEDBACK_MS = 4000;

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

  // Three independent action states — each Save button has its own pending
  // and result. Once any of them returns ok=true we close the panel after
  // AUTO_CLOSE_MS so the user sees the confirmation flash before it
  // disappears.
  const [profileState, profileFormAction, profilePending] = useActionState<
    SaveResult | null,
    FormData
  >(updateUserProfileStateAction, null);
  const [roleState, roleFormAction, rolePending] = useActionState<
    SaveResult | null,
    FormData
  >(updateUserRoleStateAction, null);
  const [domainsState, domainsFormAction, domainsPending] = useActionState<
    SaveResult | null,
    FormData
  >(setDomainRolesStateAction, null);
  const [waCredsState, waCredsFormAction, waCredsPending] = useActionState<
    SaveResult | null,
    FormData
  >(sendCredentialsViaWhatsAppStateAction, null);

  // Local "show feedback pill" timer for the WhatsApp button. The pill
  // sits beside the button in the collapsed (non-editing) row, so it has
  // to clear itself rather than rely on the panel collapsing.
  const [waPillVisible, setWaPillVisible] = useState(false);
  useEffect(() => {
    if (waCredsPending) {
      setWaPillVisible(false);
      return;
    }
    if (!waCredsState) return;
    setWaPillVisible(true);
    const t = setTimeout(() => setWaPillVisible(false), WA_FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [waCredsState, waCredsPending]);

  // Auto-close on any successful save. Errors keep the panel open so the
  // user can correct and retry.
  useEffect(() => {
    if (!editing) return;
    const successful =
      (profileState && profileState.ok) ||
      (roleState && roleState.ok) ||
      (domainsState && domainsState.ok);
    if (!successful) return;
    const t = setTimeout(() => setEditing(false), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [editing, profileState, roleState, domainsState]);

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
        <SendWhatsAppCredentialsButton
          userId={userId}
          mobileNumber={mobileNumber}
          formAction={waCredsFormAction}
          pending={waCredsPending}
          state={waCredsState}
          pillVisible={waPillVisible}
        />
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
        action={profileFormAction}
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
        <div className="md:col-span-3 flex items-center justify-end gap-3">
          <ResultPill state={profileState} pending={profilePending} kind="profile" />
          <SaveButton pending={profilePending} label="Save profile" />
        </div>
      </form>

      {/* Role + Delete (sibling forms — HTML forms cannot nest) */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-200 dark:border-slate-700">
        <form action={roleFormAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={userId} />
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium">
            Role
          </span>
          <select
            name="role"
            defaultValue={currentRole}
            className="ix-input !text-xs !py-1.5 max-w-[180px]"
          >
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
          <SaveButton pending={rolePending} label="Save role" />
          <ResultPill state={roleState} pending={rolePending} kind="role" />
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
          action={domainsFormAction}
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
          <div className="pt-1 flex items-center gap-3">
            <SaveButton pending={domainsPending} label="Save domains" />
            <ResultPill state={domainsState} pending={domainsPending} kind="domains" />
          </div>
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
      {pending ? (
        <>
          <Loader2 size={12} className="animate-spin" /> Saving…
        </>
      ) : (
        <>
          <Save size={12} /> {label}
        </>
      )}
    </button>
  );
}

function ResultPill({
  state,
  pending,
  kind,
}: {
  state: SaveResult | null;
  pending: boolean;
  kind: 'profile' | 'role' | 'domains';
}) {
  // Don't surface another form's result on this pill — only the action that
  // owns this pill (kind === state.saved) shows feedback. Keeps the visual
  // wiring 1:1 between button and confirmation.
  if (pending) return null;
  if (!state || state.saved !== kind) return null;
  if (state.ok) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800"
      >
        <CheckCircle2 size={12} /> {SAVED_LABEL[kind]} · closing…
      </span>
    );
  }
  return (
    <span
      role="alert"
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs font-medium border border-rose-200 dark:border-rose-800"
    >
      <XCircle size={12} /> {state.error || 'Save failed'}
    </span>
  );
}

function SendWhatsAppCredentialsButton({
  userId,
  mobileNumber,
  formAction,
  pending,
  state,
  pillVisible,
}: {
  userId: string;
  mobileNumber: string | null;
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: SaveResult | null;
  pillVisible: boolean;
}) {
  const disabled = pending || !mobileNumber;
  const tooltip = !mobileNumber
    ? 'No mobile number on file — add one in the Edit panel first'
    : 'Generate a new password and send credentials via WhatsApp';

  // Confirm before submitting. This action resets the user's password —
  // an existing user who was already using the dashboard would be locked
  // out of their old password, so we want a clear "are you sure?".
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (
      !confirm(
        'This will generate a NEW temporary password for this user, send it to their WhatsApp, and replace their existing password. Continue?',
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <form action={formAction} onSubmit={handleSubmit}>
        <input type="hidden" name="id" value={userId} />
        <button
          type="submit"
          disabled={disabled}
          title={tooltip}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
        >
          {pending ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Sending…
            </>
          ) : (
            <>
              <MessageCircle size={12} /> Send credentials
            </>
          )}
        </button>
      </form>
      {pillVisible && state && state.saved === 'wa-creds' && (
        state.ok ? (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800"
          >
            <CheckCircle2 size={12} /> Sent
          </span>
        ) : (
          <span
            role="alert"
            title={state.error}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs font-medium border border-rose-200 dark:border-rose-800 max-w-[260px]"
          >
            <XCircle size={12} className="shrink-0" />
            <span className="truncate">{state.error || 'Send failed'}</span>
          </span>
        )
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const r = role.toLowerCase();
  const cls =
    r === 'admin'
      ? 'bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-200 border-lime-200 dark:border-lime-800'
      : r === 'editor'
        ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700';
  return (
    <span
      className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded border ${cls}`}
    >
      {role}
    </span>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium inline-flex items-center gap-1">
        {icon} {label}
      </span>
      {children}
    </label>
  );
}
