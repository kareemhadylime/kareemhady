# Beithady HR Module — Sprint 3: Salary Access

**Date:** 2026-05-14  
**Status:** Approved  
**Scope:** Sprint 3 of 11 — Salary Access tier management (admin screen only; masking deferred)

---

## 1. Overview

A single admin-only page where authorised users assign salary visibility tiers to every Beithady dashboard account. Tiers are stored in `hr_salary_access` (already created in Sprint 1). No salary masking is applied yet — that ships in a later sprint once attendance and payroll data stabilise.

**Immediate output:**
- `/beithady/hr/salary-access` — five side-by-side tier tiles, each listing the users in that tier
- Click a user → popover → pick target tier → instant upsert
- Activate the Sprint 3 tile on the HR hub

---

## 2. Tier Definitions

| Tier | Label | Meaning |
|------|-------|---------|
| 0 | No Access | Cannot see any salary figures (default for all users) |
| 1 | ≤ 10,000 EGP | Can see salaries up to 10,000 EGP |
| 2 | ≤ 20,000 EGP | Can see salaries up to 20,000 EGP |
| 3 | ≤ 50,000 EGP | Can see salaries up to 50,000 EGP |
| 4 | Unlimited | Can see all salary figures |

All accounts without a row in `hr_salary_access` are treated as Tier 0.

---

## 3. Page Structure — `/beithady/hr/salary-access`

### 3.1 Hub tile

Already exists on `/beithady/hr` as Sprint 3 tile (dimmed, "Sprint 3"). Sprint 3 activates it.

### 3.2 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Salary Access                                                        │
│  Assign visibility tiers to dashboard users                           │
├──────────┬──────────┬──────────┬──────────┬──────────┤
│ 🔒        │  T1       │  T2       │  T3       │  T4       │
│ No Access │ ≤ 10,000  │ ≤ 20,000  │ ≤ 50,000  │ Unlimited │
│           │   EGP     │   EGP     │   EGP     │           │
│  [chip]   │  [chip]   │  [chip]   │  [chip]   │  [chip]   │
│  [chip]   │           │           │           │           │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

Five tiles rendered side by side (`grid-cols-5`). Each tile:
- Header: tier number badge + label + EGP cap (or "Unlimited")
- Body: list of user chips — avatar circle + display name + Beithady role badge
- Empty state: muted "No users" text

### 3.3 User chip popover

Clicking any user chip opens a small popover (Radix-style, positioned below the chip):
- Title: the user's display name
- Five tier buttons in a row (0 through 4), current tier highlighted
- Clicking a different tier:
  1. Closes the popover
  2. Fires `setSalaryAccessTierAction(accountId, tier)` (server action)
  3. Optimistic update: chip moves to the new tile immediately
  4. On error: chip reverts, toast shown

### 3.4 Access control

`requireBeithadyPermission('hr', 'full')` — admin and manager Beithady roles only.

---

## 4. Data Model

No new tables. `hr_salary_access` was created in Sprint 1:

```sql
create table hr_salary_access (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  tier       smallint not null default 0 check (tier between 0 and 4),
  granted_by uuid references accounts(id),
  granted_at timestamptz not null default now()
);
```

**Upsert semantics:** `INSERT … ON CONFLICT (account_id) DO UPDATE SET tier = excluded.tier, granted_by = excluded.granted_by, granted_at = now()`.

---

## 5. Server Action & Query

### `setSalaryAccessTierAction(accountId: string, tier: 0|1|2|3|4)`

```
'use server'
1. requireBeithadyPermission('hr', 'full')
2. Validate: tier must be 0–4 integer
3. Upsert hr_salary_access (accountId, tier, granted_by=currentUser.id)
4. Return { ok: true } or throw
```

### `listSalaryAccessUsers()`

Server-only query returning all accounts that have at least one `beithady_user_roles` row, left-joined with `hr_salary_access`:

```typescript
type SalaryAccessUser = {
  account_id: string;
  display_name: string;
  avatar_url: string | null;
  beithady_roles: string[];   // e.g. ['manager', 'finance']
  tier: 0 | 1 | 2 | 3 | 4;  // 0 if no hr_salary_access row
  granted_at: string | null;
  granted_by_name: string | null;
};
```

---

## 6. File Structure

```
src/lib/beithady/hr/
  hr-salary-access-queries.ts    — listSalaryAccessUsers() (server-only)
  hr-salary-access-actions.ts    — setSalaryAccessTierAction()

src/app/beithady/hr/
  salary-access/
    page.tsx                     — Server component, auth-gated
    _components/
      salary-access-board.tsx    — 'use client' — 5 tiles + optimistic state
      tier-chip.tsx              — User chip with popover tier picker

src/app/beithady/hr/
  page.tsx                       — MODIFY: activate Sprint 3 tile
```

---

## 7. Out of Scope (Sprint 3)

- Applying tier masking to payroll roster or People Card salary fields
- Salary masking in payslip PDFs
- Per-building salary access overrides
- Audit log of tier changes (beyond `granted_at` / `granted_by`)
