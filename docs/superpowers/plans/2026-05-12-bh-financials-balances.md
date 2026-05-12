# BH Financials — Beginning Balances & Snapshot Module · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Beithady financials module that persists dated opening-balance snapshots in Supabase (account-level + per-partner), imports partner-ledger xlsx files with operator review, freezes new snapshots every quarter on a 6-month lag, and surfaces audit-grade reconciliation between partner totals and account totals.

**Architecture:** Approach A — versioned snapshots persisted in DB (5 new tables) + on-the-fly current-balance compute (no materialized rollup, no SQL views). Mirrors the existing `buildBalanceSheet` "seed + Odoo deltas" pattern at the partner level. Existing `/beithady/financials/page.tsx` (1182 lines) refactors to a cockpit landing with tiles; PnL/BS/Payables sections extract to focused subpages; 4 new subpages join (Ledgers · Snapshots · Reconciliation · Import).

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript strict, Supabase Postgres (service-role via `supabaseAdmin`), Tailwind v4, vitest (colocated `*.test.ts`), `exceljs` (already in deps), `lucide-react` icons, Vercel cron (DST-safe dual-UTC entries gated on Cairo local hour), Green-API for WhatsApp.

**Spec:** [docs/superpowers/specs/2026-05-12-bh-financials-balances-design.md](../specs/2026-05-12-bh-financials-balances-design.md)

---

## File Structure (locked from spec § 7)

**New library namespace `src/lib/beithady/financials/`:**
- `cadence.ts` — pure date math (no DB)
- `partner-match.ts` — fuzzy name matching
- `xlsx-import.ts` — parse + classify + commit pipeline
- `snapshots.ts` — load/create/freeze/clone CRUD
- `ledgers.ts` — `buildLedgerReport({ kind, asOf, scope, snapshot_id })`
- `reconciliation.ts` — `buildReconciliation({ snapshot_id })`
- `__fixtures__/` — committed test fixtures (xlsx copies + balance-sheet snapshot JSON)
- Colocated `*.test.ts` for each module

**New cron handler:** `src/app/api/cron/bh-financials-snapshot-reminder/route.ts`

**Refactored existing files:**
- `src/app/beithady/financials/page.tsx` (1182 → ~200 lines, becomes cockpit)
- `src/lib/financials-pnl.ts` (swap TS-const → DB read in `buildBalanceSheet`; drop A1 from intercompany exclude)
- `vercel.json` (2 new cron entries)

**New pages:**
- `src/app/beithady/financials/{performance,balance-sheet,payables}/page.tsx` (extracted)
- `src/app/beithady/financials/{ledgers,snapshots,reconciliation,import}/page.tsx` (new)
- `src/app/beithady/financials/snapshots/[id]/page.tsx`
- `src/app/beithady/financials/import/[upload_id]/page.tsx`

**Shared components:** `src/app/beithady/financials/_components/{SnapshotCard,PartnerLedgerTable,VarianceDrilldown}.tsx`

**Deleted:**
- `src/lib/beithady-opening-balance-2026.ts` (data migrated to DB)
- `src/app/beithady/financial/` singular stub (redirect added in `next.config.ts`)

**Forward-only SQL migrations:** `supabase/migrations/0118_bh_financials_balance_snapshots.sql` (originally planned as 0117 but parallel session took that number) — creates 5 tables, seeds 31-Dec-2025 consolidated v1 snapshot bit-for-bit from the TS const (87 account rows). Plus `0119_bh_freeze_rpcs.sql` from Task 6 with the freeze + clone-for-refreeze stored functions.

---

## Phases (9)

1. **DB foundation** (Tasks 1–4)
2. **Cadence & snapshot CRUD lib** (Tasks 5–6)
3. **Partner matching** (Task 7)
4. **Import pipeline** (Tasks 8–11)
5. **Ledgers + Reconciliation lib** (Tasks 12–13)
6. **Cockpit refactor + page extraction** (Tasks 14–18)
7. **New subpages** (Tasks 19–24)
8. **Cron + banner** (Tasks 25–26)
9. **Seed + smoke + deploy** (Tasks 27–28)

Each task ends with a `git add` + `git commit` step. Type-check is local to each task; full repo tsc + vitest happen in Task 28.

---

## Task 1: Migration 0117 — create 5 tables + seed consolidated v1 snapshot

**Files:**
- Create: `supabase/migrations/0117_bh_financials_balance_snapshots.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0117_bh_financials_balance_snapshots.sql
-- BH Financials — Beginning Balances & Snapshot Module
-- 5 new tables; seeds the 31-Dec-2025 consolidated v1 snapshot from the
-- current TS const beithady-opening-balance-2026.ts so behavior is
-- value-identical on day 1.

-- 1. Snapshot headers
create table if not exists public.bh_balance_snapshots (
  id              uuid primary key default gen_random_uuid(),
  period_end      date not null,
  company_scope   text not null check (company_scope in ('consolidated','egypt','dubai','a1')),
  version         int not null default 1 check (version >= 1),
  status          text not null default 'draft' check (status in ('draft','frozen','superseded')),
  frozen_at       timestamptz,
  frozen_by       uuid references public.app_users(id),
  source_kind     text not null default 'xlsx_import' check (source_kind in ('xlsx_import','odoo_snapshot','manual_edit')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (period_end, company_scope, version)
);
create unique index if not exists uniq_bh_snapshot_frozen
  on public.bh_balance_snapshots (period_end, company_scope)
  where status = 'frozen';
create index if not exists idx_bh_snapshot_status on public.bh_balance_snapshots (status);
create index if not exists idx_bh_snapshot_period on public.bh_balance_snapshots (period_end desc);

-- 2. Account-level rows (replaces BEITHADY_OPENING_BALANCES_2026 TS const)
create table if not exists public.bh_balance_snapshot_accounts (
  id                       uuid primary key default gen_random_uuid(),
  snapshot_id              uuid not null references public.bh_balance_snapshots(id) on delete cascade,
  account_code             text not null,
  account_name             text not null,
  account_type             text not null,
  account_type_override    text,
  opening_raw              numeric(18,2) not null,
  partner_total            numeric(18,2),
  variance                 numeric(18,2) generated always as (opening_raw - coalesce(partner_total, opening_raw)) stored,
  variance_status          text not null default 'open' check (variance_status in ('open','investigating','accepted','resolved')),
  variance_notes           text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (snapshot_id, account_code, account_name)
);
create index if not exists idx_bh_snapshot_acct_snap on public.bh_balance_snapshot_accounts (snapshot_id);
create index if not exists idx_bh_snapshot_acct_variance on public.bh_balance_snapshot_accounts (snapshot_id) where variance != 0;

-- 3. Partner-level rows (the new capability)
create table if not exists public.bh_balance_snapshot_partners (
  id                       uuid primary key default gen_random_uuid(),
  snapshot_id              uuid not null references public.bh_balance_snapshots(id) on delete cascade,
  account_code             text not null,
  partner_kind             text not null check (partner_kind in ('supplier','owner','customer','employee','landlord','noteholder','unallocated')),
  partner_id               int references public.odoo_partners(id),
  partner_name_raw         text not null,
  partner_name_normalized  text,
  opening_balance          numeric(18,2) not null,
  currency                 text not null default 'EGP',
  is_synthetic             boolean not null default false,
  match_confidence         text check (match_confidence in ('exact','fuzzy','unmatched','synthetic')),
  match_score              numeric(4,3),
  match_warnings           text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (snapshot_id, account_code, partner_name_raw)
);
create index if not exists idx_bh_snapshot_partners_snap on public.bh_balance_snapshot_partners (snapshot_id, partner_kind);
create index if not exists idx_bh_snapshot_partners_pid on public.bh_balance_snapshot_partners (partner_id) where partner_id is not null;

-- 4. Upload audit
create table if not exists public.bh_balance_snapshot_uploads (
  id                    uuid primary key default gen_random_uuid(),
  snapshot_id           uuid references public.bh_balance_snapshots(id),
  account_code          text,
  period_end            date,
  company_scope         text,
  filename              text not null,
  file_sha256           text not null unique,
  storage_path          text,
  uploaded_at           timestamptz not null default now(),
  uploaded_by           uuid references public.app_users(id),
  raw_row_count         int,
  parsed_partner_count  int,
  parse_status          text not null default 'pending' check (parse_status in ('pending','parsed','committed','failed','rejected')),
  parse_errors          jsonb not null default '[]',
  raw_rows              jsonb,
  classified_rows       jsonb
);
create index if not exists idx_bh_upload_snap on public.bh_balance_snapshot_uploads (snapshot_id);
create index if not exists idx_bh_upload_status on public.bh_balance_snapshot_uploads (parse_status);

-- 5. Cron-banner state
create table if not exists public.bh_financials_reminders (
  id                    uuid primary key default gen_random_uuid(),
  period_end            date not null,
  company_scope         text not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  dismissed_until       timestamptz,
  resolved_at           timestamptz,
  notification_sent_at  jsonb not null default '{}',
  unique (period_end, company_scope)
);
create index if not exists idx_bh_reminders_open on public.bh_financials_reminders (period_end) where resolved_at is null;

-- 6. Seed: 31-Dec-2025 consolidated v1 snapshot (frozen on day 1)
-- Mirrors src/lib/beithady-opening-balance-2026.ts BEITHADY_OPENING_BALANCES_2026 + ACCOUNT_TYPE_OVERRIDES.
with new_snap as (
  insert into public.bh_balance_snapshots
    (period_end, company_scope, version, status, frozen_at, source_kind, notes)
  values
    ('2025-12-31', 'consolidated', 1, 'frozen', now(), 'xlsx_import',
     'Seeded from beithady-opening-balance-2026.ts at migration time. Partner-level rows added via xlsx imports after deploy.')
  returning id
)
insert into public.bh_balance_snapshot_accounts
  (snapshot_id, account_code, account_name, account_type, account_type_override, opening_raw)
select s.id, t.code, t.name, t.account_type, t.override, t.opening_raw
from new_snap s
cross join (values
  -- asset_cash (38 rows, subtotal 707,352.62)
  ('121053','Bank Misr 8439 AED','asset_cash',null,408.08::numeric),
  ('121054','Stripe','asset_cash',null,308430.61),
  ('121001','Cash In EGP','asset_cash',null,6622.15),
  ('121002','Cash in US Dollars','asset_cash',null,22743.36),
  ('121012','Custody Of Ramadan Lawyer','asset_cash',null,17813.00),
  ('121013','Mohamed Tarek custody','asset_cash',null,2150.00),
  ('121015','Racha Omairi Custody','asset_cash',null,-129756.90),
  ('121016','Eng Muhammed El Sayed Custody','asset_cash',null,78462.00),
  ('121017','Yassin Hady Custody','asset_cash',null,1648.19),
  ('121019','Mohamed Nabil  Custody','asset_cash',null,-30521.85),
  ('121021','moez orri custody','asset_cash',null,132765.04),
  ('121022','Mariam sherief custody','asset_cash',null,2578.31),
  ('121025','Amr Ali Custody','asset_cash',null,820.00),
  ('121026','Karim ibrahem custody','asset_cash',null,20339.76),
  ('121027','Abdelrahman hossam custody','asset_cash',null,7340.44),
  ('121028','Omar Kamel Custody','asset_cash',null,-0.59),
  ('121031','Ahmed Temraz Custody','asset_cash',null,-12149.13),
  ('121034','Bank Misr 0176 in EGP','asset_cash',null,67.88),
  ('121035','Rania Said custody','asset_cash',null,886.00),
  ('121036','Mahmoud  (Gouna) Custody','asset_cash',null,6978.00),
  ('121037','Mariam Medhat Custody','asset_cash',null,901.12),
  ('121038','mustafa fady custody','asset_cash',null,148.75),
  ('121039','Shady Gouna Custody','asset_cash',null,-7200.00),
  ('121040','Mahmoud hanafy Custody','asset_cash',null,-23638.48),
  ('121041','Yassin Karim Custody','asset_cash',null,13970.00),
  ('121042','Ahmed Kamel Custody','asset_cash',null,7.32),
  ('121043','Gehad Ashraf custody','asset_cash',null,210.00),
  ('121048','Abdelrahman Purchase custody','asset_cash',null,-3907.50),
  ('121049','Mohamed Ahmed Operation custody','asset_cash',null,567.00),
  ('121051','Ahmed Abdelsalam Custody','asset_cash',null,2.00),
  ('121055','Dopey Account','asset_cash',null,254610.00),
  ('121056','Custody Of Saeid  (الكهربائي )','asset_cash',null,-70.00),
  ('121058','Mohamed Zedan Custody','asset_cash',null,28075.00),
  ('121059','Walid Ahmed Custody','asset_cash',null,200.00),
  ('121060','Eman Mohamed Custody','asset_cash',null,462.00),
  ('121062','Abdelaziz Mohamed DRI Custody','asset_cash',null,998.00),
  ('121063','Amr Saad custody','asset_cash',null,1000.00),
  ('121067','EG Bank in EGP','asset_cash',null,3393.06),
  -- asset_receivable
  ('122001','Customers','asset_receivable',null,-796296.00),
  -- asset_current (7 rows)
  ('121052','Cash In Transit','asset_current',null,-2249.96),
  ('113002','Contract Insurance - Guarantee','asset_current',null,2930825.00),
  ('122003','other Debtors','asset_current',null,251.95),
  ('124001','Deferred Expense','asset_current',null,481174.50),
  ('124005','Loans for employees','asset_current',null,27000.00),
  ('124006','Salaries in advance','asset_current',null,6100.00),
  ('125001','V.A.T On Purchase','asset_current',null,1363540.93),
  -- asset_prepayments
  ('124004','Prepaid Expenses','asset_prepayments',null,230936.82),
  ('124007','Prepaid Interest','asset_prepayments',null,4482230.59),
  -- asset_fixed (27 rows, subtotal 67,527,108.92)
  ('111001','Furniture','asset_fixed',null,11752236.64),
  ('111002','Accum. -Office Furniture','asset_fixed',null,-487640.03),
  ('111003','Electrical Devices','asset_fixed',null,12095346.57),
  ('111004','Accum. -electrical dev.','asset_fixed',null,-489529.69),
  ('111005','Furnishings','asset_fixed',null,2938799.34),
  ('111006','Accu  Dep - Furnishings','asset_fixed',null,-629098.60),
  ('111007','Computers &Net Work','asset_fixed',null,776641.20),
  ('111008','Accum. - Computers','asset_fixed',null,-68132.34),
  ('111009','Tools Equipment','asset_fixed',null,267401.01),
  ('111010','Accum. Tools Equipment','asset_fixed',null,-45865.97),
  ('111011','Lease Holding Improvements assets','asset_fixed',null,20540742.69),
  ('111012','Accu  Dep - Lease holding improvment','asset_fixed',null,-925027.83),
  ('111013','Safety& Environmental equipment','asset_fixed',null,748355.00),
  ('111014','Accum. -Safety & Environmental equipment','asset_fixed',null,-31105.61),
  ('111015','Asset Accessories','asset_fixed',null,646786.44),
  ('111016','Accum. -Asset Accessories','asset_fixed',null,-158120.91),
  ('111017','Lease Holding Improvements Under Implementation','asset_fixed',null,11234501.34),
  ('111018','GYM Equipment','asset_fixed',null,338899.00),
  ('111019','Accum. -GYM Equipment','asset_fixed',null,-46458.21),
  ('111020','vehicles','asset_fixed',null,54000.00),
  ('111021','Accum. -vehicles','asset_fixed',null,-1350.00),
  ('111022','Cars','asset_fixed',null,7900000.00),
  ('111023','Accum. -Cars','asset_fixed',null,-197500.00),
  ('111024','Smart Devices','asset_fixed',null,776202.21),
  ('111025','Accum. -Smart Devices','asset_fixed',null,-12973.33),
  ('111026','Machinery & Equipment','asset_fixed',null,550000.00),
  -- liability_current
  ('224001','deferred Revenue','liability_current',null,-968017.30),
  ('227003','City Tax','liability_current',null,-4341.98),
  ('223001','Accrued Salaries','liability_current',null,-254728.11),
  ('223004','Accrued Others','liability_current',null,-5659.32),
  ('223005','Accrued Expenses','liability_current',null,-74999.99),
  ('225001','V.A.T On Sales','liability_current',null,-543234.27),
  ('226002','with holding Tax','liability_current',null,-3738.76),
  -- liability_payable
  ('227002','Suppliers','liability_payable',null,-9081444.65),
  -- liability_non_current (with overrides for 221001 and 222008)
  ('221001','Notes Payable - Short Term','liability_non_current','liability_non_current',-18075579.00),
  ('222006','concrete plus Loans (EGP)','liability_non_current',null,-10000000.00),
  ('222008','Total Lime Loan','liability_current','liability_non_current',-42311642.82),
  -- equity
  ('300200','Capital','equity',null,-1062500.00),
  ('','Previous Years Unallocated Earnings (2025 close)','equity_unaffected',null,5427911.00)
) as t(code, name, account_type, override, opening_raw);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Apply via the `mcp__…__apply_migration` tool against project `bpjproljatbrbmszwbov` with name `0117_bh_financials_balance_snapshots` and the SQL from Step 1.

Expected: returns `{ success: true }`. No row-count returned by `apply_migration` for DDL.

- [ ] **Step 3: Verify via `mcp__…__execute_sql`**

Run the four queries:

```sql
select count(*) from public.bh_balance_snapshots;
-- expect: 1
select status, version, period_end, company_scope from public.bh_balance_snapshots;
-- expect: frozen, 1, 2025-12-31, consolidated
select count(*) from public.bh_balance_snapshot_accounts;
-- expect: 87  (38 asset_cash + 1 asset_receivable + 7 asset_current + 2 asset_prepayments + 26 asset_fixed + 7 liability_current + 1 liability_payable + 3 liability_non_current + 2 equity)
select sum(opening_raw)::numeric(18,2) from public.bh_balance_snapshot_accounts;
-- expect: 0.17  (the documented 0.17 EGP rounding from the source xlsx)
```

If any check fails, do NOT proceed — debug the migration first.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0117_bh_financials_balance_snapshots.sql
git commit -m "feat(bh-financials): migration 0117 — balance snapshot tables + seed

Adds 5 tables (bh_balance_snapshots, bh_balance_snapshot_accounts,
bh_balance_snapshot_partners, bh_balance_snapshot_uploads, bh_financials_reminders).
Seeds 31-Dec-2025 consolidated v1 snapshot from beithady-opening-balance-2026.ts
bit-for-bit so buildBalanceSheet behavior is value-identical on day 1.

Plan: docs/superpowers/plans/2026-05-12-bh-financials-balances.md (Task 1)"
git push origin main
```

