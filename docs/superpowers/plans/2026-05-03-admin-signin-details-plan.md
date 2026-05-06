# Admin Users — WhatsApp Sign-in Details + Display Name + Disable Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three capabilities to the admin Users page — auto-send WhatsApp sign-in details on broker/owner creation (with manual re-send button that auto-rotates the password), display name field separate from username, and active/inactive account toggle.

**Architecture:** Additive migration adds `display_name`, `disabled_at`, `disabled_by` columns to `app_users`. Server actions reuse the existing Green-API notification infrastructure (`enqueueNotification` + `flushPendingNonReservation`). New `template_key='admin_signin_details'` plugged into the existing template dispatcher. Login flow gets a single guard for disabled users in `getCurrentUser()` + `loginWithPassword()`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Storage), Tailwind v4, vitest (already installed), Green-API WhatsApp.

**Spec:** [docs/superpowers/specs/2026-05-03-admin-signin-details-design.md](../specs/2026-05-03-admin-signin-details-design.md)

**Branch:** `claude/inspiring-booth-3d348a` (same worktree as the in-flight 32-task owner-features plan). Final ship: merge → main → `vercel --prod`.

---

## File map

### New files
- `supabase/migrations/0073_admin_user_ux_upgrades.sql`
- `src/lib/random-password.ts` + `.test.ts`
- `src/app/emails/boat-rental/admin/users/_components/send-signin-button.tsx`
- `src/app/emails/boat-rental/admin/users/_components/display-name-form.tsx`
- `src/app/emails/boat-rental/admin/users/_components/disable-toggle.tsx`

### Modified files
- `src/app/emails/boat-rental/admin/users/actions.ts` — modify 2 actions, add 3 new
- `src/app/emails/boat-rental/admin/users/page.tsx` — render new components, fetch new columns
- `src/lib/boat-rental/notifications.ts` — extend `TemplateKey`, `NotifContext`, add renderer + dispatch case
- `src/lib/auth.ts` — guard `getCurrentUser()` + `loginWithPassword()` against disabled accounts
- `src/app/login/page.tsx` (or wherever the login form lives) — handle `account_disabled` error

---

## Task 1: Migration 0073 — display_name + disabled_at + disabled_by

**Files:**
- Create: `supabase/migrations/0073_admin_user_ux_upgrades.sql`

- [ ] **Step 1: Create the migration file**

Path: `supabase/migrations/0073_admin_user_ux_upgrades.sql`

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
--   drop index if exists idx_app_users_disabled;

alter table public.app_users
  add column if not exists display_name text,
  add column if not exists disabled_at  timestamptz,
  add column if not exists disabled_by  uuid references public.app_users(id);

create index if not exists idx_app_users_disabled
  on public.app_users (disabled_at) where disabled_at is not null;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0073_admin_user_ux_upgrades.sql
git commit -m "feat(admin): migration 0073 — display_name + disabled_at on app_users"
```

**Note:** Migration will be applied to live Supabase during the QA task (Task 11). No application now.

---

## Task 2: `random-password.ts` helper with TDD

**Files:**
- Create: `src/lib/random-password.ts`
- Create: `src/lib/random-password.test.ts`

- [ ] **Step 1: Write failing tests**

Path: `src/lib/random-password.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { randomFriendlyPassword, FRIENDLY_ALPHABET } from './random-password';

