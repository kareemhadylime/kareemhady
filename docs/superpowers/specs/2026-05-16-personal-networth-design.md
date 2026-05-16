# Personal Net Worth Module — Design Spec

**Date:** 2026-05-16
**Author:** kareemhady + Claude
**Status:** Draft, awaiting user review

## Goal

Add a fourth tile to the `/personal` subsidiary cockpit — a self-contained module that lets Kareem track his complete personal financial picture in one place:

- **Assets** he owns (cash, real estate, vehicles, gold/jewelry, plus an auto-piped feed from `/personal/stocks`)
- **Liabilities** he owes (amortizing loans, BNPL/Valu, credit cards, overdraft)
- **Loan details** — principal, APR, term, monthly payment, full amortization schedule, projected payoff date, interest paid YTD, early-payoff savings calculator
- **Recurring payments** — charity, rent, utilities, phone, subscriptions, loan auto-payments
- **Monthly payment report** — category breakdown with month-over-month deltas
- **Historical net worth** — auto-snapshot on the 1st of every month + manual snapshot button, with a 12-month sparkline on the overview
- **Dashboards** — overview + per-page KPI strips

The module follows the same multi-route stocks-style pattern already in use at `/personal/stocks`, with EGP as the base currency and FX-converted multi-currency support.

## Non-goals (V1)

- ❌ Full Zakat module (hijri-year tracking, auto-compute zakat base) — V1 treats charity as a recurring category with a prominent dashboard widget
- ❌ Auto-pulling FX rates from a public API — manual entry in Setup for V1
- ❌ CSV / OFX bank-statement import — V1 is form-entry only
- ❌ Email / WhatsApp reminders for upcoming payments — visible on dashboard only
- ❌ Multi-user UI / user-switcher — single-user (Kareem); schema includes `app_user_id` for cheap future-proofing
- ❌ Per-payment principal/interest split for non-amortizing kinds (revolving cards just track balances + payments)
- ❌ Forecasting beyond loan payoff — no "what if I save $X more per month" scenario modeling
- ❌ Real-estate or vehicle market-value auto-update — user types the current value when they want it refreshed

## Locked product decisions