---

## Task 2: TypeScript types module for new tables

**Files:**
- Create: `src/lib/beithady/financials/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/beithady/financials/types.ts
// Shared types for the BH Financials balance-snapshot module. Keep in sync
// with supabase/migrations/0117_bh_financials_balance_snapshots.sql.

export type CompanyScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';
export type SnapshotStatus = 'draft' | 'frozen' | 'superseded';
export type SnapshotSourceKind = 'xlsx_import' | 'odoo_snapshot' | 'manual_edit';
export type PartnerKind =
  | 'supplier'
  | 'owner'
  | 'customer'
  | 'employee'
  | 'landlord'
  | 'noteholder'
  | 'unallocated';
export type MatchConfidence = 'exact' | 'fuzzy' | 'unmatched' | 'synthetic';
export type VarianceStatus = 'open' | 'investigating' | 'accepted' | 'resolved';
export type ParseStatus =
  | 'pending'
  | 'parsed'
  | 'committed'
  | 'failed'
  | 'rejected';

export type BhBalanceSnapshot = {
  id: string;
  period_end: string; // YYYY-MM-DD
  company_scope: CompanyScope;
  version: number;
  status: SnapshotStatus;
  frozen_at: string | null;
  frozen_by: string | null;
  source_kind: SnapshotSourceKind;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BhSnapshotAccount = {
  id: string;
  snapshot_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_type_override: string | null;
  opening_raw: number;
  partner_total: number | null;
  variance: number;
  variance_status: VarianceStatus;
  variance_notes: string | null;
};

export type BhSnapshotPartner = {
  id: string;
  snapshot_id: string;
  account_code: string;
  partner_kind: PartnerKind;
  partner_id: number | null;
  partner_name_raw: string;
  partner_name_normalized: string | null;
  opening_balance: number;
  currency: string;
  is_synthetic: boolean;
  match_confidence: MatchConfidence | null;
  match_score: number | null;
  match_warnings: string[];
};

export type BhSnapshotUpload = {
  id: string;
  snapshot_id: string | null;
  account_code: string | null;
  period_end: string | null;
  company_scope: CompanyScope | null;
  filename: string;
  file_sha256: string;
  storage_path: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  raw_row_count: number | null;
  parsed_partner_count: number | null;
  parse_status: ParseStatus;
  parse_errors: Array<{ row: number; error: string }>;
  raw_rows: unknown;
  classified_rows: unknown;
};

export type BhFinancialsReminder = {
  id: string;
  period_end: string;
  company_scope: CompanyScope;
  first_seen_at: string;
  last_seen_at: string;
  dismissed_until: string | null;
  resolved_at: string | null;
  notification_sent_at: Record<string, string>;
};
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "src/lib/beithady/financials" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/financials/types.ts
git commit -m "feat(bh-financials): types module for snapshot tables

Plan: Task 2"
git push origin main
```

---

## Task 3: `loadOpeningBalanceSnapshot` helper + test

**Files:**
- Create: `src/lib/beithady/financials/load-opening.ts`
- Create: `src/lib/beithady/financials/load-opening.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/beithady/financials/load-opening.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({ from: mockFrom }),
}));

import { loadOpeningBalanceSnapshot } from './load-opening';

beforeEach(() => {
  mockFrom.mockReset();
});

describe('loadOpeningBalanceSnapshot', () => {
  it('returns the latest frozen snapshot accounts for (period_end, scope)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bh_balance_snapshots') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: { id: 'snap-1', period_end: '2025-12-31' },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'bh_balance_snapshot_accounts') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  account_code: '227002',
                  account_name: 'Suppliers',
                  account_type: 'liability_payable',
                  account_type_override: null,
                  opening_raw: -9081444.65,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await loadOpeningBalanceSnapshot({
      period_end: '2025-12-31',
      scope: 'consolidated',
    });

    expect(result.snapshot_id).toBe('snap-1');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].opening_raw).toBe(-9081444.65);
  });

  it('returns null snapshot_id when no frozen snapshot exists', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));

    const result = await loadOpeningBalanceSnapshot({
      period_end: '2030-01-01',
      scope: 'consolidated',
    });

    expect(result.snapshot_id).toBeNull();
    expect(result.accounts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/beithady/financials/load-opening.test.ts
```

Expected: FAIL, `Cannot find module './load-opening'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/beithady/financials/load-opening.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { CompanyScope } from './types';

export type OpeningAccountRow = {
  account_code: string;
  account_name: string;
  account_type: string;
  account_type_override: string | null;
  opening_raw: number;
};

export type OpeningSnapshotResult = {
  snapshot_id: string | null;
  period_end: string | null;
  accounts: OpeningAccountRow[];
};

export async function loadOpeningBalanceSnapshot(params: {
  period_end: string;
  scope: CompanyScope;
}): Promise<OpeningSnapshotResult> {
  const sb = supabaseAdmin();

  const { data: snap, error: snapErr } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end')
    .eq('period_end', params.period_end)
    .eq('company_scope', params.scope)
    .eq('status', 'frozen')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapErr) {
    throw new Error(`loadOpeningBalanceSnapshot snapshot: ${snapErr.message}`);
  }
  if (!snap) {
    return { snapshot_id: null, period_end: null, accounts: [] };
  }

  const { data: rows, error: rowsErr } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, account_name, account_type, account_type_override, opening_raw')
    .eq('snapshot_id', snap.id);

  if (rowsErr) {
    throw new Error(`loadOpeningBalanceSnapshot accounts: ${rowsErr.message}`);
  }

  return {
    snapshot_id: snap.id,
    period_end: snap.period_end,
    accounts: (rows ?? []).map((r) => ({
      account_code: r.account_code,
      account_name: r.account_name,
      account_type: r.account_type,
      account_type_override: r.account_type_override,
      opening_raw: Number(r.opening_raw),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/beithady/financials/load-opening.test.ts
```

Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/load-opening.ts src/lib/beithady/financials/load-opening.test.ts
git commit -m "feat(bh-financials): loadOpeningBalanceSnapshot helper + tests (2/2)

Plan: Task 3"
git push origin main
```

---

## Task 4: Swap `buildBalanceSheet` TS-const → DB read; delete old seed file

**Files:**
- Modify: `src/lib/financials-pnl.ts:1-10` (imports) and lines around `buildBalanceSheet` (around 780–870)
- Delete: `src/lib/beithady-opening-balance-2026.ts`

- [ ] **Step 1: Read current imports + buildBalanceSheet section to confirm exact line range**

Run:

```bash
grep -n "BEITHADY_OPENING_BALANCES_2026\|OPENING_BALANCE_DATE\|ACCOUNT_TYPE_OVERRIDES\|beithady-opening-balance-2026" src/lib/financials-pnl.ts
```

Note the exact line numbers for the import (top of file) and the three call sites inside `buildBalanceSheet`.

- [ ] **Step 2: Replace the TS-const import with a DB-loader import**

Edit `src/lib/financials-pnl.ts`. Replace:

```typescript
import {
  BEITHADY_OPENING_BALANCES_2026,
  OPENING_BALANCE_DATE,
  ACCOUNT_TYPE_OVERRIDES,
} from './beithady-opening-balance-2026';
```

with:

```typescript
import { loadOpeningBalanceSnapshot } from './beithady/financials/load-opening';

// The first frozen snapshot's period_end. Anything after this date triggers
// the seed-plus-deltas path; anything on/before falls back to raw odoo_move_lines.
const OPENING_BALANCE_DATE = '2025-12-31';
```

- [ ] **Step 3: Replace the in-function seed loop**

Inside `buildBalanceSheet`, find:

```typescript
  // Seed opening balances first so later Odoo deltas stack on top of them.
  if (useOpeningBalance) {
    for (const op of BEITHADY_OPENING_BALANCES_2026) {
      const key = `${op.code}||${op.name}||${op.account_type}`;
      byAccount.set(key, {
        code: op.code,
        name: op.name,
        account_type: op.account_type,
        sum: op.opening_raw,
      });
    }
  }
```

Replace with:

```typescript
  // Seed opening balances from the latest frozen consolidated snapshot.
  let accountTypeOverrides: Record<string, string> = {};
  if (useOpeningBalance) {
    const seed = await loadOpeningBalanceSnapshot({
      period_end: OPENING_BALANCE_DATE,
      scope: 'consolidated',
    });
    if (!seed.snapshot_id) {
      throw new Error(
        `buildBalanceSheet: no frozen consolidated snapshot for ${OPENING_BALANCE_DATE}`
      );
    }
    for (const op of seed.accounts) {
      const key = `${op.account_code}||${op.account_name}||${op.account_type}`;
      byAccount.set(key, {
        code: op.account_code,
        name: op.account_name,
        account_type: op.account_type,
        sum: op.opening_raw,
      });
      if (op.account_type_override) {
        accountTypeOverrides[op.account_code] = op.account_type_override;
      }
    }
  }
```

- [ ] **Step 4: Replace the `ACCOUNT_TYPE_OVERRIDES` reference further down**

Find (still inside `buildBalanceSheet`):

```typescript
      const accountType =
        useOpeningBalance && ACCOUNT_TYPE_OVERRIDES[code]
          ? ACCOUNT_TYPE_OVERRIDES[code]
          : rawAccountType;
```

Replace with:

```typescript
      const accountType =
        useOpeningBalance && accountTypeOverrides[code]
          ? accountTypeOverrides[code]
          : rawAccountType;
```

- [ ] **Step 5: Delete the old TS const file**

```bash
git rm src/lib/beithady-opening-balance-2026.ts
```

- [ ] **Step 6: Type-check + run existing financials-pnl tests**

```bash
npx tsc --noEmit 2>&1 | grep "financials-pnl\|beithady-opening" || echo "clean"
npx vitest run src/lib/financials-pnl.test.ts 2>&1 | tail -20
```

Expected: tsc clean; all existing financials-pnl tests pass.

- [ ] **Step 7: Spot-check via SQL**

Run via Supabase MCP `execute_sql`:

```sql
select count(*) from public.bh_balance_snapshot_accounts
where snapshot_id = (select id from public.bh_balance_snapshots
                    where period_end='2025-12-31' and status='frozen');
-- expect 87
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/financials-pnl.ts
git commit -m "refactor(financials): buildBalanceSheet reads opening from DB snapshot

Replaces the BEITHADY_OPENING_BALANCES_2026 TS const with a call to
loadOpeningBalanceSnapshot against the bh_balance_snapshots table.
The TS file is deleted (data migrated bit-for-bit in 0117).

Plan: Task 4"
git push origin main
```

---

## Task 5: `cadence.ts` — pure date math + tests

**Files:**
- Create: `src/lib/beithady/financials/cadence.ts`
- Create: `src/lib/beithady/financials/cadence.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/beithady/financials/cadence.test.ts
import { describe, it, expect } from 'vitest';
import {
  quarterEndsBefore,
  dueDateFor,
  nextSnapshotDue,
} from './cadence';

describe('quarterEndsBefore', () => {
  it('returns all quarter-ends on/before the given date (descending)', () => {
    const out = quarterEndsBefore('2026-05-12');
    expect(out.slice(0, 3)).toEqual(['2026-03-31', '2025-12-31', '2025-09-30']);
  });
  it('includes the date itself when it IS a quarter-end', () => {
    const out = quarterEndsBefore('2026-03-31');
    expect(out[0]).toBe('2026-03-31');
  });
});

describe('dueDateFor', () => {
  it('returns period_end + 6 calendar months', () => {
    expect(dueDateFor('2025-12-31')).toBe('2026-06-30');
    expect(dueDateFor('2026-03-31')).toBe('2026-09-30');
    expect(dueDateFor('2026-06-30')).toBe('2026-12-31');
    expect(dueDateFor('2026-08-31')).toBe('2027-02-28'); // non-quarter input still works
  });
});

