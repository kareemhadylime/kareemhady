# Admin Users — WhatsApp Sign-in Details + Account Editing (Design Spec)

**Date:** 2026-05-03
**Status:** Spec — pending implementation plan
**Branch:** `claude/inspiring-booth-3d348a` (the active worktree branch — same as the in-flight owner-features 32-task plan; per the project's CLAUDE.md "Never create a new branch")
**Rollout:** Single-shot release (one migration, one PR, one deploy)

---

## 1. Overview

Adds three capabilities to the existing admin Users page at `/emails/boat-rental/admin/users`:

1. **WhatsApp sign-in delivery** — auto-send welcome message with username + temp password when a broker or owner is created (if WhatsApp is provided), plus a manual `[Send sign-in details]` button on each user card to re-send later (auto-generates a fresh temp password).
2. **Display name** — optional friendly name distinct from the lowercase username; used in WhatsApp greeting and as the primary heading on the user card.
3. **Active/inactive toggle** — admin can soft-disable a user account without deleting it. Disabled users cannot log in; existing sessions are wiped on disable.

Reuses the existing `boat_rental_notifications` outbox + Green-API WhatsApp infrastructure that ships with the boat rental module.

---

## 2. Goals & non-goals

### Goals
- Replace the verbal/email-based sign-in handoff with an automated WhatsApp message
- Let admin re-send sign-in details when users lose their password, without manually rotating the password and re-typing
- Soft-disable accounts (e.g., when an owner stops working with the rental business) without losing audit history
- Let admin label users with friendlier display names than the technical lowercase username

### Non-goals
- Email delivery (WhatsApp only — matches the rest of the boat-rental module)
- Multi-language welcome messages (English only per Q4)
- Self-service password recovery (admin still has to initiate)
- Two-factor / MFA
- Password complexity rules beyond the existing 8+ char minimum
- Bulk operations (send sign-in details to N users at once)
- Audit log UI (the new actions log to `boat_rental_audit_log` via existing helper, but no admin UI for browsing the log is added)

---

## 3. Decisions log (from clarifying questions)

| Q | Decision | Rationale |
|---|----------|-----------|
| Q1 Auto vs manual send | **C — Both** | Auto-fires on create (zero-touch happy path); manual button covers re-send / lost password |
| Q2 Password on re-send | **X — Auto-generate new temp** | Original is hashed and unrecoverable; one-click UX; old password is invalidated atomically |
| Q3 What "Edit" covers | **R + S — Active/inactive toggle + display name** | Username stays immutable (used as identifier in audit logs); owner-record link change deferred (not requested) |
| Q4 Welcome message language | **EN — English only** | Matches admin-side workflow; no per-broker lang preference exists today |
| Q5 UX feedback | **iii — Both** (inline button states + toast) | Standard pattern matching `MarkPaidForm` and other interactive admin actions |

---

## 4. Data model

### 4.1 Migration `0073_admin_user_ux_upgrades.sql`

```sql
-- 0073: Admin user account UX upgrades.
-- Adds optional display_name + soft-disable fields to app_users.
-- All additive; no data migration needed.
--
-- DOWN:
--   alter table public.app_users
--     drop column if exists disabled_by,
--     drop column if exists disabled_at,
--     drop column if exists display_name;

alter table public.app_users
  add column if not exists display_name text,
  add column if not exists disabled_at  timestamptz,
  add column if not exists disabled_by  uuid references public.app_users(id);

create index if not exists idx_app_users_disabled
  on public.app_users (disabled_at) where disabled_at is not null;
```

**`display_name`** — optional. Falls back to `username` everywhere it's displayed.
**`disabled_at`** — null = active, set = disabled (timestamp records when). Existing index `idx_app_users_disabled` is partial so it only stores the small minority of disabled rows.
**`disabled_by`** — optional FK to the admin user who disabled this account. Useful for audit. Nullable to avoid blocking deletes of the disabling admin.

### 4.2 No notifications table change

`boat_rental_notifications` already exists with the required columns. New `template_key = 'admin_signin_details'` is just a string value — there's no enum/check constraint to update.

### 4.3 No app_users role/domain change

`app_users.role` stays `'viewer'`; sub-role lives in `boat_rental_user_roles` as today. Disabled state is a separate axis.

---

## 5. Migrations & rollback

One migration file: `supabase/migrations/0073_admin_user_ux_upgrades.sql`.

**Pre-deploy verification:**
1. Apply on Supabase branch via `mcp__supabase__create_branch` + `apply_migration`
2. Verify `\d app_users` shows the three new columns
3. Verify the partial index exists: `\d idx_app_users_disabled`
4. Smoke test: insert a row with `disabled_at = now()`, confirm constraint accepts it; query by index

**Rollback:** the `-- DOWN:` block at the top of the migration file. Manual paste in SQL Editor if needed.

---

## 6. Server actions

All in `src/app/emails/boat-rental/admin/users/actions.ts`.

### 6.1 Modify existing `inviteBrokerAction` and `inviteOwnerAction`

After successful upsert + role assignment, **if `whatsapp` is provided**, enqueue a `admin_signin_details` notification with the username + the temp password the admin just typed. The password is the SAME one stored in `password_hash` (we still have it in plaintext at this point in the request because the form submitted it). After enqueue, flush via the existing Green-API outbox.

If `whatsapp` is null, skip the enqueue silently. The form's hint text tells the admin auto-send requires WhatsApp.

If the user already existed (admin re-invited a username), still enqueue (but **only the explicitly typed password** — don't auto-rotate on re-invite). This handles the "I'm re-inviting because they lost their password" case.

### 6.2 New `sendSigninDetailsAction(formData)`

```typescript
export async function sendSigninDetailsAction(formData: FormData): Promise<
  | { ok: true; sent_at: string }
  | { ok: false; error: 'no_whatsapp' | 'not_found' | 'forbidden' | 'user_disabled' | 'enqueue_failed' }
>
```

Inputs: `user_id` (required).

Behavior:
1. `requireBoatAdmin()` — gate
2. Look up `app_users` row — fetch `username`, `display_name`, `whatsapp`, `disabled_at`
3. If user not found → `{ ok: false, error: 'not_found' }`
4. If `whatsapp` is null → `{ ok: false, error: 'no_whatsapp' }`
5. If `disabled_at IS NOT NULL` → reject with `{ ok: false, error: 'user_disabled' }`. UI also hides the button on disabled cards (defense in depth — §8.4). Admin should re-enable first, then send.
6. Determine the user's primary role (broker / owner) by looking at `boat_rental_user_roles` — pick `'broker'` if any broker row, else `'owner'`. If neither, treat as just generic 'user'.
7. Generate a 12-char temp password via `randomFriendlyPassword()` helper (see §6.6)
8. Update `app_users.password_hash` with `hashPassword(newPw)`, in same statement set `updated_at = now()`
9. Wipe all `app_sessions` for the user (force re-login)
10. Enqueue notification via `enqueueNotification({ to_user_id, to_phone, to_role, template_key: 'admin_signin_details', language: 'en', rendered_body })` where `rendered_body` is built via `renderAdminSigninDetails({ display_name, username, temp_password, role, app_url })`
11. Flush via existing outbox (best-effort — even if Green-API delivery fails, password rotation is committed)
12. Log audit entry: `action = 'admin_signin_details_sent'`, `payload = { rotated_password: true }`
13. Return `{ ok: true, sent_at: new Date().toISOString() }`
14. Call `revalidatePath('/emails/boat-rental/admin/users')`

**Atomicity note:** password rotation + session wipe happen before the notification enqueue. If Green-API delivery fails, the password is already changed — user can no longer log in with the old password. Admin sees the error toast and can click Send again to retry (which generates ANOTHER new password). Acceptable for MVP.

### 6.3 New `setUserDisplayNameAction(formData)`

```typescript
export async function setUserDisplayNameAction(formData: FormData): Promise<void>
```

Inputs: `user_id`, `display_name` (string, may be empty to clear).

Behavior:
1. `requireBoatAdmin()`
2. Trim input. If empty string after trim, set `display_name = NULL` (clears it). Otherwise enforce 1–80 char range.
3. UPDATE `app_users.display_name`
4. `revalidatePath`

### 6.4 New `setUserDisabledAction(formData)`

```typescript
export async function setUserDisabledAction(formData: FormData): Promise<void>
```

Inputs: `user_id`, `disabled` (string `'true'` or `'false'`).

Behavior:
1. `requireBoatAdmin()` and capture `me.id`
2. If `disabled === 'true'`:
   - Refuse to disable the calling admin (cannot lock yourself out)
   - UPDATE `app_users SET disabled_at = now(), disabled_by = me.id WHERE id = user_id`
   - Wipe all `app_sessions` for that user (force logout immediately)
   - Audit log: `action = 'admin_user_disabled'`
3. If `disabled === 'false'`:
   - UPDATE `app_users SET disabled_at = NULL, disabled_by = NULL WHERE id = user_id`
   - Audit log: `action = 'admin_user_reenabled'`
4. `revalidatePath`

### 6.5 Login flow guard

In the auth helper that resolves a session (currently in `src/lib/auth.ts` — need to verify exact location during implementation), after fetching the user row:

```typescript
if (user.disabled_at) {
  // treat as no session
  return null;
  // OR throw a specific error so login flow can show "Account disabled" message
}
```

Login form route (`src/app/api/auth/login/route.ts` or similar) checks `disabled_at` after password verification and returns 403 with `{ error: 'account_disabled' }` so the login page shows a friendly message.

### 6.6 New helper `src/lib/random-password.ts`

Pure function with vitest tests:

```typescript
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
// Drops 0/O/1/l/i to avoid lookalike confusion when the user reads it from WhatsApp.

export function randomFriendlyPassword(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
```

Tests verify:
- Default length is 12
- All chars are in the allowed alphabet
- Two consecutive calls produce different outputs (probabilistic — accept rare collisions)

---

## 7. Notifications

### 7.1 Template `admin_signin_details`

Body template, English only:

```
👋 Welcome to Lime Boat Rental!

You've been added as a {role}. Sign in details:

Username: {username}
Temporary password: {temp_password}

Sign in: {app_url}/login

You'll be asked to change your password after first login.
For help, reply to this message.
```

Variables:
- `{role}` — `'broker'` or `'owner'` (lowercase). If user has multiple roles, pick the first non-admin role; if only admin, use 'admin'. Realistic case: admin-created accounts are always broker or owner.
- `{username}` — `app_users.username`
- `{temp_password}` — the plaintext password (only sent once, never stored plaintext)
- `{app_url}` — from `NEXT_PUBLIC_APP_HOST` env var; fallback `https://limeinc.vercel.app`

Greeting line uses `display_name` if set, otherwise `username`:
```
👋 Welcome to Lime Boat Rental, {display_name || username}!
```

### 7.2 Renderer in `src/lib/boat-rental/notifications.ts`

New exported function:

```typescript
export function renderAdminSigninDetails(ctx: {
  displayName: string | null;
  username: string;
  tempPassword: string;
  role: string;
  appUrl: string;
}): string {
  const greeting = ctx.displayName ?? ctx.username;
  return [
    `👋 Welcome to Lime Boat Rental, ${greeting}!`,
    '',
    `You've been added as a ${ctx.role}. Sign in details:`,
    '',
    `Username: ${ctx.username}`,
    `Temporary password: ${ctx.tempPassword}`,
    '',
    `Sign in: ${ctx.appUrl}/login`,
    '',
    `You'll be asked to change your password after first login.`,
    `For help, reply to this message.`,
  ].join('\n');
}
```

### 7.3 Outbox flush

After enqueue, call `flushPendingForUser(userId)` (existing helper if present, otherwise add a similar function — verify during implementation). The existing Green-API delivery path handles the actual send; we don't add new HTTP code.

---

## 8. UI

### 8.1 Top-of-page Invite forms — minor changes

Below each WhatsApp input, append a small hint:

```html
<span class="text-[11px] text-cyan-700">
  💬 If provided, sign-in details are auto-sent to this WhatsApp on create.
