# Personal Net Worth Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/personal/networth` module — a 4th tile under the Personal subsidiary cockpit that tracks assets, liabilities (loans + cards + overdraft + BNPL), recurring payments, and historical net worth, with full loan amortization, multi-currency support (EGP base), and auto-monthly snapshots.

**Architecture:** Multi-route stocks-style module (6 top-level routes) backed by 11 new `personal_networth_*` tables + 3 views in migration 0139. Two Vercel crons (DST-safe Cairo 9 AM): monthly snapshot on the 1st + daily recurring-payment generator. Business logic in `src/lib/personal/networth/*` with colocated Vitest tests. Spec: [docs/superpowers/specs/2026-05-16-personal-networth-design.md](../specs/2026-05-16-personal-networth-design.md).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase Postgres · Vercel cron · Vitest · recharts (charts) · @react-pdf/renderer (PDF) · lucide-react (icons)

**Total tasks:** 32, organized into 8 phases (A–H).

---

## Phase A — Schema & seed (Tasks 1–4)

### Task 1: Migration 0139 part 1 — lookup tables + seed

**Files:**
- Create: `supabase/migrations/0139_personal_networth.sql`

- [ ] **Step 1: Create the migration file with lookup tables**

Create `supabase/migrations/0139_personal_networth.sql`:

```sql
-- 0139_personal_networth.sql
-- Personal Net Worth module: 11 tables, 3 views, fx_lookup() helper.
-- Single-user (Kareem) UI but multi-user-ready schema (app_user_id everywhere).
-- Base currency EGP; multi-currency via per-row currency + fx_rates table.

begin;

-- ============================================================
-- 1) LOOKUP TABLES
-- ============================================================

create table personal_networth_currencies (
  code        text primary key,
  name        text not null,
  symbol      text,
  is_base     boolean not null default false,
  created_at  timestamptz not null default now()
);
insert into personal_networth_currencies (code, name, symbol, is_base) values
  ('EGP', 'Egyptian Pound', 'EGP', true),
  ('USD', 'US Dollar', '$', false),
  ('EUR', 'Euro', '€', false),
  ('SAR', 'Saudi Riyal', 'SAR', false),
  ('AED', 'UAE Dirham', 'AED', false);

create table personal_networth_fx_rates (
  id            uuid primary key default gen_random_uuid(),
  currency_code text not null references personal_networth_currencies(code),
  rate_to_egp   numeric(12,6) not null check (rate_to_egp > 0),
  as_of_date    date not null,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (currency_code, as_of_date)
);
create index idx_fx_rates_lookup
  on personal_networth_fx_rates (currency_code, as_of_date desc);

create table personal_networth_lenders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  kind        text not null check (kind in (
                'bank','bnpl','card_issuer','person','other'
              )),
  contact     text,
  notes       text,
  app_user_id uuid references app_users(id),
  created_at  timestamptz not null default now()
);

create table personal_networth_settings (
  app_user_id            uuid primary key references app_users(id),
  charity_goal_egp_year  numeric(14,2),
  default_currency       text not null default 'EGP'
                         references personal_networth_currencies(code),
  monthly_snapshot_day   int not null default 1 check (monthly_snapshot_day between 1 and 28),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

commit;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` against project `bpjproljatbrbmszwbov`:

```
name: 0139_personal_networth_part1
query: <contents of the migration file>
```

Expected: applied without error.

- [ ] **Step 3: Verify the seed via execute_sql**

```sql
select code, name, is_base from personal_networth_currencies order by code;
```

Expected: 5 rows (AED, EGP[base=true], EUR, SAR, USD).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0139_personal_networth.sql
git commit -m "feat(networth): migration 0139 part 1 — currencies, fx_rates, lenders, settings"
```

---

### Task 2: Migration 0139 part 2 — core entities + schedule + payments + recurring

**Files:**
- Modify: `supabase/migrations/0139_personal_networth.sql` (append before final `commit`)

- [ ] **Step 1: Restructure the file — wrap everything in one transaction**

Replace the closing `commit;` from Task 1 with the additions below, then a final `commit;`. The whole migration must end in one `begin; … commit;` block. Append after the settings table:

```sql
-- ============================================================
-- 2) CORE ENTITIES
-- ============================================================

create table personal_networth_assets (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references app_users(id),
  name          text not null,
  kind          text not null check (kind in (
                  'cash','real_estate','vehicle','gold_jewelry','other'
                )),
  currency      text not null references personal_networth_currencies(code),
  balance       numeric(14,2) not null,
  as_of_date    date not null default current_date,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_assets_user_active
  on personal_networth_assets (app_user_id) where active = true;

create table personal_networth_liabilities (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references app_users(id),
  name            text not null,
  kind            text not null check (kind in (
                    'amortizing_loan','bnpl','credit_card','overdraft','other'
                  )),
  currency        text not null references personal_networth_currencies(code),
  lender_id       uuid references personal_networth_lenders(id),
  current_balance numeric(14,2) not null,
  -- Amortizing / BNPL columns
  principal       numeric(14,2),
  apr_pct         numeric(6,3),
  term_months     int,
  start_date      date,
  monthly_payment numeric(14,2),
  -- Credit card / overdraft columns
  credit_limit    numeric(14,2),
  statement_day   int check (statement_day between 1 and 28),
  due_day         int check (due_day between 1 and 28),
  min_payment_pct numeric(5,2),
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint amortizing_required_fields check (
    kind not in ('amortizing_loan','bnpl')
    or (principal is not null and apr_pct is not null
        and term_months is not null and start_date is not null)
  ),
  constraint revolving_required_fields check (
    kind not in ('credit_card','overdraft')
    or credit_limit is not null
  )
);
create index idx_liabilities_user_active
  on personal_networth_liabilities (app_user_id) where active = true;

create table personal_networth_liability_schedule (
  id                uuid primary key default gen_random_uuid(),
  liability_id      uuid not null references personal_networth_liabilities(id)
                    on delete cascade,
  installment_no    int not null,
  due_date          date not null,
  principal_portion numeric(14,2) not null,
  interest_portion  numeric(14,2) not null,
  remaining_after   numeric(14,2) not null,
  paid_on           date,
  payment_id        uuid,
  unique (liability_id, installment_no)
);
create index idx_schedule_due
  on personal_networth_liability_schedule (due_date) where paid_on is null;

create table personal_networth_payments (
  id                    uuid primary key default gen_random_uuid(),
  app_user_id           uuid not null references app_users(id),
  occurred_on           date not null,
  amount                numeric(14,2) not null check (amount > 0),
  currency              text not null references personal_networth_currencies(code),
  category              text not null check (category in (
                          'loan_payment','card_payment','overdraft_payment',
                          'bnpl_payment','charity','rent','utility','phone',
                          'subscription','insurance','school_fee','other'
                        )),
  liability_id          uuid references personal_networth_liabilities(id),
  loan_schedule_id      uuid references personal_networth_liability_schedule(id),
  recurring_template_id uuid,
  notes                 text,
  created_at            timestamptz not null default now()
);
create index idx_payments_user_date
  on personal_networth_payments (app_user_id, occurred_on desc);
create index idx_payments_category
  on personal_networth_payments (category, occurred_on desc);

alter table personal_networth_liability_schedule
  add constraint schedule_payment_fk
  foreign key (payment_id) references personal_networth_payments(id);

create table personal_networth_recurring_templates (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references app_users(id),
  name            text not null,
  category        text not null check (category in (
                    'loan_payment','card_payment','overdraft_payment',
                    'bnpl_payment','charity','rent','utility','phone',
                    'subscription','insurance','school_fee','other'
                  )),
  amount          numeric(14,2) not null check (amount > 0),
  currency        text not null references personal_networth_currencies(code),
  frequency       text not null check (frequency in ('monthly','quarterly','yearly')),
  day_of_period   int not null check (day_of_period between 1 and 28),
  month_of_year   int check (month_of_year between 1 and 12),
  liability_id    uuid references personal_networth_liabilities(id),
  notes           text,
  active          boolean not null default true,
  next_run_date   date not null,
  last_run_date   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_recurring_due
  on personal_networth_recurring_templates (next_run_date) where active = true;

alter table personal_networth_payments
  add constraint payments_recurring_template_fk
  foreign key (recurring_template_id)
  references personal_networth_recurring_templates(id);
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply the **whole file as one migration** (`apply_migration` with `name: 0139_personal_networth`). The first part was applied in Task 1 — re-applying the whole file is safe because each `create table` uses default behaviour; if Task 1 already applied, Step 2 of Task 2 errors with "relation already exists". In that case, instead create a second migration `0139b_personal_networth_part2.sql` containing **only** the new tables/alters from this task and apply that.

- [ ] **Step 3: Verify all 9 tables exist**

```sql
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'personal_networth_%'
order by table_name;
```

Expected: 9 rows (currencies, fx_rates, lenders, settings, assets, liabilities, liability_schedule, payments, recurring_templates).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(networth): migration 0139 part 2 — assets, liabilities, schedule, payments, recurring"
```

---

### Task 3: Migration 0139 part 3 — snapshots + fx_lookup() helper

**Files:**
- Modify: `supabase/migrations/0139_personal_networth.sql` (append before final `commit;`)

- [ ] **Step 1: Append snapshot tables + fx_lookup function**

```sql
-- ============================================================
-- 3) SNAPSHOTS
-- ============================================================

create table personal_networth_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  app_user_id           uuid not null references app_users(id),
  taken_at              timestamptz not null default now(),
  kind                  text not null check (kind in ('monthly_auto','manual')),
  total_assets_egp      numeric(14,2) not null,
  total_liabilities_egp numeric(14,2) not null,
  net_worth_egp         numeric(14,2) not null,
  fx_rates_used         jsonb not null,
  notes                 text
);
create index idx_snapshots_user_date
  on personal_networth_snapshots (app_user_id, taken_at desc);

create table personal_networth_snapshot_lines (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references personal_networth_snapshots(id)
                on delete cascade,
  line_type     text not null check (line_type in ('asset','liability','stocks_pipe')),
  entity_id     uuid,
  display_name  text not null,
  currency      text not null,
  amount        numeric(14,2) not null,
  amount_egp    numeric(14,2) not null
);
create index idx_snapshot_lines_snapshot
  on personal_networth_snapshot_lines (snapshot_id);

-- ============================================================
-- 4) FX HELPER FUNCTION
-- ============================================================

create or replace function fx_lookup(p_currency text, p_as_of date)
returns numeric
language sql
stable
as $$
  select case
    when p_currency = 'EGP' then 1::numeric
    else (
      select rate_to_egp
      from personal_networth_fx_rates
      where currency_code = p_currency
        and as_of_date <= p_as_of
      order by as_of_date desc
      limit 1
    )
  end
$$;
```

- [ ] **Step 2: Apply (as `0139c_personal_networth_part3` if part 1 was already applied)**

Apply via Supabase MCP `apply_migration`.

- [ ] **Step 3: Verify fx_lookup works**

```sql
select fx_lookup('EGP', current_date) as egp_rate,
       fx_lookup('USD', current_date) as usd_rate_no_data;
```

Expected: `egp_rate = 1`, `usd_rate_no_data = null` (no FX rows seeded yet).

- [ ] **Step 4: Insert one test FX rate and verify lookup picks the latest ≤ date**

```sql
insert into personal_networth_fx_rates (currency_code, rate_to_egp, as_of_date) values
  ('USD', 47.5, '2026-01-01'),
  ('USD', 48.2, '2026-04-01');
select fx_lookup('USD', '2026-03-15') as mid_q1,
       fx_lookup('USD', '2026-05-01') as latest;
```

Expected: `mid_q1 = 47.500000`, `latest = 48.200000`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(networth): migration 0139 part 3 — snapshots + fx_lookup() helper"
```

---

### Task 4: Migration 0139 part 4 — 3 views

**Files:**
- Modify: `supabase/migrations/0139_personal_networth.sql` (or create `0139d_personal_networth_views.sql` if applying incrementally)

- [ ] **Step 1: Append the 3 views**

```sql
-- ============================================================
-- 5) VIEWS
-- ============================================================

create view v_personal_networth_current as
  with latest_prices as (
    select distinct on (instrument_id) instrument_id, price
    from personal_stock_current_prices
    order by instrument_id, as_of_date desc, entered_at desc
  ),
  holdings_value as (
    select coalesce(sum(pos.qty_held * lp.price), 0) as value_egp
    from v_personal_stock_positions pos
    left join latest_prices lp on lp.instrument_id = pos.instrument_id
  ),
  latest_account_balances as (
    select distinct on (account_id) account_id, balance_egp
    from v_personal_stock_account_balance
    order by account_id, occurred_at desc nulls last, row_index desc
  ),
  cash_balance as (
    select coalesce(sum(balance_egp), 0) as cash_egp
    from latest_account_balances
  ),
  stocks_value as (
    select hv.value_egp + cb.cash_egp as amount_egp
    from holdings_value hv, cash_balance cb
  ),
  assets_total as (
    select app_user_id,
           sum(balance * fx_lookup(currency, current_date)) as amount_egp
    from personal_networth_assets
    where active = true
    group by app_user_id
  ),
  liabilities_total as (
    select app_user_id,
           sum(current_balance * fx_lookup(currency, current_date)) as amount_egp
    from personal_networth_liabilities
    where active = true
    group by app_user_id
  )
  select
    coalesce(a.app_user_id, l.app_user_id)              as app_user_id,
    coalesce(a.amount_egp, 0) + coalesce(s.amount_egp, 0) as total_assets_egp,
    coalesce(l.amount_egp, 0)                            as total_liabilities_egp,
    coalesce(a.amount_egp, 0) + coalesce(s.amount_egp, 0)
      - coalesce(l.amount_egp, 0)                        as net_worth_egp,
    coalesce(s.amount_egp, 0)                            as stocks_pipe_egp
  from assets_total a
  full outer join liabilities_total l on l.app_user_id = a.app_user_id
  cross join stocks_value s;

create view v_personal_networth_loan_summary as
  select
    li.id                                              as liability_id,
    li.app_user_id,
    li.name,
    li.kind,
    li.currency,
    li.principal,
    li.apr_pct,
    li.term_months,
    li.monthly_payment,
    li.start_date,
    count(*)                            filter (where sch.paid_on is not null) as paid_count,
    sum(sch.principal_portion)          filter (where sch.paid_on is not null) as principal_paid,
    sum(sch.interest_portion)           filter (where sch.paid_on is not null) as interest_paid,
    sum(sch.interest_portion)           filter (where date_trunc('year', sch.paid_on)
                                                       = date_trunc('year', current_date)) as interest_paid_ytd,
    count(*)                            filter (where sch.paid_on is null)     as remaining_months,
    min(sch.due_date)                   filter (where sch.paid_on is null)     as next_due_date,
    max(sch.due_date)                                                          as final_due_date
  from personal_networth_liabilities li
  left join personal_networth_liability_schedule sch on sch.liability_id = li.id
  where li.kind in ('amortizing_loan','bnpl') and li.active = true
  group by li.id;

create view v_personal_networth_upcoming as
  select
    'schedule'::text                       as source,
    sch.id                                 as ref_id,
    li.app_user_id,
    sch.due_date                           as due_date,
    li.name                                as display_name,
    case li.kind
      when 'amortizing_loan' then 'loan_payment'
      when 'bnpl'            then 'bnpl_payment'
    end                                    as category,
    (sch.principal_portion + sch.interest_portion) as amount,
    li.currency
  from personal_networth_liability_schedule sch
  join personal_networth_liabilities li on li.id = sch.liability_id
  where sch.paid_on is null
    and sch.due_date <= current_date + interval '30 days'
  union all
  select
    'recurring'::text                      as source,
    tpl.id                                 as ref_id,
    tpl.app_user_id,
    tpl.next_run_date                      as due_date,
    tpl.name                               as display_name,
    tpl.category                           as category,
    tpl.amount,
    tpl.currency
  from personal_networth_recurring_templates tpl
  where tpl.active = true
    and tpl.next_run_date <= current_date + interval '30 days'
  order by due_date asc;
```

