# FM+ Phase 2.1 — Module enforcement + tile gating

Date: 2026-05-18
Module: FMPLUS / Cross-cutting
Status: Auto-approved per user instruction "6 sub-project — one after one automatically"
Phase 2 dependency: foundation for #2–#6

## Problem

Phase 1 stored `fmplus_role` and `fmplus_perms` on `app_users` but never read them at runtime. As a result, anyone with the `fmplus` domain grant can access every FM+ surface equally, regardless of which preset (Operations Manager / Site Manager / Shift Submitter / Budget Manager / Financials Viewer) was assigned. The Setup tile is admin-only via a hard `is_admin` check, so an Operations Manager can't reach it even though their preset says they should.

## Goal

Make Phase 1's role data actually gate access:

1. The FM+ landing page (`/fmplus/page.tsx`) renders only the tiles the current user has at least `view`-level access to.
2. The Setup tile + `/fmplus/setup/*` is reachable by `is_admin === true` **OR** users whose resolved `fmplus_perms.setup === true` (Operations Manager preset, plus anyone with that flag flipped in Advanced overrides).
3. Mutating server actions in FM+ (shift-report save/submit, budget edits, user-access mutations) gate on the relevant module level.
4. Admins (global `role='admin'`) bypass all FM+ access checks — they get the full deny-list/allow-list behavior of "see everything".
5. Users with `fmplus` domain grant but no `fmplus_role` set ("Role not set" in the FM+ Setup list) see an empty FM+ landing — no tiles, friendly empty-state message — until an admin assigns a role.

## Out of scope (deferred)

- Per-project scoping (Phase 2.2).
- Hiding the Setup tile from non-admins on the FM+ landing if they don't have `setup === true` (this spec covers it — included).
- Inline "request access" UX when a user lacks a module (Phase 3+).
- Reading `fmplus_perms` from middleware — all checks are in server components/actions (middleware can stay agnostic).

## Architecture

### `getFmplusAccess(user)` helper

New file `src/lib/fmplus/setup/access.ts` exports:

```ts
export interface FmplusAccess {
  /** True when global app role is 'admin' — admins always get full FM+ access. */
  isAdmin: boolean;
  /** Resolved per-module permissions for this user. Admin gets full access regardless of fmplus_role. */
  perms: ResolvedFmplusPerms;
  /** Underlying fmplus_role preset. Null for admins without an explicit FM+ role, and for users with only domain grant but no preset. */
  fmplusRole: FmplusRolePreset | null;
}

/**
 * Returns the FM+ access record for the current session user.
 * - Returns null when there is no session, or when the user has no `fmplus` domain grant and is not admin.
 * - Admins always get full perms.
 * - Domain-granted users with NULL fmplus_role get the deny-all perm set (forces explicit role assignment).
 */
export async function getFmplusAccess(): Promise<FmplusAccess | null>;
```

Implementation reads `app_users` for `role, fmplus_role, fmplus_perms` and checks for the domain row. Returns the deny-all set when role is missing.

A second helper for server actions:

```ts
/**
 * Throws { error: 'forbidden' } when the user lacks the required level on the named module.
 * Use at the top of any mutating server action.
 */
export async function requireFmplusModule(
  module: 'financials' | 'budget' | 'performance' | 'shift_reports' | 'setup',
  level: 'view' | 'edit' | 'submit' | 'configure' | true,
): Promise<FmplusAccess>;
```

Level comparison logic (defined in `roles.ts` already exists — extending here):

- `view` is satisfied by `view`, `edit`, `submit`, `configure`.
- `submit` is satisfied by `submit`, `configure`.
- `configure` requires exactly `configure`.
- `edit` requires `edit`.
- `setup === true` requires the boolean `true`.

Implemented as a small `meetsLevel(actual, required)` predicate.

### `src/app/fmplus/layout.tsx` (new)

Server component. Calls `getFmplusAccess()`:
- `null` AND no session → `redirect('/login?next=/fmplus')`.
- `null` AND logged in (no fmplus domain access) → `notFound()`.
- Otherwise renders `{children}`.

Layouts in App Router wrap every page under `/fmplus/*` so this is one gate covering the whole module.

### `src/app/fmplus/page.tsx` (modify)

Becomes `async`. Calls `getFmplusAccess()` (layout already guaranteed non-null). Each tile renders only when its module is at least `view`. Setup tile renders when `perms.setup === true || isAdmin`. If zero tiles render (NULL-role user), show a friendly empty state pointing to the admin contact.

### Per-page gates (light touch)

The new layout already gates "any FM+ access" at the module entry. Individual pages don't need extra checks for the "view" case — if you can reach the URL, you have at least `view` on the relevant module IF you got past the tile (and a direct URL hit also goes through the layout). For surfaces that should NOT load at all when the user has `none` for that module:

- `/fmplus/financials/*` and `/fmplus/financial/budget/*` — add a `requireFmplusModule('budget', 'view')` (or `financials`) at the top of each top-level page. Subpages can read access from layout (left to a future refactor; for v1 we gate only the entry pages: `financials/page.tsx` and `financial/budget/page.tsx`).
- `/fmplus/performance/*` — gate top-level page on `performance: 'view'`.
- `/fmplus/shift-report/page.tsx` and `/fmplus/shift-report/[contractId]/page.tsx` — gate on `shift_reports: 'view'`.
- `/fmplus/setup/page.tsx`, `/fmplus/setup/users/page.tsx` — replace the existing `if (!me.is_admin) notFound()` with the new `is_admin || perms.setup === true` gate.