| # | Decision | Rationale |
|---|---|---|
| Q1 | **Multi-currency, totals rolled up to EGP via FX table** | Kareem has USD/EUR exposure (potential foreign cards, savings). Per-row `currency` column + manually-maintained `personal_networth_fx_rates`. |
| Q2 | **Hybrid stocks pipe-in — live for dashboard, frozen at snapshot time** | Live dashboard reads `personal_stock_holdings`. Monthly snapshot freezes the value into `snapshot_lines` so historical net-worth chart is stable. |
| Q3 | **Full amortization schedule auto-generated** | One row per scheduled installment with principal/interest split. Enables interest-paid-YTD, months-remaining, early-payoff savings calculator. |
| Q4 | **Auto monthly snapshot on the 1st + manual "Snapshot now" button** | Cron writes one snapshot per month at Cairo 9 AM. Manual button for ad-hoc captures (e.g. right after paying off a loan). |
| Q5 | **Charity is a recurring-payment category with a prominent dashboard widget** | YTD total, monthly average, progress bar against goal %. No religious-calendar logic. |
| Q6 | **Multi-route stocks-style module shape** | 6 routes under `/personal/networth/*` (loans collapsed into liabilities). Matches existing `/personal/stocks` convention. |
| Q7 | **Loans + liabilities are one table with a `kind` discriminator** | One `personal_networth_liabilities` table covering `amortizing_loan` / `bnpl` / `credit_card` / `overdraft` / `other`. Schedule table referenced via `liability_id` and only used for amortizing kinds. |
| Q8 | **Dashboard layout A — Hero + grid (recommended)** | Big hero KPI strip, 3-card totals row, two mix donuts, upcoming-payments table beside charity/payoff cards, quick-entry strip at the bottom. |

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ /personal landing                                                    │
│   4 tiles — Email · Stocks · Boat Rental · Net Worth (NEW, indigo)  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ /personal/networth/                                                  │
│                                                                      │
│ /                  overview dashboard (hero, 3-card, donuts,         │
│                    upcoming, charity YTD, payoff, quick-entry)       │
│ /liabilities       all liabilities, filter chips                     │
│ /liabilities/[id]  detail (amortizing: schedule + payoff calc;       │
│                    revolving: utilization + statement timeline)     │
│ /assets            assets list + auto-piped stocks row               │
│ /recurring         tabs: Templates · Payment Log                     │
│ /reports           monthly payment report + 12-month chart           │
│ /setup             FX rates · Lenders · Settings                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ src/lib/personal/networth/                                          │
│   amortization.ts   generateSchedule, earlyPayoffProjection          │
│   fx.ts             convertToEgp, latestRate, ratesAsOf              │
│   snapshot.ts       takeSnapshot, listSnapshotsForChart              │
│   liability.ts      createLiability, updateBalance,                  │
│                     markScheduleRowPaid                              │
│   payment.ts        recordPayment, recordPaymentForSchedule,         │
│                     recordPaymentForRecurringTemplate,               │
│                     recordCardPayment                                │
│   queries.ts        getOverviewKpis, getUpcomingPayments,            │
│                     getCharityYtd, getAssetMix, getLiabilityMix,     │
│                     getMonthlyReport                                 │
│                                                                      │
│ src/lib/recurring.ts  (LIFTED from boat-rental)                      │
│   computeNextRunDate — shared between boat-rental + networth        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Supabase (migration 0139)                                            │
│   personal_networth_currencies          (lookup, seeded)             │
│   personal_networth_fx_rates            (manual rates → EGP)         │
│   personal_networth_lenders             (banks, Valu, etc.)          │
│   personal_networth_settings            (single row config)          │
│   personal_networth_assets              (kind, currency, balance)    │
│   personal_networth_liabilities         (kind, currency, balance,   │
│                                          loan + card nullable cols)  │
│   personal_networth_liability_schedule  (amortizing installments)    │
│   personal_networth_payments            (every payment row)          │
│   personal_networth_recurring_templates (charity, rent, utilities…)  │
│   personal_networth_snapshots           (monthly auto + manual)      │
│   personal_networth_snapshot_lines      (frozen balances)            │
│                                                                      │
│   v_personal_networth_current           (live net worth)             │
│   v_personal_networth_loan_summary      (per-loan rollup)            │
│   v_personal_networth_upcoming          (next 30d due payments)      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Vercel cron (vercel.json) — DST-safe double-registered, Cairo 9 AM  │
│   personal-networth-snapshot   on the 1st of every month             │
│   personal-networth-recurring  daily                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Data model

Migration slot: **`0139_personal_networth.sql`** (last migration in repo is 0138).

### Lookup / settings tables

```sql
create table personal_networth_currencies (
  code        text primary key,           -- 'EGP', 'USD', 'EUR', ...
  name        text not null,
  symbol      text,
  is_base     boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Seed: EGP (is_base=true), USD, EUR, SAR, AED

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
  charity_goal_egp_year  numeric(14,2),         -- absolute EGP target per calendar year
  default_currency       text not null default 'EGP'
                         references personal_networth_currencies(code),
  monthly_snapshot_day   int not null default 1 check (monthly_snapshot_day between 1 and 28),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
```

### Core entity tables

```sql
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

  -- Amortizing / BNPL columns (nullable on revolving)
  principal       numeric(14,2),
  apr_pct         numeric(6,3),               -- e.g. 18.500
  term_months     int,
  start_date      date,
  monthly_payment numeric(14,2),              -- may override formula

  -- Credit card / overdraft columns (nullable on amortizing)
  credit_limit    numeric(14,2),
  statement_day   int check (statement_day between 1 and 28),
  due_day         int check (due_day between 1 and 28),
  min_payment_pct numeric(5,2),               -- e.g. 5.00 for 5%

  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Type-shape integrity: amortizing kinds need principal+apr+term+start
  constraint amortizing_required_fields check (
    kind not in ('amortizing_loan','bnpl')
    or (principal is not null and apr_pct is not null
        and term_months is not null and start_date is not null)
  ),
  -- Revolving kinds need credit_limit
  constraint revolving_required_fields check (
    kind not in ('credit_card','overdraft')
    or credit_limit is not null
  )
);
create index idx_liabilities_user_active
  on personal_networth_liabilities (app_user_id) where active = true;
```

### Schedule (amortizing only)

```sql
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
  payment_id        uuid,                     -- FK added after payments table
  unique (liability_id, installment_no)
);
create index idx_schedule_due
  on personal_networth_liability_schedule (due_date) where paid_on is null;
```