describe('randomFriendlyPassword', () => {
  it('returns 12 characters by default', () => {
    expect(randomFriendlyPassword()).toHaveLength(12);
  });

  it('respects custom length', () => {
    expect(randomFriendlyPassword(20)).toHaveLength(20);
  });

  it('uses only friendly alphabet characters (no 0, O, 1, l, i)', () => {
    const allowed = new Set(FRIENDLY_ALPHABET.split(''));
    for (let i = 0; i < 50; i++) {
      const pw = randomFriendlyPassword(12);
      for (const ch of pw) {
        expect(allowed.has(ch)).toBe(true);
      }
      // explicit negatives
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });

  it('produces distinct outputs across many calls (probabilistic)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(randomFriendlyPassword(12));
    // 100 calls of 12-char from a 31-char alphabet → collisions are astronomically rare
    expect(seen.size).toBeGreaterThanOrEqual(99);
  });

  it('throws on length < 8', () => {
    expect(() => randomFriendlyPassword(7)).toThrow(/at least 8/);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test random-password
```

Expected: `Cannot find module './random-password'` or similar.

- [ ] **Step 3: Implement the helper**

Path: `src/lib/random-password.ts`

```typescript
import crypto from 'node:crypto';

// Friendly = no zero/oh/one/lowercase-L/uppercase-i to avoid lookalike
// confusion when the user reads the password from a WhatsApp message
// or prints it on paper.
export const FRIENDLY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generate a cryptographically random password from a "friendly" alphabet
 * (no lookalike characters). Default length is 12.
 *
 * Throws if length is below the system's 8-char minimum.
 */
export function randomFriendlyPassword(length = 12): string {
  if (length < 8) {
    throw new Error(`Password length must be at least 8 (got ${length})`);
  }
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += FRIENDLY_ALPHABET[bytes[i] % FRIENDLY_ALPHABET.length];
  }
  return out;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test random-password
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/random-password.ts src/lib/random-password.test.ts
git commit -m "feat(auth): add randomFriendlyPassword helper with tests"
```

---

## Task 3: `notifications.ts` — add `admin_signin_details` template

**Files:**
- Modify: `src/lib/boat-rental/notifications.ts` (extend `TemplateKey`, `NotifContext`, add renderer + dispatch case)

- [ ] **Step 1: Read the file to confirm current structure**

```bash
# Use the Read tool on src/lib/boat-rental/notifications.ts
```

The file has:
- `TemplateKey` union type at ~line 14
- `NotifContext` type at ~line 31
- Render functions like `renderManualReservationCreated` etc.
- `renderTemplate` dispatch function at ~line 252
- `enqueueNotification` at ~line 274

- [ ] **Step 2: Extend `TemplateKey` to include the new key**

Edit the `TemplateKey` union — add the new value as the last entry:

```typescript
export type TemplateKey =
  | 'booking_confirmed'
  | 'trip_details'
  | 'payment_received'
  | 'cancelled'
  | 'cancellation_requested'
  | 'cancellation_resolved'
  | 'owner_block_confirmed'
  | 'hold_warning'
  | 'manual_reservation_created'
  | 'trip_payment_complete'
  | 'recurring_expense_generated'
  | 'trip_reminder_24h'
  | 'admin_signin_details';   // <-- new
```

- [ ] **Step 3: Extend `NotifContext` with sign-in fields**

Add these properties to the `NotifContext` type (at the end, before the closing `};`):

```typescript
  // admin_signin_details
  username?: string;
  tempPassword?: string;
  signinRole?: string;        // 'broker' | 'owner' | 'admin'
  appUrl?: string;
  displayName?: string | null;
```

- [ ] **Step 4: Add renderer function**

Add this function next to the other `render*` functions (e.g., right after `renderTripReminder24hAr`):

```typescript
function renderAdminSigninDetails(ctx: NotifContext): string {
  const greeting = (ctx.displayName || ctx.username) ?? '';
  const role = ctx.signinRole || 'user';
  const appUrl = ctx.appUrl || 'https://limeinc.vercel.app';
  return [
    `👋 Welcome to Lime Boat Rental, ${greeting}!`,
    '',
    `You've been added as a ${role}. Sign in details:`,
    '',
    `Username: ${ctx.username || '—'}`,
    `Temporary password: ${ctx.tempPassword || '—'}`,
    '',
    `Sign in: ${appUrl}/login`,
    '',
    `You'll be asked to change your password after first login.`,
    `For help, reply to this message.`,
  ].join('\n');
}
```

- [ ] **Step 5: Wire the renderer into `renderTemplate`**

In the `renderTemplate` function, find the existing switch/cases (e.g., `case 'trip_reminder_24h':`) and add the new case right after the last case, before the default:

```typescript
case 'admin_signin_details':
  return renderAdminSigninDetails(ctx);
```

- [ ] **Step 6: Verify build is clean**

```bash
npm run build
```

Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/boat-rental/notifications.ts
git commit -m "feat(notif): admin_signin_details template + renderer"
```

---

## Task 4: Modify `inviteBrokerAction` + `inviteOwnerAction` to auto-send WhatsApp

**Files:**
- Modify: `src/app/emails/boat-rental/admin/users/actions.ts`

- [ ] **Step 1: Read the existing actions file**

Use the Read tool on `src/app/emails/boat-rental/admin/users/actions.ts` to confirm the current structure of `inviteBrokerAction` and `inviteOwnerAction`.

- [ ] **Step 2: Add helper function for the welcome enqueue + flush**

Add this private helper near the top of the file, after `normalizeWhatsapp`:

```typescript
import { enqueueNotification, flushPendingNonReservation } from '@/lib/boat-rental/notifications';

// Send the welcome WhatsApp with sign-in details. No-op if user has no WhatsApp.
// Uses the password the admin just typed (we have it in plaintext at the
// invite-form moment because the form submitted it).
async function sendWelcomeWhatsapp(args: {
  userId: string;
  username: string;
  whatsapp: string | null;
  password: string;
  role: 'broker' | 'owner';
  displayName: string | null;
}): Promise<void> {
  if (!args.whatsapp) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_HOST || 'https://limeinc.vercel.app';
  await enqueueNotification({
    reservationId: null,
    to: { userId: args.userId, phone: args.whatsapp, role: args.role },
    templateKey: 'admin_signin_details',
    language: 'en',
    context: {
      // Required NotifContext fields not used by this template — pass safe placeholders
      boatName: '',
      bookingDate: '',
      shortRef: '',
      // Sign-in fields
      username: args.username,
      tempPassword: args.password,
      signinRole: args.role,
      appUrl,
      displayName: args.displayName,
    },
  });
  await flushPendingNonReservation();
}
```

- [ ] **Step 3: Modify `inviteBrokerAction` to call the helper**

Replace the existing `inviteBrokerAction` body so the final lines are:

```typescript
export async function inviteBrokerAction(formData: FormData) {
  await requireBoatAdmin();
  const username = s(formData.get('username')).toLowerCase();
  const password = s(formData.get('password'));
  const wa = normalizeWhatsapp(s(formData.get('whatsapp')));
  if (wa === 'invalid') throw new Error('whatsapp_invalid');
  if (!username || password.length < 8) return;
  const result = await upsertUserWithRole({ username, password, whatsapp: wa, role: 'broker', ownerId: null });
  if ('userId' in result) {
    await sendWelcomeWhatsapp({
      userId: result.userId,
      username,
      whatsapp: wa,
      password,
      role: 'broker',
      displayName: null,   // never set on initial invite
    });
  }
  revalidatePath('/emails/boat-rental/admin/users');
}
```

- [ ] **Step 4: Modify `inviteOwnerAction` similarly**

```typescript
export async function inviteOwnerAction(formData: FormData) {
  await requireBoatAdmin();
  const username = s(formData.get('username')).toLowerCase();
  const password = s(formData.get('password'));
  const ownerId = sOrNull(formData.get('owner_id'));
  const wa = normalizeWhatsapp(s(formData.get('whatsapp')));
  if (wa === 'invalid') throw new Error('whatsapp_invalid');
  if (!username || password.length < 8 || !ownerId) return;
  const result = await upsertUserWithRole({ username, password, whatsapp: wa, role: 'owner', ownerId });
  if ('userId' in result) {
    const sb = supabaseAdmin();
    await sb
      .from('boat_rental_owners')
      .update({ user_id: result.userId, updated_at: new Date().toISOString() })
      .eq('id', ownerId);
    await sendWelcomeWhatsapp({
      userId: result.userId,
      username,
      whatsapp: wa,
      password,
      role: 'owner',
      displayName: null,
    });
  }
  revalidatePath('/emails/boat-rental/admin/users');
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/emails/boat-rental/admin/users/actions.ts
git commit -m "feat(admin): auto-send welcome WhatsApp on invite broker/owner"
```

---

## Task 5: New `sendSigninDetailsAction` server action

**Files:**
- Modify: `src/app/emails/boat-rental/admin/users/actions.ts` (append new export)

- [ ] **Step 1: Add import for `randomFriendlyPassword` + audit helper**

At the top of `actions.ts`, ensure these imports are present (add if missing):

```typescript
import { randomFriendlyPassword } from '@/lib/random-password';
import { logAudit } from '@/lib/boat-rental/server-helpers';
```

- [ ] **Step 2: Append the new action**

At the bottom of `actions.ts`:

```typescript
// Re-send sign-in details: generate a fresh temp password, rotate it on
// the user, wipe their sessions, and WhatsApp them username + new password.
// Returns a discriminated result so the client can show toast + button state.
export async function sendSigninDetailsAction(
  formData: FormData
): Promise<
  | { ok: true; sent_at: string }
  | { ok: false; error: 'no_whatsapp' | 'not_found' | 'forbidden' | 'user_disabled' | 'enqueue_failed' }
> {
  const me = await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  if (!userId) return { ok: false, error: 'not_found' };

  const sb = supabaseAdmin();
  const { data: userRow } = await sb
    .from('app_users')
    .select('id, username, display_name, whatsapp, disabled_at')
    .eq('id', userId)
    .maybeSingle();
  if (!userRow) return { ok: false, error: 'not_found' };
  const u = userRow as {
    id: string;
    username: string;
    display_name: string | null;
    whatsapp: string | null;
    disabled_at: string | null;
  };
  if (u.disabled_at) return { ok: false, error: 'user_disabled' };
  if (!u.whatsapp) return { ok: false, error: 'no_whatsapp' };

  // Determine sign-in role: broker > owner > admin (whichever boat-rental role the user has)
  const { data: roleRows } = await sb
    .from('boat_rental_user_roles')
    .select('role')
    .eq('user_id', userId);
  const roles = ((roleRows as Array<{ role: string }> | null) || []).map(r => r.role);
  const signinRole: 'broker' | 'owner' | 'admin' =
    roles.includes('broker') ? 'broker' :
    roles.includes('owner')  ? 'owner'  :
    'admin';

  // Rotate the password
  const newPassword = randomFriendlyPassword(12);
  await sb
    .from('app_users')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', userId);

  // Wipe existing sessions (force re-auth)
  await sb.from('app_sessions').delete().eq('user_id', userId);

  // Enqueue + flush WhatsApp
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_HOST || 'https://limeinc.vercel.app';
    await enqueueNotification({
      reservationId: null,
      to: { userId: u.id, phone: u.whatsapp, role: signinRole },
      templateKey: 'admin_signin_details',
      language: 'en',
      context: {
        boatName: '',
        bookingDate: '',
        shortRef: '',
        username: u.username,
        tempPassword: newPassword,
        signinRole,
        appUrl,
        displayName: u.display_name,
      },
    });
    await flushPendingNonReservation();
  } catch {
    return { ok: false, error: 'enqueue_failed' };
  }

  await logAudit({
    actorUserId: me.id,
    actorRole: 'admin',
    action: 'admin_signin_details_sent',
    payload: { user_id: userId, rotated_password: true, role: signinRole },
  });

  revalidatePath('/emails/boat-rental/admin/users');
  return { ok: true, sent_at: new Date().toISOString() };
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/emails/boat-rental/admin/users/actions.ts
git commit -m "feat(admin): sendSigninDetailsAction with password rotation + WhatsApp"
```

---

## Task 6: New `setUserDisplayNameAction` + `setUserDisabledAction`

**Files:**
- Modify: `src/app/emails/boat-rental/admin/users/actions.ts` (append two new exports)

- [ ] **Step 1: Append the display-name action**

At the bottom of `actions.ts`:

```typescript
// Set or clear display_name on an existing user. Empty string clears.
// 80-char cap; longer input is truncated rather than rejected so admins
// don't lose work.
export async function setUserDisplayNameAction(formData: FormData): Promise<void> {
  await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  if (!userId) return;
  const raw = s(formData.get('display_name')).trim();
  const display_name = raw === '' ? null : raw.slice(0, 80);
  const sb = supabaseAdmin();
  await sb.from('app_users').update({ display_name }).eq('id', userId);
  revalidatePath('/emails/boat-rental/admin/users');
}
```

- [ ] **Step 2: Append the disable-toggle action**

```typescript
// Soft-disable / re-enable an account. Disable wipes existing sessions
// and refuses to disable the calling admin.
export async function setUserDisabledAction(formData: FormData): Promise<void> {
  const me = await requireBoatAdmin();
  const userId = s(formData.get('user_id'));
  const disabled = s(formData.get('disabled')) === 'true';
  if (!userId) return;
  if (disabled && userId === me.id) {
    throw new Error('cannot_disable_self');
  }
  const sb = supabaseAdmin();
  if (disabled) {
    await sb
      .from('app_users')
      .update({ disabled_at: new Date().toISOString(), disabled_by: me.id })
      .eq('id', userId);
    // Force logout
    await sb.from('app_sessions').delete().eq('user_id', userId);
    await logAudit({
      actorUserId: me.id,
      actorRole: 'admin',
      action: 'admin_user_disabled',
      payload: { user_id: userId },
    });
  } else {
    await sb
      .from('app_users')
      .update({ disabled_at: null, disabled_by: null })
      .eq('id', userId);
    await logAudit({
      actorUserId: me.id,
      actorRole: 'admin',
      action: 'admin_user_reenabled',
      payload: { user_id: userId },
    });
  }
  revalidatePath('/emails/boat-rental/admin/users');
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/emails/boat-rental/admin/users/actions.ts
git commit -m "feat(admin): setUserDisplayName + setUserDisabled actions"
```

---

## Task 7: Login flow guard — reject disabled users

**Files:**
- Modify: `src/lib/auth.ts` (add disabled-user check to `getCurrentUser` + `loginWithPassword`)

- [ ] **Step 1: Update `getCurrentUser` to fetch `disabled_at` and return null if disabled**

In `src/lib/auth.ts`, find the `getCurrentUser` function. Locate the line `select('id, username, role')` (~line 114) and update it:

```typescript
const { data: user } = await sb
  .from('app_users')
  .select('id, username, role, disabled_at')   // <-- added disabled_at
  .eq('id', s.user_id)
  .maybeSingle();
if (!user) return null;
const u = user as { id: string; username: string; role: string; disabled_at: string | null };

// Disabled accounts have no session, even if app_sessions has stale rows.
if (u.disabled_at) {
  // Best-effort: clean up the orphan session so subsequent calls are cheaper.
  await sb.from('app_sessions').delete().eq('token', token);
  return null;
}
```

- [ ] **Step 2: Update `loginWithPassword` to reject disabled users**

Find `loginWithPassword` (~line 167). Update the SELECT and password-verification block:

```typescript
export async function loginWithPassword(
  username: string,
  password: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('app_users')
    .select('id, password_hash, disabled_at')   // <-- added disabled_at
    .eq('username', username)
    .maybeSingle();
  if (!data) return { ok: false, error: 'invalid_credentials' };
  const row = data as { id: string; password_hash: string; disabled_at: string | null };
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'invalid_credentials' };
  }
  if (row.disabled_at) {
    return { ok: false, error: 'account_disabled' };
  }
  // ... rest of the existing function (session creation) unchanged ...
```

(Keep the rest of `loginWithPassword` exactly as it was — only add the SELECT field and the disabled check after `verifyPassword`.)

- [ ] **Step 3: Update the login page to display the friendly error**

Use the Read tool to find the login page (likely `src/app/login/page.tsx`). Look for where the form's error response is rendered. The login flow already returns errors like `'invalid_credentials'`. Add a case for `'account_disabled'` that renders a different message.

If the error rendering uses a switch or map, add:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid username or password.',
  account_disabled: 'This account has been disabled. Contact your administrator.',
  // ... existing entries
};
```

If the login page uses inline error rendering:

```tsx
{error === 'account_disabled' ? (
  <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
    This account has been disabled. Contact your administrator.
  </div>
) : error === 'invalid_credentials' ? (
  /* existing rendering */
) : null}
```

Adapt to whatever pattern the file already uses; don't restructure error handling.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/login/page.tsx
git commit -m "feat(auth): block disabled accounts at login + session resolution"
```

---

## Task 8: `send-signin-button.tsx` client component

**Files:**
- Create: `src/app/emails/boat-rental/admin/users/_components/send-signin-button.tsx`

- [ ] **Step 1: Create the directory if it doesn't exist**

```bash
mkdir -p src/app/emails/boat-rental/admin/users/_components
```

- [ ] **Step 2: Create the component**

Path: `src/app/emails/boat-rental/admin/users/_components/send-signin-button.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { sendSigninDetailsAction } from '../actions';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'success'; at: string }
  | { kind: 'error'; reason: string };

export function SendSigninButton({
  userId,
  hasWhatsapp,
  disabled,
}: {
  userId: string;
  hasWhatsapp: boolean;
  disabled: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const { toast } = useToast();

  const isBusy = state.kind === 'sending';

  async function onClick() {
    if (disabled) {
      toast('Re-enable the account before sending sign-in details.', { kind: 'error' });
      return;
    }
    if (!hasWhatsapp) {
      toast('Set a WhatsApp number first.', { kind: 'error' });
      return;
    }
    setState({ kind: 'sending' });
    try {
      const fd = new FormData();
      fd.set('user_id', userId);
      const result = await sendSigninDetailsAction(fd);
      if (result.ok) {
        const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setState({ kind: 'success', at });
        toast('Sign-in details sent via WhatsApp.', { kind: 'success' });
        setTimeout(() => setState({ kind: 'idle' }), 5000);
      } else {
        const reasonMap: Record<string, string> = {
          no_whatsapp: 'No WhatsApp set',
          user_disabled: 'Account disabled',
          not_found: 'User not found',
          forbidden: 'Not authorized',
          enqueue_failed: 'WhatsApp send failed',
        };
        const reason = reasonMap[result.error] || result.error;
        setState({ kind: 'error', reason });
        toast(`Couldn't send: ${reason}`, { kind: 'error' });
        setTimeout(() => setState({ kind: 'idle' }), 5000);
      }
    } catch (err) {
      const reason = (err as Error).message || 'unknown';
      setState({ kind: 'error', reason });
      toast(`Couldn't send: ${reason}`, { kind: 'error' });
      setTimeout(() => setState({ kind: 'idle' }), 5000);
    }
  }

  if (state.kind === 'success') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1 hover:bg-emerald-100"
      >
        <CheckCircle2 size={12} /> Sent at {state.at} — Re-send
      </button>
    );
  }
  if (state.kind === 'error') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1 hover:bg-rose-100"
      >
        <AlertCircle size={12} /> Failed: {state.reason} — Retry
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy || disabled || !hasWhatsapp}
      className="ix-btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
      title={
        disabled ? 'Re-enable account first' :
        !hasWhatsapp ? 'No WhatsApp number on file' :
        'Send welcome WhatsApp with username + new temp password'
      }
    >
      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      {isBusy ? 'Sending…' : 'Send sign-in details'}
    </button>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: PASS. If `useToast` import path is wrong, find the existing one (search `useToast` in any *.tsx) and update. If `lucide-react` icons error, the icons are already used elsewhere — confirm package.json has it.