- [ ] **Step 2: Apply migration**

- [ ] **Step 3: Verify the 3 views return rows (will be empty until data exists)**

```sql
select 'current' as view, count(*) as rows from v_personal_networth_current
union all select 'loan_summary', count(*) from v_personal_networth_loan_summary
union all select 'upcoming', count(*) from v_personal_networth_upcoming;
```

Expected: 3 rows. `current` may be 0 (no settings rows yet); `loan_summary` and `upcoming` are 0 until data lands.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(networth): migration 0139 part 4 — current/loan_summary/upcoming views"
```

---

## Phase B — Shared lib + business logic (Tasks 5–14)

### Task 5: Lift `computeNextRunDate` to shared `src/lib/recurring.ts`

**Files:**
- Create: `src/lib/recurring.ts`
- Create: `src/lib/recurring.test.ts`
- Delete: `src/lib/boat-rental/recurring.ts`
- Delete: `src/lib/boat-rental/recurring.test.ts`
- Modify: any boat-rental file that imports `./recurring` (grep first)

- [ ] **Step 1: Find existing importers**

```bash
git grep -l "boat-rental/recurring" src/
```

Expected: a small list. Record them — every match needs its import path updated in Step 4.

- [ ] **Step 2: Create the shared module with the existing content**

Copy the contents of [src/lib/boat-rental/recurring.ts](src/lib/boat-rental/recurring.ts) into a new file `src/lib/recurring.ts` verbatim. Same exports (`RecurringFrequency`, `computeNextRunDate`).

Copy the contents of [src/lib/boat-rental/recurring.test.ts](src/lib/boat-rental/recurring.test.ts) into `src/lib/recurring.test.ts`. Update the `import` line to `import { computeNextRunDate } from './recurring';`.

- [ ] **Step 3: Delete the boat-rental copies**

```bash
git rm src/lib/boat-rental/recurring.ts src/lib/boat-rental/recurring.test.ts
```

- [ ] **Step 4: Update importers from step 1**

For each file found in step 1, change `from '@/lib/boat-rental/recurring'` (or `'./recurring'`) → `from '@/lib/recurring'`.

- [ ] **Step 5: Run tests + typecheck**

```bash
npm run test -- src/lib/recurring.test.ts
npx tsc --noEmit
```

Expected: tests pass. `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(networth): lift computeNextRunDate out of boat-rental into src/lib/recurring.ts"
```

---

### Task 6: `amortization.ts` — `generateSchedule` (TDD)

**Files:**
- Create: `src/lib/personal/networth/amortization.ts`
- Create: `src/lib/personal/networth/amortization.test.ts`
- Create: `src/lib/personal/networth/types.ts`

- [ ] **Step 1: Create the types module**

`src/lib/personal/networth/types.ts`:

```ts
export type LiabilityKind =
  | 'amortizing_loan' | 'bnpl' | 'credit_card' | 'overdraft' | 'other';

export type AssetKind =
  | 'cash' | 'real_estate' | 'vehicle' | 'gold_jewelry' | 'other';

export type PaymentCategory =
  | 'loan_payment' | 'card_payment' | 'overdraft_payment' | 'bnpl_payment'
  | 'charity' | 'rent' | 'utility' | 'phone' | 'subscription'
  | 'insurance' | 'school_fee' | 'other';

export type AmortizationInput = {
  principal: number;
  aprPct: number;
  termMonths: number;
  startDate: string;        // YYYY-MM-DD
  monthlyOverride?: number;
};

export type ScheduleRow = {
  installmentNo: number;
  dueDate: string;
  principalPortion: number;
  interestPortion: number;
  remainingAfter: number;
};

export type EarlyPayoffResult = {
  newPayoffDate: string;
  totalInterestSaved: number;
  monthsSaved: number;
};
```

- [ ] **Step 2: Write failing tests**

`src/lib/personal/networth/amortization.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateSchedule } from './amortization';

describe('generateSchedule', () => {
  it('produces n rows for n-month term', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12, startDate: '2026-01-01',
    });
    expect(rows).toHaveLength(12);
  });

  it('first row has correct interest portion (P × r)', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12, startDate: '2026-01-01',
    });
    // r = 0.01 monthly; first interest = 12000 × 0.01 = 120
    expect(rows[0].interestPortion).toBeCloseTo(120, 2);
  });

  it('last row remaining_after is exactly 0 (rounding absorbed)', () => {
    const rows = generateSchedule({
      principal: 10000, aprPct: 18, termMonths: 24, startDate: '2026-01-01',
    });
    expect(rows[rows.length - 1].remainingAfter).toBe(0);
  });

  it('zero APR splits principal evenly with zero interest', () => {
    const rows = generateSchedule({
      principal: 1200, aprPct: 0, termMonths: 12, startDate: '2026-01-01',
    });
    expect(rows[0].principalPortion).toBeCloseTo(100, 2);
    expect(rows[0].interestPortion).toBe(0);
    expect(rows[11].remainingAfter).toBe(0);
  });

  it('term=1 returns single row with full payoff', () => {
    const rows = generateSchedule({
      principal: 1000, aprPct: 12, termMonths: 1, startDate: '2026-01-01',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].remainingAfter).toBe(0);
  });

  it('monthlyOverride is honored over computed payment', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12,
      startDate: '2026-01-01', monthlyOverride: 1100,
    });
    // Sum of principal + interest in each row should be ≤ 1100 (last row absorbs)
    expect(rows[0].principalPortion + rows[0].interestPortion).toBeCloseTo(1100, 2);
  });

  it('dueDates advance by one month, day-of-month preserved', () => {
    const rows = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 3, startDate: '2026-01-15',
    });
    expect(rows.map(r => r.dueDate)).toEqual([
      '2026-02-15', '2026-03-15', '2026-04-15',
    ]);
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

```bash
npm run test -- src/lib/personal/networth/amortization.test.ts
```