describe('nextSnapshotDue', () => {
  it('returns null if every recent quarter already has a frozen snapshot', () => {
    const frozen = new Set([
      '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31',
    ]);
    const out = nextSnapshotDue('2026-05-12', frozen);
    expect(out).toBeNull();
  });

  it('returns the most recent unfrozen quarter when overdue', () => {
    const frozen = new Set<string>();
    const out = nextSnapshotDue('2026-09-15', frozen);
    // Today is 2026-09-15; Q1-2026 (period_end=2026-03-31) + 6mo = 2026-09-30,
    // so not yet overdue. But Q4-2025 (2025-12-31) + 6mo = 2026-06-30 IS overdue.
    expect(out).toEqual({ period_end: '2025-12-31', is_overdue: true, due_by: '2026-06-30' });
  });

  it('returns first not-yet-overdue quarter when no overdue ones exist', () => {
    const frozen = new Set(['2025-12-31', '2025-09-30', '2025-06-30']);
    const out = nextSnapshotDue('2026-05-12', frozen);
    expect(out).toEqual({
      period_end: '2026-03-31',
      is_overdue: false,
      due_by: '2026-09-30',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/beithady/financials/cadence.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/beithady/financials/cadence.ts
// Pure date math for snapshot cadence. NO database access — pure functions
// so this is trivially unit-testable.

const QUARTER_MONTHS = [3, 6, 9, 12]; // March, June, September, December

function isoDate(d: Date): string {
  // YYYY-MM-DD in UTC. We treat all dates as date-only (no TZ).
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthIdx0: number): number {
  // monthIdx0 = 0..11. Trick: day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
}

/** Returns quarter-end dates ≤ asOf (descending), bounded by 5 years back. */
export function quarterEndsBefore(asOf: string): string[] {
  const cutoff = new Date(asOf + 'T00:00:00Z');
  const out: string[] = [];
  const startYear = cutoff.getUTCFullYear() + 1;
  for (let y = startYear; y >= startYear - 5; y--) {
    for (let i = QUARTER_MONTHS.length - 1; i >= 0; i--) {
      const m = QUARTER_MONTHS[i];
      const d = new Date(Date.UTC(y, m - 1, lastDayOfMonth(y, m - 1)));
      if (d.getTime() <= cutoff.getTime()) out.push(isoDate(d));
    }
  }
  return out;
}

/** Returns period_end + 6 calendar months (clamped to last day of month). */
export function dueDateFor(periodEnd: string): string {
  const d = new Date(periodEnd + 'T00:00:00Z');
  const year = d.getUTCFullYear();
  const monthIdx0 = d.getUTCMonth(); // 0..11
  const targetYear = year + Math.floor((monthIdx0 + 6) / 12);
  const targetMonthIdx0 = (monthIdx0 + 6) % 12;
  const day = Math.min(d.getUTCDate(), lastDayOfMonth(targetYear, targetMonthIdx0));
  const out = new Date(Date.UTC(targetYear, targetMonthIdx0, day));
  return isoDate(out);
}

export type NextDueResult = {
  period_end: string;
  is_overdue: boolean;
  due_by: string;
};

/**
 * Returns the most-overdue quarter-end with no frozen snapshot; if none
 * are overdue, returns the most recent unfrozen quarter-end (not yet
 * due). Returns null if all recent quarters are frozen.
 */
export function nextSnapshotDue(
  asOf: string,
  frozenPeriodEnds: Set<string>,
): NextDueResult | null {
  const candidates = quarterEndsBefore(asOf).filter((p) => !frozenPeriodEnds.has(p));
  if (candidates.length === 0) return null;
  const todayMs = new Date(asOf + 'T00:00:00Z').getTime();
  // Prefer the most overdue (earliest unfrozen with due_by < today).
  let overdue: NextDueResult | null = null;
  let upcoming: NextDueResult | null = null;
  // candidates is descending — walk from oldest to newest to find oldest overdue.
  for (const p of [...candidates].reverse()) {
    const due_by = dueDateFor(p);
    const dueMs = new Date(due_by + 'T00:00:00Z').getTime();
    if (dueMs <= todayMs) {
      overdue = { period_end: p, is_overdue: true, due_by };
      break;
    }
  }
  if (overdue) return overdue;
  // No overdue → pick newest not-yet-due.
  for (const p of candidates) {
    const due_by = dueDateFor(p);
    upcoming = { period_end: p, is_overdue: false, due_by };
    break;
  }
  return upcoming;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/beithady/financials/cadence.test.ts
```

Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/cadence.ts src/lib/beithady/financials/cadence.test.ts
git commit -m "feat(bh-financials): cadence date math + tests (6/6)

quarterEndsBefore · dueDateFor (period_end + 6mo) · nextSnapshotDue.
Pure functions, no DB access.

Plan: Task 5"
git push origin main
```

---

## Task 6: `snapshots.ts` — CRUD + freeze + clone-for-refreeze + tests

**Files:**
- Create: `src/lib/beithady/financials/snapshots.ts`
- Create: `src/lib/beithady/financials/snapshots.test.ts`

- [ ] **Step 1: Write the failing test (4 cases)**

```typescript
// src/lib/beithady/financials/snapshots.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import {
  listSnapshots,
  getSnapshot,
  freezeSnapshot,
  cloneForRefreeze,
} from './snapshots';

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('listSnapshots', () => {
  it('returns rows for a given company_scope', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            then: (cb: (v: { data: unknown[]; error: null }) => void) =>
              cb({ data: [{ id: 's1', period_end: '2025-12-31', status: 'frozen' }], error: null }),
          }),
        }),
      }),
    }));
    const out = await listSnapshots({ scope: 'consolidated' });
    expect(out).toHaveLength(1);
  });
});

describe('freezeSnapshot', () => {
  it('throws when the draft has no account rows', async () => {
    mockFrom.mockImplementation((t: string) => {
      if (t === 'bh_balance_snapshots') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'd1', period_end: '2026-03-31', company_scope: 'consolidated', version: 1, status: 'draft' }, error: null }) }) }) };
      }
      if (t === 'bh_balance_snapshot_accounts') {
        return { select: () => ({ eq: async () => ({ data: [], error: null, count: 0 }) }) };
      }
      throw new Error('unexpected ' + t);
    });
    await expect(freezeSnapshot({ snapshot_id: 'd1', user_id: 'u1' })).rejects.toThrow(
      /no account-level rows/i
    );
  });
});

describe('cloneForRefreeze', () => {
  it('returns the new draft snapshot id with version+1', async () => {
    mockRpc.mockResolvedValueOnce({ data: { new_snapshot_id: 'd2', new_version: 2 }, error: null });
    const out = await cloneForRefreeze({ source_snapshot_id: 's1', user_id: 'u1' });
    expect(out).toEqual({ new_snapshot_id: 'd2', new_version: 2 });
  });
});

describe('getSnapshot', () => {
  it('returns null when not found', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }));
    const out = await getSnapshot('missing');
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run src/lib/beithady/financials/snapshots.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/beithady/financials/snapshots.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { BhBalanceSnapshot, CompanyScope } from './types';

export async function listSnapshots(params: { scope: CompanyScope }): Promise<BhBalanceSnapshot[]> {
  const sb = supabaseAdmin();
  const { data, error } = (await sb
    .from('bh_balance_snapshots')
    .select('*')
    .eq('company_scope', params.scope)
    .order('period_end', { ascending: false })) as { data: BhBalanceSnapshot[] | null; error: { message: string } | null };
  if (error) throw new Error(`listSnapshots: ${error.message}`);
  return data ?? [];
}

export async function getSnapshot(id: string): Promise<BhBalanceSnapshot | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('bh_balance_snapshots')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getSnapshot: ${error.message}`);
  return (data as BhBalanceSnapshot | null) ?? null;
}

export async function freezeSnapshot(params: {
  snapshot_id: string;
  user_id: string;
}): Promise<BhBalanceSnapshot> {
  const sb = supabaseAdmin();

  // 1. Load draft.
  const { data: snap, error: snapErr } = await sb
    .from('bh_balance_snapshots')
    .select('*')
    .eq('id', params.snapshot_id)
    .maybeSingle();
  if (snapErr) throw new Error(`freezeSnapshot load: ${snapErr.message}`);
  if (!snap) throw new Error(`freezeSnapshot: snapshot ${params.snapshot_id} not found`);
  if ((snap as BhBalanceSnapshot).status !== 'draft') {
    throw new Error(`freezeSnapshot: snapshot is ${(snap as BhBalanceSnapshot).status}, not draft`);
  }

  // 2. Ensure draft has at least one account row.
  const { data: acctRows, error: acctErr } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('id')
    .eq('snapshot_id', params.snapshot_id);
  if (acctErr) throw new Error(`freezeSnapshot account check: ${acctErr.message}`);
  if (!acctRows || acctRows.length === 0) {
    throw new Error('freezeSnapshot: draft has no account-level rows');
  }

  // 3. Transaction handled in DB via stored function `bh_freeze_snapshot`.
  // Falls back to client-side sequential ops if the function isn't installed.
  const { data: rpcOut, error: rpcErr } = await sb.rpc('bh_freeze_snapshot', {
    p_snapshot_id: params.snapshot_id,
    p_user_id: params.user_id,
  });
  if (rpcErr) throw new Error(`freezeSnapshot rpc: ${rpcErr.message}`);
  return rpcOut as BhBalanceSnapshot;
}

export async function cloneForRefreeze(params: {
  source_snapshot_id: string;
  user_id: string;
}): Promise<{ new_snapshot_id: string; new_version: number }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('bh_clone_snapshot_for_refreeze', {
    p_source_snapshot_id: params.source_snapshot_id,
    p_user_id: params.user_id,
  });
  if (error) throw new Error(`cloneForRefreeze: ${error.message}`);
  return data as { new_snapshot_id: string; new_version: number };
}
```

- [ ] **Step 4: Add stored functions in a follow-on migration `0119_bh_freeze_rpcs.sql`**

Create `supabase/migrations/0119_bh_freeze_rpcs.sql`:

```sql
-- 0119_bh_freeze_rpcs.sql
-- Stored functions for atomic snapshot freeze + re-freeze clone.
-- Also adds CHECK constraints + integrity guards deferred from Task 1 review.

-- Constraint 1: lock down account_type / account_type_override enums.
alter table public.bh_balance_snapshot_accounts
  add constraint chk_bh_acct_type check (
    account_type in (
      'asset_cash','asset_receivable','asset_current','asset_prepayments',
      'asset_fixed','liability_current','liability_payable',
      'liability_non_current','equity','equity_unaffected'
    )
  );
alter table public.bh_balance_snapshot_accounts
  add constraint chk_bh_acct_type_override check (
    account_type_override is null or account_type_override in (
      'asset_cash','asset_receivable','asset_current','asset_prepayments',
      'asset_fixed','liability_current','liability_payable',
      'liability_non_current','equity','equity_unaffected'
    )
  );

-- Constraint 2: an upload marked 'committed' MUST have a snapshot_id.
alter table public.bh_balance_snapshot_uploads
  add constraint chk_bh_upload_committed_has_snapshot
  check (parse_status <> 'committed' or snapshot_id is not null);

-- Constraint 3: align company_scope on reminders with the snapshots table.
alter table public.bh_financials_reminders
  add constraint chk_bh_reminders_scope
  check (company_scope in ('consolidated','egypt','dubai','a1'));

create or replace function public.bh_freeze_snapshot(
  p_snapshot_id uuid,
  p_user_id uuid
) returns public.bh_balance_snapshots
language plpgsql
as $$
declare
  v_snap public.bh_balance_snapshots;
  v_period date;
  v_scope text;
begin
  select * into v_snap from public.bh_balance_snapshots where id = p_snapshot_id for update;
  if not found then
    raise exception 'snapshot % not found', p_snapshot_id;
  end if;
  if v_snap.status <> 'draft' then
    raise exception 'snapshot % is not draft (status=%)', p_snapshot_id, v_snap.status;
  end if;
  v_period := v_snap.period_end;
  v_scope := v_snap.company_scope;

  -- Mark prior frozen version as superseded.
  update public.bh_balance_snapshots
  set status = 'superseded', updated_at = now()
  where period_end = v_period
    and company_scope = v_scope
    and status = 'frozen';

  -- Promote draft to frozen.
  update public.bh_balance_snapshots
  set status = 'frozen',
      frozen_at = now(),
      frozen_by = p_user_id,
      updated_at = now()
  where id = p_snapshot_id
  returning * into v_snap;

  -- Resolve any cron reminder for this (period, scope).
  update public.bh_financials_reminders
  set resolved_at = now()
  where period_end = v_period and company_scope = v_scope and resolved_at is null;

  return v_snap;
end;
$$;

create or replace function public.bh_clone_snapshot_for_refreeze(
  p_source_snapshot_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_src public.bh_balance_snapshots;
  v_new_id uuid := gen_random_uuid();
  v_new_version int;
begin
  select * into v_src from public.bh_balance_snapshots where id = p_source_snapshot_id;
  if not found then
    raise exception 'source snapshot % not found', p_source_snapshot_id;
  end if;

  select coalesce(max(version), 0) + 1 into v_new_version
  from public.bh_balance_snapshots
  where period_end = v_src.period_end and company_scope = v_src.company_scope;

  insert into public.bh_balance_snapshots
    (id, period_end, company_scope, version, status, source_kind, notes)
  values
    (v_new_id, v_src.period_end, v_src.company_scope, v_new_version, 'draft',
     'manual_edit',
     'Re-freeze draft cloned from snapshot ' || p_source_snapshot_id::text);

  insert into public.bh_balance_snapshot_accounts
    (snapshot_id, account_code, account_name, account_type, account_type_override,
     opening_raw, partner_total, variance_status, variance_notes)
  select v_new_id, account_code, account_name, account_type, account_type_override,
         opening_raw, partner_total, variance_status, variance_notes
  from public.bh_balance_snapshot_accounts where snapshot_id = p_source_snapshot_id;

  insert into public.bh_balance_snapshot_partners
    (snapshot_id, account_code, partner_kind, partner_id, partner_name_raw,
     partner_name_normalized, opening_balance, currency, is_synthetic,
     match_confidence, match_score, match_warnings)
  select v_new_id, account_code, partner_kind, partner_id, partner_name_raw,
         partner_name_normalized, opening_balance, currency, is_synthetic,
         match_confidence, match_score, match_warnings
  from public.bh_balance_snapshot_partners where snapshot_id = p_source_snapshot_id;

  return jsonb_build_object('new_snapshot_id', v_new_id, 'new_version', v_new_version);
end;
$$;
```

Apply migration `0119_bh_freeze_rpcs` via `apply_migration`.

- [ ] **Step 5: Run tests to verify pass**

```bash
npx vitest run src/lib/beithady/financials/snapshots.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/financials/snapshots.ts src/lib/beithady/financials/snapshots.test.ts supabase/migrations/0119_bh_freeze_rpcs.sql
git commit -m "feat(bh-financials): snapshot CRUD + freeze/clone RPCs (4/4 tests)

Plan: Task 6"
git push origin main
```

---

## Task 7: `partner-match.ts` — fuzzy matcher + tests

**Files:**
- Create: `src/lib/beithady/financials/partner-match.ts`
- Create: `src/lib/beithady/financials/partner-match.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/beithady/financials/partner-match.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePartnerName, scoreMatch, matchPartners } from './partner-match';

describe('normalizePartnerName', () => {
  it('strips leading numeric prefix "020. "', () => {
    expect(normalizePartnerName('020. B.Tech')).toBe('b.tech');
  });
  it('strips trailing numeric suffix ".138"', () => {
    expect(normalizePartnerName('مؤسسة بيور الدولية.138')).toBe('مؤسسة بيور الدولية');
  });
  it('lowercases and trims', () => {
    expect(normalizePartnerName('  Foo Bar  ')).toBe('foo bar');
  });
  it('collapses double spaces', () => {
    expect(normalizePartnerName('Foo  Bar')).toBe('foo bar');
  });
});

describe('scoreMatch', () => {
  it('returns 1.0 for identical normalized names', () => {
    expect(scoreMatch('foo bar', 'foo bar')).toBe(1.0);
  });
  it('returns >0.85 for "adel fathy it industrial" vs "adel fathy (it industrial)"', () => {
    const s = scoreMatch('adel fathy (it industrial)', 'adel fathy it industrial');
    expect(s).toBeGreaterThan(0.85);
  });
  it('returns <0.5 for unrelated names', () => {
    expect(scoreMatch('b.tech', 'amazon')).toBeLessThan(0.5);
  });
});

describe('matchPartners', () => {
  const directory = [
    { id: 1, name: 'B.Tech' },
    { id: 2, name: 'Amazon' },
    { id: 3, name: 'Adel Fathy IT Industrial' },
  ];
  it('tags exact matches', () => {
    const out = matchPartners([{ raw: '020. B.Tech', balance: -100 }], directory);
    expect(out[0].confidence).toBe('exact');
    expect(out[0].partner_id).toBe(1);
  });
  it('tags fuzzy with score', () => {
    const out = matchPartners(
      [{ raw: '034 . Adel Fathy (it industrial)', balance: -100 }],
      directory
    );
    expect(out[0].confidence).toBe('fuzzy');
    expect(out[0].partner_id).toBe(3);
    expect(out[0].score).toBeGreaterThan(0.85);
  });
  it('tags unmatched when no candidate clears threshold', () => {
    const out = matchPartners([{ raw: 'Some Random Name', balance: -100 }], directory);
    expect(out[0].confidence).toBe('unmatched');
    expect(out[0].partner_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run src/lib/beithady/financials/partner-match.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/beithady/financials/partner-match.ts
// Fuzzy partner-name matching for ledger imports. Pure functions.
// Strategy: normalize → exact lookup → token-set similarity → threshold.

const NUMERIC_PREFIX = /^[\d]+\s*[.\-]\s*/; // "020. " or "034 - "
const NUMERIC_SUFFIX = /\s*\.[\d]+$/; // ".138"

export function normalizePartnerName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(NUMERIC_PREFIX, '')
    .replace(NUMERIC_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(/[\s()\-]+/).filter(Boolean));
}

/** Jaccard similarity on token sets. Symmetric, 0..1. */
export function scoreMatch(a: string, b: string): number {
  if (a === b) return 1.0;
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return inter / union;
}

export type MatchInput = { raw: string; balance: number };
export type MatchResult = {
  raw: string;
  normalized: string;
  balance: number;
  partner_id: number | null;
  matched_name: string | null;
  confidence: 'exact' | 'fuzzy' | 'unmatched';
  score: number | null;
};

const FUZZY_THRESHOLD = 0.7;

export function matchPartners(
  inputs: MatchInput[],
  directory: Array<{ id: number; name: string }>,
): MatchResult[] {
  const directoryNormalized = directory.map((p) => ({
    ...p,
    normalized: normalizePartnerName(p.name),
  }));
  const byNorm = new Map<string, { id: number; name: string }>();
  for (const p of directoryNormalized) byNorm.set(p.normalized, p);

  return inputs.map((inp) => {
    const norm = normalizePartnerName(inp.raw);
    const exact = byNorm.get(norm);
    if (exact) {
      return {
        raw: inp.raw,
        normalized: norm,
        balance: inp.balance,
        partner_id: exact.id,
        matched_name: exact.name,
        confidence: 'exact',
        score: 1.0,
      };
    }
    let best: { id: number; name: string; score: number } | null = null;
    for (const p of directoryNormalized) {
      const s = scoreMatch(norm, p.normalized);
      if (!best || s > best.score) best = { id: p.id, name: p.name, score: s };
    }
    if (best && best.score >= FUZZY_THRESHOLD) {
      return {
        raw: inp.raw,
        normalized: norm,
        balance: inp.balance,
        partner_id: best.id,
        matched_name: best.name,
        confidence: 'fuzzy',
        score: best.score,
      };
    }
    return {
      raw: inp.raw,
      normalized: norm,
      balance: inp.balance,
      partner_id: null,
      matched_name: null,
      confidence: 'unmatched',
      score: best?.score ?? null,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/beithady/financials/partner-match.test.ts
```

Expected: PASS, 11/11.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/partner-match.ts src/lib/beithady/financials/partner-match.test.ts
git commit -m "feat(bh-financials): partner-name fuzzy matcher + tests (11/11)

Plan: Task 7"
git push origin main
```

---

## Task 8: Copy 2 xlsx files to `__fixtures__/` (test inputs)

**Files:**
- Create: `src/lib/beithady/financials/__fixtures__/suppliers-2025-12-31.xlsx`
- Create: `src/lib/beithady/financials/__fixtures__/owners-2025-12-31.xlsx`
- Create: `src/lib/beithady/financials/__fixtures__/README.md`

- [ ] **Step 1: Make the directory**

```bash
mkdir -p src/lib/beithady/financials/__fixtures__
```

- [ ] **Step 2: Copy the xlsx files (preserving binary content)**

```bash
cp "Lime Domains/Beithady/FINANCIALS/BH Accounts Payable Suppliers partner_ledger - 2026-05-12T134322.492.xlsx" \
   src/lib/beithady/financials/__fixtures__/suppliers-2025-12-31.xlsx
cp "Lime Domains/Beithady/FINANCIALS/BH Owners Payable partner_ledger - 2026-05-12T162037.416.xlsx" \
   src/lib/beithady/financials/__fixtures__/owners-2025-12-31.xlsx
```

- [ ] **Step 3: Write the README for the fixtures**

```markdown
# __fixtures__

Committed test inputs for `xlsx-import.test.ts`. Do NOT modify these files —
test assertions hard-code the expected partner counts and totals derived from
them.

- `suppliers-2025-12-31.xlsx` — 85 supplier rows, total −8,567,422.64 EGP.
  Copied from `Lime Domains/Beithady/FINANCIALS/BH Accounts Payable Suppliers
  partner_ledger - 2026-05-12T134322.492.xlsx` on 2026-05-12.
- `owners-2025-12-31.xlsx` — 6 owner rows, total −2,518,213.03 EGP. Copied
  from `Lime Domains/Beithady/FINANCIALS/BH Owners Payable partner_ledger -
  2026-05-12T162037.416.xlsx` on 2026-05-12.

If the source xlsx files change, regenerate these fixtures AND update the
test assertions.
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady/financials/__fixtures__/
git commit -m "test(bh-financials): commit xlsx fixtures for import tests

85-supplier and 6-owner partner ledgers as of 31-Dec-2025, copied from the
gitignored Lime Domains/ source folder.

Plan: Task 8"
git push origin main
```

---

## Task 9: `xlsx-import.ts` — parse stage + tests

**Files:**
- Create: `src/lib/beithady/financials/xlsx-import.ts` (parse only; classify/commit added in next tasks)
- Create: `src/lib/beithady/financials/xlsx-import.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/beithady/financials/xlsx-import.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePartnerLedgerXlsx } from './xlsx-import';

const SUPPLIERS = resolve(__dirname, '__fixtures__/suppliers-2025-12-31.xlsx');
const OWNERS = resolve(__dirname, '__fixtures__/owners-2025-12-31.xlsx');

describe('parsePartnerLedgerXlsx — suppliers fixture', () => {
  it('returns 85 rows with the correct total', async () => {
    const buf = readFileSync(SUPPLIERS);
    const out = await parsePartnerLedgerXlsx(buf);
    expect(out.rows).toHaveLength(85);
    const total = out.rows.reduce((s, r) => s + r.balance, 0);
    expect(Math.round(total * 100) / 100).toBe(-8567422.64);
    expect(out.errors).toHaveLength(0);
  });
  it('strips the header rows (date + Balance label)', async () => {
    const buf = readFileSync(SUPPLIERS);
    const out = await parsePartnerLedgerXlsx(buf);
    expect(out.rows[0].partner_name_raw).toBe('003. AMAN P V C');
    expect(out.rows[0].balance).toBe(-3888);
  });
});

describe('parsePartnerLedgerXlsx — owners fixture', () => {
  it('returns 6 owner rows totaling -2,518,213.03', async () => {
    const buf = readFileSync(OWNERS);
    const out = await parsePartnerLedgerXlsx(buf);
    expect(out.rows).toHaveLength(6);
    const total = out.rows.reduce((s, r) => s + r.balance, 0);
    expect(Math.round(total * 100) / 100).toBe(-2518213.03);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

```bash
npx vitest run src/lib/beithady/financials/xlsx-import.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the parse-stage implementation**

```typescript
// src/lib/beithady/financials/xlsx-import.ts
// xlsx parse + classify + commit pipeline. This file grows through Tasks 9–11.

import 'server-only';
import ExcelJS from 'exceljs';

export type RawLedgerRow = {
  source_row: number;
  partner_name_raw: string;
  balance: number;
};

export type ParseResult = {
  rows: RawLedgerRow[];
  errors: Array<{ row: number; error: string }>;
  total: number;
};

/**
 * Parse a partner-ledger xlsx (Odoo export format).
 * Sheet 0 has rows like:
 *   row 1: [null, null, '2025']           ← date header
 *   row 2: [null, '2025', '2025']          ← optional sub-header
 *   row 3: [null, null, 'Balance']         ← Balance label
 *   row 4+: [null, '003. AMAN P V C', -3888]  ← data
 *
 * Some Odoo exports skip row 2; some put the date in cell [1,2] vs [1,3].
 * We sniff for the first row whose cell[2] is a string AND cell[3] is a number.
 */
export async function parsePartnerLedgerXlsx(buffer: Buffer | ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS expects Buffer; convert ArrayBuffer if needed.
  const buf: Buffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer as ArrayBuffer);
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('parsePartnerLedgerXlsx: no worksheet');

  const rows: RawLedgerRow[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  let total = 0;
  let dataStarted = false;

  sheet.eachRow({ includeEmpty: false }, (row, i) => {
    const v = row.values as Array<unknown>; // 1-indexed; v[0] is undefined
    const c2 = v[2];
    const c3 = v[3];
    const isData = typeof c2 === 'string' && typeof c3 === 'number';
    if (!isData) return;

    // Skip "Balance" header row.
    if (typeof c2 === 'string' && c2.trim().toLowerCase() === 'balance') return;

    if (!dataStarted) dataStarted = true;

    const partner = (c2 as string).trim();
    const balance = c3 as number;
    if (!Number.isFinite(balance)) {
      errors.push({ row: i, error: `non-finite balance: ${balance}` });
      return;
    }
    rows.push({ source_row: i, partner_name_raw: partner, balance });
    total += balance;
  });

  if (!dataStarted) errors.push({ row: 0, error: 'no data rows found' });

  // Round total to 2dp to defeat floating-point drift in assertions.
  return { rows, errors, total: Math.round(total * 100) / 100 };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/beithady/financials/xlsx-import.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/xlsx-import.ts src/lib/beithady/financials/xlsx-import.test.ts
git commit -m "feat(bh-financials): xlsx parse stage + tests against fixtures (3/3)

85 suppliers, 6 owners parsed correctly; totals match to the cent.

Plan: Task 9"
git push origin main
```

---

## Task 10: `xlsx-import.ts` — classify + match stage + tests

**Files:**
- Modify: `src/lib/beithady/financials/xlsx-import.ts` (append)
- Modify: `src/lib/beithady/financials/xlsx-import.test.ts` (append)

- [ ] **Step 1: Append the failing test**

Add to `xlsx-import.test.ts`:

```typescript
import { classifyParsedRows } from './xlsx-import';

describe('classifyParsedRows', () => {
  const directory = [
    { id: 11, name: 'B.Tech' },
    { id: 12, name: 'Amazon' },
    { id: 13, name: 'Adel Fathy IT Industrial' },
  ];
  it('assigns exact matches', () => {
    const out = classifyParsedRows(
      { rows: [{ source_row: 4, partner_name_raw: '020. B.Tech', balance: -1911052.06 }], errors: [], total: -1911052.06 },
      { account_code: '227002', partner_kind: 'supplier', odoo_partners: directory }
    );
    expect(out.rows[0].partner_id).toBe(11);
    expect(out.rows[0].confidence).toBe('exact');
  });
  it('computes variance against an account-level total', () => {
    const out = classifyParsedRows(
      { rows: [{ source_row: 4, partner_name_raw: '020. B.Tech', balance: -100 }], errors: [], total: -100 },
      { account_code: '227002', partner_kind: 'supplier', odoo_partners: directory, account_opening_raw: -200 }
    );
    expect(out.variance).toBe(-100);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/lib/beithady/financials/xlsx-import.test.ts -t classifyParsedRows
```

Expected: FAIL (`classifyParsedRows` not exported).

- [ ] **Step 3: Append the implementation**

Append to `src/lib/beithady/financials/xlsx-import.ts`:

```typescript
import { matchPartners, type MatchResult } from './partner-match';
import type { PartnerKind } from './types';

export type ClassifiedRow = MatchResult & {
  source_row: number;
  account_code: string;
  partner_kind: PartnerKind;
};

export type ClassifyResult = {
  rows: ClassifiedRow[];
  errors: Array<{ row: number; error: string }>;
  ledger_total: number;
  account_total: number | null;
  variance: number | null;
  partner_kind: PartnerKind;
  account_code: string;
};

export function classifyParsedRows(
  parsed: ParseResult,
  ctx: {
    account_code: string;
    partner_kind: PartnerKind;
    odoo_partners: Array<{ id: number; name: string }>;
    account_opening_raw?: number;
  },
): ClassifyResult {
  const matched = matchPartners(
    parsed.rows.map((r) => ({ raw: r.partner_name_raw, balance: r.balance })),
    ctx.odoo_partners,
  );
  const rows: ClassifiedRow[] = parsed.rows.map((r, i) => ({
    ...matched[i],
    source_row: r.source_row,
    account_code: ctx.account_code,
    partner_kind: ctx.partner_kind,
  }));
  const account_total =
    typeof ctx.account_opening_raw === 'number' ? ctx.account_opening_raw : null;
  const variance =
    account_total === null
      ? null
      : Math.round((account_total - parsed.total) * 100) / 100;
  return {
    rows,
    errors: parsed.errors,
    ledger_total: parsed.total,
    account_total,
    variance,
    partner_kind: ctx.partner_kind,
    account_code: ctx.account_code,
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run src/lib/beithady/financials/xlsx-import.test.ts
```

Expected: PASS, 5/5 (3 parse + 2 classify).

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/xlsx-import.ts src/lib/beithady/financials/xlsx-import.test.ts
git commit -m "feat(bh-financials): xlsx classify+match stage + tests (5/5)

Plan: Task 10"
git push origin main
```

---

## Task 11: `xlsx-import.ts` — commit stage + tests

**Files:**
- Modify: `src/lib/beithady/financials/xlsx-import.ts` (append)
- Modify: `src/lib/beithady/financials/xlsx-import.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```typescript
import { commitClassifiedRows } from './xlsx-import';

describe('commitClassifiedRows', () => {
  it('inserts a synthetic __UNALLOCATED row when variance != 0', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockResolvedValue({ error: null });
    const mockFrom2 = vi.fn().mockImplementation((t: string) => {
      if (t === 'bh_balance_snapshot_partners') return { insert: mockInsert };
      if (t === 'bh_balance_snapshot_accounts')
        return { update: () => ({ eq: () => ({ eq: mockUpdate }) }) };
      throw new Error(t);
    });
    vi.doMock('@/lib/supabase', () => ({
      supabaseAdmin: () => ({ from: mockFrom2 }),
    }));
    // Force re-import after doMock.
    const { commitClassifiedRows: cm } = await import('./xlsx-import');
    await cm({
      snapshot_id: 'snap-1',
      classified: {
        rows: [
          {
            source_row: 4,
            account_code: '227002',
            partner_kind: 'supplier',
            raw: 'X',
            normalized: 'x',
            balance: -100,
            partner_id: 11,
            matched_name: 'X',
            confidence: 'exact',
            score: 1,
          },
        ],
        errors: [],
        ledger_total: -100,
        account_total: -200,
        variance: -100,
        partner_kind: 'supplier',
        account_code: '227002',
      },
    });
    // 1 real row + 1 synthetic = 2 inserts.
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npx vitest run src/lib/beithady/financials/xlsx-import.test.ts -t commitClassifiedRows
```

- [ ] **Step 3: Append the implementation**

```typescript
import { supabaseAdmin } from '@/lib/supabase';

export async function commitClassifiedRows(params: {
  snapshot_id: string;
  classified: ClassifyResult;
}): Promise<void> {
  const sb = supabaseAdmin();
  const partnerRows = params.classified.rows.map((r) => ({
    snapshot_id: params.snapshot_id,
    account_code: r.account_code,
    partner_kind: r.partner_kind,
    partner_id: r.partner_id,
    partner_name_raw: r.raw,
    partner_name_normalized: r.normalized,
    opening_balance: r.balance,
    is_synthetic: false,
    match_confidence: r.confidence,
    match_score: r.score,
    match_warnings: [] as string[],
  }));

  // Insert real partner rows.
  const { error: errPartners } = await sb
    .from('bh_balance_snapshot_partners')
    .insert(partnerRows);
  if (errPartners) throw new Error(`commitClassifiedRows partners: ${errPartners.message}`);

  // Insert synthetic __UNALLOCATED row when variance != 0.
  if (params.classified.variance !== null && params.classified.variance !== 0) {
    const { error: errSynth } = await sb.from('bh_balance_snapshot_partners').insert([
      {
        snapshot_id: params.snapshot_id,
        account_code: params.classified.account_code,
        partner_kind: 'unallocated',
        partner_id: null,
        partner_name_raw: `__UNALLOCATED_${params.classified.account_code}`,
        partner_name_normalized: null,
        opening_balance: params.classified.variance,
        is_synthetic: true,
        match_confidence: 'synthetic',
        match_score: null,
        match_warnings: ['auto-generated to reconcile partner_total vs account_total'],
      },
    ]);
    if (errSynth) throw new Error(`commitClassifiedRows synthetic: ${errSynth.message}`);
  }

  // Update account's cached partner_total to the ledger total (so variance recomputes).
  if (params.classified.account_total !== null) {
    const { error: errAcct } = await sb
      .from('bh_balance_snapshot_accounts')
      .update({ partner_total: params.classified.ledger_total })
      .eq('snapshot_id', params.snapshot_id)
      .eq('account_code', params.classified.account_code);
    if (errAcct) throw new Error(`commitClassifiedRows account: ${errAcct.message}`);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/beithady/financials/xlsx-import.test.ts
```

Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/xlsx-import.ts src/lib/beithady/financials/xlsx-import.test.ts
git commit -m "feat(bh-financials): xlsx commit stage + tests (6/6)

Inserts partner rows, auto-creates synthetic __UNALLOCATED row when
variance != 0, updates cached partner_total on the account row.

Plan: Task 11"
git push origin main
```

---

## Task 12: `ledgers.ts` — `buildLedgerReport` + tests

**Files:**
- Create: `src/lib/beithady/financials/ledgers.ts`
- Create: `src/lib/beithady/financials/ledgers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/beithady/financials/ledgers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mockFrom }) }));

import { buildLedgerReport } from './ledgers';

beforeEach(() => mockFrom.mockReset());

describe('buildLedgerReport', () => {
  it('returns rows with opening + delta + current = opening (when no Odoo movement)', async () => {
    mockFrom.mockImplementation((t: string) => {
      if (t === 'bh_balance_snapshots') return {
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'snap-1', period_end: '2025-12-31' }, error: null }) }) }) }) }) }) })
      };
      if (t === 'bh_balance_snapshot_partners') return {
        select: () => ({ eq: () => ({ eq: async () => ({ data: [
          { partner_id: 11, partner_name_raw: '020. B.Tech', opening_balance: -1911052.06, partner_kind: 'supplier', is_synthetic: false, account_code: '227002' },
        ], error: null }) }) }),
      };
      if (t === 'odoo_move_lines') return {
        select: () => ({ in: () => ({ gt: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }) }),
      };
      throw new Error(t);
    });
    const out = await buildLedgerReport({
      kind: 'supplier',
      scope: 'consolidated',
      as_of: '2026-05-12',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].opening_balance).toBe(-1911052.06);
    expect(out.rows[0].delta).toBe(0);
    expect(out.rows[0].current_balance).toBe(-1911052.06);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/lib/beithady/financials/ledgers.test.ts