- [ ] **Step 4: Commit**

```bash
git add src/app/emails/boat-rental/admin/users/_components/send-signin-button.tsx
git commit -m "feat(admin): SendSigninButton client component with state + toast"
```

---

## Task 9: `display-name-form.tsx` + `disable-toggle.tsx` client components

**Files:**
- Create: `src/app/emails/boat-rental/admin/users/_components/display-name-form.tsx`
- Create: `src/app/emails/boat-rental/admin/users/_components/disable-toggle.tsx`

- [ ] **Step 1: Create `display-name-form.tsx`**

Path: `src/app/emails/boat-rental/admin/users/_components/display-name-form.tsx`

```typescript
import { setUserDisplayNameAction } from '../actions';

export function DisplayNameForm({
  userId,
  current,
}: {
  userId: string;
  current: string | null;
}) {
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
      <button type="submit" className="ix-btn-secondary text-xs">
        Save name
      </button>
    </form>
  );
}
```

(Note: this is a server-rendered component — no `'use client'` directive. The form uses a server action, which Next.js handles with progressive enhancement.)

- [ ] **Step 2: Create `disable-toggle.tsx`**

Path: `src/app/emails/boat-rental/admin/users/_components/disable-toggle.tsx`

```typescript
'use client';

import { useState } from 'react';
import { CircleSlash, RotateCcw } from 'lucide-react';
import { setUserDisabledAction } from '../actions';

export function DisableToggle({
  userId,
  currentlyDisabled,
  username,
  isSelf,
}: {
  userId: string;
  currentlyDisabled: boolean;
  username: string;
  isSelf: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (isSelf) {
    // Don't render the toggle on the calling admin's own card.
    return null;
  }

  if (currentlyDisabled) {
    return (
      <form action={setUserDisabledAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="disabled" value="false" />
        <button
          type="submit"
          className="text-xs text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1"
        >
          <RotateCcw size={12} /> Re-enable account
        </button>
      </form>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
      >
        <CircleSlash size={12} /> Disable account
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded p-2 flex-wrap">
      <span className="text-xs text-rose-900">
        Disable <strong>{username}</strong>? They&apos;ll be logged out and unable to sign in.
      </span>
      <form action={setUserDisabledAction}>
        <input type="hidden" name="user_id" value={userId} />
        <input type="hidden" name="disabled" value="true" />
        <button
          type="submit"
          className="text-xs px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700"
        >
          Confirm disable
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/emails/boat-rental/admin/users/_components/display-name-form.tsx src/app/emails/boat-rental/admin/users/_components/disable-toggle.tsx
git commit -m "feat(admin): DisplayNameForm + DisableToggle client components"
```