### Payments + recurring templates

```sql
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
  recurring_template_id uuid,                 -- FK added after templates table
  notes                 text,
  created_at            timestamptz not null default now()
);
create index idx_payments_user_date
  on personal_networth_payments (app_user_id, occurred_on desc);
create index idx_payments_category
  on personal_networth_payments (category, occurred_on desc);

-- Close the schedule.payment_id FK now that payments exists
alter table personal_networth_liability_schedule
  add constraint schedule_payment_fk
  foreign key (payment_id) references personal_networth_payments(id);

create table personal_networth_recurring_templates (
  id              uuid primary key default gen_random_uuid(),
  app_user_id     uuid not null references app_users(id),
  name            text not null,
  category        text not null,              -- matches payments.category check
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

-- Close the payments.recurring_template_id FK
alter table personal_networth_payments
  add constraint payments_recurring_template_fk
  foreign key (recurring_template_id)
  references personal_networth_recurring_templates(id);
```

### Snapshots

```sql
create table personal_networth_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  app_user_id           uuid not null references app_users(id),
  taken_at              timestamptz not null default now(),
  kind                  text not null check (kind in ('monthly_auto','manual')),
  total_assets_egp      numeric(14,2) not null,
  total_liabilities_egp numeric(14,2) not null,
  net_worth_egp         numeric(14,2) not null,
  fx_rates_used         jsonb not null,       -- frozen FX at snapshot time
  notes                 text
);
create index idx_snapshots_user_date
  on personal_networth_snapshots (app_user_id, taken_at desc);

create table personal_networth_snapshot_lines (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references personal_networth_snapshots(id)
                on delete cascade,
  line_type     text not null check (line_type in (
                  'asset','liability','stocks_pipe'
                )),
  entity_id     uuid,                         -- null for stocks_pipe
  display_name  text not null,
  currency      text not null,
  amount        numeric(14,2) not null,
  amount_egp    numeric(14,2) not null
);
create index idx_snapshot_lines_snapshot
  on personal_networth_snapshot_lines (snapshot_id);
```

### Views

