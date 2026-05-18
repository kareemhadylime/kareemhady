# FM+ Setup tile + User Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 5th tile on the FM+ landing page titled "Setup" that links to a new `/fmplus/setup/users` page where admins create / edit / disable FM+ users and assign each user an FM+ app role (preset + optional per-module overrides). Role data is captured on `app_users`; module-level enforcement is explicitly Phase 2.

**Architecture:** Reuses the existing `app_users` table — no parallel user table. Adds three nullable columns (`full_name`, `fmplus_role`, `fmplus_perms`) via a single additive migration. The 5 canonical FM+ role presets and their default per-module permissions live in a new pure TS module `src/lib/fmplus/setup/roles.ts`, importable from server and client. The user-creation server action auto-grants `app_user_domain_roles.fmplus` so newly-created users immediately appear in the FM+ Setup list. Auth gating is admin-only for v1.

**Tech Stack:** Next.js 16 (App Router, `src/`), React 19 (Server Components + Server Actions + `useActionState`), TypeScript strict, Tailwind v4, Vitest (colocated `*.test.ts`), Supabase (`app_users` JSONB column for perms; CHECK constraint for role preset), existing scrypt password hashing via `src/lib/auth.ts:hashPassword`.

**Spec:** [docs/superpowers/specs/2026-05-18-fmplus-setup-user-access-design.md](../specs/2026-05-18-fmplus-setup-user-access-design.md)