---

## Task 10: Refactor `users/page.tsx` to render new components + new fields

**Files:**
- Modify: `src/app/emails/boat-rental/admin/users/page.tsx`

- [ ] **Step 1: Update imports**

At the top of `page.tsx`, add imports for the new components and `getCurrentUser`:

```typescript
import { getCurrentUser } from '@/lib/auth';
import { SendSigninButton } from './_components/send-signin-button';
import { DisplayNameForm } from './_components/display-name-form';
import { DisableToggle } from './_components/disable-toggle';
```

- [ ] **Step 2: Update `UserRow` type to include new fields**

```typescript
type UserRow = {
  id: string;
  username: string;
  display_name: string | null;
  last_login_at: string | null;
  whatsapp: string | null;
  logo_path: string | null;
  disabled_at: string | null;
};
```

- [ ] **Step 3: Update the SELECT statement to fetch new columns**

Find the line that selects from `app_users`:

```typescript
const usersRes = userIds.length
  ? await sb.from('app_users').select('id, username, last_login_at, whatsapp, logo_path').in('id', userIds)
  : { data: [] };
```

Update to:

```typescript
const usersRes = userIds.length
  ? await sb.from('app_users').select('id, username, display_name, last_login_at, whatsapp, logo_path, disabled_at').in('id', userIds)
  : { data: [] };
```