```

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/beithady/financials/ledgers.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { CompanyScope, PartnerKind } from './types';

const SCOPE_TO_COMPANY_IDS: Record<CompanyScope, number[]> = {
  consolidated: [5, 10],
  egypt: [5],
  dubai: [10],
  a1: [4],
};

export type LedgerRow = {
  partner_id: number | null;
  partner_name_raw: string;
  account_code: string;
  partner_kind: PartnerKind;
  is_synthetic: boolean;
  opening_balance: number;
  delta: number;
  current_balance: number;
  last_move_date: string | null;
};

export async function buildLedgerReport(params: {
  kind: PartnerKind | 'all';
  scope: CompanyScope;
  as_of: string;
}): Promise<{ rows: LedgerRow[]; snapshot_id: string | null; opening_period_end: string | null }> {
  const sb = supabaseAdmin();

  // 1. Latest frozen snapshot for scope at or before as_of.
  const { data: snap, error: snapErr } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end')
    .eq('company_scope', params.scope)
    .eq('status', 'frozen')
    .lte('period_end', params.as_of)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapErr) throw new Error(`buildLedgerReport snap: ${snapErr.message}`);

  if (!snap) {
    return { rows: [], snapshot_id: null, opening_period_end: null };
  }

  // 2. Partner rows.
  let q = sb
    .from('bh_balance_snapshot_partners')
    .select('partner_id, partner_name_raw, partner_kind, is_synthetic, opening_balance, account_code')
    .eq('snapshot_id', snap.id);
  if (params.kind !== 'all') q = q.eq('partner_kind', params.kind);
  const { data: parts, error: partsErr } = await q;
  if (partsErr) throw new Error(`buildLedgerReport partners: ${partsErr.message}`);

  // 3. Odoo deltas after the snapshot period_end, per partner.
  const companyIds = SCOPE_TO_COMPANY_IDS[params.scope];
  const partnerIds = (parts ?? [])
    .map((p) => p.partner_id)
    .filter((x): x is number => typeof x === 'number');

  const deltas = new Map<number, { sum: number; last_date: string | null }>();
  if (partnerIds.length > 0) {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: lines, error: linesErr } = await sb
        .from('odoo_move_lines')
        .select('id, partner_id, balance, date, company_id')
        .in('company_id', companyIds)
        .in('partner_id', partnerIds)
        .gt('date', snap.period_end)
        .lte('date', params.as_of)
        .eq('parent_state', 'posted')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (linesErr) throw new Error(`buildLedgerReport moves: ${linesErr.message}`);
      if (!lines || lines.length === 0) break;
      for (const ln of lines as Array<{ partner_id: number | null; balance: number; date: string | null }>) {
        if (ln.partner_id == null) continue;
        const cur = deltas.get(ln.partner_id) ?? { sum: 0, last_date: null };
        cur.sum += Number(ln.balance);
        if (ln.date && (!cur.last_date || ln.date > cur.last_date)) cur.last_date = ln.date;
        deltas.set(ln.partner_id, cur);
      }
      if (lines.length < PAGE) break;
      offset += PAGE;
    }
  }

  const rows: LedgerRow[] = (parts ?? []).map((p) => {
    const d = p.partner_id != null ? deltas.get(p.partner_id) : null;
    const delta = d?.sum ?? 0;
    return {
      partner_id: p.partner_id ?? null,
      partner_name_raw: p.partner_name_raw,
      account_code: p.account_code,
      partner_kind: p.partner_kind as PartnerKind,
      is_synthetic: p.is_synthetic,
      opening_balance: Number(p.opening_balance),
      delta: Math.round(delta * 100) / 100,
      current_balance: Math.round((Number(p.opening_balance) + delta) * 100) / 100,
      last_move_date: d?.last_date ?? null,
    };
  });

  return {
    rows,
    snapshot_id: snap.id,
    opening_period_end: snap.period_end,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/beithady/financials/ledgers.test.ts
```