</span>
```

No other changes to the create flow.

### 8.2 Per-user card — new actions

Existing card structure (preserved): username heading, last login, WhatsApp status, role badges, [Save WhatsApp] + [Reset password] forms, broker logo block, [Remove role].

New additions in this order:

```
1. Username heading line:
   - PRIMARY: display_name || username (large, bold)
   - SECONDARY: @username (small, muted) — only shown if display_name set
   - INACTIVE badge (rose-50 bg) if disabled_at set

2. Existing badge row (BROKER / OWNER · Owner Name) — unchanged

3. Existing "Last login X" + WhatsApp display — unchanged

4. Existing [Save WhatsApp] + [Reset password] form row — unchanged

5. NEW: Display name form (single row, server action):
   [Display name: ___________________] [Save]

6. NEW: Send sign-in details button (client component with state):
   [📩 Send sign-in details]   ← idle
   [⟳ Sending…]                ← in flight (disabled)
   [✓ Sent at HH:MM — Re-send] ← post-success (5s, then reverts to idle)
   [⚠ Failed: {reason} — Retry] ← post-error (5s, then reverts)

7. Existing broker logo block (broker only) — unchanged

8. NEW: Disable / Enable toggle (client component with confirm modal):
   - When active:   [⊘ Disable account]
   - When disabled: [↻ Re-enable account]