- [ ] **Step 4: Resolve the calling admin's id at the top of the component**

After the `const sb = supabaseAdmin();` line and before the existing Promise.all, add:

```typescript
const me = await getCurrentUser();
const currentAdminId = me?.id || null;
```

- [ ] **Step 5: Add hint text under each WhatsApp input on the invite forms**

Find the broker invite form's WhatsApp `<label>` block. After the existing `<span className="text-[11px] text-slate-500 ...">Required for broker to receive trip-detail WhatsApp confirmations.</span>`, add a sibling:

```tsx
<span className="text-[11px] text-cyan-700 dark:text-cyan-400 mt-1 block">
  💬 If provided, sign-in details are auto-sent to this WhatsApp on create.
</span>
```

Do the same for the owner invite form's WhatsApp field.

- [ ] **Step 6: Render new actions on each user card**

In the existing `{[...rolesByUser.entries()].map(...)}` block, locate the per-user `<div key={uid} className="ix-card p-5">` wrapper. Update its className to fade disabled cards:

```tsx
<div
  key={uid}
  className={`ix-card p-5 ${u.disabled_at ? 'opacity-60' : ''}`}
>
```

In the heading section (existing `<div className="flex items-center justify-between gap-2 mb-3 flex-wrap">`), update the username display block to show display_name + secondary username + INACTIVE badge:

```tsx
<div>
  <div className="font-semibold flex items-center gap-2">
    <span>{u.display_name || u.username}</span>
    {u.disabled_at && (
      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
        Inactive
      </span>
    )}
  </div>
  {u.display_name && (
    <div className="text-xs text-slate-500">@{u.username}</div>
  )}
  <div className="text-xs text-slate-500">
    {u.last_login_at ? `Last login ${new Date(u.last_login_at).toLocaleString()}` : 'Never logged in'}
  </div>
  <div className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
    <MessageCircle size={11} />
    {u.whatsapp ? (
      <span className="font-mono text-slate-700 dark:text-slate-300">{u.whatsapp}</span>
    ) : (
      <span className="italic text-amber-600 dark:text-amber-400">No WhatsApp set</span>
    )}
  </div>
</div>
```

After the existing `[Save WhatsApp] [Reset password]` form row (the `<div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">`), insert these three new action sections (still inside the user card, above the broker logo block):

```tsx
{/* Display name */}
<div className="mb-2">
  <DisplayNameForm userId={uid} current={u.display_name} />
</div>

{/* Send sign-in details */}
<div className="mb-2 flex items-center gap-2">
  <SendSigninButton
    userId={uid}
    hasWhatsapp={!!u.whatsapp}
    disabled={!!u.disabled_at}
  />
  <span className="text-[11px] text-slate-500">
    Generates a fresh temp password and WhatsApps the user.
  </span>
</div>

{/* Disable / re-enable */}
<div className="mb-2">
  <DisableToggle
    userId={uid}
    currentlyDisabled={!!u.disabled_at}
    username={u.username}
    isSelf={uid === currentAdminId}
  />
</div>
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/emails/boat-rental/admin/users/page.tsx
git commit -m "feat(admin): users page renders display name, send button, disable toggle"
```