### Server actions (mutation gates)

- `src/lib/fmplus/shift-report/actions.ts:saveShiftReportConfig` → `requireFmplusModule('shift_reports', 'configure')`.
- `src/lib/fmplus/shift-report/actions.ts:submitShiftReport` → `requireFmplusModule('shift_reports', 'submit')`.
- `src/app/fmplus/setup/users/actions.ts` — replace `requireAdmin()` with `requireFmplusModule('setup', true)`.
- Budget edit actions (in `src/app/fmplus/financial/budget/edit/actions.ts` if it exists; or wherever the edit/save/publish actions live) → `requireFmplusModule('budget', 'edit')`.

### Backward compatibility

- Existing users with `fmplus_role IS NULL` get deny-all perms. Empty FM+ landing. Admins must assign roles via `/fmplus/setup/users` (or `/admin/users` — eventually we'll add a quick "Set FM+ role" link).
- Global admins always pass every check, regardless of `fmplus_role`. This preserves the operator's ability to access everything.

## Schema

**No migration.** All data already exists. The helper just reads `app_users.role`, `app_users.fmplus_role`, `app_users.fmplus_perms`, and `app_user_domain_roles.domain='fmplus'`.

## File layout

| Path | Action | Responsibility |
|---|---|---|
| `src/lib/fmplus/setup/access.ts` | **Create** | `getFmplusAccess()`, `requireFmplusModule()`, `meetsLevel()`. |
| `src/lib/fmplus/setup/access.test.ts` | **Create** | Vitest coverage for `meetsLevel` matrix. |
| `src/app/fmplus/layout.tsx` | **Create** | Layout-level gate redirecting/404ing as appropriate. |
| `src/app/fmplus/page.tsx` | Modify | Async; conditional tile rendering; empty state. |
| `src/app/fmplus/setup/page.tsx` | Modify | Replace `is_admin` gate with `is_admin || perms.setup`. |
| `src/app/fmplus/setup/users/page.tsx` | Modify | Same gate. |
| `src/app/fmplus/setup/users/actions.ts` | Modify | Replace `requireAdmin()` with `requireFmplusModule('setup', true)`. |
| `src/lib/fmplus/shift-report/actions.ts` | Modify | Gate `saveShiftReportConfig` + `submitShiftReport`. |
| `src/app/fmplus/financials/page.tsx` | Modify | `requireFmplusModule('financials', 'view')` near top. |
| `src/app/fmplus/financial/budget/page.tsx` | Modify | `requireFmplusModule('budget', 'view')` near top. |
| `src/app/fmplus/performance/page.tsx` | Modify | `requireFmplusModule('performance', 'view')` near top. |
| `src/app/fmplus/shift-report/page.tsx` | Modify | `requireFmplusModule('shift_reports', 'view')` near top. |
| `src/app/fmplus/shift-report/[contractId]/page.tsx` | Modify | Same. |

## Verification

After implementation:

1. **Admin smoke**: log in as `kareemhady` → `/fmplus` shows 5 tiles. Setup is reachable. Everything works as before.
2. **Operations Manager smoke**: assign that preset to a test user via `/fmplus/setup/users`. Sign in. `/fmplus` shows 5 tiles. Setup reachable. Can edit budget. Can submit + configure shift reports.
3. **Site Manager smoke**: assign that preset. `/fmplus` shows 4 tiles (no Financials). Setup not reachable (404 on direct URL). Can configure + submit shift reports. Can view but not edit budget. Direct URL to `/fmplus/financials` → 404.
4. **Shift Submitter smoke**: tiles = Performance + Shift Reports. Cannot configure shift reports (Save Config action errors with "forbidden"). Can submit.
5. **Budget Manager smoke**: tiles = Financials + Budget + Performance + Shift Reports (view). Cannot configure shift reports.
6. **Financials Viewer smoke**: tiles = Financials + Performance only.
7. **Role-not-set smoke**: take a pre-existing user who has `fmplus` domain grant but `fmplus_role IS NULL`. `/fmplus` shows zero tiles + empty-state message "Contact your admin to assign an FM+ role."
8. **Tests**: `access.test.ts` covers the `meetsLevel` matrix exhaustively.

## Risks

- **Subpages of Budget / Performance / Financials remain ungated in v1** — if a non-`view` user knows a deep URL (e.g. `/fmplus/financial/budget/edit?contractId=4`), they could hit it without a check. **Mitigation**: server actions are gated, so they can't actually mutate; reads are read-only. Phase 2.2 can deepen page-level gates if needed.
- **`requireFmplusModule` adds one Supabase round-trip per gated action.** Same shape as Phase 1's `requireAdmin`. Acceptable for small-tenant ops dashboard; can be cached later if it shows up in profiling.
- **NULL-role legacy users see an empty FM+** — surprising on first encounter. Mitigated by the friendly empty state pointing to admin.