9. Existing [Remove broker / owner / admin] role buttons — unchanged
```

When a user is disabled, the entire card gets `opacity-60` styling AND most action buttons are disabled. The only enabled actions on a disabled user are: Re-enable, Remove role.

### 8.3 New client components

Path: `src/app/emails/boat-rental/admin/users/_components/`

#### `send-signin-button.tsx`

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { sendSigninDetailsAction } from '../actions';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'success'; at: string }
  | { kind: 'error'; reason: string };

export function SendSigninButton({ userId, hasWhatsapp }: { userId: string; hasWhatsapp: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const { toast } = useToast();

  async function onClick() {
    if (!hasWhatsapp) {
      toast('Set a WhatsApp number first.', { kind: 'error' });
      return;
    }
    setState({ kind: 'sending' });
    const fd = new FormData();
    fd.set('user_id', userId);
    try {
      const result = await sendSigninDetailsAction(fd);
      if (result.ok) {
        setState({ kind: 'success', at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        toast('Sign-in details sent via WhatsApp.', { kind: 'success' });
        setTimeout(() => setState({ kind: 'idle' }), 5000);
      } else {
        const reason = result.error === 'no_whatsapp' ? 'No WhatsApp set' : result.error;
        setState({ kind: 'error', reason });
        toast(`Couldn't send: ${reason}`, { kind: 'error' });
        setTimeout(() => setState({ kind: 'idle' }), 5000);
      }
    } catch (e) {
      const reason = (e as Error).message ?? 'unknown';
      setState({ kind: 'error', reason });
      toast(`Couldn't send: ${reason}`, { kind: 'error' });
      setTimeout(() => setState({ kind: 'idle' }), 5000);
    }
  }

  // … render based on state …
}
```

Renders a button whose label, icon, and disabled state vary by `state`. After 5s the success/error state reverts to idle automatically. Toast also fires for redundancy.

**Note on password rotation visibility:** the button label doesn't say "rotate password" — it just says "Send sign-in details". The fact that a rotation happens under the hood is intentional (admin doesn't need to think about it). The success toast reads "Sign-in details sent via WhatsApp." not "Password rotated." — keeping the action name action-focused.

#### `display-name-form.tsx`

Server-action form, no client state needed:

```typescript
import { setUserDisplayNameAction } from '../actions';