**Deployment:** Per repo CLAUDE.md, commit straight to `main` and push. GitHub → Vercel auto-deploys. Migration applies via `mcp__…__apply_migration` (standing authorization in CLAUDE.md).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0146_fmplus_setup_user_access.sql` | **Create** | Additive migration: 3 nullable columns + CHECK constraint + partial index on `app_users`. |
| `src/lib/fmplus/setup/roles.ts` | **Create** | Pure data + types: `FmplusRolePreset` union, `FmplusPerms` interface, `FMPLUS_ROLE_PRESETS` table with Arabic + English labels and default permissions per module, `resolveFmplusPerms(role, perms)` helper. Server + client safe. |
| `src/lib/fmplus/setup/roles.test.ts` | **Create** | Vitest coverage for `resolveFmplusPerms` across all 5 presets, null perms, partial overrides, and full overrides. |
| `src/app/fmplus/page.tsx` | Modify | Add the 5th tile "Setup" between Performance Dashboard and Shift Reports. Uses `Settings` lucide icon, links to `/fmplus/setup`. |
| `src/app/fmplus/setup/page.tsx` | **Create** | Setup landing. Admin gate. Renders `<TopNav>` + `<FmplusHero>` + a single card linking to `/fmplus/setup/users`. |
| `src/app/fmplus/setup/users/page.tsx` | **Create** | User list + create-user form. Server component. Filters `app_users` to those with `fmplus` domain grant. Admin gate. |
| `src/app/fmplus/setup/users/actions.ts` | **Create** | Server actions: `createFmplusUserAction`, `updateFmplusUserProfileStateAction`, `setFmplusUserRoleStateAction`, `resetFmplusPasswordStateAction`, `setFmplusUserDisabledStateAction`. Each gated on `is_admin`. |
| `src/app/fmplus/setup/users/_components/fmplus-role-picker.tsx` | **Create** | Shared client component: `<select>` for the 5 presets + Advanced toggle + 5-row matrix. Used by both the Create form and the Edit pop-out. |
| `src/app/fmplus/setup/users/_components/fmplus-user-row-edit.tsx` | **Create** | Client component for per-row Edit pop-out. Profile fields, FM+ role picker, reset password, disable toggle. Models `src/app/admin/users/_components/user-row-edit.tsx` patterns (useActionState, inline result pills, auto-close on success). |

No changes to `src/lib/auth.ts`, `src/lib/rules/presets.ts`, or `src/app/admin/users/*` — those files keep their current shape.

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/0146_fmplus_setup_user_access.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add FM+ Setup user fields to app_users.
-- All columns nullable so existing rows continue to work without backfill.

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

-- Helpful index for the Setup user list: filter by fmplus_role presence.
CREATE INDEX IF NOT EXISTS app_users_fmplus_role_idx
  ON app_users(fmplus_role)
  WHERE fmplus_role IS NOT NULL;
```

- [ ] **Step 2: Apply via the Supabase MCP**

The repo's CLAUDE.md gives standing authorization for `mcp__…__apply_migration` against project `bpjproljatbrbmszwbov`. Call the MCP tool with the migration's SQL body and a name like `0146_fmplus_setup_user_access`.

- [ ] **Step 3: Verify via `mcp__…__execute_sql`**

Run this against the same project:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'app_users'
  AND column_name IN ('full_name', 'fmplus_role', 'fmplus_perms')
ORDER BY column_name;
```

Expected: 3 rows. `full_name text YES`, `fmplus_perms jsonb YES`, `fmplus_role text YES`.

Then verify the constraint:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'app_users'::regclass
  AND conname = 'app_users_fmplus_role_check';
```

Expected: 1 row, `app_users_fmplus_role_check`.

- [ ] **Step 4: Commit and push**

```bash
git add supabase/migrations/0146_fmplus_setup_user_access.sql
git commit -m "feat(fmplus): migration — add full_name + fmplus_role + fmplus_perms to app_users"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 2: Role catalog library (TDD)

**Files:**
- Create: `src/lib/fmplus/setup/roles.ts`
- Create: `src/lib/fmplus/setup/roles.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/fmplus/setup/roles.test.ts` with this content:

```ts
import { describe, expect, it } from 'vitest';
import {
  FMPLUS_ROLE_PRESETS,
  resolveFmplusPerms,
  type FmplusRolePreset,
} from './roles';

describe('FMPLUS_ROLE_PRESETS', () => {
  it('contains exactly the 5 canonical presets in display order', () => {
    expect(FMPLUS_ROLE_PRESETS.map((p) => p.key)).toEqual([
      'operations_manager',
      'site_manager',
      'shift_submitter',
      'budget_manager',
      'financials_viewer',
    ]);
  });

  it('every preset has both Arabic and English labels', () => {
    for (const p of FMPLUS_ROLE_PRESETS) {
      expect(p.labelAr).toBeTruthy();
      expect(p.labelEn).toBeTruthy();
    }
  });
});

describe('resolveFmplusPerms — preset defaults', () => {
  it('operations_manager gets full access', () => {
    const out = resolveFmplusPerms('operations_manager', null);
    expect(out).toEqual({
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'configure',
      setup:         true,
    });
  });

  it('site_manager: shift-reports configure, budget+performance view, no financials/setup', () => {
    const out = resolveFmplusPerms('site_manager', null);
    expect(out).toEqual({
      financials:    'none',
      budget:        'view',
      performance:   'view',
      shift_reports: 'configure',
      setup:         false,
    });
  });

  it('shift_submitter: only submit shift reports and view performance', () => {
    const out = resolveFmplusPerms('shift_submitter', null);
    expect(out).toEqual({
      financials:    'none',
      budget:        'none',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    });
  });

  it('budget_manager: edit budget, view financials/performance, view shift reports', () => {
    const out = resolveFmplusPerms('budget_manager', null);
    expect(out).toEqual({
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'view',
      setup:         false,
    });
  });

  it('financials_viewer: view financials + performance only', () => {
    const out = resolveFmplusPerms('financials_viewer', null);
    expect(out).toEqual({
      financials:    'view',
      budget:        'none',
      performance:   'view',
      shift_reports: 'none',
      setup:         false,
    });
  });
});

describe('resolveFmplusPerms — overrides', () => {
  it('partial override merges with preset defaults', () => {
    // shift_submitter base → no budget access. Override grants budget: 'edit'.
    const out = resolveFmplusPerms('shift_submitter', { budget: 'edit' });
    expect(out).toEqual({
      financials:    'none',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    });
  });

  it('multiple overrides on the same preset', () => {
    const out = resolveFmplusPerms('financials_viewer', {
      shift_reports: 'submit',
      budget:        'view',
    });
    expect(out).toEqual({
      financials:    'view',
      budget:        'view',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    });
  });

  it('empty overrides object is equivalent to null', () => {
    expect(resolveFmplusPerms('site_manager', {})).toEqual(
      resolveFmplusPerms('site_manager', null),
    );
  });
});

describe('resolveFmplusPerms — unknown role fallback', () => {
  it('falls back to the most-restricted permission set when role is unrecognized', () => {
    const out = resolveFmplusPerms('unknown_role' as FmplusRolePreset, null);
    expect(out).toEqual({
      financials:    'none',
      budget:        'none',
      performance:   'none',
      shift_reports: 'none',
      setup:         false,
    });
  });
});
```

- [ ] **Step 2: Run the test suite — confirm RED**

```bash
npm run test -- src/lib/fmplus/setup/roles.test.ts
```

Expected: tests fail with "Cannot find module './roles'" or similar. This is the TDD red state — the module doesn't exist yet.

- [ ] **Step 3: Implement `roles.ts`**

Create `src/lib/fmplus/setup/roles.ts` with this content:

```ts
// Canonical FM+ role presets + per-module permission matrix.
//
// Used by both the Settings UI (Create / Edit user forms) and any future
// enforcement code in FM+ modules. This file is pure data + a small resolver
// helper — no React, no server imports — so it can be safely imported from
// client components, server components, server actions, and tests alike.

export type FmplusRolePreset =
  | 'operations_manager'
  | 'site_manager'
  | 'shift_submitter'
  | 'budget_manager'
  | 'financials_viewer';

export type FinancialsLevel    = 'none' | 'view';
export type BudgetLevel        = 'none' | 'view' | 'edit';
export type PerformanceLevel   = 'none' | 'view';
export type ShiftReportsLevel  = 'none' | 'view' | 'submit' | 'configure';

/**
 * Per-module permissions for a single FM+ user. Each field is optional —
 * absent fields fall back to the user's preset defaults. Stored on
 * app_users.fmplus_perms (jsonb).
 */
