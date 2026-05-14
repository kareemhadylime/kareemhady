# Beithady HR Sprint 3: Salary Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/beithady/hr/salary-access` admin screen — five side-by-side tier tiles where authorised users assign salary visibility tiers (0–4) to every Beithady dashboard account; no masking logic applied yet.

**Architecture:** A DB migration fixes a FK bug in `hr_salary_access` (references wrong table). A server-only query fetches all Beithady users and their current tier via 3 cheap queries merged in application code. A `'use server'` action upserts tier changes. A `'use client'` board component renders 5 tiles with optimistic state updates; clicking a user chip opens an inline popover (useState + useRef click-outside pattern, no Radix).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · Supabase (supabaseAdmin) · Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0127_hr_salary_access_fix.sql` | Create | Fix account_id FK → app_users |
| `src/lib/beithady/hr/hr-salary-access-queries.ts` | Create | SalaryAccessUser type, SALARY_TIERS, validateSalaryTier(), listSalaryAccessUsers() |
| `src/lib/beithady/hr/hr-salary-access-queries.test.ts` | Create | Unit tests for validateSalaryTier() |
| `src/lib/beithady/hr/hr-salary-access-actions.ts` | Create | setSalaryAccessTierAction() |
| `src/app/beithady/hr/salary-access/_components/tier-chip.tsx` | Create | User chip + click-to-open tier popover |
| `src/app/beithady/hr/salary-access/_components/salary-access-board.tsx` | Create | 5-tile grid with optimistic state |
| `src/app/beithady/hr/salary-access/page.tsx` | Create | Server component, auth-gated |
| `src/app/beithady/hr/page.tsx` | Modify | Remove disabled + comingSoonLabel from Sprint 3 tile |

---

## Task 1: DB Migration — Fix hr_salary_access FK

**Files:**
- Create: `supabase/migrations/0127_hr_salary_access_fix.sql`

**Background:** Migration `0123_hr_team_members.sql` created `hr_salary_access.account_id` with a FK referencing `public.accounts(id)` — the Gmail OAuth accounts table from Phase 1. It should reference `public.app_users(id)` (the dashboard users table, also referenced by `beithady_user_roles`). This migration fixes that.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0127_hr_salary_access_fix.sql
-- Fix hr_salary_access FKs: account_id and granted_by were mistakenly
-- referencing public.accounts (Gmail OAuth table) instead of app_users.

alter table public.hr_salary_access
  drop constraint if exists hr_salary_access_account_id_fkey,
  drop constraint if exists hr_salary_access_granted_by_fkey;

alter table public.hr_salary_access
  add constraint hr_salary_access_account_id_fkey
    foreign key (account_id) references public.app_users(id) on delete cascade,
  add constraint hr_salary_access_granted_by_fkey
    foreign key (granted_by) references public.app_users(id);
```

- [ ] **Step 2: Apply the migration**

Paste the SQL above into the Supabase dashboard SQL Editor for project `bpjproljatbrbmszwbov` and run it. Verify it succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0127_hr_salary_access_fix.sql
git commit -m "fix(hr): correct hr_salary_access FK to reference app_users not accounts"
```

---

## Task 2: Types + Query

**Files:**
- Create: `src/lib/beithady/hr/hr-salary-access-queries.ts`
- Create: `src/lib/beithady/hr/hr-salary-access-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/beithady/hr/hr-salary-access-queries.test.ts
import { describe, it, expect } from 'vitest';
import { validateSalaryTier, SALARY_TIERS } from './hr-salary-access-queries';

describe('SALARY_TIERS', () => {
  it('has 5 entries with correct tier values', () => {
    expect(SALARY_TIERS).toHaveLength(5);
    expect(SALARY_TIERS.map(t => t.tier)).toEqual([0, 1, 2, 3, 4]);
  });
  it('tier 0 label is No Access', () => {
    expect(SALARY_TIERS[0].label).toBe('No Access');
  });
  it('tier 4 label is Unlimited', () => {
    expect(SALARY_TIERS[4].label).toBe('Unlimited');
  });
});