---

## Task 11: QA + ship

- [ ] **Step 1: Run all tests + build**

```bash
npm test
npm run build
```

Both must pass. The vitest suite includes the new `random-password.test.ts` (5 tests) plus all pre-existing tests.

- [ ] **Step 2: Apply migration 0073 to live Supabase**

Use the Supabase dashboard SQL Editor (or `mcp__supabase__apply_migration` if MCP is connected). Migration name: `0073_admin_user_ux_upgrades`. SQL is in `supabase/migrations/0073_admin_user_ux_upgrades.sql`.

After applying, verify in psql or the dashboard:

```sql
\d app_users
-- Expect: display_name text, disabled_at timestamptz, disabled_by uuid columns

\d idx_app_users_disabled
-- Expect: partial index on disabled_at where disabled_at is not null
```

- [ ] **Step 3: Manual QA checklist**

Walk through these 12 items and tick each:

1. **Auto-send on create (broker):** invite a test broker with WhatsApp filled → confirm WhatsApp arrives within 30s with username + admin-typed password
2. **Auto-send on create (owner):** same for owner role
3. **No-WhatsApp create:** invite a test broker without WhatsApp → no notification fires, no error in admin UI
4. **Manual send button (success):** click `[Send sign-in details]` on a user with WhatsApp → button shows Sending → Sent at HH:MM → toast fires → WhatsApp arrives with NEW temp password
5. **Verify password rotation:** before clicking Send, log in as the test user with the original password (works). Click Send. Try original password (rejected). Try new password from the WhatsApp message (works).
6. **Send button error path:** click Send on a user without WhatsApp → button shows red error state with "No WhatsApp set" → error toast → password is NOT rotated (verify the user can still log in with their previous password)
7. **Display name set:** type "Hisham Mohamed" in DisplayNameForm for user `outoftheblue` → save → card shows "Hisham Mohamed" as primary heading, `@outoftheblue` as secondary
8. **Display name clear:** save blank in DisplayNameForm → display name clears, card heading reverts to `outoftheblue` only
9. **Display name in WhatsApp:** with display_name set, click Send → WhatsApp greeting reads "Welcome to Lime Boat Rental, Hisham Mohamed!"
10. **Disable account:** click Disable → confirm modal → Confirm → card opacity fades, INACTIVE badge appears, button changes to Re-enable. Test user is logged out (existing session destroyed). Test user attempts login → "This account has been disabled" message → can't sign in.
11. **Re-enable:** click Re-enable → opacity restores, badge gone → test user can log in with their prior password
12. **Self-disable guard:** as admin, your own card should NOT show the Disable button (DisableToggle returns null when `isSelf=true`)