```sql
-- Live current net worth (used by overview dashboard)
-- Stocks module is single-user (all 3 AOLB accounts are Kareem's), so the
-- stocks-pipe value is a scalar joined as a CROSS JOIN below.
create view v_personal_networth_current as
  with latest_prices as (
    select distinct on (instrument_id)
      instrument_id, price
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

-- Per-loan rollup for the liabilities list + detail KPIs
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
    -- aggregations from schedule
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

-- Next 30d of upcoming payments (schedule rows + recurring template runs)
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

`fx_lookup(currency, date)` is a helper SQL function that returns the latest `rate_to_egp` from `personal_networth_fx_rates` with `as_of_date <= date`. Returns `1` when `currency = 'EGP'`. Returns `null` if no rate exists (callers `coalesce` to surface a "FX missing" warning in the UI).

## Routes & UX

Parent tile added to [src/app/personal/page.tsx](src/app/personal/page.tsx):

```ts
{
  href: '/personal/networth',
  title: 'Net Worth',
  description: "Assets, loans + liabilities, recurring payments, charity, monthly report, and historical net-worth chart — totals in EGP.",
  icon: Wallet,
  accent: 'indigo',       // 4th accent, joins slate/cyan/emerald
  badge: { label: 'Live', tone: 'navy' },
}
```

A new `'indigo'` entry is added to the `ACCENTS` map in the same file:

```ts
indigo: {
  iconBg: 'bg-indigo-50 dark:bg-indigo-950',
  iconText: 'text-indigo-700 dark:text-indigo-300',
  hoverBorder: 'group-hover:border-indigo-400',
  arrow: 'group-hover:text-indigo-600',
  gradFrom: 'from-indigo-400',
  gradTo: 'to-indigo-600',
}
```

Shared shell: `NetWorthShell` + `NetWorthHeader` in `src/app/personal/networth/_components/networth-shell.tsx`, mirroring `PersonalShell` / `PersonalHeader`. Every networth page renders a top nav with `Overview · Liabilities · Assets · Recurring · Reports · Setup`.

### `/personal/networth` — overview dashboard (Layout A)

Top → bottom:

1. **Hero KPI strip (full width)**
   - Big EGP net-worth number, e.g. "EGP 4,234,500"
   - Δ vs last monthly snapshot in absolute + %, colored emerald (up) / rose (down) / slate (flat)
   - 12-month sparkline of monthly snapshots (recharts), hover shows value at each point
   - "Snapshot now" button (top-right corner of the strip)
2. **3-card totals row** — Total Assets · Total Liabilities · Net Worth (all EGP). Each card has a small currency-split line ("EGP 3.1M · USD 12K · EUR 5K") underneath when multi-currency.
3. **Two donuts side-by-side** — Asset Mix (cash / stocks-piped / real-estate / vehicles / gold-jewelry / other) and Liability Mix (loans / cards / overdraft / BNPL). Legend shows EGP value + % of total per slice.
4. **Upcoming-payments table + side cards row**
   - Left (60% width): Upcoming payments next 30 days — columns: Due date · Name · Category · Amount · "Mark paid" button
   - Right (40% width): stacked — Charity YTD card on top (total given + monthly avg + progress bar to yearly goal (EGP)) + Loan-payoff card below (top 3 active loans with months-to-payoff)
5. **Quick-entry strip (full width, bottom)** — 4 buttons: `+ Payment` `+ Liability` `+ Asset` `+ Recurring`. Each opens the matching create-modal.

### `/personal/networth/liabilities`

- Top KPI strip: Total liabilities (EGP) · Total monthly outflow · Highest APR · Total interest paid YTD
- Filter chips: `All` `Loans` `Cards` `Overdraft` `BNPL`
- Table: Name · Lender · Kind badge · Currency · Balance · Monthly payment · Next due · EGP equiv
- Default sort: balance DESC. Each row links to `/liabilities/[id]`
- `+ Add Liability` button opens a modal with a kind picker (loan / card / overdraft / BNPL), then a kind-specific form
- Footer row: total liabilities in EGP

### `/personal/networth/liabilities/[id]`

Two layouts based on `kind`:

**Amortizing (`amortizing_loan` / `bnpl`):**
- Header: name + kind badge + current remaining balance + lender + projected payoff date
- KPI strip: Interest paid YTD · Months remaining · Total interest if-paid-as-scheduled · Early-payoff savings
- "Early payoff" calculator: input extra monthly amount → shows new payoff date + total interest saved (re-runs amortization in JS, no DB write)
- Schedule table: # · Due date · Principal · Interest · Remaining-after · Status (`upcoming` / `paid` / `overdue`, computed at query time from `paid_on` + today) · Paid on
- "Mark paid" button per unpaid row → creates a `personal_networth_payments` row linked to the schedule row, sets `paid_on`
- Edit / Close liability buttons

**Revolving (`credit_card` / `overdraft`):**
- Header: name + kind badge + current balance + credit limit + utilization %
- KPI strip: This-month spend · YTD payments · Average daily balance (computed from payment history)
- Statement timeline visual: statement day → due day → min payment %
- Payment history table
- "Pay card" button → modal with amount preset options (Minimum / Statement balance / Full balance / Custom). Records a payment with category `card_payment` or `overdraft_payment`.

### `/personal/networth/assets`

- Top KPI strip: Total assets (EGP) · Liquid (cash + stocks) · Illiquid (real-estate + vehicles + jewelry) · # of currencies in play
- Filter chips: `All` `Cash` `Real Estate` `Vehicles` `Gold/Jewelry` `Other`
- Read-only row at the top: **AOLB Stocks (auto-piped)** — live EGP total from `/personal/stocks`, with a tiny "view in stocks" link
- Table: Name · Kind · Currency · Balance · As-of-date · EGP equiv
- Inline "Update balance" button per row → modal (new balance + new as-of-date, default today)
- `+ Add Asset` button
- Footer row: total assets in EGP

### `/personal/networth/recurring`

Two tabs:

**Templates** — list of recurring rules (charity, rent, phone bill, car-loan auto-payment, etc.).
- Columns: Name · Category · Amount · Frequency · Day · Next run · Last run · Linked liability · Active toggle
- `+ Add Recurring` button
- `Run today's due` button — manually triggers the cron, bypasses the date gate via `?force=1`

**Payment Log** — read-only feed of every recorded payment.
- Filters: date range · category · liability · recurring template · free-text search on notes
- Columns: Date · Amount · Currency · Category · Liability · Notes
- Export CSV / Export PDF buttons

