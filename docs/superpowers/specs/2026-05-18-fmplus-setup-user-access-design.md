# FM+ Setup tile + User Access (v1)

Date: 2026-05-18
Module: FMPLUS / Setup
Status: Design approved — pending spec review

## Problem

FM+ (Property & Facility Management) has four operational surfaces — Financials, Project Budget, Performance Dashboard, Shift Reports — but no in-module setup or user-management UI. Today, anyone with `fmplus` domain access on `app_users` can see all four tiles equally. As the FM+ workforce grows (operations managers, site managers, shift submitters, budget editors), we need:

1. A clear in-module entry point for setup tasks ("the place to manage FM+ users / integrations / WhatsApp groups / etc.").
2. A way to record **what each user's role is inside FM+** so future per-module enforcement (Phase 2) has somewhere to read from.
3. A self-contained user-creation form that an FM+ operations manager can run without learning the general `/admin/users` UI (which exposes all domains and global concerns irrelevant to FM+ staff).

## Goal

Add a 5th tile on the FM+ landing page titled "Setup". The tile links to `/fmplus/setup`, a landing page that for v1 contains a single card: **User Access**. The User Access page lists users with `fmplus` domain access, lets admins create new FM+ users, and assigns each user an FM+ role (preset + optional per-module overrides). The role data is stored on `app_users`; **enforcement at each FM+ module is explicitly Phase 2** and not in scope for this spec.

## Out of scope

The following are deliberately deferred to keep this PR small and shippable:

- **Per-module enforcement.** This spec stores `fmplus_role` and `fmplus_perms` on `app_users` but does NOT add role checks to Financials / Budget / Performance / Shift Reports pages. Those gates are a Phase 2 task with its own spec.
- **Per-project scoping** (e.g. "Shift Submitter for City Gate only"). Future Phase 2 work using a new `fmplus_user_project_access` table.
- **Invite-link signup flow** (admin enters Name + Email; system sends a one-time signup link; user picks their own password). Defer to Phase 3.
- **Activity audit log per user** (who edited what, when). Future cross-cutting concern.
- **Additional Setup cards** beyond User Access (integrations management, WhatsApp group defaults, notification preferences). The landing page is designed to host more cards, but only one card ships in v1.
- **Distinct WhatsApp number column.** This spec reuses the existing `mobile_number` field. If a future need arises to separate "voice mobile" from "WhatsApp number" we can add `whatsapp_number text` later without breaking anything.

## Architecture

### Single source of truth for users

The existing `app_users` table (defined in `src/lib/auth.ts`, used by `/admin/users`, scrypt-hashed passwords, sessions in `app_sessions`) is the single source of truth. This spec extends the same row — it does NOT create a parallel `fmplus_users` table. A user shows up in the FM+ Setup list iff they have a row in `app_user_domain_roles` with `domain = 'fmplus'`. The FM+ Create-User form auto-grants that row, so users created via the FM+ UI appear in the list automatically.

### Role model — preset + optional per-module overrides

Each FM+ user has:

- A `fmplus_role` text column with one of 5 canonical preset values (or NULL when the user pre-dates this feature).
- A `fmplus_perms` jsonb column carrying optional per-module overrides. When NULL or empty, the preset's defaults apply. When populated, individual modules override the preset.

**Preset → permissions matrix** (canonical source of truth, mirrored in `src/lib/fmplus/setup/roles.ts`):

| Preset key | Financials | Budget | Performance | Shift Reports | Setup |
|---|---|---|---|---|---|
| `operations_manager` | view | edit | view | configure | yes |
| `site_manager` | none | view | view | configure | no |
| `shift_submitter` | none | none | view | submit | no |
| `budget_manager` | view | edit | view | view | no |
| `financials_viewer` | view | none | view | none | no |

Per-module access levels:

- **Financials:** `none` | `view`
- **Budget:** `none` | `view` | `edit`
- **Performance:** `none` | `view`
- **Shift Reports:** `none` | `view` | `submit` | `configure` (each level implies the previous — `submit` includes `view`; `configure` includes everything)
- **Setup:** `false` | `true` (manage users)

`fmplus_perms` JSON shape (all keys optional):

```json
{
  "financials":    "view",
  "budget":        "edit",
  "performance":   "view",
  "shift_reports": "configure",
  "setup":         true
}
```

### Backward compatibility

Existing users on `app_users` continue to work:

- `full_name`, `fmplus_role`, `fmplus_perms` are all nullable. No existing row needs updating.
- Users without `fmplus_role` set: the FM+ Setup user list shows them with a "Role not set" badge. They still get access through the existing `app_user_domain_roles` row for `fmplus` (if they have one). The Edit form lets admins assign a preset retroactively.
- `username` retains its case-insensitive uniqueness behavior (login trims+lowercases).
- The `mobile_number` column gains a new alias in the FM+ form ("WhatsApp number") but the column itself is unchanged. The existing `/admin/users` form still labels it "Mobile number"; both forms write to the same column.

## Schema migration

File: `supabase/migrations/0146_fmplus_setup_user_access.sql`

```sql
-- Add FM+ Setup user fields to app_users.
-- All columns nullable so existing rows continue to work.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS full_name    text,
  ADD COLUMN IF NOT EXISTS fmplus_role  text,
  ADD COLUMN IF NOT EXISTS fmplus_perms jsonb;

-- Constrain fmplus_role to the canonical preset values (NULL allowed).
ALTER TABLE app_users
  ADD CONSTRAINT app_users_fmplus_role_check
  CHECK (
    fmplus_role IS NULL
    OR fmplus_role IN (
      'operations_manager',
      'site_manager',
      'shift_submitter',
      'budget_manager',
      'financials_viewer'
    )
  );

-- Helpful index for the Setup user list: filtered by fmplus_role presence.
-- Not strictly required but keeps the list fast as tenancy grows.
CREATE INDEX IF NOT EXISTS app_users_fmplus_role_idx
  ON app_users(fmplus_role)
  WHERE fmplus_role IS NOT NULL;
```

No data migration required — all new columns default to NULL.

## File layout

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0146_fmplus_setup_user_access.sql` | **Create** | The migration above. Applied via `apply_migration` MCP per repo standing authorization. |
| `src/lib/fmplus/setup/roles.ts` | **Create** | Canonical role definitions: `FMPLUS_ROLE_PRESETS` array (key + Arabic + English label + default permissions), `MODULE_LEVELS` enum per module, `resolveFmplusPerms(role, perms)` helper that merges preset defaults with overrides into the effective permission set. **No React code in here** — pure types + data, importable from server and client. |
| `src/app/fmplus/page.tsx` | Modify | Add the 5th tile "Setup" between Performance Dashboard and Shift Reports. New icon: `Settings` from lucide-react. Links to `/fmplus/setup`. Tile is rendered for everyone with `fmplus` domain access (the *page* behind it gates on admin). |
| `src/app/fmplus/setup/page.tsx` | **Create** | Setup landing page. Renders `<TopNav>` + `<FmplusHero>` + a single card "User Access" linking to `/fmplus/setup/users`. Server component, `getCurrentUser` gate: `is_admin` only. Non-admins hitting this URL get `notFound()`. Designed to host more cards later (e.g. Integrations, Notifications) — we leave a placeholder comment. |
| `src/app/fmplus/setup/users/page.tsx` | **Create** | User list + Create-User form. Server component. Mirrors `/admin/users` shape closely but: (a) filters to users with `fmplus` domain role; (b) replaces the global-role + per-domain-grants UI with the FM+ preset + Advanced matrix; (c) the form fields are Name / Username / Password / WhatsApp / Email / FM+ Role; (d) bullets the in-scope improvements: last-login pill, disabled toggle on edit, reset-password button on edit. |
| `src/app/fmplus/setup/users/actions.ts` | **Create** | Server actions: `createFmplusUserAction(formData)`, `updateFmplusUserAction(userId, formData)`, `resetFmplusPasswordAction(userId, formData)`, `setFmplusUserDisabledAction(userId, disabled)`. All gated on `is_admin`. Each action validates inputs (Zod schemas), hashes passwords via existing `hashPassword`, upserts into `app_users` + `app_user_domain_roles`. |
| `src/app/fmplus/setup/users/_components/user-row-edit.tsx` | **Create** | Client component for the per-row Edit affordance. Pop-out form with: edit name/email/whatsapp, change FM+ role preset, toggle Advanced + edit matrix, reset password, disable/enable account. Modeled on `src/app/admin/users/_components/user-row-edit.tsx` but FM+-specific. |
| `src/app/fmplus/setup/users/_components/fmplus-role-picker.tsx` | **Create** | Shared client component: `<select>` for the 5 presets + Advanced toggle that reveals the 5-row matrix. Used by both the Create form on `users/page.tsx` and the Edit pop-out. Lifts the picker out so it's not duplicated. Pure UI; takes value + onChange props. |

No changes to `app_users` reads elsewhere — the new columns are additive and other code that does `select * from app_users` will simply pick them up.

## UI design

### Tile on `/fmplus/page.tsx`

A 5th card in the existing grid, after Performance Dashboard:

```
[Setup]
  Settings icon (lucide), fmplus-yellow tinted background
  Title: Setup
  Subtitle: User access · FM+ app roles · integrations