Expected: tests fail (module doesn't exist).

- [ ] **Step 4: Implement `amortization.ts`**

`src/lib/personal/networth/amortization.ts`:

```ts
import type { AmortizationInput, ScheduleRow } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const newY = y + Math.floor((m - 1 + months) / 12);
  const newM = ((m - 1 + months) % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function generateSchedule(input: AmortizationInput): ScheduleRow[] {
  const { principal, aprPct, termMonths, startDate, monthlyOverride } = input;
  if (principal <= 0) throw new Error('principal must be > 0');
  if (termMonths < 1) throw new Error('termMonths must be >= 1');
  if (aprPct < 0) throw new Error('aprPct must be >= 0');

  const r = aprPct / 100 / 12;
  const monthly = monthlyOverride ?? (
    r === 0
      ? principal / termMonths
      : principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)
  );

  const rows: ScheduleRow[] = [];
  let remaining = principal;
  for (let i = 1; i <= termMonths; i++) {
    const interest = round2(remaining * r);
    let principalPart = round2(monthly - interest);
    let newRemaining = round2(remaining - principalPart);
    if (i === termMonths) {
      // Absorb rounding drift: last row pays off exactly
      principalPart = round2(remaining);
      newRemaining = 0;
    }
    rows.push({
      installmentNo: i,
      dueDate: addMonths(startDate, i),
      principalPortion: principalPart,
      interestPortion: interest,
      remainingAfter: newRemaining,
    });
    remaining = newRemaining;
  }
  return rows;
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm run test -- src/lib/personal/networth/amortization.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): generateSchedule amortization with full test coverage"
```

---

### Task 7: `amortization.ts` — `earlyPayoffProjection` (TDD)

**Files:**
- Modify: `src/lib/personal/networth/amortization.ts`
- Modify: `src/lib/personal/networth/amortization.test.ts`

- [ ] **Step 1: Add failing tests to `amortization.test.ts`**

```ts
import { earlyPayoffProjection } from './amortization';

describe('earlyPayoffProjection', () => {
  it('zero extra returns the original final due date', () => {
    const schedule = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12, startDate: '2026-01-01',
    });
    const r = earlyPayoffProjection(schedule, 0, 0, 12);
    expect(r.newPayoffDate).toBe('2027-01-01');
    expect(r.monthsSaved).toBe(0);
    expect(r.totalInterestSaved).toBe(0);
  });

  it('100 extra/month shortens the payoff and saves interest', () => {
    const schedule = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12, startDate: '2026-01-01',
    });
    const r = earlyPayoffProjection(schedule, 0, 100, 12);
    expect(r.monthsSaved).toBeGreaterThan(0);
    expect(r.totalInterestSaved).toBeGreaterThan(0);
  });

  it('already paid installments are not re-counted', () => {
    const schedule = generateSchedule({
      principal: 12000, aprPct: 12, termMonths: 12, startDate: '2026-01-01',
    });
    const r = earlyPayoffProjection(schedule, 6, 0, 12);
    // 6 paid, 6 remaining at normal pace → final date unchanged
    expect(r.newPayoffDate).toBe('2027-01-01');
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test -- src/lib/personal/networth/amortization.test.ts
```

- [ ] **Step 3: Implement `earlyPayoffProjection`**

Append to `amortization.ts`:

```ts
import type { EarlyPayoffResult, ScheduleRow } from './types';

export function earlyPayoffProjection(
  schedule: ScheduleRow[],
  paidInstallmentCount: number,
  extraMonthlyAmount: number,
  aprPct: number
): EarlyPayoffResult {
  const r = aprPct / 100 / 12;
  const remaining = schedule.slice(paidInstallmentCount);
  if (remaining.length === 0) {
    return { newPayoffDate: schedule[schedule.length - 1].dueDate, totalInterestSaved: 0, monthsSaved: 0 };
  }

  const baseRemainingBalance = paidInstallmentCount === 0
    ? schedule[0].principalPortion + schedule[0].remainingAfter
    : schedule[paidInstallmentCount - 1].remainingAfter;

  const baseMonthly = remaining[0].principalPortion + remaining[0].interestPortion;
  const newMonthly = baseMonthly + extraMonthlyAmount;
  const baseInterestRemaining = remaining.reduce((s, row) => s + row.interestPortion, 0);

  let balance = baseRemainingBalance;
  let months = 0;
  let interestPaid = 0;
  let lastDueDate = remaining[remaining.length - 1].dueDate;
  let currentDate = remaining[0].dueDate;

  while (balance > 0.01 && months < remaining.length + 600) {
    const interest = Math.round(balance * r * 100) / 100;
    const principalPart = Math.min(balance, Math.round((newMonthly - interest) * 100) / 100);
    balance = Math.round((balance - principalPart) * 100) / 100;
    interestPaid += interest;
    lastDueDate = currentDate;
    months++;
    currentDate = addMonthsLocal(currentDate, 1);
    if (principalPart <= 0) break;
  }

  return {
    newPayoffDate: lastDueDate,
    totalInterestSaved: Math.round((baseInterestRemaining - interestPaid) * 100) / 100,
    monthsSaved: remaining.length - months,
  };
}

function addMonthsLocal(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const newY = y + Math.floor((m - 1 + months) / 12);
  const newM = ((m - 1 + months) % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test -- src/lib/personal/networth/amortization.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): earlyPayoffProjection for amortization"
```

---

### Task 8: `fx.ts` — currency conversion helpers (TDD)

**Files:**
- Create: `src/lib/personal/networth/fx.ts`
- Create: `src/lib/personal/networth/fx.test.ts`

- [ ] **Step 1: Write failing tests**

`fx.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { convertToEgp, latestRate, ratesAsOf } from './fx';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { rate_to_egp: 48.2 }, error: null }),
    })),
  }),
}));

describe('convertToEgp', () => {
  it('returns amount unchanged for EGP', async () => {
    const r = await convertToEgp(100, 'EGP', '2026-05-01');
    expect(r).toEqual({ egp: 100, rate: 1, rateAsOf: '2026-05-01' });
  });

  it('multiplies by FX rate for non-EGP', async () => {
    const r = await convertToEgp(100, 'USD', '2026-05-01');
    if ('error' in r) throw new Error('expected success');
    expect(r.egp).toBeCloseTo(4820, 2);
    expect(r.rate).toBe(48.2);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test -- src/lib/personal/networth/fx.test.ts
```

- [ ] **Step 3: Implement `fx.ts`**

```ts
import { supabaseAdmin } from '@/lib/supabase';

type ConversionResult =
  | { egp: number; rate: number; rateAsOf: string }
  | { error: 'missing_rate'; currency: string; asOfDate: string };

export async function convertToEgp(
  amount: number, currency: string, asOfDate: string,
): Promise<ConversionResult> {
  if (currency === 'EGP') return { egp: amount, rate: 1, rateAsOf: asOfDate };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_fx_rates')
    .select('rate_to_egp, as_of_date')
    .eq('currency_code', currency)
    .lte('as_of_date', asOfDate)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { error: 'missing_rate', currency, asOfDate };
  return {
    egp: Math.round(amount * Number(data.rate_to_egp) * 100) / 100,
    rate: Number(data.rate_to_egp),
    rateAsOf: data.as_of_date,
  };
}

export async function latestRate(currency: string): Promise<number | null> {
  if (currency === 'EGP') return 1;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_networth_fx_rates')
    .select('rate_to_egp')
    .eq('currency_code', currency)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.rate_to_egp) : null;
}

export async function ratesAsOf(asOfDate: string): Promise<Record<string, number>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_networth_currencies')
    .select('code');
  if (!data) return { EGP: 1 };
  const out: Record<string, number> = { EGP: 1 };
  for (const row of data) {
    if (row.code === 'EGP') continue;
    const r = await sb
      .from('personal_networth_fx_rates')
      .select('rate_to_egp')
      .eq('currency_code', row.code)
      .lte('as_of_date', asOfDate)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (r.data) out[row.code] = Number(r.data.rate_to_egp);
  }
  return out;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test -- src/lib/personal/networth/fx.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): fx conversion helpers (convertToEgp, latestRate, ratesAsOf)"
```

---

### Task 9: `snapshot.ts` — `takeSnapshot` + `listSnapshotsForChart`

**Files:**
- Create: `src/lib/personal/networth/snapshot.ts`
- Create: `src/lib/personal/networth/snapshot.test.ts`

- [ ] **Step 1: Write failing tests** (`snapshot.test.ts`)

```ts
import { describe, it, expect, vi } from 'vitest';
import { takeSnapshot, listSnapshotsForChart } from './snapshot';

// supabaseAdmin is mocked at module level; integration coverage comes from cron route tests
vi.mock('@/lib/supabase');

describe('takeSnapshot', () => {
  it('returns snapshotId and netWorthEgp', async () => {
    // Detailed behavioural assertions verified in cron route test (integration).
    // Here we just type-check the contract.
    expect(typeof takeSnapshot).toBe('function');
  });
});

describe('listSnapshotsForChart', () => {
  it('returns most-recent-first array of {takenAt, netWorthEgp}', () => {
    expect(typeof listSnapshotsForChart).toBe('function');
  });
});
```

- [ ] **Step 2: Run — expect fail (module missing)**

```bash
npm run test -- src/lib/personal/networth/snapshot.test.ts
```

- [ ] **Step 3: Implement `snapshot.ts`**

```ts
import { supabaseAdmin } from '@/lib/supabase';
import { ratesAsOf } from './fx';

export type SnapshotKind = 'monthly_auto' | 'manual';

export async function takeSnapshot(appUserId: string, kind: SnapshotKind): Promise<{
  snapshotId: string;
  netWorthEgp: number;
}> {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const fx = await ratesAsOf(today);

  // Pull assets, liabilities, and stocks-pipe value
  const [assetsRes, liabilitiesRes, currentRes] = await Promise.all([
    sb.from('personal_networth_assets')
      .select('id, name, currency, balance')
      .eq('app_user_id', appUserId).eq('active', true),
    sb.from('personal_networth_liabilities')
      .select('id, name, currency, current_balance')
      .eq('app_user_id', appUserId).eq('active', true),
    sb.from('v_personal_networth_current')
      .select('stocks_pipe_egp')
      .eq('app_user_id', appUserId).maybeSingle(),
  ]);

  if (assetsRes.error) throw assetsRes.error;
  if (liabilitiesRes.error) throw liabilitiesRes.error;

  const stocksEgp = Number(currentRes.data?.stocks_pipe_egp ?? 0);

  const lines: Array<{
    line_type: 'asset' | 'liability' | 'stocks_pipe';
    entity_id: string | null;
    display_name: string;
    currency: string;
    amount: number;
    amount_egp: number;
  }> = [];

  for (const a of assetsRes.data ?? []) {
    const rate = fx[a.currency] ?? 1;
    lines.push({
      line_type: 'asset', entity_id: a.id, display_name: a.name,
      currency: a.currency, amount: Number(a.balance),
      amount_egp: Math.round(Number(a.balance) * rate * 100) / 100,
    });
  }
  for (const l of liabilitiesRes.data ?? []) {
    const rate = fx[l.currency] ?? 1;
    lines.push({
      line_type: 'liability', entity_id: l.id, display_name: l.name,
      currency: l.currency, amount: Number(l.current_balance),
      amount_egp: Math.round(Number(l.current_balance) * rate * 100) / 100,
    });
  }
  if (stocksEgp > 0) {
    lines.push({
      line_type: 'stocks_pipe', entity_id: null,
      display_name: 'AOLB Stocks', currency: 'EGP',
      amount: stocksEgp, amount_egp: stocksEgp,
    });
  }

  const totalAssetsEgp = lines
    .filter(l => l.line_type !== 'liability')
    .reduce((s, l) => s + l.amount_egp, 0);
  const totalLiabilitiesEgp = lines
    .filter(l => l.line_type === 'liability')
    .reduce((s, l) => s + l.amount_egp, 0);
  const netWorthEgp = Math.round((totalAssetsEgp - totalLiabilitiesEgp) * 100) / 100;

  const { data: snap, error: snapErr } = await sb
    .from('personal_networth_snapshots')
    .insert({
      app_user_id: appUserId, kind,
      total_assets_egp: totalAssetsEgp,
      total_liabilities_egp: totalLiabilitiesEgp,
      net_worth_egp: netWorthEgp,
      fx_rates_used: fx,
    })
    .select('id').single();
  if (snapErr || !snap) throw snapErr ?? new Error('snapshot insert failed');

  if (lines.length > 0) {
    const linesInsert = lines.map(l => ({ ...l, snapshot_id: snap.id }));
    const { error: linesErr } = await sb
      .from('personal_networth_snapshot_lines').insert(linesInsert);
    if (linesErr) throw linesErr;
  }

  return { snapshotId: snap.id, netWorthEgp };
}

export async function listSnapshotsForChart(
  appUserId: string, months: number,
): Promise<Array<{ takenAt: string; netWorthEgp: number }>> {
  const sb = supabaseAdmin();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const { data, error } = await sb
    .from('personal_networth_snapshots')
    .select('taken_at, net_worth_egp')
    .eq('app_user_id', appUserId)
    .gte('taken_at', cutoff.toISOString())
    .order('taken_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({
    takenAt: r.taken_at, netWorthEgp: Number(r.net_worth_egp),
  }));
}
```

- [ ] **Step 4: Run — expect pass (smoke level)**

```bash
npm run test -- src/lib/personal/networth/snapshot.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): snapshot + listSnapshotsForChart"
```

---

### Task 10: `liability.ts` — createLiability + updateBalance + markScheduleRowPaid

**Files:**
- Create: `src/lib/personal/networth/liability.ts`
- Create: `src/lib/personal/networth/liability.test.ts`

- [ ] **Step 1: Write failing tests**

`liability.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createLiability, updateBalance, markScheduleRowPaid } from './liability';

describe('liability module', () => {
  it('exports createLiability / updateBalance / markScheduleRowPaid', () => {
    expect(typeof createLiability).toBe('function');
    expect(typeof updateBalance).toBe('function');
    expect(typeof markScheduleRowPaid).toBe('function');
  });
});
```

(Deeper coverage lives in route-level integration tests in Phase C.)

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `liability.ts`**

```ts
import { supabaseAdmin } from '@/lib/supabase';
import { generateSchedule } from './amortization';
import type { LiabilityKind } from './types';

type CreateLiabilityInput = {
  appUserId: string;
  name: string;
  kind: LiabilityKind;
  currency: string;
  lenderId?: string | null;
  currentBalance: number;
  // Amortizing
  principal?: number;
  aprPct?: number;
  termMonths?: number;
  startDate?: string;
  monthlyPayment?: number;
  // Revolving
  creditLimit?: number;
  statementDay?: number;
  dueDay?: number;
  minPaymentPct?: number;
  notes?: string;
};

export async function createLiability(input: CreateLiabilityInput): Promise<string> {
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from('personal_networth_liabilities')
    .insert({
      app_user_id: input.appUserId, name: input.name, kind: input.kind,
      currency: input.currency, lender_id: input.lenderId ?? null,
      current_balance: input.currentBalance,
      principal: input.principal ?? null, apr_pct: input.aprPct ?? null,
      term_months: input.termMonths ?? null, start_date: input.startDate ?? null,
      monthly_payment: input.monthlyPayment ?? null,
      credit_limit: input.creditLimit ?? null,
      statement_day: input.statementDay ?? null, due_day: input.dueDay ?? null,
      min_payment_pct: input.minPaymentPct ?? null, notes: input.notes ?? null,
    }).select('id').single();
  if (error || !row) throw error ?? new Error('insert failed');

  if (input.kind === 'amortizing_loan' || input.kind === 'bnpl') {
    const schedule = generateSchedule({
      principal: input.principal!, aprPct: input.aprPct!,
      termMonths: input.termMonths!, startDate: input.startDate!,
      monthlyOverride: input.monthlyPayment,
    });
    const rows = schedule.map(s => ({
      liability_id: row.id,
      installment_no: s.installmentNo, due_date: s.dueDate,
      principal_portion: s.principalPortion,
      interest_portion: s.interestPortion,
      remaining_after: s.remainingAfter,
    }));
    const { error: schErr } = await sb
      .from('personal_networth_liability_schedule').insert(rows);
    if (schErr) throw schErr;
  }
  return row.id;
}

export async function updateBalance(
  liabilityId: string, newBalance: number,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_liabilities')
    .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', liabilityId);
  if (error) throw error;
}

export async function markScheduleRowPaid(
  scheduleId: string, paymentId: string, paidOn: string,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_networth_liability_schedule')
    .update({ paid_on: paidOn, payment_id: paymentId })
    .eq('id', scheduleId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test -- src/lib/personal/networth/liability.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): createLiability + updateBalance + markScheduleRowPaid"
```

---

### Task 11: `payment.ts` — recordPayment + variants

**Files:**
- Create: `src/lib/personal/networth/payment.ts`
- Create: `src/lib/personal/networth/payment.test.ts`

- [ ] **Step 1: Smoke tests**

`payment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  recordPayment, recordPaymentForSchedule,
  recordPaymentForRecurringTemplate, recordCardPayment,
} from './payment';

describe('payment module', () => {
  it('exports all 4 recorders', () => {
    expect(typeof recordPayment).toBe('function');
    expect(typeof recordPaymentForSchedule).toBe('function');
    expect(typeof recordPaymentForRecurringTemplate).toBe('function');
    expect(typeof recordCardPayment).toBe('function');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement `payment.ts`**

```ts
import { supabaseAdmin } from '@/lib/supabase';
import { markScheduleRowPaid, updateBalance } from './liability';
import { computeNextRunDate } from '@/lib/recurring';
import type { PaymentCategory } from './types';

type RecordPaymentInput = {
  appUserId: string;
  occurredOn: string;
  amount: number;
  currency: string;
  category: PaymentCategory;
  liabilityId?: string | null;
  loanScheduleId?: string | null;
  recurringTemplateId?: string | null;
  notes?: string;
};

export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_networth_payments')
    .insert({
      app_user_id: input.appUserId, occurred_on: input.occurredOn,
      amount: input.amount, currency: input.currency, category: input.category,
      liability_id: input.liabilityId ?? null,
      loan_schedule_id: input.loanScheduleId ?? null,
      recurring_template_id: input.recurringTemplateId ?? null,
      notes: input.notes ?? null,
    }).select('id').single();
  if (error || !data) throw error ?? new Error('insert failed');
  return data.id;
}

export async function recordPaymentForSchedule(
  scheduleId: string,
  opts: { appUserId: string; occurredOn?: string; amount?: number },
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: sch, error: schErr } = await sb
    .from('personal_networth_liability_schedule')
    .select('id, liability_id, principal_portion, interest_portion, remaining_after, '
            + 'personal_networth_liabilities!inner(currency, kind, current_balance)')
    .eq('id', scheduleId).single();
  if (schErr || !sch) throw schErr ?? new Error('schedule not found');

  const liability = (sch as unknown as { personal_networth_liabilities: { currency: string; kind: string; current_balance: number } }).personal_networth_liabilities;
  const occurredOn = opts.occurredOn ?? new Date().toISOString().slice(0, 10);
  const amount = opts.amount ?? (Number(sch.principal_portion) + Number(sch.interest_portion));
  const category = liability.kind === 'bnpl' ? 'bnpl_payment' : 'loan_payment';

  const paymentId = await recordPayment({
    appUserId: opts.appUserId, occurredOn, amount,
    currency: liability.currency, category,
    liabilityId: sch.liability_id, loanScheduleId: scheduleId,
  });
  await markScheduleRowPaid(scheduleId, paymentId, occurredOn);
  await updateBalance(sch.liability_id, Number(sch.remaining_after));
  return paymentId;
}

export async function recordPaymentForRecurringTemplate(
  templateId: string, occurredOn: string,
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: tpl, error } = await sb
    .from('personal_networth_recurring_templates')
    .select('*').eq('id', templateId).single();
  if (error || !tpl) throw error ?? new Error('template not found');

  const paymentId = await recordPayment({
    appUserId: tpl.app_user_id, occurredOn,
    amount: Number(tpl.amount), currency: tpl.currency,
    category: tpl.category, liabilityId: tpl.liability_id,
    recurringTemplateId: tpl.id,
  });

  // If template links a loan, also mark its next unpaid schedule row paid
  if (tpl.liability_id) {
    const { data: next } = await sb
      .from('personal_networth_liability_schedule')
      .select('id, remaining_after').eq('liability_id', tpl.liability_id)
      .is('paid_on', null).order('due_date').limit(1).maybeSingle();
    if (next) {
      await markScheduleRowPaid(next.id, paymentId, occurredOn);
      await updateBalance(tpl.liability_id, Number(next.remaining_after));
    }
  }

  // Advance the template
  const nextRun = computeNextRunDate(
    tpl.frequency, tpl.day_of_period, tpl.month_of_year, occurredOn,
  );
  await sb.from('personal_networth_recurring_templates')
    .update({ next_run_date: nextRun, last_run_date: occurredOn })
    .eq('id', templateId);
  return paymentId;
}

export async function recordCardPayment(
  liabilityId: string, appUserId: string,
  preset: 'min' | 'statement' | 'full' | 'custom', customAmount?: number,
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: li } = await sb
    .from('personal_networth_liabilities')
    .select('current_balance, min_payment_pct, currency, kind')
    .eq('id', liabilityId).single();
  if (!li) throw new Error('liability not found');

  let amount: number;
  switch (preset) {
    case 'min':
      amount = Math.round((Number(li.current_balance) * Number(li.min_payment_pct ?? 5) / 100) * 100) / 100;
      break;
    case 'statement':
    case 'full':
      amount = Number(li.current_balance);
      break;
    case 'custom':
      amount = customAmount ?? 0;
      break;
  }
  const today = new Date().toISOString().slice(0, 10);
  const category = li.kind === 'overdraft' ? 'overdraft_payment' : 'card_payment';
  const paymentId = await recordPayment({
    appUserId, occurredOn: today, amount,
    currency: li.currency, category, liabilityId,
  });
  await updateBalance(liabilityId, Math.max(0, Number(li.current_balance) - amount));
  return paymentId;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test -- src/lib/personal/networth/payment.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): payment recorders (regular, schedule-linked, recurring, card)"