export function DisplayNameForm({ userId, current }: { userId: string; current: string | null }) {
  return (
    <form action={setUserDisplayNameAction} className="flex items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input
        name="display_name"
        defaultValue={current ?? ''}
        placeholder="Display name (optional)"
        maxLength={80}
        className="ix-input text-xs flex-1"
      />
      <button type="submit" className="ix-btn-secondary text-xs">Save name</button>
    </form>
  );
}
```

Server action handles the empty→null normalization.

#### `disable-toggle.tsx`

Confirmation modal before disabling (destructive-ish action), simple inline button to re-enable:

```typescript
'use client';

import { useState } from 'react';
import { useTransition } from 'react';
import { CircleSlash, RotateCcw } from 'lucide-react';
import { setUserDisabledAction } from '../actions';

export function DisableToggle({ userId, currentlyDisabled, username }: {
  userId: string;
  currentlyDisabled: boolean;
  username: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (currentlyDisabled) {
    // Re-enable: no confirm modal, just an inline button.
    return (
      <form action={setUserDisabledAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="disabled" value="false" />
        <button type="submit" disabled={pending} className="text-xs text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1">
          <RotateCcw size={12} /> Re-enable account
        </button>
      </form>
    );
  }

  // Active → confirm before disabling
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
      >
        <CircleSlash size={12} /> Disable account
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded p-2">
      <span className="text-xs text-rose-900">
        Disable <strong>{username}</strong>? They'll be logged out and unable to sign in.
      </span>
      <form action={setUserDisabledAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="disabled" value="true" />
        <button type="submit" className="text-xs px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700">
          Confirm disable
        </button>
      </form>
      <button onClick={() => setConfirming(false)} className="text-xs text-slate-500 hover:text-slate-700">
        Cancel
      </button>
    </div>
  );
}
```

### 8.4 Inactive state styling

Disabled user card:
```
<div className={`ix-card p-5 ${u.disabled_at ? 'opacity-60' : ''}`}>
  ...
</div>
```

Plus a badge in the heading row:
```
{u.disabled_at && (
  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
    INACTIVE
  </span>
)}
```

---

## 9. Login flow guard

The login flow needs to reject disabled accounts. Current login lives at `src/app/api/auth/login/route.ts` (verified during implementation; if path differs, find via grep).

After password verification but before issuing a session:

```typescript
if (user.disabled_at) {
  return NextResponse.json({ error: 'account_disabled' }, { status: 403 });
}
```

Login page form (`src/app/login/page.tsx` or wherever) maps `error: 'account_disabled'` to a user-friendly message: *"This account has been disabled. Contact your administrator."*

Session-resolution helper (the function that powers `getCurrentUser()`) ALSO checks `disabled_at` so any extant session for a now-disabled user is treated as no-session. The disable action wipes sessions explicitly, but this is belt-and-braces.

---

## 10. Testing strategy

### 10.1 Unit tests (vitest)

`src/lib/random-password.test.ts`:
- Default length is 12
- All chars from allowed alphabet
- 100 calls produce ≥ 99 distinct values (rare collision tolerated)
- Custom length parameter respected

`src/lib/boat-rental/notifications.test.ts` — add tests for the new renderer:
- `renderAdminSigninDetails` produces the expected body shape
- Falls back to username when displayName is null
- Includes the temp password verbatim

### 10.2 Manual QA checklist (post-deploy)

1. **Auto-send on create (broker):** invite a broker with WhatsApp filled → confirm WhatsApp arrives within 30s with correct username + the password admin typed
2. **Auto-send on create (owner):** same for owner
3. **No-WhatsApp create:** invite broker without WhatsApp → no notification fires, no error in admin UI
4. **Manual send button:** click `[Send sign-in details]` on existing user with WhatsApp → button shows Sending → success → success toast → WhatsApp arrives with NEW temp password (different from any previously stored)
5. **Verify password rotation:** before clicking Send, log in as the user (works). Click Send. Try to log in with old password (rejected). Try with new password (works).
6. **Send button error path:** click Send on user without WhatsApp → button shows error state with "No WhatsApp set" → error toast fires → no rotation happens (verify by checking user can still log in with prior password)
7. **Display name:** set "Hisham Mohamed" on user `outoftheblue` → card shows "Hisham Mohamed" as primary, `@outoftheblue` as secondary → save blank → display name clears, primary heading reverts to username
8. **Display name in WhatsApp:** set display name, click Send → WhatsApp greeting reads "Welcome to Lime Boat Rental, Hisham Mohamed!"
9. **Disable account:** click Disable → confirm modal → Confirm → user card opacity fades, INACTIVE badge appears, button changes to Re-enable → check user is logged out (existing session destroyed) → user tries to log in → "Account disabled" message → can't sign in
10. **Re-enable:** click Re-enable → opacity restores, INACTIVE badge gone → user can sign in again with their prior password
11. **Self-disable guard:** as admin, try to disable own account → server action returns error / refuses (admin tests via developer tools)
12. **Disabled user actions are gated:** on a disabled user card, [Save WhatsApp], [Reset password], [Send sign-in details], [Save name] are all hidden or disabled. Only Re-enable + Remove role remain.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Password rotation succeeds but WhatsApp fails — user is locked out | Admin sees error toast; can click Send again immediately to generate fresh password. Alternative recovery: existing [Reset password] form works. Accept for MVP. |
| Admin disables their own account | Server action explicitly refuses if `user_id === me.id`. UI also hides the Disable button on the card representing the calling admin (defense in depth). |
| Concurrent sends produce racing rotations | Both calls succeed; the LATEST password wins (DB last-write). User receives both WhatsApp messages; only the latest password works. Acceptable — admins rarely double-click. |
| Plaintext password lives in process memory + WhatsApp message body | Already true for the existing invite flow. Green-API stores rendered body in DB until sent — no new exposure surface. Accept as-is. |
| `display_name` injection (admin types HTML) | Server-side trim + length cap (80 chars). Tailwind/React auto-escape on render. No SQL injection — Supabase parameterizes. |
| Disabled user has an active hold/reservation — should we cascade? | No. Disable only blocks login. Existing reservations remain. Admin must manually transition them via the broker portal. Documented in spec, not enforced by code. |
| Roles other than broker/owner being created via this UI | `inviteBrokerAction` and `inviteOwnerAction` only create those two roles. Send/Disable apply to ANY user in `boat_rental_user_roles`. Audit log captures who was affected. |
| `app_url` env var missing in production | Hardcoded fallback `https://limeinc.vercel.app` ensures the WhatsApp link is always valid. |

---

## 12. Done criteria

The release is **done** when:
1. Migration `0073_admin_user_ux_upgrades.sql` applied to production Supabase
2. `app_users.disabled_at` + `display_name` + `disabled_by` columns exist
3. All new server actions deployed and reachable
4. All 12-item manual QA checklist passes
5. Existing flows (Create broker, Create owner, Save WhatsApp, Reset password, Upload logo, Remove role) still work — no regression
6. `npm test` passes (the helper + renderer tests included)
7. `npm run build` clean
8. SESSION_HANDOFF.md updated with shipped state

---

## 13. Out of scope / future work

- Email delivery as alternative to WhatsApp
- Per-broker `notification_lang` (would mirror `boat_rental_owner_settings.notification_lang`)
- Bulk send to multiple users
- Audit log UI to browse who-disabled-whom
- Password complexity rules
- Two-factor authentication
- Self-service password recovery (user-initiated, no admin)
- Broker-side WhatsApp inbox (replies to the welcome message)
- Email verification
- "Account disabled — contact administrator at X" — generic fallback message; no admin contact lookup
- Disabled-account grace period (e.g., 30 days before hard delete)

---

## 14. Implementation phasing within the single PR

1. Migration `0073` — additive, low-risk
2. `random-password.ts` helper + tests (TDD)
3. `notifications.ts` renderer addition + tests
4. Modify `inviteBrokerAction` and `inviteOwnerAction` to auto-send
5. New server action `sendSigninDetailsAction`
6. New server actions `setUserDisplayNameAction` + `setUserDisabledAction`
7. Login flow guard (login route + session-resolution helper)
8. Client components (`send-signin-button`, `display-name-form`, `disable-toggle`)
9. Refactor `users/page.tsx` to render the new components per user
10. QA on Supabase branch
11. Merge → main → `vercel --prod`

---

## 15. References

- Existing admin Users actions: `src/app/emails/boat-rental/admin/users/actions.ts`
- Existing admin Users page: `src/app/emails/boat-rental/admin/users/page.tsx`
- Notification infrastructure: `src/lib/boat-rental/notifications.ts`
- Password hashing: `src/lib/auth.ts` (`hashPassword`)
- Audit log helper: `src/lib/boat-rental/server-helpers.ts` (`logAudit`)
- Owner-features 32-task plan (sibling, in-flight): `docs/superpowers/plans/2026-05-02-boat-owner-features-plan.md`