```

Layout: 1 column on mobile, 2 on sm, 3 on lg (matches existing grid). When admin clicks, lands on `/fmplus/setup`. When a non-admin clicks (Phase 1 has no UX hint that they shouldn't), the Setup landing 404s — acceptable for v1 since non-admins won't typically see the link in their training, and the landing page itself returns `notFound()`.

### `/fmplus/setup` (Setup landing)

```
FMPLUS / Setup
─────────────────────────────────────
FmplusHero: title="Setup", eyebrow="FMPLUS · ADMINISTRATION",
            subtitle="Manage who can access FM+ and what they can do."

[User Access card]
  UserCog icon
  Title: User Access
  Subtitle: Add, edit, and disable FM+ users. Assign app roles inside FM+.
  → /fmplus/setup/users

(Future cards live here: Integrations, Notifications, …)
```

Server-rendered. Gate: `await getCurrentUser(); if (!user) redirect('/login?next=/fmplus/setup'); if (!user.is_admin) notFound();`.

### `/fmplus/setup/users` (User list + Create form)

Top section: **Create user** form, single column on mobile, 2 cols sm, 3 cols lg, matching the `/admin/users` styling. Fields in order:

1. **Name** (`name="full_name"`, required, max 80 chars) — full real name
2. **Username** (`name="username"`, required, min 3, lowercased + trimmed)
3. **Password** (`name="password"`, required, min 8, hashed server-side via `hashPassword`)
4. **WhatsApp number** (`name="mobile_number"`, optional, `tel`, placeholder "+201234567890")
5. **Email** (`name="email"`, optional, `email`)
6. **FM+ Role** (uses the shared `<FmplusRolePicker>` component) — `<select>` defaults to `shift_submitter`; "Advanced" toggle off by default
7. Submit → `createFmplusUserAction`

The server action: (a) validates inputs (Zod); (b) inserts the `app_users` row with `role = 'editor'` globally (so they have write access on the domains they're granted, but don't see other domains); (c) inserts `app_user_domain_roles(user_id, domain='fmplus', role='editor')`; (d) revalidates `/fmplus/setup/users`.

Bottom section: **Users list** — one card per user. For each user:

- Header line: full_name (large) · username (mono small) · "admin" pill if `role='admin'` · "you" pill if `id===me.id` · "disabled" pill if `disabled_at`
- Contact line: 📞 WhatsApp · ✉️ Email (clickable `tel:` / `mailto:`)
- FM+ role line: 🎭 preset label (Arabic + English) · "Advanced" indicator if `fmplus_perms !== null`
- Activity line: "last login Mar 8, 2026 14:23" or "never signed in"
- Edit button (right side, opens `<UserRowEdit>` pop-out)

### Edit pop-out (`<UserRowEdit>`)

Form fields (all optional except where noted):

- Name (text)
- WhatsApp number (tel)
- Email (email)
- FM+ Role preset (`<FmplusRolePicker>`) + Advanced toggle + matrix
- **Reset password** sub-section: a separate password input + "Reset" button (calls `resetFmplusPasswordAction`)
- **Account status** toggle: "Disabled" checkbox (calls `setFmplusUserDisabledAction`)

Save button at the bottom calls `updateFmplusUserAction`. Reset password and Disable status fire their own actions to avoid bundling concerns.

### `<FmplusRolePicker>` component

```
[FM+ Role *]
  ┌──────────────────────────────────┐
  │ Site Manager (مدير الموقع)    ▼  │
  └──────────────────────────────────┘
  ☐ Advanced (override preset)

  (when Advanced is checked, the matrix below appears:)
  ┌────────────────────────────────────────┐
  │ Financials      [ view ▼ ]             │
  │ Budget          [ edit ▼ ]             │
  │ Performance     [ view ▼ ]             │
  │ Shift Reports   [ configure ▼ ]        │
  │ Setup           [ Yes ]                │
  │ "Reset to preset defaults" link        │
  └────────────────────────────────────────┘