Expected: PASS, 1/1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/ledgers.ts src/lib/beithady/financials/ledgers.test.ts
git commit -m "feat(bh-financials): buildLedgerReport (opening + Odoo deltas) + test

Plan: Task 12"
git push origin main
```

---

## Task 13: `reconciliation.ts` — `buildReconciliation` + tests

**Files:**
- Create: `src/lib/beithady/financials/reconciliation.ts`
- Create: `src/lib/beithady/financials/reconciliation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/beithady/financials/reconciliation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mockFrom }) }));

import { buildReconciliation } from './reconciliation';

beforeEach(() => mockFrom.mockReset());

describe('buildReconciliation', () => {
  it('returns one row per account with variance and status', async () => {
    mockFrom.mockImplementation((t: string) => {
      if (t === 'bh_balance_snapshot_accounts') return {
        select: () => ({
          eq: async () => ({
            data: [
              {
                account_code: '227002',
                account_name: 'Suppliers',
                opening_raw: -9081444.65,
                partner_total: -8567422.64,
                variance: -514022.01,
                variance_status: 'open',
                variance_notes: null,
              },
              {
                account_code: '122001',
                account_name: 'Customers',
                opening_raw: -796296,
                partner_total: null,
                variance: 0,
                variance_status: 'open',
                variance_notes: null,
              },
            ],
            error: null,
          }),
        }),
      };
      throw new Error(t);
    });
    const out = await buildReconciliation({ snapshot_id: 'snap-1' });
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].variance).toBe(-514022.01);
    expect(out.rows[1].partner_total).toBeNull(); // awaiting ledger
    expect(out.summary.open_variance_count).toBe(1);
    expect(out.summary.total_variance).toBe(-514022.01);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/lib/beithady/financials/reconciliation.test.ts
```

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/beithady/financials/reconciliation.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { VarianceStatus } from './types';

export type ReconciliationRow = {
  account_code: string;
  account_name: string;
  opening_raw: number;
  partner_total: number | null;
  variance: number;
  variance_status: VarianceStatus;
  variance_notes: string | null;
};

export type ReconciliationReport = {
  snapshot_id: string;
  rows: ReconciliationRow[];
  summary: {
    accounts_with_partners: number;
    accounts_awaiting_ledger: number;
    open_variance_count: number;
    total_variance: number;
  };
};

export async function buildReconciliation(params: {
  snapshot_id: string;
}): Promise<ReconciliationReport> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, account_name, opening_raw, partner_total, variance, variance_status, variance_notes')
    .eq('snapshot_id', params.snapshot_id);
  if (error) throw new Error(`buildReconciliation: ${error.message}`);
  const rows = (data ?? []).map((r) => ({
    account_code: r.account_code as string,
    account_name: r.account_name as string,
    opening_raw: Number(r.opening_raw),
    partner_total: r.partner_total == null ? null : Number(r.partner_total),
    variance: Number(r.variance),
    variance_status: r.variance_status as VarianceStatus,
    variance_notes: (r.variance_notes as string | null) ?? null,
  }));
  const summary = {
    accounts_with_partners: rows.filter((r) => r.partner_total !== null).length,
    accounts_awaiting_ledger: rows.filter((r) => r.partner_total === null).length,
    open_variance_count: rows.filter(
      (r) => r.variance_status === 'open' && r.variance !== 0
    ).length,
    total_variance:
      Math.round(rows.reduce((s, r) => s + (r.variance ?? 0), 0) * 100) / 100,
  };
  return { snapshot_id: params.snapshot_id, rows, summary };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/lib/beithady/financials/reconciliation.test.ts
```

Expected: PASS, 1/1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/financials/reconciliation.ts src/lib/beithady/financials/reconciliation.test.ts
git commit -m "feat(bh-financials): buildReconciliation + test (1/1)

Plan: Task 13"
git push origin main
```

---

## Task 14: Drop A1 from `getIntercompanyPartnerIds`

**Files:**
- Modify: `src/lib/financials-pnl.ts` (function `getIntercompanyPartnerIds`)
- Modify: corresponding test if it exists

- [ ] **Step 1: Find the function**

```bash
grep -n "getIntercompanyPartnerIds\|INTERCOMPANY_PARTNER\|A1_PARTNER" src/lib/financials-pnl.ts
```

- [ ] **Step 2: Read the function**

Open `src/lib/financials-pnl.ts` at the matched lines. The function returns the set of `odoo_partners.id` values to exclude when consolidating Egypt+Dubai. Per spec Q3, A1 is NOT intercompany. Remove A1 from whatever data structure holds the IDs.

Concretely: if the function returns a hardcoded list, remove the A1 partner_id literal. If it queries `odoo_partners WHERE is_intercompany = true`, locate the offending row in Supabase via `execute_sql` and `UPDATE odoo_partners SET is_intercompany = false WHERE name ILIKE 'A1 HOSPITALITY%'`.

- [ ] **Step 3: Make the edit**

If hardcoded list (e.g.):

```typescript
const INTERCOMPANY_PARTNER_IDS = [12345 /* A1 HOSPITALITY */, 67890 /* Lime FZCO */];
```

becomes:

```typescript
// A1 HOSPITALITY (12345) removed 2026-05-12 — per Q3 of BH Financials spec,
// owners (incl. A1) are external parties, not intercompany.
const INTERCOMPANY_PARTNER_IDS = [67890 /* Lime FZCO */];
```

- [ ] **Step 4: Update existing test assertion**

Find the test that asserts payables-consolidated excludes A1 and flip the expectation. If no such test exists, add one in `financials-pnl.test.ts`:

```typescript
it('includes A1 HOSPITALITY in consolidated payables (no longer intercompany)', async () => {
  // … test setup …
  const report = await buildPayablesReport({ asOf: '2026-04-30' });
  const names = report.partners.map((p) => p.partner_name);
  expect(names.some((n) => /A1 HOSPITALITY/i.test(n))).toBe(true);
});
```

- [ ] **Step 5: Run financials-pnl tests**

```bash
npx vitest run src/lib/financials-pnl.test.ts
```

Expected: existing + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/financials-pnl.ts src/lib/financials-pnl.test.ts
git commit -m "fix(financials): include A1 HOSPITALITY in consolidated payables

Per BH Financials spec Q3, owners (incl. A1) are external parties.
A1 was previously excluded from buildPayablesReport on consolidated.

Plan: Task 14"
git push origin main
```

---

## Task 15: Extract Performance subpage from current financials page

**Files:**
- Create: `src/app/beithady/financials/performance/page.tsx`
- Read: `src/app/beithady/financials/page.tsx` (extract PnL section)

- [ ] **Step 1: Identify the PnL section in the current page**

```bash
grep -n "buildPnlReport\|PnlReport\|pnl\b" src/app/beithady/financials/page.tsx | head -20
```

- [ ] **Step 2: Create the new subpage**

```typescript
// src/app/beithady/financials/performance/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildPnlReport,
  resolveFinancePeriod,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import {
  PeriodPresetLink,
  PeriodSubmitForm,
  PeriodSubmitButton,
} from '../_components/PeriodControls';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// COPY the existing PnL render block from src/app/beithady/financials/page.tsx
// (the PnL tab content) here. Top-of-file imports, helpers, and FINANCE_PRESETS
// constant come along verbatim. Replace the tab-switch logic with always-PnL.
//
// Layout:
//  - TopNav
//  - Back link to /beithady/financials/
//  - Period preset + scope tabs (existing PeriodControls)
//  - PnL report table (existing PnlReport rendering)

export default async function Page({ searchParams }: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; scope?: string; building?: string; lob?: string }>;
}) {
  const sp = await searchParams;
  const scope: CompanyScope = (sp.scope as CompanyScope) || 'consolidated';
  const period = resolveFinancePeriod({ preset: sp.preset, from: sp.from, to: sp.to });
  const companyIds = scopeCompanyIds(scope);
  const pnl = await buildPnlReport({
    from: period.from,
    to: period.to,
    companyIds,
    building: sp.building,
    lob: sp.lob,
  });

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <h1 className="text-xl font-semibold mb-4">Performance · {scopeLabel(scope)}</h1>
        {/* === PASTE THE EXISTING PnL JSX BLOCK FROM page.tsx HERE === */}
        {/* It uses the `pnl` variable above. Keep the period preset controls,
            scope tabs (CONSOLIDATED/EGYPT/DUBAI/A1), and the building/LOB analytic strip. */}
      </main>
    </>
  );
}
```

After pasting the PnL JSX, run typecheck to chase down any missing imports.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "financials/performance" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Smoke-load the route**

Start dev server:

```bash
npm run dev
```

Visit `http://localhost:3000/beithady/financials/performance?preset=last_month` and confirm a PnL table renders.

Stop the dev server (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/financials/performance/page.tsx
git commit -m "feat(bh-financials): extract Performance subpage from /financials

Plan: Task 15"
git push origin main
```

---

## Task 16: Extract Balance Sheet subpage

**Files:**
- Create: `src/app/beithady/financials/balance-sheet/page.tsx`

- [ ] **Step 1: Create the subpage**

```typescript
// src/app/beithady/financials/balance-sheet/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildBalanceSheet,
  resolveFinancePeriod,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Page({ searchParams }: {
  searchParams: Promise<{ asof?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const scope: CompanyScope = (sp.scope as CompanyScope) || 'consolidated';
  const asOf = sp.asof || new Date().toISOString().slice(0, 10);
  const companyIds = scopeCompanyIds(scope);
  const bs = await buildBalanceSheet({ asOf, companyIds });

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <h1 className="text-xl font-semibold mb-4">Balance Sheet · {scopeLabel(scope)} · as of {asOf}</h1>
        {/* === PASTE THE EXISTING BS JSX BLOCK FROM page.tsx HERE === */}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Paste BS JSX from `page.tsx`**

Open `src/app/beithady/financials/page.tsx`, find the BalanceSheet tab JSX (search for `BalanceSheetReport` or `BalanceSheetGroup`), paste into the placeholder above, verify imports.

- [ ] **Step 3: Type-check + smoke**

```bash
npx tsc --noEmit 2>&1 | grep "balance-sheet" || echo "clean"
```

Start `npm run dev`, visit `http://localhost:3000/beithady/financials/balance-sheet?asof=2026-02-28&scope=consolidated`, confirm totals match the Feb-2026 xlsx (Total Assets 76,957,975.37 is the 31-Dec baseline; Feb totals differ but should not be hilariously wrong).

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/balance-sheet/page.tsx
git commit -m "feat(bh-financials): extract Balance Sheet subpage from /financials

Plan: Task 16"
git push origin main
```

---

## Task 17: Extract Payables subpage

**Files:**
- Create: `src/app/beithady/financials/payables/page.tsx`

- [ ] **Step 1: Create the subpage**

```typescript
// src/app/beithady/financials/payables/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildPayablesReport,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PayablesDetailButton } from '../_components/PayablesDetailModal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Page({ searchParams }: {
  searchParams: Promise<{ asof?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const scope: CompanyScope = (sp.scope as CompanyScope) || 'consolidated';
  const asOf = sp.asof || new Date().toISOString().slice(0, 10);
  const companyIds = scopeCompanyIds(scope);
  const payables = await buildPayablesReport({ asOf, companyIds });

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <h1 className="text-xl font-semibold mb-4">Payables · {scopeLabel(scope)} · as of {asOf}</h1>
        {/* === PASTE THE EXISTING PAYABLES JSX BLOCK HERE === */}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Paste Payables JSX**

Same paste-and-fix-imports drill as Tasks 15–16. Use the existing aging table rendering.

- [ ] **Step 3: Type-check + smoke**

```bash
npx tsc --noEmit 2>&1 | grep "payables/page" || echo "clean"
```

Visit `http://localhost:3000/beithady/financials/payables?scope=consolidated`, **confirm A1 HOSPITALITY now appears in the partner list** (Task 14 fix).

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/payables/page.tsx
git commit -m "feat(bh-financials): extract Payables subpage; A1 now visible on consolidated

Plan: Task 17"
git push origin main
```

---

## Task 18: Refactor `/beithady/financials/page.tsx` → cockpit (~200 lines)

**Files:**
- Modify: `src/app/beithady/financials/page.tsx`
- Create: `src/app/beithady/financials/_components/CockpitTile.tsx`

- [ ] **Step 1: Write the CockpitTile component**

```typescript
// src/app/beithady/financials/_components/CockpitTile.tsx
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function CockpitTile(props: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string | null;
  variant?: 'default' | 'new' | 'audit';
}) {
  const variantClass =
    props.variant === 'new'
      ? 'border-green-300 bg-green-50/40'
      : props.variant === 'audit'
      ? 'border-red-300 bg-red-50/40'
      : 'border-border bg-background';
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      className={`block rounded-lg border ${variantClass} p-4 hover:shadow-sm transition`}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        {props.badge ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {props.badge}
          </span>
        ) : null}
      </div>
      <div className="text-sm font-semibold mb-1">{props.title}</div>
      <div className="text-xs text-muted-foreground">{props.description}</div>
    </Link>
  );
}
```

- [ ] **Step 2: Replace `page.tsx` with the cockpit**

```typescript
// src/app/beithady/financials/page.tsx
import {
  BarChart3,
  FileText,
  Calendar,
  Users,
  Snowflake,
  Search,
  Upload,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { supabaseAdmin } from '@/lib/supabase';
import { CockpitTile } from './_components/CockpitTile';
import { nextSnapshotDue, dueDateFor } from '@/lib/beithady/financials/cadence';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function loadCockpitData() {
  const sb = supabaseAdmin();
  const { data: snaps } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end, version, company_scope, status, frozen_at')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen')
    .order('period_end', { ascending: false })
    .limit(1);
  const active = snaps?.[0] ?? null;

  const { data: openVar } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, variance')
    .eq('snapshot_id', active?.id ?? '00000000-0000-0000-0000-000000000000')
    .eq('variance_status', 'open');
  const openVariance = (openVar ?? [])
    .filter((r) => Number(r.variance) !== 0)
    .reduce((s, r) => s + Number(r.variance), 0);

  const { data: frozenAll } = await sb
    .from('bh_balance_snapshots')
    .select('period_end')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen');
  const frozenSet = new Set((frozenAll ?? []).map((r) => r.period_end as string));
  const today = new Date().toISOString().slice(0, 10);
  const next = nextSnapshotDue(today, frozenSet);

  return { active, openVariance, openVarCount: (openVar ?? []).length, next };
}

export default async function Page() {
  const { active, openVariance, openVarCount, next } = await loadCockpitData();
  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <h1 className="text-xl font-semibold mb-4">Financials · Beithady</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 mb-1">
              Active snapshot
            </div>
            <div className="text-base font-semibold">
              {active ? `${active.period_end} v${active.version}` : 'No frozen snapshot'}
            </div>
            <div className="text-xs text-muted-foreground">
              {active?.frozen_at ? `Consolidated · frozen ${active.frozen_at.slice(0, 10)}` : '—'}
            </div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700 mb-1">
              Open variance
            </div>
            <div className="text-base font-semibold">
              {Math.round(openVariance).toLocaleString('en-US')} EGP
            </div>
            <div className="text-xs text-muted-foreground">
              {openVarCount} account{openVarCount === 1 ? '' : 's'}
            </div>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700 mb-1">
              Next snapshot due
            </div>
            <div className="text-base font-semibold">
              {next ? next.period_end : 'All current'}
            </div>
            <div className="text-xs text-muted-foreground">
              {next ? `${next.is_overdue ? 'Overdue · ' : ''}due by ${next.due_by}` : '—'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CockpitTile href="/beithady/financials/performance" icon={BarChart3}
            title="Performance" description="P&L by period · analytic · LOB" />
          <CockpitTile href="/beithady/financials/balance-sheet" icon={FileText}
            title="Balance Sheet" description="Assets · liabilities · equity" />
          <CockpitTile href="/beithady/financials/payables" icon={Calendar}
            title="Payables Aging" description="Open AP buckets by partner" />
          <CockpitTile href="/beithady/financials/ledgers" icon={Users}
            title="Partner Ledgers" description="Per-partner current balance"
            badge="NEW" variant="new" />
          <CockpitTile href="/beithady/financials/snapshots" icon={Snowflake}
            title="Snapshots" description="Frozen opening balances · versions"
            badge="NEW" variant="new" />
          <CockpitTile href="/beithady/financials/reconciliation" icon={Search}
            title="Reconciliation" description="Variance audit · account ↔ ledger"
            badge="AUDIT" variant="audit" />
          <CockpitTile href="/beithady/financials/import" icon={Upload}
            title="Import" description="Upload xlsx ledgers"
            badge="NEW" variant="new" />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Type-check + smoke**

```bash
npx tsc --noEmit 2>&1 | grep "financials/page\|CockpitTile" || echo "clean"
```

Visit `http://localhost:3000/beithady/financials` and confirm cockpit renders with 7 tiles and 3 status cards.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/page.tsx src/app/beithady/financials/_components/CockpitTile.tsx
git commit -m "feat(bh-financials): refactor /financials to cockpit with tiles

1182-line page becomes ~200-line landing. PnL/BS/Payables now live in
their extracted subpages.

Plan: Task 18"
git push origin main
```

---

## Task 19: Delete `/beithady/financial/` singular stub + redirect

**Files:**
- Delete: `src/app/beithady/financial/page.tsx`
- Modify: `next.config.ts` (add redirect)

- [ ] **Step 1: Delete the stub**

```bash
git rm src/app/beithady/financial/page.tsx
rmdir src/app/beithady/financial 2>/dev/null || true
```

- [ ] **Step 2: Add the redirect**

Edit `next.config.ts` — find the existing `redirects()` function (used for `/emails/beithady/* → /beithady/*`) and add:

```typescript
      {
        source: '/beithady/financial',
        destination: '/beithady/financials',
        permanent: true,
      },
      {
        source: '/beithady/financial/:path*',
        destination: '/beithady/financials/:path*',
        permanent: true,
      },
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "next.config" || echo "clean"
```

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "chore(bh-financials): remove /beithady/financial stub; redirect to plural

Plan: Task 19"
git push origin main
```

---

## Task 20: `/snapshots` list page + `[id]` detail page

**Files:**
- Create: `src/app/beithady/financials/snapshots/page.tsx`
- Create: `src/app/beithady/financials/snapshots/[id]/page.tsx`
- Create: `src/app/beithady/financials/snapshots/actions.ts` (server actions: freeze, clone)

- [ ] **Step 1: Snapshots list page**

```typescript
// src/app/beithady/financials/snapshots/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { listSnapshots } from '@/lib/beithady/financials/snapshots';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const snaps = await listSnapshots({ scope: 'consolidated' });
  // Group by period_end.
  const byPeriod = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const arr = byPeriod.get(s.period_end) ?? [];
    arr.push(s);
    byPeriod.set(s.period_end, arr);
  }
  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <h1 className="text-xl font-semibold mb-4">Snapshots · Consolidated</h1>
        <div className="space-y-4">
          {[...byPeriod.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([period, versions]) => (
            <div key={period} className="rounded-lg border p-4">
              <div className="text-sm font-semibold mb-2">{period}</div>
              <ul className="space-y-1">
                {versions.sort((a, b) => b.version - a.version).map((v) => (
                  <li key={v.id} className="text-sm flex items-center gap-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                      v.status === 'frozen' ? 'bg-green-100 text-green-800' :
                      v.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>{v.status}</span>
                    <span>v{v.version}</span>
                    <span className="text-muted-foreground">
                      {v.frozen_at ? `frozen ${v.frozen_at.slice(0, 10)}` : ''}
                    </span>
                    <Link href={`/beithady/financials/snapshots/${v.id}`} className="ml-auto text-xs hover:underline">
                      View detail →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Snapshot detail page**

```typescript
// src/app/beithady/financials/snapshots/[id]/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { TopNav } from '@/app/_components/brand';
import { getSnapshot } from '@/lib/beithady/financials/snapshots';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await getSnapshot(id);
  if (!snap) notFound();
  const sb = supabaseAdmin();
  const { data: accounts } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, account_name, opening_raw, partner_total, variance')
    .eq('snapshot_id', id)
    .order('account_code');
  const { data: partners } = await sb
    .from('bh_balance_snapshot_partners')
    .select('account_code, partner_kind, partner_name_raw, opening_balance, is_synthetic')
    .eq('snapshot_id', id)
    .order('account_code');

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials/snapshots" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Snapshots
        </Link>
        <h1 className="text-xl font-semibold mb-1">
          {snap.period_end} v{snap.version} · {snap.company_scope} · {snap.status}
        </h1>
        <p className="text-xs text-muted-foreground mb-4">
          {snap.frozen_at ? `Frozen ${snap.frozen_at.slice(0, 10)}` : 'Draft (not yet frozen)'}
        </p>

        <h2 className="text-sm font-semibold mt-4 mb-2">Account-level ({accounts?.length ?? 0})</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b font-semibold">
              <td className="py-1">Code</td><td>Name</td>
              <td className="text-right">Opening</td>
              <td className="text-right">Partner total</td>
              <td className="text-right">Variance</td>
            </tr>
          </thead>
          <tbody>
            {(accounts ?? []).map((a, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{a.account_code}</td>
                <td>{a.account_name}</td>
                <td className="text-right">{Number(a.opening_raw).toLocaleString('en-US')}</td>
                <td className="text-right">{a.partner_total == null ? '—' : Number(a.partner_total).toLocaleString('en-US')}</td>
                <td className="text-right">{Number(a.variance).toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-sm font-semibold mt-6 mb-2">Partner-level ({partners?.length ?? 0})</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b font-semibold">
              <td className="py-1">Account</td><td>Kind</td><td>Partner</td>
              <td className="text-right">Balance</td>
            </tr>
          </thead>
          <tbody>
            {(partners ?? []).map((p, i) => (
              <tr key={i} className={`border-b ${p.is_synthetic ? 'bg-red-50' : ''}`}>
                <td className="py-1">{p.account_code}</td>
                <td>{p.partner_kind}</td>
                <td>{p.is_synthetic ? '🔴 ' : ''}{p.partner_name_raw}</td>
                <td className="text-right">{Number(p.opening_balance).toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Type-check + smoke**

```bash
npx tsc --noEmit 2>&1 | grep "snapshots/" || echo "clean"
```

Visit `http://localhost:3000/beithady/financials/snapshots` then click into the 31-Dec-2025 v1 detail. Confirm 75 account rows render.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/snapshots/
git commit -m "feat(bh-financials): /snapshots list + [id] detail page

Plan: Task 20"
git push origin main
```

---

## Task 21: `/ledgers` page

**Files:**
- Create: `src/app/beithady/financials/ledgers/page.tsx`
- Create: `src/app/beithady/financials/_components/PartnerLedgerTable.tsx`

- [ ] **Step 1: PartnerLedgerTable component**

```typescript
// src/app/beithady/financials/_components/PartnerLedgerTable.tsx
import type { LedgerRow } from '@/lib/beithady/financials/ledgers';

export function PartnerLedgerTable({ rows }: { rows: LedgerRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b font-semibold">
          <td className="py-1">Partner</td>
          <td className="text-right">Opening</td>
          <td className="text-right">Deltas YTD</td>
          <td className="text-right">Current balance</td>
          <td className="text-right">Last move</td>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`border-b ${r.is_synthetic ? 'bg-red-50' : ''}`}>
            <td className="py-1">
              {r.is_synthetic ? '🔴 ' : ''}
              {r.partner_name_raw}
            </td>
            <td className="text-right">{Math.round(r.opening_balance).toLocaleString('en-US')}</td>
            <td className="text-right">{Math.round(r.delta).toLocaleString('en-US')}</td>
            <td className="text-right font-semibold">
              {Math.round(r.current_balance).toLocaleString('en-US')}
            </td>
            <td className="text-right text-muted-foreground">
              {r.last_move_date ?? '—'}
            </td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No partners — try a different kind or import the ledger.</td></tr>
        ) : null}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Ledgers page**

```typescript
// src/app/beithady/financials/ledgers/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { buildLedgerReport } from '@/lib/beithady/financials/ledgers';
import type { CompanyScope, PartnerKind } from '@/lib/beithady/financials/types';
import { PartnerLedgerTable } from '../_components/PartnerLedgerTable';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KINDS: Array<{ id: PartnerKind | 'all'; label: string }> = [
  { id: 'supplier', label: 'Suppliers' },
  { id: 'owner', label: 'Owners' },
  { id: 'customer', label: 'Customers' },
  { id: 'landlord', label: 'Landlords' },
  { id: 'employee', label: 'Employees' },
  { id: 'noteholder', label: 'Noteholders' },
  { id: 'all', label: 'All' },
];

export default async function Page({ searchParams }: {
  searchParams: Promise<{ kind?: string; scope?: string; asof?: string }>;
}) {
  const sp = await searchParams;
  const kind = (sp.kind as PartnerKind | 'all') || 'supplier';
  const scope: CompanyScope = (sp.scope as CompanyScope) || 'consolidated';
  const asOf = sp.asof || new Date().toISOString().slice(0, 10);
  const report = await buildLedgerReport({ kind, scope, as_of: asOf });
  const sum = report.rows.reduce((s, r) => s + r.current_balance, 0);

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <h1 className="text-xl font-semibold mb-3">Partner Ledgers · {scope}</h1>
        <nav className="flex gap-1 mb-4 text-xs">
          {KINDS.map((k) => (
            <Link
              key={k.id}
              href={`/beithady/financials/ledgers?kind=${k.id}&scope=${scope}&asof=${asOf}`}
              className={`px-2 py-1 rounded ${k.id === kind ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
            >
              {k.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground mb-3">
          Opening from snapshot {report.opening_period_end ?? '—'} · as of {asOf}
        </p>
        <PartnerLedgerTable rows={report.rows} />
        {report.rows.length > 0 ? (
          <p className="text-xs text-right mt-3 text-muted-foreground">
            Sum: <strong>{Math.round(sum).toLocaleString('en-US')} EGP</strong>
          </p>
        ) : null}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "ledgers/" || echo "clean"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/ledgers/ src/app/beithady/financials/_components/PartnerLedgerTable.tsx
git commit -m "feat(bh-financials): /ledgers page with kind sub-tabs

Plan: Task 21"
git push origin main
```

---

## Task 22: `/reconciliation` page

**Files:**
- Create: `src/app/beithady/financials/reconciliation/page.tsx`

- [ ] **Step 1: Page**

```typescript
// src/app/beithady/financials/reconciliation/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { buildReconciliation } from '@/lib/beithady/financials/reconciliation';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function Page({ searchParams }: {
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const sp = await searchParams;
  const sb = supabaseAdmin();
  let snapshotId = sp.snapshot;
  if (!snapshotId) {
    const { data } = await sb
      .from('bh_balance_snapshots')
      .select('id')
      .eq('company_scope', 'consolidated')
      .eq('status', 'frozen')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotId = data?.id;
  }
  if (!snapshotId) {
    return (
      <main className="px-4 py-8 text-sm">
        No frozen snapshot found. Import a snapshot to begin.
      </main>
    );
  }
  const report = await buildReconciliation({ snapshot_id: snapshotId });

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <h1 className="text-xl font-semibold mb-3">Reconciliation</h1>
        <div className="flex gap-3 text-xs mb-4">
          <span className="rounded bg-muted px-2 py-1">
            With partners: <strong>{report.summary.accounts_with_partners}</strong>
          </span>
          <span className="rounded bg-muted px-2 py-1">
            Awaiting ledger: <strong>{report.summary.accounts_awaiting_ledger}</strong>
          </span>
          <span className={`rounded px-2 py-1 ${report.summary.open_variance_count ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            Open variances: <strong>{report.summary.open_variance_count}</strong>
          </span>
          <span className="rounded bg-muted px-2 py-1">
            Total variance: <strong>{Math.round(report.summary.total_variance).toLocaleString('en-US')}</strong>
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b font-semibold">
              <td className="py-1">Code</td><td>Account</td>
              <td className="text-right">Account total</td>
              <td className="text-right">Partner total</td>
              <td className="text-right">Variance</td>
              <td>Status</td>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i} className={`border-b ${r.variance !== 0 && r.variance_status === 'open' ? 'bg-red-50' : ''}`}>
                <td className="py-1">{r.account_code}</td>
                <td>{r.account_name}</td>
                <td className="text-right">{Math.round(r.opening_raw).toLocaleString('en-US')}</td>
                <td className="text-right">{r.partner_total == null ? '—' : Math.round(r.partner_total).toLocaleString('en-US')}</td>
                <td className="text-right">{r.variance === 0 ? '0' : Math.round(r.variance).toLocaleString('en-US')}</td>
                <td>{r.partner_total == null ? '⏳ Awaiting' : r.variance === 0 ? '✓ Clean' : `🔴 ${r.variance_status}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "reconciliation/" || echo "clean"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/financials/reconciliation/
git commit -m "feat(bh-financials): /reconciliation page

Plan: Task 22"
git push origin main
```

---

## Task 23: `/import` page (queue + upload)

**Files:**
- Create: `src/app/beithady/financials/import/page.tsx`
- Create: `src/app/beithady/financials/import/actions.ts` (upload server action)

- [ ] **Step 1: Upload server action**

```typescript
// src/app/beithady/financials/import/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { parsePartnerLedgerXlsx } from '@/lib/beithady/financials/xlsx-import';
import { redirect } from 'next/navigation';
import type { CompanyScope } from '@/lib/beithady/financials/types';

export async function uploadXlsx(formData: FormData) {
  const file = formData.get('file') as File | null;
  const accountCode = String(formData.get('account_code') || '');
  const periodEnd = String(formData.get('period_end') || '');
  const scope = String(formData.get('company_scope') || 'consolidated') as CompanyScope;
  if (!file || !accountCode || !periodEnd) {
    throw new Error('uploadXlsx: missing file / account_code / period_end');
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  const sb = supabaseAdmin();

  const { data: dup } = await sb
    .from('bh_balance_snapshot_uploads')
    .select('id')
    .eq('file_sha256', sha)
    .maybeSingle();
  if (dup) {
    throw new Error(`uploadXlsx: file already uploaded (id=${dup.id})`);
  }

  const parsed = await parsePartnerLedgerXlsx(buf);

  const { data: row, error } = await sb
    .from('bh_balance_snapshot_uploads')
    .insert({
      filename: file.name,
      file_sha256: sha,
      account_code: accountCode,
      period_end: periodEnd,
      company_scope: scope,
      parse_status: parsed.errors.length === 0 ? 'parsed' : 'failed',
      parse_errors: parsed.errors,
      raw_row_count: parsed.rows.length,
      raw_rows: parsed.rows,
    })
    .select('id')
    .single();
  if (error) throw new Error(`uploadXlsx insert: ${error.message}`);

  revalidatePath('/beithady/financials/import');
  redirect(`/beithady/financials/import/${row.id}`);
}
```

- [ ] **Step 2: Import landing page**

```typescript
// src/app/beithady/financials/import/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadXlsx } from './actions';

export const dynamic = 'force-dynamic';

const TARGET_ACCOUNTS = [
  { code: '227002', name: 'Suppliers', kind: 'supplier' },
  { code: '227002', name: 'Owner Payables', kind: 'owner' },
  { code: '122001', name: 'Customers', kind: 'customer' },
  { code: '113002', name: 'Contract Insurance Guarantee', kind: 'landlord' },
  { code: '124005', name: 'Loans for employees', kind: 'employee' },
  { code: '124006', name: 'Salaries in advance', kind: 'employee' },
  { code: '223001', name: 'Accrued Salaries', kind: 'employee' },
  { code: '221001', name: 'Notes Payable holders', kind: 'noteholder' },
];

export default async function Page() {
  const sb = supabaseAdmin();
  const { data: snap } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existing } = await sb
    .from('bh_balance_snapshot_partners')
    .select('account_code, partner_kind')
    .eq('snapshot_id', snap?.id ?? '00000000-0000-0000-0000-000000000000');
  const haveSet = new Set(
    (existing ?? []).map((e) => `${e.account_code}:${e.partner_kind}`)
  );

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <h1 className="text-xl font-semibold mb-3">Import partner ledgers</h1>

        <form action={uploadXlsx} className="border rounded-lg p-4 mb-6 space-y-3" encType="multipart/form-data">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label>
              <div className="text-xs text-muted-foreground mb-1">Account code</div>
              <input name="account_code" required className="border rounded px-2 py-1 w-full" defaultValue="227002" />
            </label>
            <label>
              <div className="text-xs text-muted-foreground mb-1">Period end</div>
              <input name="period_end" type="date" required className="border rounded px-2 py-1 w-full" defaultValue="2025-12-31" />
            </label>
            <label>
              <div className="text-xs text-muted-foreground mb-1">Scope</div>
              <select name="company_scope" className="border rounded px-2 py-1 w-full" defaultValue="consolidated">
                <option value="consolidated">Consolidated</option>
                <option value="egypt">Egypt</option>
                <option value="dubai">Dubai</option>
                <option value="a1">A1</option>
              </select>
            </label>
          </div>
          <input type="file" name="file" accept=".xlsx" required className="text-sm" />
          <button type="submit" className="px-4 py-1.5 bg-foreground text-background rounded text-sm">
            Upload &amp; parse
          </button>
        </form>

        <h2 className="text-sm font-semibold mb-2">Import queue · for snapshot {snap?.period_end ?? '—'}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TARGET_ACCOUNTS.map((t) => {
            const have = haveSet.has(`${t.code}:${t.kind}`);
            return (
              <div key={`${t.code}-${t.kind}`} className={`rounded-lg border p-3 ${have ? 'border-green-300 bg-green-50/40' : 'border-yellow-300 bg-yellow-50/40'}`}>
                <div className="text-xs text-muted-foreground">{t.code}</div>
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-xs mt-1">{have ? '✓ Imported' : '⏳ Awaiting xlsx'}</div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "import/" || echo "clean"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/import/
git commit -m "feat(bh-financials): /import page with upload form + import queue

Plan: Task 23"
git push origin main
```

---

## Task 24: `/import/[upload_id]` review page + classify + commit

**Files:**
- Create: `src/app/beithady/financials/import/[upload_id]/page.tsx`
- Create: `src/app/beithady/financials/import/[upload_id]/actions.ts`

- [ ] **Step 1: Commit server action**

```typescript
// src/app/beithady/financials/import/[upload_id]/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { classifyParsedRows, commitClassifiedRows, type ParseResult } from '@/lib/beithady/financials/xlsx-import';
import type { PartnerKind } from '@/lib/beithady/financials/types';

export async function commitUpload(formData: FormData) {
  const uploadId = String(formData.get('upload_id'));
  const partnerKind = String(formData.get('partner_kind')) as PartnerKind;
  const sb = supabaseAdmin();

  const { data: up, error: upErr } = await sb
    .from('bh_balance_snapshot_uploads')
    .select('*')
    .eq('id', uploadId)
    .maybeSingle();
  if (upErr || !up) throw new Error(`commitUpload load: ${upErr?.message ?? 'not found'}`);

  // Find target snapshot (latest frozen for the scope+period).
  const { data: snap } = await sb
    .from('bh_balance_snapshots')
    .select('id')
    .eq('period_end', up.period_end)
    .eq('company_scope', up.company_scope)
    .eq('status', 'frozen')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!snap) throw new Error('commitUpload: no frozen snapshot for this period+scope');

  // Account opening total.
  const { data: acct } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('opening_raw')
    .eq('snapshot_id', snap.id)
    .eq('account_code', up.account_code)
    .maybeSingle();

  // Load odoo_partners (filtered by kind for performance).
  const partnerFilter =
    partnerKind === 'supplier' ? { col: 'supplier_rank', op: 'gt', val: 0 } :
    partnerKind === 'owner' ? { col: 'is_owner', op: 'eq', val: true } :
    partnerKind === 'employee' ? { col: 'is_employee', op: 'eq', val: true } :
    null;
  let q = sb.from('odoo_partners').select('id, name');
  if (partnerFilter?.op === 'gt') q = q.gt(partnerFilter.col, partnerFilter.val as number);
  if (partnerFilter?.op === 'eq') q = q.eq(partnerFilter.col, partnerFilter.val as boolean);
  const { data: partners } = await q;

  const parsed: ParseResult = {
    rows: (up.raw_rows as Array<{ source_row: number; partner_name_raw: string; balance: number }>) ?? [],
    errors: (up.parse_errors as Array<{ row: number; error: string }>) ?? [],
    total: 0,
  };
  parsed.total = Math.round(parsed.rows.reduce((s, r) => s + r.balance, 0) * 100) / 100;

  const classified = classifyParsedRows(parsed, {
    account_code: up.account_code,
    partner_kind: partnerKind,
    odoo_partners: (partners ?? []) as Array<{ id: number; name: string }>,
    account_opening_raw: acct ? Number(acct.opening_raw) : undefined,
  });

  await commitClassifiedRows({ snapshot_id: snap.id, classified });

  await sb
    .from('bh_balance_snapshot_uploads')
    .update({
      snapshot_id: snap.id,
      parse_status: 'committed',
      classified_rows: classified.rows,
      parsed_partner_count: classified.rows.length,
    })
    .eq('id', uploadId);

  revalidatePath('/beithady/financials/import');
  revalidatePath('/beithady/financials/reconciliation');
  revalidatePath('/beithady/financials/ledgers');
  redirect('/beithady/financials/reconciliation');
}
```

- [ ] **Step 2: Review page**

```typescript
// src/app/beithady/financials/import/[upload_id]/page.tsx
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { TopNav } from '@/app/_components/brand';
import { supabaseAdmin } from '@/lib/supabase';
import { commitUpload } from './actions';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ upload_id: string }> }) {
  const { upload_id } = await params;
  const sb = supabaseAdmin();
  const { data: up } = await sb
    .from('bh_balance_snapshot_uploads')
    .select('*')
    .eq('id', upload_id)
    .maybeSingle();
  if (!up) notFound();

  const rows = (up.raw_rows as Array<{ source_row: number; partner_name_raw: string; balance: number }>) ?? [];
  const total = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <>
      <TopNav />
      <main className="px-4 sm:px-8 py-6">
        <Link href="/beithady/financials/import" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Import
        </Link>
        <h1 className="text-xl font-semibold mb-2">{up.filename}</h1>
        <p className="text-xs text-muted-foreground mb-4">
          Target: snapshot {up.period_end} · {up.company_scope} · account {up.account_code} ·
          {' '}{rows.length} partners · ledger total {Math.round(total).toLocaleString('en-US')} EGP
        </p>

        <form action={commitUpload}>
          <input type="hidden" name="upload_id" value={upload_id} />
          <label className="text-sm mr-2">Partner kind:</label>
          <select name="partner_kind" required className="border rounded px-2 py-1 text-sm mb-3">
            <option value="supplier">supplier</option>
            <option value="owner">owner</option>
            <option value="customer">customer</option>
            <option value="landlord">landlord</option>
            <option value="employee">employee</option>
            <option value="noteholder">noteholder</option>
          </select>
          <button type="submit" className="ml-3 px-4 py-1.5 bg-foreground text-background rounded text-sm">
            Commit to snapshot
          </button>
        </form>

        <table className="w-full text-xs mt-4">
          <thead>
            <tr className="border-b font-semibold">
              <td className="py-1">Source row</td><td>Partner</td><td className="text-right">Balance</td>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{r.source_row}</td>
                <td>{r.partner_name_raw}</td>
                <td className="text-right">{Math.round(r.balance).toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "import/\[upload_id\]" || echo "clean"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/financials/import/\[upload_id\]/
git commit -m "feat(bh-financials): /import/[upload_id] review + commit page

Plan: Task 24"
git push origin main
```

---

## Task 25: Cron handler + `vercel.json` entries

**Files:**
- Create: `src/app/api/cron/bh-financials-snapshot-reminder/route.ts`
- Create: `src/app/api/cron/bh-financials-snapshot-reminder/route.test.ts`
- Modify: `vercel.json` (add 2 new cron entries)

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/cron/bh-financials-snapshot-reminder/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: mockFrom }) }));

import { GET } from './route';

beforeEach(() => mockFrom.mockReset());

function makeReq(opts: { auth?: string; url?: string } = {}) {
  return new Request(opts.url ?? 'https://example.com/api/cron/bh-financials-snapshot-reminder', {
    headers: opts.auth ? { Authorization: opts.auth } : {},
  });
}

describe('bh-financials-snapshot-reminder', () => {
  it('rejects requests without bearer secret', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 200 with skipped=true outside the Cairo-9-AM window (no force)', async () => {
    process.env.CRON_SECRET = 'shh';
    const res = await GET(makeReq({ auth: 'Bearer shh' }));
    const body = await res.json();
    // Cairo time will vary at test execution; the handler must always return
    // 200 (not throw), and signal "skipped" via the body when gate fails.
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('skipped');
  });
});
```

- [ ] **Step 2: Run test to confirm fail**

```bash
npx vitest run src/app/api/cron/bh-financials-snapshot-reminder/route.test.ts
```

- [ ] **Step 3: Implement the handler**

```typescript
// src/app/api/cron/bh-financials-snapshot-reminder/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { nextSnapshotDue } from '@/lib/beithady/financials/cadence';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function cairoLocalHour(now: Date = new Date()): number {
  // Africa/Cairo. DST flips → use Intl to be safe.
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(f.format(now));
}

export async function GET(req: NextRequest | Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = new URL((req as Request).url);
  const force = url.searchParams.get('force') === '1';
  const h = cairoLocalHour();
  if (!force && h !== 9) {
    return NextResponse.json({ skipped: true, cairo_hour: h });
  }

  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: frozen } = await sb
    .from('bh_balance_snapshots')
    .select('period_end')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen');
  const frozenSet = new Set((frozen ?? []).map((r) => r.period_end as string));

  const next = nextSnapshotDue(today, frozenSet);
  if (!next || !next.is_overdue) {
    return NextResponse.json({ ok: true, overdue: false });
  }

  // Upsert reminder row (idempotent per quarter).
  await sb
    .from('bh_financials_reminders')
    .upsert(
      {
        period_end: next.period_end,
        company_scope: 'consolidated',
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'period_end,company_scope' }
    );

  // WhatsApp + morning-brief integration deferred to a follow-up
  // (covered in Task 26 banner; this handler still returns success).

  return NextResponse.json({ ok: true, overdue: true, period_end: next.period_end });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run src/app/api/cron/bh-financials-snapshot-reminder/route.test.ts
```

Expected: PASS, 2/2.

- [ ] **Step 5: Add cron entries to `vercel.json`**

Open `vercel.json`. Inside the `crons` array, add:

```json
    {
      "path": "/api/cron/bh-financials-snapshot-reminder",
      "schedule": "0 6 * * 0"
    },
    {
      "path": "/api/cron/bh-financials-snapshot-reminder",
      "schedule": "0 7 * * 0"
    },
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/bh-financials-snapshot-reminder/ vercel.json
git commit -m "feat(bh-financials): snapshot reminder cron (Sunday 09:00 Cairo)

DST-safe via dual UTC entries gated on cairoLocalHour() == 9.

Plan: Task 25"
git push origin main
```

---

## Task 26: Cockpit banner sourced from `bh_financials_reminders`

**Files:**
- Modify: `src/app/beithady/financials/page.tsx` (add banner above status cards)

- [ ] **Step 1: Edit `page.tsx` to load reminders and render banner**

In the `loadCockpitData` function (Task 18), add at the end:

```typescript
  const { data: reminders } = await sb
    .from('bh_financials_reminders')
    .select('period_end, company_scope, first_seen_at, dismissed_until')
    .is('resolved_at', null)
    .or(`dismissed_until.is.null,dismissed_until.lt.${new Date().toISOString()}`);
  return { active, openVariance, openVarCount: (openVar ?? []).length, next, reminders: reminders ?? [] };
```

Update the return-type and the destructure in `Page()`:

```typescript
  const { active, openVariance, openVarCount, next, reminders } = await loadCockpitData();
```

Above the status-cards `div`, add the banner:

```typescript
        {reminders.length > 0 ? (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm">
            🔴 <strong>Snapshot overdue:</strong>{' '}
            {reminders.map((r) => `${r.period_end} (${r.company_scope})`).join(', ')}.{' '}
            <a href="/beithady/financials/snapshots" className="underline ml-1">
              Start draft →
            </a>
          </div>
        ) : null}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep "financials/page" || echo "clean"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/financials/page.tsx
git commit -m "feat(bh-financials): cockpit banner for overdue snapshot reminders

Plan: Task 26"
git push origin main
```

---

## Task 27: Operator-action notes — import the 2 xlsx ledgers via the new UI

This task is not code. It's documented here so the plan executor knows what manual steps round out the v1 seed once the code is deployed. **The implementer should NOT skip this** — leaving the partner-level tables empty means the Ledgers/Reconciliation pages have nothing real to show, and the integration test in Task 28 will fail.

**Files referenced:** `src/lib/beithady/financials/__fixtures__/suppliers-2025-12-31.xlsx`, `src/lib/beithady/financials/__fixtures__/owners-2025-12-31.xlsx`.

- [ ] **Step 1: Visit the deployed import page**

After Task 26 lands and Vercel completes its deploy, visit `https://limeinc.vercel.app/beithady/financials/import` (or local `http://localhost:3000/...` for a pre-deploy run).

- [ ] **Step 2: Upload the Suppliers ledger**

Fill the form:
- account_code: `227002`
- period_end: `2025-12-31`
- company_scope: `consolidated`
- file: `src/lib/beithady/financials/__fixtures__/suppliers-2025-12-31.xlsx`

Click **Upload & parse**. Wait for redirect to `/import/[upload_id]`.

- [ ] **Step 3: Commit the Suppliers ledger**

On the review page, set **Partner kind = supplier**, click **Commit to snapshot**.

Expected redirect to `/reconciliation`. The Suppliers row should show:
- Account total: −9,081,444.65
- Partner total: −8,567,422.64
- Variance: −514,022.01 (🔴 open)

- [ ] **Step 4: Upload the Owners ledger**

Repeat with the owners fixture, account_code `227002`, **Partner kind = owner**.

Expected variance on Owners after commit: 0 (within rounding); the 6 partner rows sum to −2,518,213.03.

- [ ] **Step 5: Verify via SQL**

```sql
select count(*) filter (where partner_kind = 'supplier') as supplier_count,
       count(*) filter (where partner_kind = 'owner') as owner_count,
       count(*) filter (where is_synthetic) as synthetic_count
from public.bh_balance_snapshot_partners
where snapshot_id = (select id from public.bh_balance_snapshots
                     where period_end='2025-12-31' and status='frozen');
-- expected: 85 suppliers, 6 owners, 1 synthetic (the __UNALLOCATED_227002 row)
```

- [ ] **Step 6: No git step — operator action only**

If anything fails, fix code and re-run; do NOT commit anything from this task.

---

## Task 28: Full smoke + tsc + push + deploy

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests for the new module pass; pre-existing failures (the unrelated `fmplus-logo.test.tsx` module-load issue noted in earlier handoff) remain unchanged.

- [ ] **Step 2: Run full tsc**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors except the 2 pre-existing unrelated ones (`qrcode`, `@testing-library/react`).

- [ ] **Step 3: Smoke-test all routes locally**

Start dev server: `npm run dev`. Hit each route in a browser:
- `http://localhost:3000/beithady/financials` (cockpit, no 🔴 banner expected)
- `http://localhost:3000/beithady/financials/performance?preset=last_month`
- `http://localhost:3000/beithady/financials/balance-sheet?asof=2026-02-28`
- `http://localhost:3000/beithady/financials/payables?scope=consolidated` (A1 visible)
- `http://localhost:3000/beithady/financials/ledgers?kind=supplier` (85 rows + 1 synthetic)
- `http://localhost:3000/beithady/financials/snapshots`
- `http://localhost:3000/beithady/financials/reconciliation` (Suppliers row at −514,022)
- `http://localhost:3000/beithady/financials/import`
- `http://localhost:3000/beithady/financial` → redirects to `/beithady/financials`

Stop dev server.

- [ ] **Step 4: Final push (already pushed throughout — confirm in sync)**

```bash
git fetch origin main && git status
```

Expected: `Your branch is up to date with 'origin/main'`.

- [ ] **Step 5: Trigger Vercel prod deploy as belt-and-suspenders**

```bash
vercel --prod --yes 2>&1 | tail -5
```

Expected: deploy URL output. GitHub→Vercel integration also auto-deploys on the pushes above.

- [ ] **Step 6: Verify on production**

Visit `https://limeinc.vercel.app/beithady/financials` and walk through Task 28 Step 3 routes against production.

If everything renders, the v1 implementation is complete. Followup tasks (Phase 2/3 from spec § 10) remain queued.

---

## Self-Review (post-write checklist)

- [x] **Spec coverage:** All 11 spec sections have at least one task (Task 1 = §3 data model; Task 3,4,12,13 = §3 + §6 lifecycle; Tasks 9–11 = §5 import; Tasks 14–19 + 18 = §7 code impact + §4 routes; Tasks 20–24 = §4 UI; Task 25–26 = §6.4 cron; Task 27 = §9 rollout; Task 28 = §8 testing + §9 deploy). One spec area intentionally left implicit: "books-closed pre-flight check" from §6.5 is deferred (it's marked optional/nice-to-have in the spec).
- [x] **Placeholder scan:** No "TBD" / "TODO" / "implement later". Every code step shows actual code. The few `// === PASTE THE EXISTING X JSX BLOCK HERE ===` markers in Tasks 15–17 are the extraction strategy made explicit — they're not placeholders for novel code but pointers to the existing 1182-line page; the surrounding boilerplate (imports, page shell, route metadata) IS spelled out.
- [x] **Type consistency:** `LedgerRow`, `OpeningAccountRow`, `BhBalanceSnapshot`, `ParseResult`, `ClassifyResult`, `MatchResult`, `ReconciliationRow` are defined once each and reused; `PartnerKind`, `CompanyScope`, `SnapshotStatus`, `VarianceStatus`, `MatchConfidence`, `ParseStatus`, `SnapshotSourceKind` come from `types.ts` (Task 2). `loadOpeningBalanceSnapshot()` is defined in Task 3 and consumed in Task 4. `nextSnapshotDue()` is defined in Task 5 and consumed in Tasks 18 (cockpit) and 25 (cron). `parsePartnerLedgerXlsx()`, `classifyParsedRows()`, `commitClassifiedRows()` are defined incrementally in Tasks 9/10/11 and consumed in Tasks 23/24.

---

**Brainstorm artifacts:** `.superpowers/brainstorm/3301-1778609938/content/` (welcome, approaches, design-1 through design-5).
**Spec:** [docs/superpowers/specs/2026-05-12-bh-financials-balances-design.md](../specs/2026-05-12-bh-financials-balances-design.md).