export interface FmplusPerms {
  financials?:    FinancialsLevel;
  budget?:        BudgetLevel;
  performance?:   PerformanceLevel;
  shift_reports?: ShiftReportsLevel;
  /** Setup module is binary: false = cannot manage users, true = can. */
  setup?:         boolean;
}

/** A fully-resolved permission set (no optional fields). */
export interface ResolvedFmplusPerms {
  financials:    FinancialsLevel;
  budget:        BudgetLevel;
  performance:   PerformanceLevel;
  shift_reports: ShiftReportsLevel;
  setup:         boolean;
}

export interface FmplusRolePresetDef {
  key:      FmplusRolePreset;
  labelAr:  string;
  labelEn:  string;
  defaults: ResolvedFmplusPerms;
}

/** The 5 canonical presets, in display order (most-privileged → least). */
export const FMPLUS_ROLE_PRESETS: readonly FmplusRolePresetDef[] = [
  {
    key:     'operations_manager',
    labelAr: 'مدير العمليات',
    labelEn: 'Operations Manager',
    defaults: {
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'configure',
      setup:         true,
    },
  },
  {
    key:     'site_manager',
    labelAr: 'مدير الموقع',
    labelEn: 'Site Manager',
    defaults: {
      financials:    'none',
      budget:        'view',
      performance:   'view',
      shift_reports: 'configure',
      setup:         false,
    },
  },
  {
    key:     'shift_submitter',
    labelAr: 'مُسجِّل الورديات',
    labelEn: 'Shift Submitter',
    defaults: {
      financials:    'none',
      budget:        'none',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    },
  },
  {
    key:     'budget_manager',
    labelAr: 'مدير الميزانية',
    labelEn: 'Budget Manager',
    defaults: {
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'view',
      setup:         false,
    },
  },
  {
    key:     'financials_viewer',
    labelAr: 'مُطّلع على المالية',
    labelEn: 'Financials Viewer',
    defaults: {
      financials:    'view',
      budget:        'none',
      performance:   'view',
      shift_reports: 'none',
      setup:         false,
    },
  },
] as const;

/** Most-restricted fallback: no access to anything. Used when role is unrecognized. */
export const FMPLUS_PERMS_DENY_ALL: ResolvedFmplusPerms = {
  financials:    'none',
  budget:        'none',
  performance:   'none',
  shift_reports: 'none',
  setup:         false,
};

/**
 * Merge a preset's defaults with optional per-module overrides into a
 * fully-resolved permission set. Used by enforcement code (future Phase 2)
 * and by the Settings UI to display the "effective" permissions before save.
 *
 * - If `role` is unrecognized, returns the deny-all fallback.
 * - If `perms` is null or empty, returns the preset's defaults.
 * - Override fields that are present REPLACE the preset's defaults for that
 *   module; fields that are absent keep the preset's default.
 */