- [ ] **Step 4: Verify existing flows still work (no regression)**

Quick smoke test:
- Create broker (existing flow): Save WhatsApp, Reset password, Upload broker logo, Remove broker — all still work
- Create owner: same
- Login flow with valid credentials still issues a session

- [ ] **Step 5: Update SESSION_HANDOFF.md**

Append a new section at the top:

```markdown
## 🟢 Latest turn — Admin sign-in details feature SHIPPED

Migration 0073 applied. All 11 tasks committed. `npm test` 35/35 passing,
`npm run build` clean. Auto-send works, manual re-send rotates password,
display name + disable toggle live.
```

- [ ] **Step 6: Final commit**

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: SESSION_HANDOFF — admin sign-in details shipped"
```

- [ ] **Step 7: Ask user before deploying to production**

This task does NOT auto-merge to `main` or run `vercel --prod`. The 32-task owner-features plan is also pending deploy on this same branch (per SESSION_HANDOFF). Coordinate with the user before either deploys, since both sets of changes will go to prod together if the branch merges.

Tell the user:
- All admin sign-in details code committed on `claude/inspiring-booth-3d348a`
- Migration 0073 applied to live Supabase
- 12-item QA checklist passed
- Awaiting their go-ahead to merge → main → `vercel --prod`

---

## Self-review

### Spec coverage check

| Spec section | Implemented in task |
|---|---|
| §4.1 Migration 0073 | Task 1 |
| §6.1 Modify inviteBroker/Owner auto-send | Task 4 |
| §6.2 sendSigninDetailsAction | Task 5 |
| §6.3 setUserDisplayNameAction | Task 6 |
| §6.4 setUserDisabledAction | Task 6 |
| §6.5 Login flow guard | Task 7 |
| §6.6 randomFriendlyPassword helper | Task 2 |
| §7.1–7.3 Notification template + renderer + outbox | Task 3 |
| §8.1 Invite-form hint text | Task 10 (Step 5) |
| §8.2 Per-user card additions | Task 10 (Step 6) |
| §8.3 send-signin-button.tsx | Task 8 |
| §8.3 display-name-form.tsx | Task 9 |
| §8.3 disable-toggle.tsx | Task 9 |
| §8.4 Inactive state styling | Task 10 (Step 6) |
| §9 Login flow guard + login page error | Task 7 |
| §10.1 Vitest tests | Task 2 (random-password) — note: spec also mentions notifications.ts renderer tests but those are integration-level; covered by manual QA in §10.2 |
| §10.2 Manual QA 12-item checklist | Task 11 (Step 3) |
| §11 Risks → mitigations | Implementation reflects the mitigations (self-disable refused in Task 6, rotation-then-enqueue order in Task 5, etc.) |

### Placeholder scan
- No "TBD", "TODO", "implement later" patterns
- All code blocks contain real code
- All file paths are exact

### Type consistency
- `randomFriendlyPassword(length = 12)` defined in Task 2 → called as `randomFriendlyPassword(12)` in Task 5 ✅
- `enqueueNotification({ reservationId, to, templateKey, language, context })` shape from existing `notifications.ts` (Task 3 verified) → called consistently in Task 4 (`sendWelcomeWhatsapp` helper) and Task 5 (`sendSigninDetailsAction`) ✅
- `NotifContext` shape extension in Task 3 (`username`, `tempPassword`, `signinRole`, `appUrl`, `displayName`) → used consistently in Task 4 + Task 5 ✅
- `sendSigninDetailsAction` return type `{ ok: true; sent_at } | { ok: false; error }` defined in Task 5 → consumed by `SendSigninButton` in Task 8 with matching narrowing ✅
- `DisableToggle` props `{ userId, currentlyDisabled, username, isSelf }` defined in Task 9 → matched in Task 10 Step 6 ✅
- `DisplayNameForm` props `{ userId, current }` defined in Task 9 → matched in Task 10 Step 6 ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-03-admin-signin-details-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended for this size)** — I dispatch a fresh subagent per task with full task text, two-stage review (spec compliance → code quality) between tasks. 11 tasks × ~3 dispatches each ≈ 30-35 dispatches total.

**2. Inline Execution** — I execute tasks in this session via executing-plans, batched checkpoints every few tasks for your review.

For an 11-task plan, both are workable. Subagent-driven gives more rigorous review; inline is faster end-to-end if you trust the spec.

**Which approach?**