### `/personal/networth/reports`

- Top KPI strip: Total paid this month · Δ vs prev month · Largest category · # of payments
- Month picker (default = current month, prev/next arrows)
- Category breakdown table: Category · Amount · # payments · Δ vs prev month (absolute + %)
- 12-month trend chart: stacked area chart per category (recharts)
- "Export PDF" button (via `@react-pdf/renderer`, already in stack)

### `/personal/networth/setup`

- **FX rates** section: Currency · Rate to EGP · As-of-date · Edit / Delete · `+ Add rate`
- **Lenders** section: Name · Kind · # liabilities using · Edit / Delete · `+ Add lender`
- **Settings** form: yearly charity goal (EGP) · default currency · monthly snapshot day-of-month (default 1)

## Cron jobs & business logic

### Cron 1 — Monthly snapshot

**Route:** `POST /api/cron/personal-networth-snapshot`

**Schedule** (in [vercel.json](vercel.json), DST-safe double-registration for Cairo 9 AM on the 1st):

```json
{ "path": "/api/cron/personal-networth-snapshot", "schedule": "0 6 1 * *" },
{ "path": "/api/cron/personal-networth-snapshot", "schedule": "0 7 1 * *" }
```

**Handler logic:**
1. Verify `Authorization: Bearer $CRON_SECRET`. Reject 401 otherwise.
2. Gate: compute Cairo local hour from `new Date()`. If `localHour !== 9` and no `?force=1` query param, return `{ skipped: true, reason: 'not 9am Cairo' }` with HTTP 200.
3. For each `app_user_id` with a row in `personal_networth_settings`:
   - Open a transaction.
   - Insert a `personal_networth_snapshots` row with `kind = 'monthly_auto'`, `fx_rates_used` = JSONB of `{currency: rate}` for every currency in use.
   - For every active asset: insert a `personal_networth_snapshot_lines` row with `line_type = 'asset'`, `amount` = balance, `amount_egp` = balance × FX rate at snapshot date.
   - For every active liability: same, `line_type = 'liability'`.
   - Compute stocks pipe-in value (sum of `market_value_egp` across `personal_stock_holdings` + cash balances across the 3 accounts). Insert one row with `line_type = 'stocks_pipe'`, `display_name = 'AOLB Stocks'`.
   - Sum lines into `total_assets_egp` / `total_liabilities_egp` / `net_worth_egp` on the parent snapshot row.
   - Commit.

### Cron 2 — Daily recurring-payment generator

**Route:** `POST /api/cron/personal-networth-recurring`

**Schedule** (DST-safe Cairo 9 AM every day):

```json
{ "path": "/api/cron/personal-networth-recurring", "schedule": "0 6 * * *" },
{ "path": "/api/cron/personal-networth-recurring", "schedule": "0 7 * * *" }
```

**Handler logic:**
1. Verify bearer + Cairo-9-AM gate (same as snapshot).
2. Select templates where `active = true AND next_run_date <= current_date (Cairo)`.
3. For each: open a transaction.
   - Insert `personal_networth_payments` row with `amount` / `currency` / `category` / `liability_id` / `recurring_template_id` from the template, `occurred_on = today (Cairo)`.
   - If the template has a `liability_id` and that liability is `amortizing_loan` / `bnpl`, also find the next unpaid `liability_schedule` row and set `paid_on = today`, `payment_id = <new payment id>`.
   - Advance `next_run_date` via `computeNextRunDate(frequency, day_of_period, month_of_year, today)`.
   - Set `last_run_date = today`.
   - Commit.

### Manual triggers (UI-facing routes)

- `POST /api/personal/networth/snapshot` — calls the snapshot logic with `kind = 'manual'`. Wired to the "Snapshot now" button on the overview.
- `POST /api/personal/networth/recurring/run-now` — calls the recurring logic with the time gate bypassed. Wired to "Run today's due" on the Recurring page.

Both require an authenticated session (not `CRON_SECRET`).

### Business-logic modules

Created under `src/lib/personal/networth/`:

**`amortization.ts`**