export function resolveFmplusPerms(
  role: FmplusRolePreset | null | undefined,
  perms: FmplusPerms | null | undefined,
): ResolvedFmplusPerms {
  const preset = FMPLUS_ROLE_PRESETS.find((p) => p.key === role);
  if (!preset) return { ...FMPLUS_PERMS_DENY_ALL };
  const base = preset.defaults;
  if (!perms) return { ...base };
  return {
    financials:    perms.financials    ?? base.financials,
    budget:        perms.budget        ?? base.budget,
    performance:   perms.performance   ?? base.performance,
    shift_reports: perms.shift_reports ?? base.shift_reports,
    setup:         perms.setup         ?? base.setup,
  };
}
```

- [ ] **Step 4: Run the test suite — confirm GREEN**

```bash
npm run test -- src/lib/fmplus/setup/roles.test.ts
```

Expected: all tests pass (Tests N passed where N = 12).

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/fmplus/setup/roles.ts src/lib/fmplus/setup/roles.test.ts
git commit -m "feat(fmplus): role preset catalog + resolveFmplusPerms helper with vitest coverage"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 3: Add Setup tile to FM+ landing page

**Files:**
- Modify: `src/app/fmplus/page.tsx`

- [ ] **Step 1: Add the Settings icon to the existing import**

In `src/app/fmplus/page.tsx` line 2, the current import is:

```tsx
import { Building2, BarChart3, ChevronRight, Wallet, Gauge, ClipboardList } from 'lucide-react';
```

Replace it with:

```tsx
import { Building2, BarChart3, ChevronRight, Wallet, Gauge, ClipboardList, Settings } from 'lucide-react';
```

- [ ] **Step 2: Insert the Setup tile between Performance Dashboard and Shift Reports**

Find the closing `</Link>` of the Performance Dashboard tile (around line 81 in the current file, ends with the `Performance Dashboard` text + its `</Link>`). Right after that closing `</Link>` and before the `<Link href="/fmplus/shift-report"` opening, insert:

```tsx
          <Link
            href="/fmplus/setup"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <Settings size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  Setup
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  User access · FM+ app roles · integrations.
                </p>
              </div>
            </div>
          </Link>

```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "fmplus/page" || echo "fmplus/page.tsx clean"
```

Expected: `fmplus/page.tsx clean`. (Pre-existing errors in `personal/email/actions.ts` and `beithady-daily-report` tests are acceptable; ignore those.)

- [ ] **Step 4: Commit and push**

```bash
git add src/app/fmplus/page.tsx
git commit -m "feat(fmplus): add Setup tile linking to /fmplus/setup"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 4: Setup landing page

**Files:**
- Create: `src/app/fmplus/setup/page.tsx`

- [ ] **Step 1: Create the landing page**

Create `src/app/fmplus/setup/page.tsx` with this content:

```tsx
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Settings, UserCog, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { FmplusHero } from '../_components/fmplus-hero';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function FmplusSetupLandingPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/fmplus/setup');
  if (!me.is_admin) notFound();

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="hover:text-fmplus-gold">FMPLUS</Link>
        <span className="text-slate-400">/</span>
        <span>Setup</span>
      </TopNav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1">
        <FmplusHero
          eyebrow="FMPLUS · ADMINISTRATION"
          title="Setup"
          subtitle="Manage who can access FM+ and what they can do."
          icon={Settings}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/fmplus/setup/users"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <UserCog size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  User Access
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Add, edit, and disable FM+ users. Assign app roles inside FM+.
                </p>
              </div>
            </div>
          </Link>

          {/* Future cards (integrations, notifications, etc.) live here. */}
        </section>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "fmplus/setup" || echo "fmplus/setup clean"
```

Expected: `fmplus/setup clean`.

- [ ] **Step 3: Commit and push**

```bash
git add src/app/fmplus/setup/page.tsx
git commit -m "feat(fmplus): Setup landing page with User Access card (admin-gated)"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 5: FmplusRolePicker shared component

**Files:**
- Create: `src/app/fmplus/setup/users/_components/fmplus-role-picker.tsx`

- [ ] **Step 1: Create the picker component**

This is a controlled client component used by both the Create form (single user-level use) and the Edit pop-out (per-user use). It owns: the preset `<select>`, the Advanced toggle, and the 5-row matrix that renders when Advanced is on.

Create `src/app/fmplus/setup/users/_components/fmplus-role-picker.tsx` with this content:

```tsx
'use client';

import { useEffect, useId, useState } from 'react';
import {
  FMPLUS_ROLE_PRESETS,
  resolveFmplusPerms,
  type FmplusPerms,
  type FmplusRolePreset,
  type ResolvedFmplusPerms,
} from '@/lib/fmplus/setup/roles';

interface Props {
  /** Field name for the hidden `<input>` carrying the preset value. */
  nameRole:  string;
  /** Field name for the hidden `<input>` carrying the JSON-stringified FmplusPerms (empty string when Advanced is off). */
  namePerms: string;
  /** Initial preset value. */
  defaultRole:  FmplusRolePreset;
  /** Initial overrides (null/empty → Advanced toggle starts off). */
  defaultPerms: FmplusPerms | null;
}

const FINANCIALS_LEVELS:    Array<ResolvedFmplusPerms['financials']>    = ['none', 'view'];
const BUDGET_LEVELS:        Array<ResolvedFmplusPerms['budget']>        = ['none', 'view', 'edit'];
const PERFORMANCE_LEVELS:   Array<ResolvedFmplusPerms['performance']>   = ['none', 'view'];
const SHIFT_REPORTS_LEVELS: Array<ResolvedFmplusPerms['shift_reports']> = ['none', 'view', 'submit', 'configure'];

export function FmplusRolePicker({ nameRole, namePerms, defaultRole, defaultPerms }: Props) {
  const id = useId();
  const [role, setRole]           = useState<FmplusRolePreset>(defaultRole);
  const [advanced, setAdvanced]   = useState<boolean>(!!defaultPerms && Object.keys(defaultPerms).length > 0);
  const [perms, setPerms]         = useState<ResolvedFmplusPerms>(() => resolveFmplusPerms(defaultRole, defaultPerms));

  // When the preset changes AND Advanced is off, swap to the new preset's defaults.
  // When Advanced is on, keep the manually-set perms (user explicitly overrode).
  useEffect(() => {
    if (!advanced) {
      setPerms(resolveFmplusPerms(role, null));
    }
  }, [role, advanced]);

  // What we serialize to the hidden field:
  // - Advanced OFF → empty string (server treats as null, applies preset defaults at read time).
  // - Advanced ON  → JSON of ONLY the modules that differ from the preset.
  const presetDefaults = resolveFmplusPerms(role, null);
  const overrides: FmplusPerms = {};
  if (advanced) {
    if (perms.financials    !== presetDefaults.financials)    overrides.financials    = perms.financials;
    if (perms.budget        !== presetDefaults.budget)        overrides.budget        = perms.budget;
    if (perms.performance   !== presetDefaults.performance)   overrides.performance   = perms.performance;
    if (perms.shift_reports !== presetDefaults.shift_reports) overrides.shift_reports = perms.shift_reports;
    if (perms.setup         !== presetDefaults.setup)         overrides.setup         = perms.setup;
  }
  const permsJson = advanced && Object.keys(overrides).length > 0
    ? JSON.stringify(overrides)
    : '';

  return (
    <div className="space-y-2">
      <input type="hidden" name={nameRole}  value={role} />
      <input type="hidden" name={namePerms} value={permsJson} />

      <label className="block">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
          FM+ Role <span className="text-rose-500">*</span>
        </span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as FmplusRolePreset)}
          className="ix-input w-full"
        >
          {FMPLUS_ROLE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.labelEn} ({p.labelAr})</option>
          ))}
        </select>
      </label>

      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => {
            const next = e.target.checked;
            setAdvanced(next);
            if (!next) setPerms(resolveFmplusPerms(role, null));
          }}
        />
        Advanced (override preset)
      </label>

      {advanced && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/40 space-y-2">
          <MatrixRow id={`${id}-fin`} label="Financials">
            <select
              value={perms.financials}
              onChange={(e) => setPerms({ ...perms, financials: e.target.value as ResolvedFmplusPerms['financials'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {FINANCIALS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-bud`} label="Budget">
            <select
              value={perms.budget}
              onChange={(e) => setPerms({ ...perms, budget: e.target.value as ResolvedFmplusPerms['budget'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {BUDGET_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-perf`} label="Performance">
            <select
              value={perms.performance}
              onChange={(e) => setPerms({ ...perms, performance: e.target.value as ResolvedFmplusPerms['performance'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {PERFORMANCE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-shift`} label="Shift Reports">
            <select
              value={perms.shift_reports}
              onChange={(e) => setPerms({ ...perms, shift_reports: e.target.value as ResolvedFmplusPerms['shift_reports'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {SHIFT_REPORTS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-setup`} label="Setup">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={perms.setup}
                onChange={(e) => setPerms({ ...perms, setup: e.target.checked })}
              />
              {perms.setup ? 'Yes' : 'No'}
            </label>
          </MatrixRow>
          <button
            type="button"
            onClick={() => setPerms(resolveFmplusPerms(role, null))}
            className="text-[11px] text-fmplus-gold hover:text-fmplus-yellow underline"
          >
            Reset to preset defaults
          </button>
        </div>
      )}
    </div>
  );
}

function MatrixRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs font-medium text-slate-700 dark:text-slate-200">{label}</label>
      <div id={id}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "fmplus-role-picker" || echo "fmplus-role-picker clean"
```

Expected: `fmplus-role-picker clean`.

- [ ] **Step 3: Commit and push**

```bash
git add src/app/fmplus/setup/users/_components/fmplus-role-picker.tsx
git commit -m "feat(fmplus): FmplusRolePicker — preset select + advanced overrides matrix"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 6: Server actions

**Files:**
- Create: `src/app/fmplus/setup/users/actions.ts`

- [ ] **Step 1: Create the actions file**

Models the existing `/admin/users/actions.ts` patterns (`requireAdmin` helper, `SaveResult` + `useActionState`-friendly wrappers, normalization helpers).

Create `src/app/fmplus/setup/users/actions.ts` with this content:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword, getCurrentUser } from '@/lib/auth';
import {
  FMPLUS_ROLE_PRESETS,
  type FmplusPerms,
  type FmplusRolePreset,
} from '@/lib/fmplus/setup/roles';

const VALID_PRESETS: ReadonlySet<FmplusRolePreset> = new Set(
  FMPLUS_ROLE_PRESETS.map((p) => p.key),
);

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !me.is_admin) throw new Error('forbidden');
  return me;
}

function normaliseMobile(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  return cleaned || null;
}

function normaliseEmail(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function normaliseName(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 80);
  return trimmed || null;
}

function parsePresetOrNull(raw: string | null): FmplusRolePreset | null {
  if (!raw) return null;
  return VALID_PRESETS.has(raw as FmplusRolePreset) ? (raw as FmplusRolePreset) : null;
}

function parsePermsJson(raw: string | null): FmplusPerms | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    // Sanity: strip fields we don't recognize. Server is the trust boundary.
    const out: FmplusPerms = {};
    if (parsed.financials === 'none' || parsed.financials === 'view') out.financials = parsed.financials;
    if (parsed.budget === 'none' || parsed.budget === 'view' || parsed.budget === 'edit') out.budget = parsed.budget;
    if (parsed.performance === 'none' || parsed.performance === 'view') out.performance = parsed.performance;
    if (parsed.shift_reports === 'none' || parsed.shift_reports === 'view' || parsed.shift_reports === 'submit' || parsed.shift_reports === 'configure') out.shift_reports = parsed.shift_reports;
    if (parsed.setup === true || parsed.setup === false) out.setup = parsed.setup;
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export type FmplusSaveResult =
  | { ok: true;  saved: 'profile' | 'role' | 'password' | 'disabled' }
  | { ok: false; saved: 'profile' | 'role' | 'password' | 'disabled'; error: string };

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}

// ──────────────────────────────────────────────────────────────────────
// Create — used by the top-of-page form on /fmplus/setup/users
// ──────────────────────────────────────────────────────────────────────

export async function createFmplusUserAction(formData: FormData) {
  await requireAdmin();
  const full_name    = normaliseName(String(formData.get('full_name') || ''));
  const username     = String(formData.get('username') || '').trim().toLowerCase();
  const password     = String(formData.get('password') || '');
  const mobile_number = normaliseMobile(String(formData.get('mobile_number') || ''));
  const email        = normaliseEmail(String(formData.get('email') || ''));
  const fmplus_role  = parsePresetOrNull(String(formData.get('fmplus_role') || ''));
  const fmplus_perms = parsePermsJson(String(formData.get('fmplus_perms') || ''));

  if (!username || password.length < 8 || !fmplus_role) return;

  const sb = supabaseAdmin();
  // Insert app_users row. Global role = 'editor' so they have write capability
  // on the domains they're granted. Admins remain admin via /admin/users.
  const { data: insertedRaw, error: insErr } = await sb
    .from('app_users')
    .insert({
      username,
      password_hash: hashPassword(password),
      role:          'editor',
      full_name,
      mobile_number,
      email,
      fmplus_role,
      fmplus_perms,
    })
    .select('id')
    .single();
  if (insErr || !insertedRaw) return;
  const inserted = insertedRaw as { id: string };

  // Auto-grant fmplus domain access so the user shows up in this list.
  await sb.from('app_user_domain_roles').insert({
    user_id: inserted.id,
    domain:  'fmplus',
    role:    'editor',
  });

  revalidatePath('/fmplus/setup/users');
}

// ──────────────────────────────────────────────────────────────────────
// Edit profile (name / mobile / email)
// ──────────────────────────────────────────────────────────────────────

async function updateFmplusUserProfile(formData: FormData) {
  await requireAdmin();
  const id            = String(formData.get('id') || '');
  if (!id) return;
  const full_name     = normaliseName(String(formData.get('full_name') || ''));
  const mobile_number = normaliseMobile(String(formData.get('mobile_number') || ''));
  const email         = normaliseEmail(String(formData.get('email') || ''));

  const sb = supabaseAdmin();
  await sb.from('app_users').update({
    full_name,
    mobile_number,
    email,
  }).eq('id', id);
  revalidatePath('/fmplus/setup/users');
}

export async function updateFmplusUserProfileStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await updateFmplusUserProfile(formData);
    return { ok: true, saved: 'profile' };
  } catch (e) {
    return { ok: false, saved: 'profile', error: errMsg(e) };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Edit FM+ role (preset + optional advanced overrides)
// ──────────────────────────────────────────────────────────────────────

async function setFmplusUserRole(formData: FormData) {
  await requireAdmin();
  const id           = String(formData.get('id') || '');
  if (!id) return;
  const fmplus_role  = parsePresetOrNull(String(formData.get('fmplus_role') || ''));
  const fmplus_perms = parsePermsJson(String(formData.get('fmplus_perms') || ''));
  if (!fmplus_role) return;

  const sb = supabaseAdmin();
  await sb.from('app_users').update({
    fmplus_role,
    fmplus_perms,
  }).eq('id', id);
  revalidatePath('/fmplus/setup/users');
}

export async function setFmplusUserRoleStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await setFmplusUserRole(formData);
    return { ok: true, saved: 'role' };
  } catch (e) {
    return { ok: false, saved: 'role', error: errMsg(e) };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Reset password (admin types a new password)
// ──────────────────────────────────────────────────────────────────────

async function resetFmplusUserPassword(formData: FormData) {
  await requireAdmin();
  const id          = String(formData.get('id') || '');
  const newPassword = String(formData.get('new_password') || '');
  if (!id || newPassword.length < 8) throw new Error('password must be at least 8 chars');
  const sb = supabaseAdmin();
  await sb.from('app_users')
    .update({ password_hash: hashPassword(newPassword) })
    .eq('id', id);
  revalidatePath('/fmplus/setup/users');
}

export async function resetFmplusPasswordStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await resetFmplusUserPassword(formData);
    return { ok: true, saved: 'password' };
  } catch (e) {
    return { ok: false, saved: 'password', error: errMsg(e) };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Disable / enable account (sets/clears app_users.disabled_at)
// ──────────────────────────────────────────────────────────────────────

async function setFmplusUserDisabled(formData: FormData) {
  const me = await requireAdmin();
  const id       = String(formData.get('id') || '');
  const disabled = formData.get('disabled') === '1';
  if (!id) return;
  if (id === me.id) throw new Error('cannot disable yourself');
  const sb = supabaseAdmin();
  await sb.from('app_users')
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq('id', id);
  // When disabling, kill any active sessions so the user is logged out.
  if (disabled) {
    await sb.from('app_sessions').delete().eq('user_id', id);
  }
  revalidatePath('/fmplus/setup/users');
}

export async function setFmplusUserDisabledStateAction(
  _prev: FmplusSaveResult | null,
  formData: FormData,
): Promise<FmplusSaveResult> {
  try {
    await setFmplusUserDisabled(formData);
    return { ok: true, saved: 'disabled' };
  } catch (e) {
    return { ok: false, saved: 'disabled', error: errMsg(e) };
  }
}

```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "fmplus/setup/users/actions" || echo "actions.ts clean"
```

Expected: `actions.ts clean`.

- [ ] **Step 3: Commit and push**

```bash
git add src/app/fmplus/setup/users/actions.ts
git commit -m "feat(fmplus): server actions — create/update/role/reset-password/disable FM+ users"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 7: Edit pop-out component

**Files:**
- Create: `src/app/fmplus/setup/users/_components/fmplus-user-row-edit.tsx`

- [ ] **Step 1: Create the edit component**

Create `src/app/fmplus/setup/users/_components/fmplus-user-row-edit.tsx` with this content:

```tsx
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
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "fmplus-user-row-edit" || echo "fmplus-user-row-edit clean"
```

Expected: `fmplus-user-row-edit clean`.

- [ ] **Step 3: Commit and push**

```bash
git add src/app/fmplus/setup/users/_components/fmplus-user-row-edit.tsx
git commit -m "feat(fmplus): per-row edit pop-out — profile/role/password/disable"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 8: User list page

**Files:**
- Create: `src/app/fmplus/setup/users/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/fmplus/setup/users/page.tsx` with this content:

```tsx
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
  // Select all users that have an `fmplus` domain grant. We use an inner-join
  // pattern: fetch user_ids from app_user_domain_roles WHERE domain='fmplus',
  // then fetch app_users for those ids. Two trips keeps things simple given
  // the tenant is tiny.
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
```

- [ ] **Step 2: Verify TS compiles + tests still green**

```bash
npx tsc --noEmit 2>&1 | grep -E "fmplus/setup" || echo "fmplus/setup tree clean"
npm run test -- src/lib/fmplus/setup/roles.test.ts 2>&1 | tail -5
```

Expected:
- `fmplus/setup tree clean`
- All roles tests still pass.

- [ ] **Step 3: Commit and push**

```bash
git add src/app/fmplus/setup/users/page.tsx
git commit -m "feat(fmplus): User Access page — list + create-user form + per-row edit"
git fetch origin main
git rebase origin/main
git push origin main
```

---

## Task 9: Production build + manual verification + final push

**Files:** none beyond what's already on main.

- [ ] **Step 1: Full production build**

```bash
npm run build
```

Expected: `✓ Compiled successfully` near the end of output. If the build reports a missing dep (e.g. `sanitize-html` as has happened before), run `npm install` and retry. If the build fails for a real TypeScript error in any of the files we touched, fix it and re-run before moving on.

- [ ] **Step 2: Verify migration is live on prod**

The migration was applied in Task 1. Re-verify via Supabase MCP `execute_sql`:

```sql
SELECT count(*) FROM app_users WHERE fmplus_role IS NOT NULL;
```

Expected: a number (probably 0 right now — no users have been assigned an FM+ role yet via the new UI). The query succeeding at all confirms the column exists.

- [ ] **Step 3: Manual smoke test in production**

Wait ~90 seconds after the final push for Vercel to deploy, then in a browser:

1. Open `https://app.limeinc.cc/fmplus` as `kareemhady` (admin). Confirm the 5th tile "Setup" is present, between Performance Dashboard and Shift Reports.
2. Click Setup. Lands on `/fmplus/setup`. One card visible: "User Access". Click it.
3. Lands on `/fmplus/setup/users`. Initially the list may be empty (no users have an `fmplus` domain grant via the new form yet — `kareemhady` is admin, may or may not be in the list depending on whether they had a pre-existing fmplus domain grant).
4. Fill the Add form:
   - Name: `Yasser Test`
   - Username: `yasser_test`
   - Password: `tempPass1`
   - WhatsApp: `+201234567890`
   - Email: `yasser.test@fmplus.com`
   - FM+ Role: pick "Site Manager (مدير الموقع)"
   - Submit.
5. User appears in the list with the Site Manager preset displayed. WhatsApp / email links work.
6. Click Edit on the new row. Pop-out opens. Toggle Advanced; bump Budget to "edit". Save role → "Role saved · closing…" pill appears, then panel collapses.
7. Re-open Edit. Confirm Advanced is on and Budget shows `edit`. Verify via SQL: `select fmplus_role, fmplus_perms from app_users where username='yasser_test';` returns `('site_manager', {"budget": "edit"})`.
8. Use the Reset password sub-form: type `newPass2`, click Reset → "Password reset · closing…" pill.
9. Sign out of the dashboard, sign in as `yasser_test` with `newPass2` → succeeds. Sign back out, attempt `tempPass1` → fails. Sign back in as `kareemhady`.
10. Re-open `/fmplus/setup/users`, edit yasser_test, click Disable account → row shows "disabled" pill. SQL: `select disabled_at from app_users where username='yasser_test';` returns a timestamp.
11. Sign out → try to sign in as `yasser_test` → fails (`account_disabled`).
12. Sign in as `kareemhady`, re-enable yasser_test → "disabled" pill gone, login works again.
13. As a final smoke: sign in as a non-admin user (or use a private window after manually creating one via /admin/users with a non-admin role + fmplus domain), try to hit `/fmplus/setup` directly → 404.

If any step fails, stop and debug. The most likely failure modes are: TS errors caught only by build (already covered by Step 1), Supabase RLS surprises on `app_user_domain_roles` (the table allows service-role inserts so this should not be an issue), or copy-paste typos in the JSX.

- [ ] **Step 4: There's nothing else to push.** All earlier task commits already landed on main during their individual steps. Re-run `git status --short` to confirm the working tree is clean.

```bash
git status --short
```

Expected: empty output (clean tree).

---

## Verification summary

After Task 9:

- Migration applied; `app_users` has `full_name`, `fmplus_role`, `fmplus_perms` columns + CHECK constraint + partial index.
- `npm run build` succeeds.
- Vitest: `src/lib/fmplus/setup/roles.test.ts` passes (12 tests).
- Production: 5 tiles on `/fmplus`, Setup tile navigates to `/fmplus/setup` for admins, 404 for non-admins.
- Create / Edit / Reset Password / Disable / Re-enable flows all work end-to-end against real Supabase.
- Backward compat: existing `/admin/users` page continues to function (its create form does not set `fmplus_role`; those rows show as "Role not set" in the FM+ list, which is the documented behavior).

## Risks (re-stated from spec for the implementer)

- Existing FM+-domain users created via `/admin/users` will have `fmplus_role = NULL` and show "Role not set" in the new list. This is intentional and not a bug.
- `mobile_number` is shared between `/admin/users` ("Mobile") and `/fmplus/setup/users` ("WhatsApp"). Same column, different labels. Acceptable.
- Setup tile is visible to non-admins on `/fmplus`; clicking it 404s. Phase 2 will hide the tile when per-tile conditional rendering is wired.