describe('validateSalaryTier', () => {
  it('accepts 0', () => expect(validateSalaryTier(0)).toBe(true));
  it('accepts 4', () => expect(validateSalaryTier(4)).toBe(true));
  it('accepts 1, 2, 3', () => {
    expect(validateSalaryTier(1)).toBe(true);
    expect(validateSalaryTier(2)).toBe(true);
    expect(validateSalaryTier(3)).toBe(true);
  });
  it('rejects -1', () => expect(validateSalaryTier(-1)).toBe(false));
  it('rejects 5', () => expect(validateSalaryTier(5)).toBe(false));
  it('rejects non-integer 1.5', () => expect(validateSalaryTier(1.5)).toBe(false));
  it('rejects string "2"', () => expect(validateSalaryTier('2')).toBe(false));
  it('rejects null', () => expect(validateSalaryTier(null)).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- --run hr-salary-access-queries
```

Expected: FAIL — `validateSalaryTier` and `SALARY_TIERS` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/beithady/hr/hr-salary-access-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// ── Tier constants ────────────────────────────────────────────────────────────

export type SalaryTier = 0 | 1 | 2 | 3 | 4;

export const SALARY_TIERS: {
  tier: SalaryTier;
  label: string;
  sublabel: string;
  accent: string;  // Tailwind colour token used in the board
}[] = [
  { tier: 0, label: 'No Access',   sublabel: 'default',      accent: 'slate'  },
  { tier: 1, label: '≤ 10,000',    sublabel: 'EGP / month',  accent: 'amber'  },
  { tier: 2, label: '≤ 20,000',    sublabel: 'EGP / month',  accent: 'orange' },
  { tier: 3, label: '≤ 50,000',    sublabel: 'EGP / month',  accent: 'blue'   },
  { tier: 4, label: 'Unlimited',   sublabel: 'full access',  accent: 'emerald'},
];

// Pure validation — safe to call on unvalidated input.
export function validateSalaryTier(v: unknown): v is SalaryTier {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SalaryAccessUser = {
  user_id: string;
  username: string;
  position: string | null;
  beithady_roles: string[];
  tier: SalaryTier;
  granted_at: string | null;
  granted_by_name: string | null;
};

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Return all app_users that have at least one beithady_user_roles row,
 * merged with their current hr_salary_access tier (default 0 if absent).
 * Sorted by username.
 */
export async function listSalaryAccessUsers(): Promise<SalaryAccessUser[]> {
  const sb = supabaseAdmin();

  // 1. All beithady role assignments (user can have multiple roles).
  const { data: roleRows, error: roleErr } = await sb
    .from('beithady_user_roles')
    .select('user_id, role');
  if (roleErr) throw new Error(roleErr.message);
  if (!roleRows?.length) return [];

  const userIds = [...new Set(roleRows.map((r: { user_id: string }) => r.user_id))];

  // 2. User details for those IDs.
  const { data: users, error: userErr } = await sb
    .from('app_users')
    .select('id, username, position')
    .in('id', userIds)
    .order('username');
  if (userErr) throw new Error(userErr.message);

  // 3. All salary tiers.
  const { data: tiers, error: tierErr } = await sb
    .from('hr_salary_access')
    .select('account_id, tier, granted_at, granted_by');
  if (tierErr) throw new Error(tierErr.message);

  // 4. Grantor names.
  const grantorIds = [
    ...new Set(
      (tiers ?? [])
        .map((t: { granted_by: string | null }) => t.granted_by)
        .filter((id): id is string => !!id)
    ),
  ];
  const grantorMap = new Map<string, string>();
  if (grantorIds.length) {
    const { data: grantors } = await sb
      .from('app_users')
      .select('id, username')
      .in('id', grantorIds);
    for (const g of grantors ?? []) {
      grantorMap.set(
        (g as { id: string; username: string }).id,
        (g as { id: string; username: string }).username
      );
    }
  }

  // 5. Merge.
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows as { user_id: string; role: string }[]) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  }

  const tierByUser = new Map<string, { tier: number; granted_at: string; granted_by: string | null }>();
  for (const t of tiers ?? []) {
    tierByUser.set(
      (t as { account_id: string }).account_id,
      t as { tier: number; granted_at: string; granted_by: string | null }
    );
  }

  return (users ?? []).map(u => {
    const row = u as { id: string; username: string; position: string | null };
    const tierRow = tierByUser.get(row.id);
    return {
      user_id:         row.id,
      username:        row.username,
      position:        row.position ?? null,
      beithady_roles:  rolesByUser.get(row.id) ?? [],
      tier:            (tierRow?.tier ?? 0) as SalaryTier,
      granted_at:      tierRow?.granted_at ?? null,
      granted_by_name: tierRow?.granted_by
        ? (grantorMap.get(tierRow.granted_by) ?? null)
        : null,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- --run hr-salary-access-queries
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/hr/hr-salary-access-queries.ts src/lib/beithady/hr/hr-salary-access-queries.test.ts
git commit -m "feat(hr): SalaryAccessUser types + listSalaryAccessUsers query + validateSalaryTier"
```

---

## Task 3: Server Action

**Files:**
- Create: `src/lib/beithady/hr/hr-salary-access-actions.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/beithady/hr/hr-salary-access-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { validateSalaryTier } from './hr-salary-access-queries';
import type { SalaryTier } from './hr-salary-access-queries';

/**
 * Upsert a salary access tier for a dashboard user.
 * Requires hr:full permission (admin or manager Beithady role).
 */
export async function setSalaryAccessTierAction(
  userId: string,
  tier: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { user } = await requireBeithadyPermission('hr', 'full');

    if (!userId || typeof userId !== 'string') {
      return { ok: false, error: 'Invalid user ID' };
    }
    if (!validateSalaryTier(tier)) {
      return { ok: false, error: 'Tier must be an integer between 0 and 4' };
    }

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('hr_salary_access')
      .upsert(
        {
          account_id: userId,
          tier: tier as SalaryTier,
          granted_by: user.id,
          granted_at: new Date().toISOString(),
        },
        { onConflict: 'account_id' }
      );

    if (error) return { ok: false, error: error.message };

    revalidatePath('/beithady/hr/salary-access');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 2: Run all tests to confirm no regressions**

```
npm test -- --run
```

Expected: all tests pass (the action is `'use server'` and Supabase-dependent so no new unit tests; validation is covered by Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/hr/hr-salary-access-actions.ts
git commit -m "feat(hr): setSalaryAccessTierAction — upsert salary tier, hr:full gated"
```

---

## Task 4: TierChip Component

**Files:**
- Create: `src/app/beithady/hr/salary-access/_components/tier-chip.tsx`

The chip is a button showing the user's avatar initials + username + beithady role badge. Clicking it toggles a popover (absolute-positioned div) with five tier buttons. Clicking outside closes the popover (useRef click-outside pattern, same as `period-chips.tsx`).

- [ ] **Step 1: Write the component**

```typescript
// src/app/beithady/hr/salary-access/_components/tier-chip.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { SalaryAccessUser, SalaryTier } from '@/lib/beithady/hr/hr-salary-access-queries';
import { SALARY_TIERS } from '@/lib/beithady/hr/hr-salary-access-queries';
import { setSalaryAccessTierAction } from '@/lib/beithady/hr/hr-salary-access-actions';

type Props = {
  user: SalaryAccessUser;
  onTierChange: (userId: string, newTier: SalaryTier) => void;
};

function initials(username: string): string {
  const parts = username.split(/[\s._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

const ACCENT_BG: Record<string, string> = {
  slate:   'bg-slate-500',
  amber:   'bg-amber-500',
  orange:  'bg-orange-500',
  blue:    'bg-blue-500',
  emerald: 'bg-emerald-500',
};

export function TierChip({ user, onTierChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentTierDef = SALARY_TIERS[user.tier];

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleTierSelect(tier: SalaryTier) {
    if (tier === user.tier || busy) return;
    setBusy(true);
    setOpen(false);
    onTierChange(user.user_id, tier); // optimistic
    const result = await setSalaryAccessTierAction(user.user_id, tier);
    if (!result.ok) {
      // Revert on error
      onTierChange(user.user_id, user.tier);
    }
    setBusy(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={busy}
        className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        {/* Avatar */}
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${ACCENT_BG[currentTierDef.accent]}`}
        >
          {initials(user.username)}
        </span>
        {/* Name + role */}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-white leading-tight truncate">
            {user.username}
          </span>
          {user.position && (
            <span className="block text-[11px] text-white/50 truncate">{user.position}</span>
          )}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-neutral-900 border border-white/10 rounded-xl shadow-xl p-2 min-w-[200px]">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide px-2 pb-1">
            Set tier for {user.username}
          </p>
          {SALARY_TIERS.map(t => (
            <button
              key={t.tier}
              onClick={() => handleTierSelect(t.tier)}
              className={`flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-sm transition-colors ${
                t.tier === user.tier
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ACCENT_BG[t.accent]}`} />
              <span>
                T{t.tier} · {t.label}
              </span>
              {t.tier === user.tier && (
                <span className="ml-auto text-[10px] text-white/40">current</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests still pass (new file is UI-only, no new unit tests).

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/salary-access/_components/tier-chip.tsx
git commit -m "feat(hr): TierChip component with inline tier-picker popover"
```

---

## Task 5: SalaryAccessBoard — 5 Tiles

**Files:**
- Create: `src/app/beithady/hr/salary-access/_components/salary-access-board.tsx`

The board holds a local copy of `SalaryAccessUser[]` for optimistic updates. When `TierChip` calls `onTierChange`, the board moves the user to the new tier tile immediately — no loading state visible to the user.

- [ ] **Step 1: Write the component**

```typescript
// src/app/beithady/hr/salary-access/_components/salary-access-board.tsx
'use client';

import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { TierChip } from './tier-chip';
import { SALARY_TIERS } from '@/lib/beithady/hr/hr-salary-access-queries';
import type { SalaryAccessUser, SalaryTier } from '@/lib/beithady/hr/hr-salary-access-queries';

type Props = {
  initialUsers: SalaryAccessUser[];
};

const TILE_BG: Record<string, string> = {
  slate:   'bg-slate-800/60 border-slate-700/50',
  amber:   'bg-amber-950/40 border-amber-700/30',
  orange:  'bg-orange-950/40 border-orange-700/30',
  blue:    'bg-blue-950/40 border-blue-700/30',
  emerald: 'bg-emerald-950/40 border-emerald-700/30',
};

const TILE_HEADER_TEXT: Record<string, string> = {
  slate:   'text-slate-300',
  amber:   'text-amber-300',
  orange:  'text-orange-300',
  blue:    'text-blue-300',
  emerald: 'text-emerald-300',
};

const TILE_BADGE: Record<string, string> = {
  slate:   'bg-slate-700 text-slate-300',
  amber:   'bg-amber-900/60 text-amber-300',
  orange:  'bg-orange-900/60 text-orange-300',
  blue:    'bg-blue-900/60 text-blue-300',
  emerald: 'bg-emerald-900/60 text-emerald-300',
};

export function SalaryAccessBoard({ initialUsers }: Props) {
  const [users, setUsers] = useState<SalaryAccessUser[]>(initialUsers);

  function handleTierChange(userId: string, newTier: SalaryTier) {
    setUsers(prev =>
      prev.map(u => u.user_id === userId ? { ...u, tier: newTier } : u)
    );
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {SALARY_TIERS.map(tierDef => {
        const tierUsers = users.filter(u => u.tier === tierDef.tier);
        return (
          <div
            key={tierDef.tier}
            className={`rounded-2xl border p-4 flex flex-col gap-3 ${TILE_BG[tierDef.accent]}`}
          >
            {/* Tile header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {tierDef.tier === 0 ? (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-white/40" />
                  )}
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${TILE_HEADER_TEXT[tierDef.accent]}`}>
                    T{tierDef.tier}
                  </span>
                </div>
                <p className={`text-sm font-semibold ${TILE_HEADER_TEXT[tierDef.accent]}`}>
                  {tierDef.label}
                </p>
                <p className="text-[11px] text-white/35 mt-0.5">{tierDef.sublabel}</p>
              </div>
              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TILE_BADGE[tierDef.accent]}`}>
                {tierUsers.length}
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/8" />

            {/* User chips */}
            <div className="flex flex-col gap-1 min-h-[48px]">
              {tierUsers.length === 0 ? (
                <p className="text-[12px] text-white/25 italic px-2">No users</p>
              ) : (
                tierUsers.map(u => (
                  <TierChip
                    key={u.user_id}
                    user={u}
                    onTierChange={handleTierChange}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- --run
```

Expected: all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/salary-access/_components/salary-access-board.tsx
git commit -m "feat(hr): SalaryAccessBoard — 5 tier tiles with optimistic user reassignment"
```

---

## Task 6: Page + Activate Tile + Deploy

**Files:**
- Create: `src/app/beithady/hr/salary-access/page.tsx`
- Modify: `src/app/beithady/hr/page.tsx` (remove `disabled: true` and `comingSoonLabel: 'Sprint 3'` from the Salary Access tile)

- [ ] **Step 1: Write the page**

```typescript
// src/app/beithady/hr/salary-access/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listSalaryAccessUsers } from '@/lib/beithady/hr/hr-salary-access-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { SalaryAccessBoard } from './_components/salary-access-board';

export const dynamic = 'force-dynamic';

export default async function SalaryAccessPage() {
  await requireBeithadyPermission('hr', 'full');
  const users = await listSalaryAccessUsers();
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Salary Access' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Salary Access"
        subtitle="Assign salary visibility tiers to dashboard users · changes take effect in the next sprint"
      />
      <SalaryAccessBoard initialUsers={users} />
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Activate the hub tile**

In `src/app/beithady/hr/page.tsx`, find the Salary Access tile object:

```typescript
    {
      href: '/beithady/hr/salary-access',
      title: 'Salary Access',
      description: 'Control who can see salary data — 5 tiers: No Access · ≤10K · ≤20K · ≤50K · Unlimited.',
      icon: ShieldCheck,
      accent: 'amber',
      disabled: true,
      comingSoonLabel: 'Sprint 3',
    },
```

Remove the `disabled: true,` and `comingSoonLabel: 'Sprint 3',` lines so it becomes:

```typescript
    {
      href: '/beithady/hr/salary-access',
      title: 'Salary Access',
      description: 'Control who can see salary data — 5 tiers: No Access · ≤10K · ≤20K · ≤50K · Unlimited.',
      icon: ShieldCheck,
      accent: 'amber',
    },
```

- [ ] **Step 3: Run all tests**

```
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Deploy**

```bash
git add src/app/beithady/hr/salary-access/page.tsx src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Salary Access page + activate Sprint 3 tile on HR hub — Sprint 3 complete"
git fetch origin main
git rebase origin/main
git push origin HEAD:main
vercel --prod --yes
```