```ts
type AmortizationInput = {
  principal: number;
  aprPct: number;
  termMonths: number;
  startDate: string;        // YYYY-MM-DD
  monthlyOverride?: number; // if lender uses non-standard rounding
};

type ScheduleRow = {
  installmentNo: number;
  dueDate: string;          // YYYY-MM-DD
  principalPortion: number;
  interestPortion: number;
  remainingAfter: number;
};

export function generateSchedule(input: AmortizationInput): ScheduleRow[];
export function earlyPayoffProjection(
  schedule: ScheduleRow[],
  paidInstallmentCount: number,
  extraMonthlyAmount: number,
  apr: number
): { newPayoffDate: string; totalInterestSaved: number; monthsSaved: number };
```

Standard amortization formula:

```
monthly_payment = P × r(1+r)^n / ((1+r)^n − 1)
  where P = principal, r = (APR / 100) / 12, n = term_months
```

Last row's `principal_portion` is adjusted so `remaining_after` snaps to 0 (absorbs rounding drift). If `monthlyOverride` is provided, the loop uses it directly and the last row absorbs any residual.

**`fx.ts`**

```ts
export async function convertToEgp(
  amount: number,
  currency: string,
  asOfDate: string
): Promise<{ egp: number; rate: number; rateAsOf: string } | { error: 'missing_rate' }>;

export async function latestRate(currency: string): Promise<...>;
export async function ratesAsOf(date: string): Promise<Record<string, number>>;
```

**`snapshot.ts`**

```ts
export async function takeSnapshot(
  appUserId: string,
  kind: 'monthly_auto' | 'manual'
): Promise<{ snapshotId: string; netWorthEgp: number }>;

export async function listSnapshotsForChart(
  appUserId: string,
  months: number
): Promise<Array<{ takenAt: string; netWorthEgp: number }>>;
```

**`liability.ts`**

```ts
export async function createLiability(input: CreateLiabilityInput): Promise<string>;
// For amortizing kinds, also generates the full schedule via generateSchedule()
// and inserts liability_schedule rows in the same transaction.

export async function updateBalance(
  liabilityId: string,
  newBalance: number,
  asOfDate: string
): Promise<void>;

export async function markScheduleRowPaid(
  scheduleId: string,
  paymentId: string,
  paidOn: string
): Promise<void>;
```

**`payment.ts`**

```ts
export async function recordPayment(input: RecordPaymentInput): Promise<string>;

export async function recordPaymentForSchedule(
  scheduleId: string,
  opts: { occurredOn?: string; amount?: number }
): Promise<string>;

export async function recordPaymentForRecurringTemplate(
  templateId: string,
  occurredOn: string
): Promise<string>;

export async function recordCardPayment(
  liabilityId: string,
  preset: 'min' | 'statement' | 'full' | 'custom',
  customAmount?: number
): Promise<string>;
```

**`queries.ts`**

```ts
export async function getOverviewKpis(appUserId: string): Promise<OverviewKpis>;
export async function getUpcomingPayments(appUserId: string, daysAhead?: number): Promise<UpcomingPayment[]>;
export async function getCharityYtd(appUserId: string): Promise<CharityYtd>;
export async function getAssetMix(appUserId: string): Promise<MixSlice[]>;
export async function getLiabilityMix(appUserId: string): Promise<MixSlice[]>;
export async function getMonthlyReport(appUserId: string, year: number, month: number): Promise<MonthlyReport>;
```

### Shared `computeNextRunDate` lift

The existing function at [src/lib/boat-rental/recurring.ts](src/lib/boat-rental/recurring.ts) is moved verbatim to `src/lib/recurring.ts`. The boat-rental import is updated. The colocated test moves to `src/lib/recurring.test.ts`. Networth imports it from the new shared location.

## Tests

Colocated `*.test.ts` files (Vitest). No new test infrastructure needed.

| File | Coverage |
|---|---|
| `src/lib/personal/networth/amortization.test.ts` | standard amortization, zero APR, term=1, monthly_payment override, last-row rounding snap, earlyPayoffProjection math |
| `src/lib/personal/networth/fx.test.ts` | exact-date match, fallback to latest ≤ date, EGP→EGP returns 1, missing-rate returns `{ error: 'missing_rate' }` |
| `src/lib/recurring.test.ts` (lifted) | existing boat-rental recurring tests continue to pass after the move |
| `src/lib/personal/networth/snapshot.test.ts` | snapshot writes correct totals, FX frozen into JSONB, stocks-pipe line captured, lines sum to parent totals |
| `src/lib/personal/networth/queries.test.ts` | `getOverviewKpis` / `getUpcomingPayments` / `getCharityYtd` / `getMonthlyReport` return-shape assertions against seeded test data |
| `src/app/api/cron/personal-networth-snapshot/route.test.ts` | rejects without bearer; rejects outside Cairo 9 AM; `?force=1` bypasses gate; happy-path inserts a snapshot |
| `src/app/api/cron/personal-networth-recurring/route.test.ts` | same auth/gate tests; happy-path advances next_run_date and marks schedule paid when linked |