```

When Advanced is OFF, `fmplus_perms` is saved as NULL (preset defaults apply). When ON and at least one row differs from the preset, `fmplus_perms` is saved as a JSON object with the overridden keys.

## Auth gating (v1)

- **Setup tile rendering on `/fmplus/page.tsx`:** always rendered (every FM+ tile is visible to every user with fmplus domain access today). We do NOT condition the tile on `is_admin`. The page behind it does the real gate, so non-admins see the tile but get a 404 if they click. Rationale: the FM+ landing page is a server component without per-user filtering of tiles yet; adding it is a bigger refactor we don't want in this spec.
- **`/fmplus/setup`, `/fmplus/setup/users`, all action handlers:** gated on `getCurrentUser()` returning a user with `is_admin === true`. Otherwise `notFound()` (not `redirect`, so non-admins can't probe for the page's existence).

Phase 2 will replace `is_admin` with `is_admin || fmplus_role === 'operations_manager'` once the role data is being collected.

## Verification

After implementation:

1. **Migration applies cleanly.** `apply_migration` on Lime Investments Supabase succeeds. `select column_name from information_schema.columns where table_name='app_users' and column_name in ('full_name','fmplus_role','fmplus_perms')` returns 3 rows.
2. **Tile visible.** `/fmplus` shows 5 tiles (Financials, Project Budget, Performance Dashboard, Setup, Shift Reports). Setup tile uses the Settings icon.
3. **Admin can land on Setup.** As `kareemhady` (admin), clicking the Setup tile lands on `/fmplus/setup`. Card shown: "User Access".
4. **Non-admin gets 404.** Manually create a user with `is_admin=false` and `fmplus` domain access. Hit `/fmplus/setup` directly → 404.
5. **Create user.** As admin, fill the form (Name=Yasser, Username=yasser, Password=tempPass1, WhatsApp=+201234567890, Email=yasser@fmplus.com, FM+ Role=Site Manager). Submit → user appears in the list. Re-query `app_users` and `app_user_domain_roles` to confirm:
   - `app_users` row has `full_name='Yasser'`, `username='yasser'`, `fmplus_role='site_manager'`, `fmplus_perms IS NULL`, `mobile_number='+201234567890'`, `email='yasser@fmplus.com'`, `role='editor'`.
   - `app_user_domain_roles` has `(user_id=<yasser>, domain='fmplus', role='editor')`.
6. **Advanced overrides save.** Edit yasser, toggle Advanced, set Budget to "edit", save. `fmplus_perms = {budget: 'edit'}` in the DB.
7. **Reset password.** Reset yasser's password to `newPass2`. Verify the existing `loginWithPassword('yasser','newPass2')` succeeds and the old password no longer works.
8. **Disable account.** Toggle yasser's Disabled. `disabled_at` is set. Yasser can no longer log in (existing `getCurrentUser` already handles this).
9. **Existing user backfill.** Pick an existing fmplus-domain user via SQL (e.g. `dy`). They appear in the list with "Role not set" badge. Admin can edit, set preset, save. Subsequent reads return their `fmplus_role`.
10. **Production build succeeds.** `npm run build` finishes with no TS errors.

## Risks

- **Existing fmplus-domain users have `fmplus_role = NULL` until backfilled.** No functional impact (no enforcement yet), only a "Role not set" badge in the UI. Phase 2 enforcement code will need to handle `fmplus_role IS NULL` gracefully — likely treat as "no FM+ access beyond domain-level grant", which means full read on all FM+ pages but no enforced write gates. The spec for Phase 2 will pin this down.
- **`mobile_number` column shared between `/admin/users` (label "Mobile number") and `/fmplus/setup/users` (label "WhatsApp number")** — minor UX inconsistency. Acceptable since `mobile_number` IS what the dashboard's WhatsApp helper uses, and the two forms aren't typically open at the same time. If it becomes a problem, add a separate `whatsapp_number` column in a follow-up migration.
- **Setup tile visible to non-admins → 404 on click.** Mildly bad UX, but acceptable for v1. We document this and revisit when we have per-role tile rendering on the FM+ landing page (Phase 2).