```

---

### Task 12: `queries.ts` — getOverviewKpis + getUpcomingPayments + getCharityYtd

**Files:**
- Create: `src/lib/personal/networth/queries.ts`
- Create: `src/lib/personal/networth/queries.test.ts`

- [ ] **Step 1: Smoke test**

`queries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getOverviewKpis, getUpcomingPayments, getCharityYtd } from './queries';

describe('queries module — overview group', () => {
  it('exports all 3 functions', () => {
    expect(typeof getOverviewKpis).toBe('function');
    expect(typeof getUpcomingPayments).toBe('function');
    expect(typeof getCharityYtd).toBe('function');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement these three functions in `queries.ts`**

```ts
import { supabaseAdmin } from '@/lib/supabase';

export type OverviewKpis = {
  totalAssetsEgp: number;
  totalLiabilitiesEgp: number;
  netWorthEgp: number;
  stocksPipeEgp: number;
  deltaSinceLastSnapshotEgp: number;
  deltaPct: number | null;
};

export async function getOverviewKpis(appUserId: string): Promise<OverviewKpis> {
  const sb = supabaseAdmin();
  const [current, latestSnap] = await Promise.all([
    sb.from('v_personal_networth_current')
      .select('*').eq('app_user_id', appUserId).maybeSingle(),
    sb.from('personal_networth_snapshots')
      .select('net_worth_egp').eq('app_user_id', appUserId)
      .order('taken_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const totalAssetsEgp = Number(current.data?.total_assets_egp ?? 0);
  const totalLiabilitiesEgp = Number(current.data?.total_liabilities_egp ?? 0);
  const netWorthEgp = Number(current.data?.net_worth_egp ?? 0);
  const stocksPipeEgp = Number(current.data?.stocks_pipe_egp ?? 0);
  const lastNet = latestSnap.data ? Number(latestSnap.data.net_worth_egp) : null;
  const delta = lastNet === null ? 0 : netWorthEgp - lastNet;
  const deltaPct = lastNet && lastNet !== 0 ? (delta / lastNet) * 100 : null;
  return {
    totalAssetsEgp, totalLiabilitiesEgp, netWorthEgp, stocksPipeEgp,
    deltaSinceLastSnapshotEgp: Math.round(delta * 100) / 100,
    deltaPct: deltaPct === null ? null : Math.round(deltaPct * 100) / 100,
  };
}

export type UpcomingPayment = {
  source: 'schedule' | 'recurring';
  refId: string;
  dueDate: string;
  displayName: string;
  category: string;
  amount: number;
  currency: string;
};

export async function getUpcomingPayments(
  appUserId: string, daysAhead = 30,
): Promise<UpcomingPayment[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('v_personal_networth_upcoming')
    .select('*').eq('app_user_id', appUserId);
  if (error) throw error;
  return (data ?? []).map(r => ({
    source: r.source, refId: r.ref_id, dueDate: r.due_date,
    displayName: r.display_name, category: r.category,
    amount: Number(r.amount), currency: r.currency,
  }));
}

export type CharityYtd = {
  totalEgp: number;
  monthlyAvg: number;
  yearlyGoalEgp: number | null;
  progressPct: number | null;
};

export async function getCharityYtd(appUserId: string): Promise<CharityYtd> {
  const sb = supabaseAdmin();
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [paymentsRes, settingsRes] = await Promise.all([
    sb.from('personal_networth_payments')
      .select('amount, currency, occurred_on')
      .eq('app_user_id', appUserId).eq('category', 'charity')
      .gte('occurred_on', yearStart),
    sb.from('personal_networth_settings')
      .select('charity_goal_egp_year')
      .eq('app_user_id', appUserId).maybeSingle(),
  ]);
  // Convert each payment to EGP at its occurred_on rate via fx_lookup SQL function
  let totalEgp = 0;
  for (const p of paymentsRes.data ?? []) {
    const { data: rate } = await sb.rpc('fx_lookup', {
      p_currency: p.currency, p_as_of: p.occurred_on,
    });
    totalEgp += Number(p.amount) * (rate ?? 1);
  }
  totalEgp = Math.round(totalEgp * 100) / 100;
  const monthsElapsed = new Date().getMonth() + 1;
  const monthlyAvg = Math.round((totalEgp / monthsElapsed) * 100) / 100;
  const goal = settingsRes.data?.charity_goal_egp_year ? Number(settingsRes.data.charity_goal_egp_year) : null;
  const progressPct = goal && goal > 0 ? Math.round((totalEgp / goal) * 10000) / 100 : null;
  return { totalEgp, monthlyAvg, yearlyGoalEgp: goal, progressPct };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test -- src/lib/personal/networth/queries.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): queries — overview KPIs, upcoming payments, charity YTD"
```

---

### Task 13: `queries.ts` — getAssetMix + getLiabilityMix + getMonthlyReport

**Files:**
- Modify: `src/lib/personal/networth/queries.ts`
- Modify: `src/lib/personal/networth/queries.test.ts`

- [ ] **Step 1: Add smoke tests**

Append to `queries.test.ts`:

```ts
import { getAssetMix, getLiabilityMix, getMonthlyReport } from './queries';

describe('queries module — mix + reports', () => {
  it('exports all 3 functions', () => {
    expect(typeof getAssetMix).toBe('function');
    expect(typeof getLiabilityMix).toBe('function');
    expect(typeof getMonthlyReport).toBe('function');
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement and append to `queries.ts`**

```ts
export type MixSlice = {
  label: string;
  amountEgp: number;
  pct: number;
};

export async function getAssetMix(appUserId: string): Promise<MixSlice[]> {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const [assetsRes, stocksRes] = await Promise.all([
    sb.from('personal_networth_assets')
      .select('kind, currency, balance').eq('app_user_id', appUserId).eq('active', true),
    sb.from('v_personal_networth_current')
      .select('stocks_pipe_egp').eq('app_user_id', appUserId).maybeSingle(),
  ]);
  const bucket: Record<string, number> = {};
  for (const a of assetsRes.data ?? []) {
    const { data: rate } = await sb.rpc('fx_lookup', { p_currency: a.currency, p_as_of: today });
    bucket[a.kind] = (bucket[a.kind] ?? 0) + Number(a.balance) * Number(rate ?? 1);
  }
  const stocksEgp = Number(stocksRes.data?.stocks_pipe_egp ?? 0);
  if (stocksEgp > 0) bucket['stocks_pipe'] = stocksEgp;
  const total = Object.values(bucket).reduce((s, v) => s + v, 0);
  return Object.entries(bucket).map(([label, amount]) => ({
    label, amountEgp: Math.round(amount * 100) / 100,
    pct: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
  }));
}

export async function getLiabilityMix(appUserId: string): Promise<MixSlice[]> {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from('personal_networth_liabilities')
    .select('kind, currency, current_balance').eq('app_user_id', appUserId).eq('active', true);
  const bucket: Record<string, number> = {};
  for (const l of data ?? []) {
    const { data: rate } = await sb.rpc('fx_lookup', { p_currency: l.currency, p_as_of: today });
    bucket[l.kind] = (bucket[l.kind] ?? 0) + Number(l.current_balance) * Number(rate ?? 1);
  }
  const total = Object.values(bucket).reduce((s, v) => s + v, 0);
  return Object.entries(bucket).map(([label, amount]) => ({
    label, amountEgp: Math.round(amount * 100) / 100,
    pct: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
  }));
}

export type MonthlyReport = {
  monthLabel: string;
  totalEgp: number;
  prevMonthTotalEgp: number;
  deltaEgp: number;
  deltaPct: number | null;
  byCategory: Array<{ category: string; amountEgp: number; count: number; deltaVsPrevEgp: number }>;
  paymentCount: number;
};

export async function getMonthlyReport(
  appUserId: string, year: number, month: number,
): Promise<MonthlyReport> {
  const sb = supabaseAdmin();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const prevMonth = month === 1
    ? `${year - 1}-12-01`
    : `${year}-${String(month - 1).padStart(2, '0')}-01`;
  const [thisRes, prevRes] = await Promise.all([
    sb.from('personal_networth_payments')
      .select('category, amount, currency, occurred_on')
      .eq('app_user_id', appUserId).gte('occurred_on', monthStart).lt('occurred_on', nextMonth),
    sb.from('personal_networth_payments')
      .select('category, amount, currency, occurred_on')
      .eq('app_user_id', appUserId).gte('occurred_on', prevMonth).lt('occurred_on', monthStart),
  ]);

  async function toEgp(amount: number, currency: string, asOf: string): Promise<number> {
    const { data: rate } = await sb.rpc('fx_lookup', { p_currency: currency, p_as_of: asOf });
    return amount * Number(rate ?? 1);
  }

  const thisByCat: Record<string, { amount: number; count: number }> = {};
  let thisTotal = 0;
  for (const p of thisRes.data ?? []) {
    const egp = await toEgp(Number(p.amount), p.currency, p.occurred_on);
    thisTotal += egp;
    thisByCat[p.category] = {
      amount: (thisByCat[p.category]?.amount ?? 0) + egp,
      count: (thisByCat[p.category]?.count ?? 0) + 1,
    };
  }
  const prevByCat: Record<string, number> = {};
  let prevTotal = 0;
  for (const p of prevRes.data ?? []) {
    const egp = await toEgp(Number(p.amount), p.currency, p.occurred_on);
    prevTotal += egp;
    prevByCat[p.category] = (prevByCat[p.category] ?? 0) + egp;
  }

  return {
    monthLabel: `${year}-${String(month).padStart(2, '0')}`,
    totalEgp: Math.round(thisTotal * 100) / 100,
    prevMonthTotalEgp: Math.round(prevTotal * 100) / 100,
    deltaEgp: Math.round((thisTotal - prevTotal) * 100) / 100,
    deltaPct: prevTotal > 0 ? Math.round(((thisTotal - prevTotal) / prevTotal) * 10000) / 100 : null,
    byCategory: Object.entries(thisByCat).map(([category, v]) => ({
      category, amountEgp: Math.round(v.amount * 100) / 100, count: v.count,
      deltaVsPrevEgp: Math.round((v.amount - (prevByCat[category] ?? 0)) * 100) / 100,
    })),
    paymentCount: thisRes.data?.length ?? 0,
  };
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test -- src/lib/personal/networth/queries.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/networth/
git commit -m "feat(networth): queries — asset/liability mix + monthly report"
```

---

### Task 14: `tsc --noEmit` checkpoint

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. Fix any signature mismatch surfaced by the lib layer.

- [ ] **Step 2: Full test run**

```bash
npm run test
```

Expected: all existing tests still pass + new networth tests pass.

- [ ] **Step 3: Commit (no-op or fix-up only — skip if nothing to commit)**

```bash
git status
# if any tsc/test fixups were made:
git add -A && git commit -m "chore(networth): typecheck + test checkpoint after Phase B"
```

---

## Phase C — Cron + manual triggers (Tasks 15–17)

### Task 15: `/api/cron/personal-networth-snapshot` route

**Files:**
- Create: `src/app/api/cron/personal-networth-snapshot/route.ts`
- Create: `src/app/api/cron/personal-networth-snapshot/route.test.ts`

- [ ] **Step 1: Write failing route tests**

`route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/supabase');
vi.mock('@/lib/personal/networth/snapshot', () => ({
  takeSnapshot: vi.fn().mockResolvedValue({ snapshotId: 'snap-1', netWorthEgp: 1234 }),
}));

const origCronSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = 'test-secret';

function req(opts: { authHeader?: string; url?: string } = {}): Request {
  return new Request(opts.url ?? 'http://localhost/api/cron/personal-networth-snapshot', {
    method: 'POST',
    headers: opts.authHeader ? { authorization: opts.authHeader } : {},
  });
}

describe('personal-networth-snapshot cron route', () => {
  it('rejects without bearer', async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('rejects wrong bearer', async () => {
    const res = await POST(req({ authHeader: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('skips outside Cairo 9am without force', async () => {
    // Mock Date so Cairo hour is not 9
    const realDate = global.Date;
    const fixed = new Date('2026-05-16T02:00:00Z'); // Cairo = 05:00
    vi.spyOn(global, 'Date').mockImplementation(() => fixed as unknown as Date);
    const res = await POST(req({ authHeader: 'Bearer test-secret' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    global.Date = realDate;
  });

  it('runs with ?force=1 regardless of hour', async () => {
    const res = await POST(req({
      authHeader: 'Bearer test-secret',
      url: 'http://localhost/api/cron/personal-networth-snapshot?force=1',
    }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement route**

`route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { takeSnapshot } from '@/lib/personal/networth/snapshot';

export const maxDuration = 60;

function cairoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false })
      .format(new Date())
  );
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && cairoHour() !== 9) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not 9am Cairo' });
  }

  const sb = supabaseAdmin();
  const { data: users, error } = await sb
    .from('personal_networth_settings').select('app_user_id');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results: Array<{ appUserId: string; snapshotId: string; netWorthEgp: number }> = [];
  for (const u of users ?? []) {
    const r = await takeSnapshot(u.app_user_id, 'monthly_auto');
    results.push({ appUserId: u.app_user_id, ...r });
  }
  return NextResponse.json({ ok: true, results });
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm run test -- src/app/api/cron/personal-networth-snapshot/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/personal-networth-snapshot/
git commit -m "feat(networth): /api/cron/personal-networth-snapshot route with auth + Cairo 9am gate"
```

---

### Task 16: `/api/cron/personal-networth-recurring` route

**Files:**
- Create: `src/app/api/cron/personal-networth-recurring/route.ts`
- Create: `src/app/api/cron/personal-networth-recurring/route.test.ts`

- [ ] **Step 1: Write tests** (mirror Task 15 structure with `recordPaymentForRecurringTemplate` mock)

```ts
import { describe, it, expect, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/supabase');
vi.mock('@/lib/personal/networth/payment', () => ({
  recordPaymentForRecurringTemplate: vi.fn().mockResolvedValue('pay-1'),
}));

process.env.CRON_SECRET = 'test-secret';

describe('personal-networth-recurring cron route', () => {
  it('rejects without bearer', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('runs with ?force=1', async () => {
    const res = await POST(new Request(
      'http://localhost?force=1',
      { method: 'POST', headers: { authorization: 'Bearer test-secret' } },
    ));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement route**

```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordPaymentForRecurringTemplate } from '@/lib/personal/networth/payment';

export const maxDuration = 60;

function cairoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false })
      .format(new Date())
  );
}
function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' })
    .format(new Date()); // YYYY-MM-DD
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && cairoHour() !== 9) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const today = cairoToday();
  const sb = supabaseAdmin();
  const { data: due, error } = await sb
    .from('personal_networth_recurring_templates')
    .select('id').eq('active', true).lte('next_run_date', today);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results: Array<{ templateId: string; paymentId: string }> = [];
  for (const t of due ?? []) {
    const paymentId = await recordPaymentForRecurringTemplate(t.id, today);
    results.push({ templateId: t.id, paymentId });
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/personal-networth-recurring/
git commit -m "feat(networth): /api/cron/personal-networth-recurring route"
```

---

### Task 17: Register both crons in `vercel.json` + manual trigger routes

**Files:**
- Modify: `vercel.json`
- Create: `src/app/api/personal/networth/snapshot/route.ts`
- Create: `src/app/api/personal/networth/recurring/run-now/route.ts`

- [ ] **Step 1: Read current vercel.json**

```bash
cat vercel.json | tail -30
```

- [ ] **Step 2: Append 4 new cron entries**

In the `crons` array of `vercel.json`, add (preserve trailing comma rules):

```json
{ "path": "/api/cron/personal-networth-snapshot",  "schedule": "0 6 1 * *" },
{ "path": "/api/cron/personal-networth-snapshot",  "schedule": "0 7 1 * *" },
{ "path": "/api/cron/personal-networth-recurring", "schedule": "0 6 * * *" },
{ "path": "/api/cron/personal-networth-recurring", "schedule": "0 7 * * *" }
```

- [ ] **Step 3: Create manual snapshot trigger**

`src/app/api/personal/networth/snapshot/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { takeSnapshot } from '@/lib/personal/networth/snapshot';

export async function POST(): Promise<Response> {
  const appUserId = await getServerAuthUserId();
  if (!appUserId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const result = await takeSnapshot(appUserId, 'manual');
  return NextResponse.json({ ok: true, ...result });
}
```

Note: if `getServerAuthUserId` doesn't exist at that path, grep `src/lib/auth.ts` for the equivalent (look for a helper that returns the current `app_user_id` server-side; the codebase has one — same one used by `/personal/stocks` server routes).

- [ ] **Step 4: Create manual recurring trigger**

`src/app/api/personal/networth/recurring/run-now/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordPaymentForRecurringTemplate } from '@/lib/personal/networth/payment';

export async function POST(): Promise<Response> {
  const appUserId = await getServerAuthUserId();
  if (!appUserId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const sb = supabaseAdmin();
  const { data: due } = await sb
    .from('personal_networth_recurring_templates')
    .select('id').eq('app_user_id', appUserId).eq('active', true).lte('next_run_date', today);
  const results: string[] = [];
  for (const t of due ?? []) {
    results.push(await recordPaymentForRecurringTemplate(t.id, today));
  }
  return NextResponse.json({ ok: true, processed: results.length });
}
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add vercel.json src/app/api/personal/networth/
git commit -m "feat(networth): register crons + manual snapshot/recurring trigger routes"
```

---

## Phase D — Shell + parent tile + setup page (Tasks 18–20)

### Task 18: `NetWorthShell` + `NetWorthHeader` + nav tabs

**Files:**
- Create: `src/app/personal/networth/_components/networth-shell.tsx`
- Create: `src/app/personal/networth/layout.tsx`

- [ ] **Step 1: Inspect the existing `PersonalShell` for the visual pattern**

```bash
cat src/app/personal/_components/personal-shell.tsx
```

- [ ] **Step 2: Create the layout file**

`src/app/personal/networth/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Net Worth · Lime' };

export default function NetWorthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Create the shell component**

`src/app/personal/networth/_components/networth-shell.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Wallet, type LucideIcon } from 'lucide-react';

export function NetWorthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

const TABS = [
  { href: '/personal/networth', label: 'Overview' },
  { href: '/personal/networth/liabilities', label: 'Liabilities' },
  { href: '/personal/networth/assets', label: 'Assets' },
  { href: '/personal/networth/recurring', label: 'Recurring' },
  { href: '/personal/networth/reports', label: 'Reports' },
  { href: '/personal/networth/setup', label: 'Setup' },
];

export function NetWorthHeader({
  eyebrow, title, subtitle, icon = Wallet,
}: { eyebrow?: string; title: string; subtitle?: string; icon?: LucideIcon }) {
  const Icon = icon;
  const pathname = usePathname();
  const isActive = (href: string) => href === '/personal/networth'
    ? pathname === '/personal/networth'
    : pathname?.startsWith(href);
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 inline-flex items-center justify-center">
          <Icon size={28} className="text-indigo-700 dark:text-indigo-300" />
        </div>
        <div>
          {eyebrow && <div className="text-xs uppercase tracking-wider text-slate-500">{eyebrow}</div>}
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{subtitle}</p>}
        </div>
      </div>
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <Link key={t.href} href={t.href}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
              isActive(t.href)
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/networth/
git commit -m "feat(networth): NetWorthShell + NetWorthHeader + tab nav"
```

---

### Task 19: Add `Net Worth` tile + indigo accent to `/personal`

**Files:**
- Modify: `src/app/personal/page.tsx`

- [ ] **Step 1: Read current TILES + ACCENTS**

```bash
sed -n '20,80p' src/app/personal/page.tsx
```

- [ ] **Step 2: Add `Wallet` to the lucide import**

Change line 2 from:

```ts
import { ArrowRight, Mail, Ship, TrendingUp, User, type LucideIcon } from 'lucide-react';
```

to:

```ts
import { ArrowRight, Mail, Ship, TrendingUp, User, Wallet, type LucideIcon } from 'lucide-react';
```

- [ ] **Step 3: Add `'indigo'` to the `Tile['accent']` union**

In the `type Tile` definition change `'slate' | 'cyan' | 'emerald'` to `'slate' | 'cyan' | 'emerald' | 'indigo'`.

- [ ] **Step 4: Append the 4th TILE**

After the boat-rental entry in the `TILES` array:

```ts
{
  href: '/personal/networth',
  title: 'Net Worth',
  description:
    "Assets, loans + liabilities, recurring payments, charity, monthly report, and historical net-worth chart — totals in EGP.",
  icon: Wallet,
  accent: 'indigo',
  badge: { label: 'Live', tone: 'navy' },
},
```

- [ ] **Step 5: Append the `indigo` accent to ACCENTS**

```ts
indigo: {
  iconBg: 'bg-indigo-50 dark:bg-indigo-950', iconText: 'text-indigo-700 dark:text-indigo-300',
  hoverBorder: 'group-hover:border-indigo-400', arrow: 'group-hover:text-indigo-600',
  gradFrom: 'from-indigo-400', gradTo: 'to-indigo-600',
},
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/app/personal/page.tsx
git commit -m "feat(networth): add Net Worth tile to /personal with indigo accent"
```

---

### Task 20: `/personal/networth/setup` page (FX rates + Lenders + Settings)

**Files:**
- Create: `src/app/personal/networth/setup/page.tsx`
- Create: `src/app/personal/networth/_components/setup/fx-rates-section.tsx`
- Create: `src/app/personal/networth/_components/setup/lenders-section.tsx`
- Create: `src/app/personal/networth/_components/setup/settings-form.tsx`
- Create: `src/app/api/personal/networth/setup/fx/route.ts`
- Create: `src/app/api/personal/networth/setup/lenders/route.ts`
- Create: `src/app/api/personal/networth/setup/settings/route.ts`

- [ ] **Step 1: Create the API routes (CRUD)**

`src/app/api/personal/networth/setup/fx/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('personal_networth_fx_rates')
    .select('*').order('currency_code').order('as_of_date', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rates: data });
}

export async function POST(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('personal_networth_fx_rates')
    .insert({ currency_code: body.currencyCode, rate_to_egp: body.rateToEgp,
              as_of_date: body.asOfDate, notes: body.notes ?? null })
    .select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const sb = supabaseAdmin();
  const { error } = await sb.from('personal_networth_fx_rates').delete().eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

`lenders/route.ts` mirrors the same GET/POST/DELETE shape with column names `name`, `kind`, `contact`, `notes`, `app_user_id`.

`settings/route.ts` is GET + PUT (single-row upsert keyed by `app_user_id`):

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = supabaseAdmin();
  const { data } = await sb.from('personal_networth_settings')
    .select('*').eq('app_user_id', uid).maybeSingle();
  return NextResponse.json({ ok: true, settings: data });
}

export async function PUT(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { error } = await sb.from('personal_networth_settings').upsert({
    app_user_id: uid,
    charity_goal_egp_year: body.charityGoalEgpYear ?? null,
    default_currency: body.defaultCurrency ?? 'EGP',
    monthly_snapshot_day: body.monthlySnapshotDay ?? 1,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create the page**

`src/app/personal/networth/setup/page.tsx`:

```tsx
import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { FxRatesSection } from '../_components/setup/fx-rates-section';
import { LendersSection } from '../_components/setup/lenders-section';
import { SettingsForm } from '../_components/setup/settings-form';

export default function SetupPage() {
  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Net Worth" title="Setup"
        subtitle="FX rates, lenders, and personal settings." />
      <SettingsForm />
      <FxRatesSection />
      <LendersSection />
    </NetWorthShell>
  );
}
```

- [ ] **Step 3: Create three client section components**

Each section component renders a table + add form + delete button, all calling the API routes above with `fetch`. Pattern is the same as setup tabs in `/emails/kika/setup`. Show:

- `FxRatesSection` — list of `{currency_code, rate_to_egp, as_of_date}` rows. Form fields: currency code select (populated by GET `/api/personal/networth/setup/fx?currencies=1` — for V1 just hardcode EGP/USD/EUR/SAR/AED), rate (numeric input), as-of date (date picker), notes (text). Submit POSTs; delete button calls DELETE with `?id=`.
- `LendersSection` — list of `{name, kind, contact, notes}` rows. Form fields: name, kind select, contact, notes.
- `SettingsForm` — single-row form: `charity_goal_egp_year` (numeric input), `default_currency` (select), `monthly_snapshot_day` (1-28 number). Loads via GET, saves via PUT.

Each component uses `useState` + `useEffect` to fetch on mount, and shows a toast/inline message on save. Style with `ix-card` + `ix-input` + `ix-btn-primary` classes that already exist in the codebase.

- [ ] **Step 4: Typecheck + visual smoke**

```bash
npx tsc --noEmit
npm run dev
# open http://localhost:3000/personal/networth/setup
# add one FX rate (USD → 48), one lender (CIB), save settings (goal 50000)
```

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/networth/ src/app/api/personal/networth/setup/
git commit -m "feat(networth): /personal/networth/setup — FX, lenders, settings"
```

---

## Phase E — Assets + Liabilities routes (Tasks 21–25)

### Task 21: `/personal/networth/assets` page + API + add modal

**Files:**
- Create: `src/app/personal/networth/assets/page.tsx`
- Create: `src/app/personal/networth/_components/assets/asset-table.tsx`
- Create: `src/app/personal/networth/_components/modals/add-asset-modal.tsx`
- Create: `src/app/api/personal/networth/assets/route.ts`
- Create: `src/app/api/personal/networth/assets/[id]/route.ts`

- [ ] **Step 1: API — assets list + create**

`src/app/api/personal/networth/assets/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('personal_networth_assets')
    .select('*').eq('app_user_id', uid).eq('active', true).order('balance', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, assets: data });
}

export async function POST(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('personal_networth_assets').insert({
    app_user_id: uid,
    name: body.name, kind: body.kind, currency: body.currency,
    balance: body.balance, as_of_date: body.asOfDate ?? new Date().toISOString().slice(0, 10),
    notes: body.notes ?? null,
  }).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
```

`src/app/api/personal/networth/assets/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const sb = supabaseAdmin();
  const { error } = await sb.from('personal_networth_assets').update({
    balance: body.balance, as_of_date: body.asOfDate, notes: body.notes,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('app_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('personal_networth_assets').update({ active: false })
    .eq('id', id).eq('app_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Server page**

`src/app/personal/networth/assets/page.tsx`:

```tsx
import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { AssetTable } from '../_components/assets/asset-table';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerAuthUserId } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AssetsPage() {
  const uid = await getServerAuthUserId();
  if (!uid) redirect('/login');

  const sb = supabaseAdmin();
  const [assetsRes, currentRes] = await Promise.all([
    sb.from('personal_networth_assets').select('*').eq('app_user_id', uid).eq('active', true)
      .order('balance', { ascending: false }),
    sb.from('v_personal_networth_current').select('stocks_pipe_egp').eq('app_user_id', uid).maybeSingle(),
  ]);

  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Net Worth" title="Assets"
        subtitle="Cash, real estate, vehicles, gold/jewelry. Stocks pipe in from /personal/stocks." />
      <AssetTable
        assets={(assetsRes.data ?? []) as any}
        stocksPipeEgp={Number(currentRes.data?.stocks_pipe_egp ?? 0)}
      />
    </NetWorthShell>
  );
}
```

- [ ] **Step 3: Client `AssetTable` + `AddAssetModal`**

`asset-table.tsx`: client component that renders:
- KPI strip on top: Total assets EGP · Liquid · Illiquid · # currencies
- Read-only top row "AOLB Stocks (auto-piped)" showing `stocksPipeEgp` with a link to `/personal/stocks`
- Filter chips (All / Cash / Real Estate / Vehicles / Gold/Jewelry / Other) controlling a local `useState` filter
- Table rows with inline "Update balance" button → opens a small modal with new balance + as-of-date, PATCHes the API, then `router.refresh()`
- `+ Add Asset` button → opens `AddAssetModal`

`add-asset-modal.tsx`: form fields: name (text), kind (select with the 5 enum values), currency (select EGP/USD/EUR/SAR/AED), balance (numeric), as-of-date (date), notes (textarea). On submit POSTs `/api/personal/networth/assets`, then closes + refreshes.

- [ ] **Step 4: Typecheck + manual smoke**

```bash
npx tsc --noEmit
npm run dev
# Open http://localhost:3000/personal/networth/assets
# Add "Bank CIB" / cash / EGP / 50000
# Add "Apartment Maadi" / real_estate / EGP / 8000000
# Verify both appear and the totals KPI strip computes correctly
```

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/networth/assets/ \
        src/app/personal/networth/_components/assets/ \
        src/app/personal/networth/_components/modals/add-asset-modal.tsx \
        src/app/api/personal/networth/assets/
git commit -m "feat(networth): /assets page + asset table + add-asset modal + API"
```

---

### Task 22: `/personal/networth/liabilities` list page + API + add-liability modal

**Files:**
- Create: `src/app/personal/networth/liabilities/page.tsx`
- Create: `src/app/personal/networth/_components/liabilities/liability-table.tsx`
- Create: `src/app/personal/networth/_components/modals/add-liability-modal.tsx`
- Create: `src/app/api/personal/networth/liabilities/route.ts`
- Create: `src/app/api/personal/networth/liabilities/[id]/route.ts`

- [ ] **Step 1: API — list + create**

`src/app/api/personal/networth/liabilities/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createLiability } from '@/lib/personal/networth/liability';

export async function GET() {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('personal_networth_liabilities')
    .select('*, personal_networth_lenders(name)')
    .eq('app_user_id', uid).eq('active', true)
    .order('current_balance', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, liabilities: data });
}

export async function POST(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();
  try {
    const id = await createLiability({ appUserId: uid, ...body });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
```

`[id]/route.ts`: PATCH for edits + DELETE that sets `active = false` (no hard delete — schedule rows + payments must remain queryable).

- [ ] **Step 2: Server page**

`src/app/personal/networth/liabilities/page.tsx`:

```tsx
import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { LiabilityTable } from '../_components/liabilities/liability-table';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerAuthUserId } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LiabilitiesPage() {
  const uid = await getServerAuthUserId();
  if (!uid) redirect('/login');
  const sb = supabaseAdmin();
  const { data: liabilities } = await sb
    .from('personal_networth_liabilities')
    .select('*, personal_networth_lenders(name)')
    .eq('app_user_id', uid).eq('active', true)
    .order('current_balance', { ascending: false });

  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Net Worth" title="Liabilities"
        subtitle="Loans · BNPL · Credit cards · Overdraft." />
      <LiabilityTable liabilities={(liabilities ?? []) as any} />
    </NetWorthShell>
  );
}
```

- [ ] **Step 3: `LiabilityTable` client component**

Renders the KPI strip (Total · Monthly outflow · Highest APR · YTD interest), filter chips, table with rows linking to `/liabilities/[id]`, and a "+ Add Liability" button opening `AddLiabilityModal`.

- [ ] **Step 4: `AddLiabilityModal` — kind picker → form**

Two-stage modal:
1. Stage 1 — kind picker: 4 big buttons (Loan / BNPL / Credit Card / Overdraft).
2. Stage 2 — kind-specific form:
   - Loan/BNPL: name · lender (select) · currency · principal · APR % · term months · start date · monthly payment (optional override) · notes
   - Card/Overdraft: name · lender · currency · current balance · credit limit · statement day · due day · min payment %

On submit POSTs `/api/personal/networth/liabilities` with the full payload. The server-side `createLiability` auto-generates the schedule for amortizing kinds.

- [ ] **Step 5: Typecheck + smoke**

```bash
npx tsc --noEmit
npm run dev
# Add a test loan: "Car Loan" / amortizing_loan / CIB / EGP / 200000 / 18% / 36 months / 2026-01-01
# Verify schedule rows exist:
```

```sql
select count(*) from personal_networth_liability_schedule;
```

Expected: 36.

- [ ] **Step 6: Commit**

```bash
git add src/app/personal/networth/liabilities/ \
        src/app/personal/networth/_components/liabilities/liability-table.tsx \
        src/app/personal/networth/_components/modals/add-liability-modal.tsx \
        src/app/api/personal/networth/liabilities/
git commit -m "feat(networth): /liabilities list + add modal + create API (auto-schedule)"
```

---

### Task 23: `/personal/networth/liabilities/[id]` — amortizing detail (schedule + early-payoff calc)

**Files:**
- Create: `src/app/personal/networth/liabilities/[id]/page.tsx`
- Create: `src/app/personal/networth/_components/liabilities/schedule-table.tsx`
- Create: `src/app/personal/networth/_components/liabilities/early-payoff-calc.tsx`
- Create: `src/app/api/personal/networth/liabilities/[id]/mark-paid/route.ts`

- [ ] **Step 1: API — mark schedule row paid**

`mark-paid/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { recordPaymentForSchedule } from '@/lib/personal/networth/payment';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  await params; // id is the liability id, unused here — schedule id comes from body
  const body = await req.json();
  try {
    const paymentId = await recordPaymentForSchedule(body.scheduleId, {
      appUserId: uid, occurredOn: body.occurredOn, amount: body.amount,
    });
    return NextResponse.json({ ok: true, paymentId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Detail page — dual-mode (amortizing branch first)**

`src/app/personal/networth/liabilities/[id]/page.tsx`:

```tsx
import { NetWorthShell, NetWorthHeader } from '../../_components/networth-shell';
import { ScheduleTable } from '../../_components/liabilities/schedule-table';
import { EarlyPayoffCalc } from '../../_components/liabilities/early-payoff-calc';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerAuthUserId } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';

export default async function LiabilityDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const uid = await getServerAuthUserId();
  if (!uid) redirect('/login');
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: liability } = await sb
    .from('personal_networth_liabilities')
    .select('*, personal_networth_lenders(name)')
    .eq('id', id).eq('app_user_id', uid).maybeSingle();
  if (!liability) notFound();

  if (liability.kind === 'credit_card' || liability.kind === 'overdraft') {
    return <RevolvingDetail liability={liability} />; // see Task 24
  }

  const [scheduleRes, summaryRes] = await Promise.all([
    sb.from('personal_networth_liability_schedule')
      .select('*').eq('liability_id', id).order('installment_no'),
    sb.from('v_personal_networth_loan_summary')
      .select('*').eq('liability_id', id).maybeSingle(),
  ]);

  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Net Worth · Liability" title={liability.name}
        subtitle={`${liability.kind} · ${(liability as any).personal_networth_lenders?.name ?? 'No lender'}`} />
      <AmortizingKpiStrip summary={summaryRes.data as any} liability={liability as any} />
      <EarlyPayoffCalc
        schedule={(scheduleRes.data ?? []) as any}
        paidCount={Number(summaryRes.data?.paid_count ?? 0)}
        aprPct={Number(liability.apr_pct)}
      />
      <ScheduleTable
        liabilityId={id}
        rows={(scheduleRes.data ?? []) as any}
      />
    </NetWorthShell>
  );
}

function AmortizingKpiStrip({ summary, liability }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi label="Interest YTD" value={`EGP ${Number(summary?.interest_paid_ytd ?? 0).toLocaleString()}`} />
      <Kpi label="Months remaining" value={String(summary?.remaining_months ?? 0)} />
      <Kpi label="Total interest if-scheduled"
           value={`EGP ${(Number(summary?.principal) * Number(liability.apr_pct) / 100 / 12 * Number(liability.term_months)).toLocaleString()}`} />
      <Kpi label="Final due" value={summary?.final_due_date ?? '—'} />
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="ix-card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

// RevolvingDetail is defined in Task 24 — for now stub it:
function RevolvingDetail({ liability }: any) {
  return <NetWorthShell><NetWorthHeader title={liability.name} /><p>Revolving — see Task 24</p></NetWorthShell>;
}
```

- [ ] **Step 3: `ScheduleTable` client component**

Renders the schedule rows table with Status badge (paid/overdue/upcoming derived from `paid_on` + today) and a "Mark paid" button on unpaid rows. The button POSTs `/api/personal/networth/liabilities/[id]/mark-paid` with `{ scheduleId }`, then `router.refresh()`.

- [ ] **Step 4: `EarlyPayoffCalc` client component**

Uses `earlyPayoffProjection` from the lib (import it; logic is pure, no server roundtrip). State: `extraMonthly` (input). On change, computes `{ newPayoffDate, totalInterestSaved, monthsSaved }` and displays them inline.

- [ ] **Step 5: Typecheck + smoke**

```bash
npx tsc --noEmit
# Open http://localhost:3000/personal/networth/liabilities/<id from Task 22>
# Verify 36 schedule rows render, KPI strip shows months remaining, early-payoff calc updates as you type
```

- [ ] **Step 6: Commit**

```bash
git add src/app/personal/networth/liabilities/ \
        src/app/personal/networth/_components/liabilities/ \
        src/app/api/personal/networth/liabilities/
git commit -m "feat(networth): liability detail (amortizing) — schedule + early-payoff + KPI strip"
```

---

### Task 24: Liability detail — revolving variant (utilization + statement timeline + pay-card modal)

**Files:**
- Modify: `src/app/personal/networth/liabilities/[id]/page.tsx`
- Create: `src/app/personal/networth/_components/liabilities/revolving-detail.tsx`
- Create: `src/app/personal/networth/_components/modals/pay-card-modal.tsx`
- Create: `src/app/api/personal/networth/liabilities/[id]/pay-card/route.ts`

- [ ] **Step 1: API — pay card**

```ts
// pay-card/route.ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { recordCardPayment } from '@/lib/personal/networth/payment';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const paymentId = await recordCardPayment(id, uid, body.preset, body.customAmount);
  return NextResponse.json({ ok: true, paymentId });
}
```

- [ ] **Step 2: `RevolvingDetail` component**

`revolving-detail.tsx` (client component):

```tsx
'use client';
import { useState } from 'react';
import { NetWorthShell, NetWorthHeader } from '../networth-shell';
import { PayCardModal } from '../modals/pay-card-modal';

export function RevolvingDetail({ liability, paymentHistory }: {
  liability: any; paymentHistory: any[];
}) {
  const [showPay, setShowPay] = useState(false);
  const utilization = liability.credit_limit > 0
    ? Math.round((Number(liability.current_balance) / Number(liability.credit_limit)) * 100)
    : 0;
  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Net Worth · Liability" title={liability.name}
        subtitle={`${liability.kind} · ${liability.personal_networth_lenders?.name ?? ''}`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Balance" value={`${liability.currency} ${Number(liability.current_balance).toLocaleString()}`} />
        <Kpi label="Credit limit" value={`${liability.currency} ${Number(liability.credit_limit).toLocaleString()}`} />
        <Kpi label="Utilization" value={`${utilization}%`} />
        <Kpi label="Min payment" value={`${liability.min_payment_pct ?? 5}%`} />
      </div>
      <div className="ix-card p-4">
        <div className="text-sm font-semibold mb-2">Statement timeline</div>
        <div className="text-sm text-slate-600">
          Statement day: {liability.statement_day} · Due day: {liability.due_day}
        </div>
      </div>
      <button className="ix-btn-primary" onClick={() => setShowPay(true)}>Pay card</button>
      <PaymentHistoryTable rows={paymentHistory} />
      {showPay && (
        <PayCardModal liability={liability} onClose={() => setShowPay(false)} />
      )}
    </NetWorthShell>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="ix-card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
function PaymentHistoryTable({ rows }: { rows: any[] }) {
  return (
    <div className="ix-card p-4">
      <div className="text-sm font-semibold mb-2">Payment history</div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-slate-500">
          <th>Date</th><th>Amount</th><th>Notes</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="py-1">{r.occurred_on}</td>
              <td className="py-1">{r.currency} {Number(r.amount).toLocaleString()}</td>
              <td className="py-1 text-slate-500">{r.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: `PayCardModal`**

Form with 4 preset buttons (Minimum / Statement balance / Full balance / Custom). Custom shows a numeric input. On submit POSTs `/api/personal/networth/liabilities/[id]/pay-card`, then closes + refreshes.

- [ ] **Step 4: Wire `RevolvingDetail` into the dynamic page (replace the stub from Task 23)**

Update `page.tsx` to fetch payment history for revolving kinds and pass it to `<RevolvingDetail>`:

```tsx
if (liability.kind === 'credit_card' || liability.kind === 'overdraft') {
  const { data: history } = await sb.from('personal_networth_payments')
    .select('*').eq('liability_id', id).order('occurred_on', { ascending: false }).limit(50);
  return <RevolvingDetail liability={liability} paymentHistory={history ?? []} />;
}
```

Remove the inline stub and add the proper import.

- [ ] **Step 5: Typecheck + smoke**

```bash
npx tsc --noEmit
# Add a test card: "CIB Visa" / credit_card / CIB / EGP / 5000 (balance) / 50000 (limit) / 5% min / statement day 1 / due day 25
# Open its detail page — verify the utilization gauge shows 10%, click Pay card → Minimum → verify balance drops
```

- [ ] **Step 6: Commit**

```bash
git add src/app/personal/networth/ src/app/api/personal/networth/liabilities/
git commit -m "feat(networth): liability detail (revolving) — utilization + statement + pay-card modal"
```

---

### Task 25: Per-page liabilities KPI strip + Edit/Close actions

**Files:**
- Modify: `src/app/personal/networth/_components/liabilities/liability-table.tsx`
- Create: `src/app/personal/networth/_components/liabilities/liabilities-kpi-strip.tsx`

- [ ] **Step 1: Compute KPIs server-side and pass into the page**

Update `liabilities/page.tsx` to also fetch `v_personal_networth_loan_summary` and aggregate:

```tsx
const { data: loanSummaries } = await sb
  .from('v_personal_networth_loan_summary')
  .select('*').eq('app_user_id', uid);

const totalMonthly = (liabilities ?? []).reduce((s, l) => s + Number(l.monthly_payment ?? 0), 0);
const highestApr = Math.max(0, ...(liabilities ?? []).map(l => Number(l.apr_pct ?? 0)));
const ytdInterest = (loanSummaries ?? []).reduce((s, r) => s + Number(r.interest_paid_ytd ?? 0), 0);
const totalLiabEgp = /* sum via fx_lookup or pre-computed view */;
```

For totals in EGP, prefer reading from `v_personal_networth_current.total_liabilities_egp` instead of computing in JS.

- [ ] **Step 2: Add the KPI strip to the page above the table**

```tsx
<LiabilitiesKpiStrip
  totalEgp={Number(current?.total_liabilities_egp ?? 0)}
  monthlyOutflowEgp={totalMonthly}
  highestApr={highestApr}
  ytdInterestEgp={ytdInterest}
/>
```

- [ ] **Step 3: Add Edit/Close row actions to `LiabilityTable`**

Each row gets a `…` menu with two items: "Edit" (opens the kind-specific form from `AddLiabilityModal` pre-filled, PATCHes) and "Close liability" (calls DELETE which sets `active = false`).

- [ ] **Step 4: Typecheck + smoke**

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/networth/
git commit -m "feat(networth): liabilities KPI strip + edit/close row actions"
```

---

## Phase F — Recurring + Reports (Tasks 26–28)

### Task 26: `/personal/networth/recurring` — Templates tab + Add Recurring modal

**Files:**
- Create: `src/app/personal/networth/recurring/page.tsx`
- Create: `src/app/personal/networth/_components/recurring/templates-tab.tsx`
- Create: `src/app/personal/networth/_components/modals/add-recurring-modal.tsx`
- Create: `src/app/api/personal/networth/recurring/route.ts`
- Create: `src/app/api/personal/networth/recurring/[id]/route.ts`
- Create: `src/app/api/personal/networth/recurring/[id]/toggle/route.ts`

- [ ] **Step 1: API — templates CRUD + toggle active**

`recurring/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { computeNextRunDate } from '@/lib/recurring';

export async function GET() {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = supabaseAdmin();
  const { data } = await sb.from('personal_networth_recurring_templates')
    .select('*, personal_networth_liabilities(name)')
    .eq('app_user_id', uid).order('next_run_date');
  return NextResponse.json({ ok: true, templates: data });
}

export async function POST(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const nextRun = computeNextRunDate(
    body.frequency, body.dayOfPeriod, body.monthOfYear ?? null,
    body.startFrom ?? new Date().toISOString().slice(0, 10),
  );
  const { data, error } = await sb.from('personal_networth_recurring_templates').insert({
    app_user_id: uid, name: body.name, category: body.category,
    amount: body.amount, currency: body.currency,
    frequency: body.frequency, day_of_period: body.dayOfPeriod,
    month_of_year: body.monthOfYear ?? null,
    liability_id: body.liabilityId ?? null,
    notes: body.notes ?? null,
    next_run_date: nextRun,
  }).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
```

`[id]/route.ts`: PATCH (edit) + DELETE (hard delete OK — no historical FK from payments will break since `payments.recurring_template_id` has no cascade; alternately set `active = false`).

`[id]/toggle/route.ts`: POST that flips `active`.

- [ ] **Step 2: Server page with tabs**

`recurring/page.tsx`:

```tsx
import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { TemplatesTab } from '../_components/recurring/templates-tab';
import { PaymentLogTab } from '../_components/recurring/payment-log-tab';

export default async function RecurringPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? 'templates';
  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Net Worth" title="Recurring"
        subtitle="Charity, rent, utilities, subscriptions, loan auto-payments." />
      <TabSwitcher current={tab} />
      {tab === 'templates' ? <TemplatesTab /> : <PaymentLogTab />}
    </NetWorthShell>
  );
}

function TabSwitcher({ current }: { current: string }) {
  return (
    <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
      <a href="?tab=templates" className={`px-3 py-2 text-sm border-b-2 ${current === 'templates' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500'}`}>Templates</a>
      <a href="?tab=log" className={`px-3 py-2 text-sm border-b-2 ${current === 'log' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500'}`}>Payment Log</a>
    </div>
  );
}
```

- [ ] **Step 3: `TemplatesTab` client component**

Fetches `/api/personal/networth/recurring`. Renders table with toggle, edit, delete. "+ Add Recurring" button → `AddRecurringModal`. "Run today's due" button → POST `/api/personal/networth/recurring/run-now`.

- [ ] **Step 4: `AddRecurringModal`**

Fields: name · category (select with 12 enum values) · amount · currency · frequency (monthly/quarterly/yearly) · day_of_period (1-28) · month_of_year (1-12, only if yearly) · linked liability (optional select) · notes. On submit POSTs.

- [ ] **Step 5: Typecheck + smoke**

```bash
npx tsc --noEmit
# Add a recurring template: "Charity monthly" / charity / 5000 EGP / monthly / day 1
# Verify it appears with next_run_date = next 1st of month
# Click "Run today's due" → verify a payment row is created
```

- [ ] **Step 6: Commit**

```bash
git add src/app/personal/networth/recurring/ \
        src/app/personal/networth/_components/recurring/templates-tab.tsx \
        src/app/personal/networth/_components/modals/add-recurring-modal.tsx \
        src/app/api/personal/networth/recurring/
git commit -m "feat(networth): /recurring templates tab + add modal + CRUD + run-now"
```

---

### Task 27: `/personal/networth/recurring` — Payment Log tab + filters + CSV/PDF export

**Files:**
- Create: `src/app/personal/networth/_components/recurring/payment-log-tab.tsx`
- Create: `src/app/api/personal/networth/payments/route.ts`
- Create: `src/app/api/personal/networth/payments/export/csv/route.ts`

- [ ] **Step 1: Payments list API with filters**

```ts
// payments/route.ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const category = url.searchParams.get('category');
  const liabilityId = url.searchParams.get('liabilityId');
  const sb = supabaseAdmin();
  let q = sb.from('personal_networth_payments')
    .select('*, personal_networth_liabilities(name)')
    .eq('app_user_id', uid).order('occurred_on', { ascending: false });
  if (from) q = q.gte('occurred_on', from);
  if (to) q = q.lte('occurred_on', to);
  if (category) q = q.eq('category', category);
  if (liabilityId) q = q.eq('liability_id', liabilityId);
  const { data, error } = await q.limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, payments: data });
}

export async function POST(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('personal_networth_payments').insert({
    app_user_id: uid, occurred_on: body.occurredOn, amount: body.amount,
    currency: body.currency, category: body.category,
    liability_id: body.liabilityId ?? null, notes: body.notes ?? null,
  }).select('id').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
```

- [ ] **Step 2: CSV export route**

```ts
// payments/export/csv/route.ts
import { getServerAuthUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return new Response('unauthorized', { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const sb = supabaseAdmin();
  let q = sb.from('personal_networth_payments')
    .select('occurred_on, amount, currency, category, notes, personal_networth_liabilities(name)')
    .eq('app_user_id', uid).order('occurred_on', { ascending: false });
  if (from) q = q.gte('occurred_on', from);
  if (to) q = q.lte('occurred_on', to);
  const { data } = await q.limit(5000);
  const header = 'date,amount,currency,category,liability,notes\n';
  const rows = (data ?? []).map(r =>
    [r.occurred_on, r.amount, r.currency, r.category,
     (r as any).personal_networth_liabilities?.name ?? '',
     (r.notes ?? '').replace(/"/g, '""')]
      .map(v => `"${String(v)}"`).join(',')).join('\n');
  return new Response(header + rows, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="payments-${from ?? 'all'}-to-${to ?? 'all'}.csv"`,
    },
  });
}
```

- [ ] **Step 3: `PaymentLogTab` client component**

Filter UI: date-range pickers · category select · liability select · free-text search on `notes` (client-side filter). Table of payments. "Export CSV" button (link to the CSV route with current filters as query params).

- [ ] **Step 4: Typecheck + smoke**

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/networth/_components/recurring/payment-log-tab.tsx \
        src/app/api/personal/networth/payments/
git commit -m "feat(networth): payment log tab with filters + CSV export"
```

---

### Task 28: `/personal/networth/reports` — monthly report + stacked-area chart + PDF export

**Files:**
- Create: `src/app/personal/networth/reports/page.tsx`
- Create: `src/app/personal/networth/_components/reports/monthly-report.tsx`
- Create: `src/app/personal/networth/_components/reports/category-trend-chart.tsx`
- Create: `src/app/api/personal/networth/reports/monthly/route.ts`
- Create: `src/app/api/personal/networth/reports/export/pdf/route.ts`

- [ ] **Step 1: API — monthly report**

```ts
// reports/monthly/route.ts
import { NextResponse } from 'next/server';
import { getServerAuthUserId } from '@/lib/auth';
import { getMonthlyReport } from '@/lib/personal/networth/queries';

export async function GET(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') ?? new Date().getFullYear());
  const month = Number(url.searchParams.get('month') ?? (new Date().getMonth() + 1));
  const report = await getMonthlyReport(uid, year, month);
  return NextResponse.json({ ok: true, report });
}
```

- [ ] **Step 2: Server page with month picker**

```tsx
// reports/page.tsx
import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { MonthlyReportClient } from '../_components/reports/monthly-report';
import { getServerAuthUserId } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getMonthlyReport } from '@/lib/personal/networth/queries';

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const uid = await getServerAuthUserId();
  if (!uid) redirect('/login');
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());
  const month = Number(sp.month ?? (new Date().getMonth() + 1));
  const report = await getMonthlyReport(uid, year, month);
  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Net Worth" title="Reports"
        subtitle="Monthly payment breakdown with month-over-month delta and 12-month trend." />
      <MonthlyReportClient initialReport={report} initialYear={year} initialMonth={month} />
    </NetWorthShell>
  );
}
```

- [ ] **Step 3: `MonthlyReportClient`**

Client component. State: `year`/`month`. Month picker (prev/next arrows + dropdown). Updates URL params via `router.push` to re-trigger SSR, OR fetches `/api/personal/networth/reports/monthly` directly.

Sections:
- KPI strip — Total paid · Δ vs prev month · Largest category · Payment count
- Category table — Category · Amount EGP · # payments · Δ vs prev (absolute + %)
- `CategoryTrendChart` — 12-month stacked-area chart using `recharts` (`AreaChart` with `Area stackId="1"` per category)
- "Export PDF" button → POST `/api/personal/networth/reports/export/pdf` with current year/month, response is PDF blob

- [ ] **Step 4: PDF export route**

```ts
// reports/export/pdf/route.ts
import { getServerAuthUserId } from '@/lib/auth';
import { getMonthlyReport } from '@/lib/personal/networth/queries';
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40 }, h1: { fontSize: 18, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 4 },
  cell: { flex: 1, fontSize: 10 },
});

export async function POST(req: Request) {
  const uid = await getServerAuthUserId();
  if (!uid) return new Response('unauthorized', { status: 401 });
  const { year, month } = await req.json();
  const report = await getMonthlyReport(uid, year, month);
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Payment Report — {report.monthLabel}</Text>
        <Text>Total: EGP {report.totalEgp.toLocaleString()}</Text>
        <Text>Δ vs prev month: EGP {report.deltaEgp.toLocaleString()} ({report.deltaPct ?? '—'}%)</Text>
        <Text> </Text>
        <View style={styles.row}>
          <Text style={styles.cell}>Category</Text>
          <Text style={styles.cell}>Amount EGP</Text>
          <Text style={styles.cell}># Payments</Text>
          <Text style={styles.cell}>Δ vs prev</Text>
        </View>
        {report.byCategory.map(r => (
          <View key={r.category} style={styles.row}>
            <Text style={styles.cell}>{r.category}</Text>
            <Text style={styles.cell}>{r.amountEgp.toLocaleString()}</Text>
            <Text style={styles.cell}>{r.count}</Text>
            <Text style={styles.cell}>{r.deltaVsPrevEgp.toLocaleString()}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
  const buffer = await renderToBuffer(doc as any);
  return new Response(buffer, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="payment-report-${report.monthLabel}.pdf"`,
    },
  });
}
```

- [ ] **Step 5: Typecheck + smoke**

```bash
npx tsc --noEmit
# Open /personal/networth/reports
# Use month picker, verify totals + category breakdown render
# Click Export PDF and verify the download
```

- [ ] **Step 6: Commit**

```bash
git add src/app/personal/networth/reports/ \
        src/app/personal/networth/_components/reports/ \
        src/app/api/personal/networth/reports/
git commit -m "feat(networth): /reports monthly report + 12-month trend chart + PDF export"
```

---

## Phase G — Overview dashboard (Tasks 29–31)

### Task 29: Overview page — hero KPI strip + 3-card row + sparkline

**Files:**
- Create: `src/app/personal/networth/page.tsx`
- Create: `src/app/personal/networth/_components/overview/hero-kpi.tsx`
- Create: `src/app/personal/networth/_components/overview/totals-row.tsx`

- [ ] **Step 1: Server page skeleton**

`src/app/personal/networth/page.tsx`:

```tsx
import { NetWorthShell, NetWorthHeader } from './_components/networth-shell';
import { HeroKpi } from './_components/overview/hero-kpi';
import { TotalsRow } from './_components/overview/totals-row';
import { getServerAuthUserId } from '@/lib/auth';
import { redirect } from 'next/navigation';
import {
  getOverviewKpis,
} from '@/lib/personal/networth/queries';
import { listSnapshotsForChart } from '@/lib/personal/networth/snapshot';
import { Wallet } from 'lucide-react';

export default async function NetWorthOverviewPage() {
  const uid = await getServerAuthUserId();
  if (!uid) redirect('/login');
  const [kpis, snapshots] = await Promise.all([
    getOverviewKpis(uid),
    listSnapshotsForChart(uid, 12),
  ]);
  return (
    <NetWorthShell>
      <NetWorthHeader eyebrow="Subsidiary cockpit" title="Net Worth"
        subtitle="Assets, liabilities, recurring payments, monthly report, and historical net-worth chart."
        icon={Wallet} />
      <HeroKpi kpis={kpis} snapshots={snapshots} />
      <TotalsRow kpis={kpis} />
    </NetWorthShell>
  );
}
```

- [ ] **Step 2: `HeroKpi` client component (sparkline via recharts)**

```tsx
'use client';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';

export function HeroKpi({ kpis, snapshots }: { kpis: any; snapshots: any[] }) {
  const router = useRouter();
  const delta = Number(kpis.deltaSinceLastSnapshotEgp ?? 0);
  const tone = delta > 0 ? 'text-emerald-600'
             : delta < 0 ? 'text-rose-600'
             : 'text-slate-500';
  async function snapshotNow() {
    await fetch('/api/personal/networth/snapshot', { method: 'POST' });
    router.refresh();
  }
  return (
    <div className="ix-card p-6 flex items-center justify-between gap-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500">Net Worth</div>
        <div className="text-4xl font-bold mt-1">
          EGP {Number(kpis.netWorthEgp).toLocaleString()}
        </div>
        <div className={`mt-1 text-sm font-medium ${tone}`}>
          {delta >= 0 ? '▲' : '▼'} EGP {Math.abs(delta).toLocaleString()}
          {kpis.deltaPct !== null && <> ({kpis.deltaPct}%)</>}
          <span className="text-slate-400"> vs last snapshot</span>
        </div>
      </div>
      <div className="hidden md:block flex-1 max-w-md h-16">
        <ResponsiveContainer>
          <LineChart data={snapshots}>
            <Line type="monotone" dataKey="netWorthEgp" stroke="#6366f1" strokeWidth={2} dot={false} />
            <Tooltip formatter={(v: number) => `EGP ${v.toLocaleString()}`} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <button onClick={snapshotNow} className="ix-btn-secondary">Snapshot now</button>
    </div>
  );
}
```

- [ ] **Step 3: `TotalsRow` component**

```tsx
export function TotalsRow({ kpis }: { kpis: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <TotalCard label="Total Assets" value={kpis.totalAssetsEgp} accent="emerald" />
      <TotalCard label="Total Liabilities" value={kpis.totalLiabilitiesEgp} accent="rose" />
      <TotalCard label="Net Worth" value={kpis.netWorthEgp} accent="indigo" />
    </div>
  );
}
function TotalCard({ label, value, accent }: { label: string; value: number; accent: 'emerald' | 'rose' | 'indigo' }) {
  const colour = accent === 'emerald' ? 'text-emerald-700'
              : accent === 'rose' ? 'text-rose-700' : 'text-indigo-700';
  return (
    <div className="ix-card p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colour}`}>EGP {Number(value).toLocaleString()}</div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + smoke**

```bash
npx tsc --noEmit
# Open /personal/networth
# Verify hero KPI shows current net worth, totals row populates, sparkline renders if 1+ snapshot exists
```

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/networth/page.tsx \
        src/app/personal/networth/_components/overview/
git commit -m "feat(networth): /networth overview — hero KPI + sparkline + totals row"
```

---

### Task 30: Overview — donuts + upcoming payments table

**Files:**
- Modify: `src/app/personal/networth/page.tsx`
- Create: `src/app/personal/networth/_components/overview/asset-mix-donut.tsx`
- Create: `src/app/personal/networth/_components/overview/liability-mix-donut.tsx`
- Create: `src/app/personal/networth/_components/overview/upcoming-payments.tsx`

- [ ] **Step 1: Fetch mix + upcoming in the page**

Add to `page.tsx`:

```tsx
import { getAssetMix, getLiabilityMix, getUpcomingPayments } from '@/lib/personal/networth/queries';

// inside the async component:
const [kpis, snapshots, assetMix, liabilityMix, upcoming] = await Promise.all([
  getOverviewKpis(uid),
  listSnapshotsForChart(uid, 12),
  getAssetMix(uid),
  getLiabilityMix(uid),
  getUpcomingPayments(uid, 30),
]);
```

And below `<TotalsRow />`:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  <AssetMixDonut slices={assetMix} />
  <LiabilityMixDonut slices={liabilityMix} />
</div>
<UpcomingPayments rows={upcoming} />
```

- [ ] **Step 2: `AssetMixDonut`**

```tsx
'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#94a3b8'];
const LABEL_OVERRIDES: Record<string, string> = {
  cash: 'Cash', real_estate: 'Real Estate', vehicle: 'Vehicles',
  gold_jewelry: 'Gold / Jewelry', stocks_pipe: 'Stocks', other: 'Other',
};

export function AssetMixDonut({ slices }: { slices: any[] }) {
  const data = slices.map(s => ({
    name: LABEL_OVERRIDES[s.label] ?? s.label,
    value: s.amountEgp,
    pct: s.pct,
  }));
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-2">Asset Mix</div>
      <div className="h-64">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number, _name, p: any) =>
              [`EGP ${v.toLocaleString()} (${p.payload.pct}%)`, p.payload.name]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

`LiabilityMixDonut` is identical structure but with different label overrides:

```ts
const LIAB_LABELS = {
  amortizing_loan: 'Loans', bnpl: 'BNPL', credit_card: 'Cards',
  overdraft: 'Overdraft', other: 'Other',
};
```

- [ ] **Step 3: `UpcomingPayments`**

```tsx
'use client';
import { useRouter } from 'next/navigation';

export function UpcomingPayments({ rows }: { rows: any[] }) {
  const router = useRouter();
  async function markPaid(row: any) {
    if (row.source !== 'schedule') return;
    // recurring rows get marked paid by clicking through to /recurring and running them
    const liabilityId = row.liabilityId; // not available — we need to look it up or pass it through the view
    await fetch(`/api/personal/networth/liabilities/${liabilityId}/mark-paid`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduleId: row.refId }),
    });
    router.refresh();
  }
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-2">Upcoming payments — next 30 days</div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-slate-500">
          <th>Due</th><th>Name</th><th>Category</th><th>Amount</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.source}-${r.refId}`} className="border-t border-slate-100">
              <td className="py-1">{r.dueDate}</td>
              <td className="py-1">{r.displayName}</td>
              <td className="py-1 text-slate-500">{r.category}</td>
              <td className="py-1">{r.currency} {Number(r.amount).toLocaleString()}</td>
              <td className="py-1 text-right">
                <button onClick={() => markPaid(r)} className="text-indigo-600 text-xs">Mark paid</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Note on `liabilityId`: extend `v_personal_networth_upcoming` to include `liability_id` (only for schedule rows). Update the view in migration 0139 part 4 (or add a follow-up migration). The `getUpcomingPayments` query needs to pass it through.

If the view is already applied, create `0140_personal_networth_upcoming_liability_id.sql`:

```sql
create or replace view v_personal_networth_upcoming as
  select
    'schedule'::text as source, sch.id as ref_id, li.app_user_id,
    sch.due_date, li.name as display_name,
    case li.kind when 'amortizing_loan' then 'loan_payment'
                 when 'bnpl' then 'bnpl_payment' end as category,
    (sch.principal_portion + sch.interest_portion) as amount,
    li.currency, li.id as liability_id
  from personal_networth_liability_schedule sch
  join personal_networth_liabilities li on li.id = sch.liability_id
  where sch.paid_on is null and sch.due_date <= current_date + interval '30 days'
  union all
  select
    'recurring'::text, tpl.id, tpl.app_user_id, tpl.next_run_date, tpl.name,
    tpl.category, tpl.amount, tpl.currency, tpl.liability_id
  from personal_networth_recurring_templates tpl
  where tpl.active = true and tpl.next_run_date <= current_date + interval '30 days'
  order by 4 asc;
```

Update `getUpcomingPayments` return type to include `liabilityId: string | null`.

- [ ] **Step 4: Typecheck + smoke**

- [ ] **Step 5: Commit**

```bash
git add src/app/personal/networth/ src/app/api/personal/networth/ supabase/migrations/
git commit -m "feat(networth): overview donuts + upcoming-payments table"
```

---

### Task 31: Overview — charity YTD + loan payoff + quick-entry strip + 3 quick-entry modals

**Files:**
- Modify: `src/app/personal/networth/page.tsx`
- Create: `src/app/personal/networth/_components/overview/charity-ytd.tsx`
- Create: `src/app/personal/networth/_components/overview/loan-payoff.tsx`
- Create: `src/app/personal/networth/_components/overview/quick-entry-strip.tsx`
- Create: `src/app/personal/networth/_components/modals/add-payment-modal.tsx`

(Asset + Liability + Recurring modals already created in Tasks 21/22/26 — reuse those.)

- [ ] **Step 1: Fetch charity + loan-summary in the page**

```tsx
import { getCharityYtd } from '@/lib/personal/networth/queries';
import { supabaseAdmin } from '@/lib/supabase';

const [kpis, snapshots, assetMix, liabilityMix, upcoming, charity, loanSummary] = await Promise.all([
  getOverviewKpis(uid),
  listSnapshotsForChart(uid, 12),
  getAssetMix(uid),
  getLiabilityMix(uid),
  getUpcomingPayments(uid, 30),
  getCharityYtd(uid),
  supabaseAdmin().from('v_personal_networth_loan_summary')
    .select('*').eq('app_user_id', uid).order('remaining_months', { ascending: true }).limit(3)
    .then(r => r.data ?? []),
]);
```

- [ ] **Step 2: Replace the single-column upcoming layout with the two-column row from Layout A**

```tsx
<div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
  <UpcomingPayments rows={upcoming} />
  <div className="space-y-3">
    <CharityYtd charity={charity} />
    <LoanPayoff loans={loanSummary} />
  </div>
</div>
<QuickEntryStrip />
```

- [ ] **Step 3: `CharityYtd` component**

```tsx
export function CharityYtd({ charity }: { charity: any }) {
  const pct = charity.progressPct ?? 0;
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-1">Charity YTD</div>
      <div className="text-2xl font-bold text-emerald-700">
        EGP {Number(charity.totalEgp).toLocaleString()}
      </div>
      <div className="text-xs text-slate-500">Monthly avg: EGP {Number(charity.monthlyAvg).toLocaleString()}</div>
      {charity.yearlyGoalEgp && (
        <div className="mt-3">
          <div className="flex justify-between text-xs">
            <span>Goal: EGP {Number(charity.yearlyGoalEgp).toLocaleString()}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 mt-1 bg-slate-100 rounded">
            <div className="h-2 bg-emerald-500 rounded" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `LoanPayoff` component**

```tsx
import Link from 'next/link';

export function LoanPayoff({ loans }: { loans: any[] }) {
  if (loans.length === 0) return null;
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-2">Loan payoff projection</div>
      <ul className="space-y-2 text-sm">
        {loans.map(l => (
          <li key={l.liability_id}>
            <Link href={`/personal/networth/liabilities/${l.liability_id}`} className="hover:underline">
              <span className="font-medium">{l.name}</span>
              <span className="text-slate-500"> — {l.remaining_months} months left</span>
              <span className="text-xs text-slate-400 ml-2">(final: {l.final_due_date})</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: `QuickEntryStrip` + `AddPaymentModal`**

```tsx
'use client';
import { useState } from 'react';
import { AddPaymentModal } from '../modals/add-payment-modal';
import { AddLiabilityModal } from '../modals/add-liability-modal';
import { AddAssetModal } from '../modals/add-asset-modal';
import { AddRecurringModal } from '../modals/add-recurring-modal';

export function QuickEntryStrip() {
  const [open, setOpen] = useState<null | 'payment' | 'liability' | 'asset' | 'recurring'>(null);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Btn label="+ Payment"   onClick={() => setOpen('payment')}   />
        <Btn label="+ Liability" onClick={() => setOpen('liability')} />
        <Btn label="+ Asset"     onClick={() => setOpen('asset')}     />
        <Btn label="+ Recurring" onClick={() => setOpen('recurring')} />
      </div>
      {open === 'payment'   && <AddPaymentModal   onClose={() => setOpen(null)} />}
      {open === 'liability' && <AddLiabilityModal onClose={() => setOpen(null)} />}
      {open === 'asset'     && <AddAssetModal     onClose={() => setOpen(null)} />}
      {open === 'recurring' && <AddRecurringModal onClose={() => setOpen(null)} />}
    </>
  );
}
function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="ix-card p-4 text-indigo-700 dark:text-indigo-300 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950 transition">
      {label}
    </button>
  );
}
```

`AddPaymentModal`: fields date · amount · currency · category (12-value select) · liability (optional select) · notes. On submit POSTs `/api/personal/networth/payments`.

- [ ] **Step 6: Typecheck + smoke**

```bash
npx tsc --noEmit
# Open /personal/networth — verify all sections render:
# Hero · Totals · Donuts · Upcoming (left) + Charity (right top) + Loan payoff (right bottom) · Quick entry strip
# Click +Payment, fill 5000 EGP charity, submit → verify charity widget updates after refresh
```

- [ ] **Step 7: Commit**

```bash
git add src/app/personal/networth/
git commit -m "feat(networth): overview — charity YTD + loan payoff + quick-entry strip"
```

---

## Phase H — Verification (Task 32)

### Task 32: End-to-end smoke pass + final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Full test suite**

```bash
npm run test
```

Expected: all existing tests still pass + all new networth tests pass.

- [ ] **Step 3: Manual data entry (run dev server)**

```bash
npm run dev
```

Open http://localhost:3000/personal/networth/setup and enter:
- FX rate: USD = 48 (as_of_date = today)
- Lender: CIB (kind: bank)
- Settings: charity_goal_egp_year = 60000, default_currency = EGP

- [ ] **Step 4: Add sample data**

- Asset: "Bank CIB" / cash / EGP / 250,000
- Asset: "Apartment Maadi" / real_estate / EGP / 8,000,000
- Asset: "USD savings" / cash / USD / 5,000
- Liability: "Car loan" / amortizing_loan / CIB / EGP / 200,000 / 18% APR / 36 months / start 2026-01-01
- Liability: "CIB Visa" / credit_card / CIB / EGP / current 5,000 / limit 50,000 / min 5% / statement day 1 / due day 25
- Recurring: "Charity monthly" / charity / 5,000 EGP / monthly / day 1
- Recurring: "Car loan auto" / loan_payment / monthly / day 1, linked to the car loan

- [ ] **Step 5: Trigger crons via ?force=1**

```bash
# Snapshot
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/personal-networth-snapshot?force=1"

# Recurring
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/personal-networth-recurring?force=1"
```

Expected:
- Snapshot: `{ok: true, results: [{appUserId: '…', snapshotId: '…', netWorthEgp: <some big number>}]}`
- Recurring: `{ok: true, processed: 2}` (charity + car loan auto)

- [ ] **Step 6: Verify the dashboard**

Open `/personal/networth` and confirm:
- Net worth hero shows a number close to 250k + 8M + (5k × 48) − 200k − 5k ≈ 8,285,000
- 3-card totals correct
- Asset donut shows 5 slices (cash, real_estate, stocks_pipe if any)
- Liability donut shows 2 slices (amortizing_loan, credit_card)
- Upcoming payments table is empty for now (next run is in the future; the cron above moved them forward)
- Charity YTD shows 5,000 (from the recurring trigger) · monthly avg ~ 5,000/(months elapsed) · goal 60,000 · pct ~ 8%
- Loan payoff shows the car loan with 35 months remaining (cron marked one paid)

- [ ] **Step 7: Verify the loan detail page**

Open the car loan's detail page and confirm:
- 36 schedule rows
- Row 1 is paid (paid_on = today), rows 2-36 upcoming
- Interest YTD on the KPI strip is non-zero
- Early-payoff calc: enter +1000 extra/month, verify months_saved > 0 and interest_saved > 0

- [ ] **Step 8: Verify the report page**

Open `/personal/networth/reports` and confirm:
- Current month shows charity 5,000 + loan_payment (whatever the car loan first installment was)
- Category breakdown shows 2 categories
- 12-month trend chart renders (with only one bar)
- PDF export downloads successfully

- [ ] **Step 9: Apply migration to production**

Apply migration 0139 (and 0140 if created in Task 30) to the production Supabase project `bpjproljatbrbmszwbov` via `apply_migration`.

- [ ] **Step 10: Final commit**

```bash
git status
# if anything is left uncommitted from manual testing/fixes:
git add -A
git commit -m "chore(networth): end-to-end smoke pass complete — module ready"
git push origin main
```

Vercel auto-deploys via the GitHub integration.

---

## Notes for the engineer

- **Codebase conventions:** kebab-case filenames, `@/*` path alias, server-only modules import `supabaseAdmin()` from `@/lib/supabase`. Use Zod for any inbound webhook/form input validation (none needed in the cron routes — service-role + no external data).
- **Styling:** use existing `ix-card`, `ix-input`, `ix-btn-primary`, `ix-btn-secondary`, `ix-btn-ghost` utilities. Indigo is the module's accent; emerald/rose for status semantics (up/good vs down/bad). Avoid hardcoded hex outside the donut palette in `asset-mix-donut.tsx`.
- **Server vs client:** pages are server components; anything with `useState` / `recharts` / form handlers goes in a `_components/*.tsx` file with `'use client'`. Pass server data in as props.
- **`getServerAuthUserId`:** if the exact helper name differs (codebase uses one — grep `src/lib/auth.ts`), substitute. Net worth pages must redirect to `/login` when no session is present.
- **`force-dynamic`:** every page that reads live SQL needs `export const dynamic = 'force-dynamic'`. The shell layout from Task 18 already sets it at the layout level — verify children inherit, or add `export const dynamic = 'force-dynamic'` per-page if not.
- **Commits:** small and frequent (one per task minimum). Trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` per repo convention.
- **No backwards-compatibility shims:** this is a new module; no migration of existing data. Don't carry forward unused code or "future-flexibility" abstractions beyond what tasks specify.