## Open items / V1 defaults

- **Single-user.** Schema includes `app_user_id` on user-facing rows for cheap future-proofing, but the UI is single-user (Kareem). No user-switcher.
- **FX rates** manually entered in Setup for V1. Auto-pull from a public API (e.g. exchangerate-api.com or CBE's published rate) is a Phase 2.
- **No CSV / OFX import** for V1. All entry via UI forms. (Stocks import remains in `/personal/stocks/import`.)
- **No notifications** for V1. "Upcoming payments" is visible on the dashboard but no email / WhatsApp reminders. Phase 2 could hook into the existing Green-API WhatsApp integration.
- **PDF export** uses `@react-pdf/renderer` for the monthly report only (already in the stack).
- **Cron schedules**: monthly snapshot on the 1st (Cairo 9 AM); daily recurring generator (Cairo 9 AM every day). Both DST-safe double-registered.
- **Status of a schedule row** (`upcoming` / `paid` / `overdue`) is computed at query time, not stored. `paid_on IS NOT NULL` → paid. `paid_on IS NULL AND due_date < today` → overdue. Otherwise → upcoming.
- **Currency seed:** EGP (is_base=true), USD, EUR, SAR, AED. More can be added in Setup.
- **`fx_lookup` SQL helper function** is created as part of migration 0139 alongside the views.

## Implementation phases (rough — final task breakdown happens in the plan)

1. **Migration 0139** — all tables, lookups, views, `fx_lookup()` helper, seed (EGP currency + USD/EUR/SAR/AED, default settings row for Kareem).
2. **Shared `computeNextRunDate` lift** out of boat-rental into `src/lib/recurring.ts`.
3. **Business-logic libs** — `amortization`, `fx`, `snapshot`, `liability`, `payment`, `queries` with unit tests (TDD).
4. **Cron routes** — snapshot + recurring generator, with bearer auth + DST-safe Cairo 9 AM gate + `?force=1` escape hatch.
5. **Shell + parent tile** — new `NetWorthShell`, `NetWorthHeader`; new "Net Worth" tile on `/personal` with indigo accent.
6. **Routes** — overview → liabilities (list + detail, both amortizing and revolving) → assets → recurring (templates + log) → reports → setup.
7. **Quick-entry modals** — `+ Payment`, `+ Liability` (kind picker), `+ Asset`, `+ Recurring`.
8. **Charts** — net-worth sparkline, asset/liability donuts, loan-balance line, stacked-area monthly report.
9. **End-to-end pass** — click through, enter sample data (one loan, one card, charity recurring, a Valu BNPL), verify snapshot + recurring crons fire correctly via `?force=1`.

## Notes / risk flags

- **Stocks pipe-in joins.** Resolved against the existing views from migration 0117 (`v_personal_stock_positions` for qty_held + avg_cost, `v_personal_stock_account_balance` for running cash balance) plus `personal_stock_current_prices` (migration 0116) for the latest price per instrument. Stocks module is single-user, so the pipe-in is a scalar `CROSS JOIN`ed onto the per-user assets/liabilities aggregates.
- **One snapshot per month per user.** No uniqueness constraint enforced — if you click "Snapshot now" manually three times in one day, you get three rows (with `kind='manual'`). The chart uses the latest snapshot per month; manual snapshots in the middle of a month appear as extra points on the sparkline (this is intentional — you snapshot when something material changes).
- **Currency on the schedule.** Schedule inherits the liability's currency. If you change a liability's currency mid-life (which you shouldn't), historical schedule rows stay in the old currency. We'll prevent currency edits on existing amortizing liabilities in the UI.
- **No soft-delete.** Liabilities/assets have an `active` boolean. Closing a paid-off loan flips `active = false` so it disappears from the live dashboard but historical payments + the schedule remain queryable.
