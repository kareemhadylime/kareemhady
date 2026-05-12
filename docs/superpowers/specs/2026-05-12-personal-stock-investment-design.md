# Personal → Stock Investment — Design Spec

**Status:** Plan-phase approved 2026-05-12 · Awaiting Workflow phase
**Author:** kareem.hady@gmail.com (with Claude)
**Migration target:** `0116_personal_stock_investment.sql`
**Source data:** `C:\kareemhady\Lime Domains\Personal\AOLB\*.xls` (SpreadsheetML 2003 XML)

## 1. Purpose

Build a personal stock-investment cockpit at `/personal/stocks` that ingests broker statements from **AOLB (Arab Online Brokerage)**, normalizes every transaction into a typed schema, and surfaces:

- What shares are currently held, at what avg cost, and at what current value (vs manually-entered mark-to-market prices)
- Total bought, total sold, realized P&L (FIFO-matched buy/sell pairs)
- Cash in (bank deposits) and cash out (withdrawals) over time
- Dividends earned per ticker per year
- Per-account balances and activity across the three AOLB accounts (001, 003, 009)

The module is operator-grade for one user (Kareem). v1 is **pure operational visibility** — no tax/cap-gains reporting, no real-time price feed, no order placement.

## 2. Why now

The Personal Domain currently has two tiles (Email, Boat Rental). Stock activity is the third major personal-finance stream that is currently invisible: 7 statement files spanning 2024 → today, 800+ transactions, ~21 distinct securities, across 3 accounts with inter-account transfers, dividends, margin interest, and a fund position — all sitting in opaque `.xls` files. A consolidated view turns the broker's accounting log into a useful portfolio dashboard.

## 3. Decisions locked during plan phase

| # | Decision | Resolution |
|---|----------|------------|
| Q1 | Time range | **2024 → today.** No 2023 data exists. |
| Q2 | Import mechanism | **Hybrid** — bulk-seed the 7 existing `.xls` files once, then permanent upload UI for new statements. |
| Q3 | Currency | **EGP-only**, schema-extensible (`currency` column on accounts + instruments, defaulted to 'EGP'). |
| Q4 | Pricing | **Cost-basis for closed positions** (realized P&L via FIFO matching). **Manual current-price entry with date** for open positions → unrealized P&L. |
| Q5 | Tax / cap-gains report | **Skip.** Pure ops view in v1. |
| Q6 | Data model | **Approach B — fully normalized** (10 tables, 4 views). One table per concept. |
| Q7 | Tab structure | **Option A — Rich 8 tabs**: Dashboard · Portfolio · Transactions · Cash Flow · Dividends · Accounts · Prices · Import. |
| Q8 | Single vs. split fund/stock trades | **Single `personal_stock_trades` table**, distinguished by `instrument.kind` (`stock` or `fund`). |
| Q9 | Audit trail | **Every parsed row keeps FK to its raw broker row.** Trace any KPI → original `.xls` line. |
| Q10 | Current-price storage | **Append-only history** — each entry is a new row; "current" = latest by `as_of_date`. |
| Q11 | Cash-flow tab scope | Drop inter-account view (clutter). Keep **bank in/out** + **balance-over-time**. Inter-account data still stored in DB for reconciliation. |
| Q12 | Prices tab format | **Single editable table** with inline inputs (no modals). |
| Q13 | KPI density | **2 bands × 4 tiles = 8 KPIs** (down from 12). Merge Trading totals into Money Flow band. |
| Q14 | Dashboard charts | Portfolio value over time · cumulative dividends · realized P&L by year · account-balance lines (001/003/009). |

## 4. Module structure (8 tabs)

Route prefix: `/personal/stocks/...`

| Tab | Route | Purpose |
|-----|-------|---------|
| Dashboard | `/personal/stocks` | KPI overview + holdings + recent activity + charts |
| Portfolio | `/personal/stocks/portfolio` | Open positions with cost, current price, unrealized P&L; click row → ticker drilldown |
| Transactions | `/personal/stocks/transactions` | Full broker log, filterable by account/kind/ticker/date; CSV export |
| Cash Flow | `/personal/stocks/cash-flow` | Bank in/out + balance-over-time per account |
| Dividends | `/personal/stocks/dividends` | Per-ticker per-year totals + chart |
| Accounts | `/personal/stocks/accounts` | Per-account drill (001 / 003 / 009): balance over time, activity feed |
| Prices | `/personal/stocks/prices` | Inline editable table for current mark-to-market prices per held instrument |
| Import | `/personal/stocks/import` | Drag-drop .xls upload + past-upload audit log + re-process button |

Landing tile added to `/personal/page.tsx` between Email and Boat Rental, using a `TrendingUp` Lucide icon and `emerald` accent (a new entry in the existing `ACCENTS` map).

## 5. Data model (`0116_personal_stock_investment.sql`)

### 5.1 Lookup tables (seeded once)

```sql
personal_stock_accounts (
  id          serial primary key,
  code        text not null unique,      -- '001' | '003' | '009'
  kind        text not null,             -- 'trading' | 'margin' | 'fund'
  currency    text not null default 'EGP',
  notes       text,
  created_at  timestamptz not null default now()
);
-- seeded: 3 rows on migration apply

personal_stock_instruments (
  id          serial primary key,
  kind        text not null,             -- 'stock' | 'fund'
  ticker      text not null unique,      -- canonical short code; e.g. 'EZZ_STEEL', 'ICS_MAKASEB_2'
  name        text not null,             -- parsed from broker description
  currency    text not null default 'EGP',
  notes       text,
  created_at  timestamptz not null default now()
);
-- auto-discovered: rows inserted on first import where a new ticker name appears
```

### 5.2 Audit tables (raw broker data)

```sql
personal_stock_uploads (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,
  account_id    int not null references personal_stock_accounts(id),
  year          int not null,
  sha256        text not null unique,    -- file-level dedup
  row_count     int not null,
  status        text not null,           -- 'ok' | 'reconcile_mismatch' | 'parse_error'
  status_note   text,                    -- error details, mismatch delta, etc.
  uploaded_at   timestamptz not null default now(),
  uploaded_by   text                     -- email of uploader (kareem only in v1)
);

personal_stock_raw_rows (
  id                uuid primary key default gen_random_uuid(),
  upload_id         uuid not null references personal_stock_uploads(id) on delete cascade,
  row_index         int not null,           -- 0-based row index in the source sheet
  details           text,                   -- 'Details' column (invoice id or blank)
  occurred_at       date,                   -- 'Date' column parsed from DD-MM-YYYY
  op_type           text,                   -- 'Buy Invoice' | 'Sell Invoice' | …
  description       text,
  debit             numeric(18,4),
  credit            numeric(18,4),
  balance_after     numeric(18,4),
  dc_flag           text,
  unique (upload_id, row_index)
);
create index on personal_stock_raw_rows (op_type);
create index on personal_stock_raw_rows (occurred_at);
```

### 5.3 Core tables (parsed/typed)

```sql
personal_stock_trades (
  id              uuid primary key default gen_random_uuid(),
  raw_row_id      uuid not null references personal_stock_raw_rows(id) on delete cascade,
  account_id      int not null references personal_stock_accounts(id),
  instrument_id   int not null references personal_stock_instruments(id),
  side            text not null,           -- 'buy' | 'sell'
  qty             numeric(18,6) not null,
  price           numeric(18,6) not null,
  gross_amount    numeric(18,4) not null,  -- qty * price
  net_amount      numeric(18,4) not null,  -- amount actually debited/credited (incl. commissions)
  fees_amount     numeric(18,4) not null,  -- net_amount - gross_amount (signed)
  invoice_id      text,
  trade_date      date not null,
  unique (raw_row_id)
);

personal_stock_dividends (
  id              uuid primary key default gen_random_uuid(),
  raw_row_id      uuid not null references personal_stock_raw_rows(id) on delete cascade,
  account_id      int not null references personal_stock_accounts(id),
  instrument_id   int references personal_stock_instruments(id),  -- nullable if unknown
  amount          numeric(18,4) not null,
  pay_date        date not null,
  note            text,
  unique (raw_row_id)
);

personal_stock_cash_movements (
  id                       uuid primary key default gen_random_uuid(),
  raw_row_id               uuid not null references personal_stock_raw_rows(id) on delete cascade,
  account_id               int not null references personal_stock_accounts(id),
  kind                     text not null,    -- 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out'
  amount                   numeric(18,4) not null,  -- always positive; direction in `kind`
  counterparty_account_id  int references personal_stock_accounts(id),  -- for transfers
  occurred_at              date not null,
  note                     text,
  unique (raw_row_id)
);

personal_stock_fees (
  id           uuid primary key default gen_random_uuid(),
  raw_row_id   uuid not null references personal_stock_raw_rows(id) on delete cascade,
  account_id   int not null references personal_stock_accounts(id),
  kind         text not null,           -- 'platform_daily' | 'ipo_subscription' | 'other'
  amount       numeric(18,4) not null,
  occurred_at  date not null,
  note         text,
  unique (raw_row_id)
);

personal_stock_interest (
  id                uuid primary key default gen_random_uuid(),
  raw_row_id        uuid not null references personal_stock_raw_rows(id) on delete cascade,
  account_id        int not null references personal_stock_accounts(id),
  direction         text not null,           -- 'charge' (margin interest on 003) | 'credit' (BANK PROFIT)
  amount            numeric(18,4) not null,
  period_end_date   date not null,
  note              text,
  unique (raw_row_id)
);

personal_stock_corrections (
  id                    uuid primary key default gen_random_uuid(),
  raw_row_id            uuid not null references personal_stock_raw_rows(id) on delete cascade,
  account_id            int not null references personal_stock_accounts(id),
  reverses_raw_row_id   uuid references personal_stock_raw_rows(id),  -- best-effort match
  amount_debit          numeric(18,4) not null default 0,
  amount_credit         numeric(18,4) not null default 0,
  occurred_at           date not null,
  note                  text,
  unique (raw_row_id)
);

personal_stock_current_prices (
  id              uuid primary key default gen_random_uuid(),
  instrument_id   int not null references personal_stock_instruments(id),
  price           numeric(18,6) not null,
  as_of_date      date not null,
  entered_at      timestamptz not null default now(),
  entered_by      text,
  note            text
);
create index on personal_stock_current_prices (instrument_id, as_of_date desc);
```

### 5.4 Views

```sql
-- Open quantity per (account, instrument) with weighted avg cost
create view v_personal_stock_positions as
select
  account_id,
  instrument_id,
  sum(case when side = 'buy' then qty else -qty end) as qty_held,
  sum(case when side = 'buy' then net_amount else 0 end)
    / nullif(sum(case when side = 'buy' then qty else 0 end), 0) as avg_cost
from personal_stock_trades
group by account_id, instrument_id
having sum(case when side = 'buy' then qty else -qty end) > 0;

-- FIFO-matched closed lots
create view v_personal_stock_realized_pnl as
  /* recursive FIFO matcher: pairs each sell row with the oldest unmatched buy
     until qty exhausted; produces one row per matched lot
     (buy_trade_id, sell_trade_id, qty, buy_price, sell_price, gain, hold_days) */
  ...;

-- Running balance per account by date
create view v_personal_stock_account_balance as
  select
    raw.account_id,
    raw.occurred_at,
    raw.credit - raw.debit as delta,
    sum(raw.credit - raw.debit)
      over (partition by raw.account_id order by raw.occurred_at, raw.row_index) as balance_egp
  from personal_stock_raw_rows raw
  join personal_stock_uploads u on u.id = raw.upload_id;

-- One-row dashboard summary
create view v_personal_stock_dashboard_kpis as
  /* aggregates: cash_in, cash_out, total_bought, total_sold,
     dividends_total, realized_pnl, unrealized_pnl, open_positions_count,
     open_positions_cost — accepts WHERE filters on account_id / year */
  ...;
```

The realized-P&L view uses a FIFO algorithm: for each `(account_id, instrument_id)`, iterate sells in chronological order and match against the oldest unmatched buy lots. Implemented as a SQL function returning a table rather than a recursive view, since recursion across two columns is non-trivial in pure SQL.

## 6. Import flow (the parser)

Implemented as a TypeScript server action at `src/app/api/personal/stocks/upload/route.ts` plus a worker in `src/lib/personal/stocks/parse-aolb.ts`.

### 6.1 Per-file pipeline

1. **Validate**: file starts with `<?xml` and contains `urn:schemas-microsoft-com:office:spreadsheet` namespace. Reject otherwise.
2. **SHA-256** the file body. Look up in `personal_stock_uploads.sha256`. If found, return "already imported" with the existing upload row.
3. **Parse filename**: regex `AOLB Account (\d{3}) - (\d{4})\.xls` → account code, year. Look up `personal_stock_accounts.id`.
4. **Parse XML**: SpreadsheetML 2003 → array of rows from the `ag-grid` sheet. Strip Open Balance and Close Balance lines (header/footer); keep them only as `upload.metadata` for reconciliation.
5. **Insert raw rows** into `personal_stock_raw_rows` with `row_index = ordinal position in sheet`.
6. **Classify each raw row** by `op_type` (see §6.2). For each classified row, insert into the corresponding core table with `raw_row_id` set.
7. **Reconcile**: compute `sum(credit - debit) for all raw rows`. Verify it equals `Close Balance - Open Balance` ± 0.01. Set `upload.status` to `ok` or `reconcile_mismatch`.

### 6.2 Classification rules

| op_type | Routes to | Parsing |
|---|---|---|
| `Buy Invoice` / `Sell Invoice` | `personal_stock_trades` | Description regex: `^(Buy\|Sell) (\d+) (.+?)/L\.E\./1/.+\(inv\. (\d+)\) @([\d.]+)`. Side from match[1], qty match[2], instrument name match[3], invoice_id match[4], price match[5]. gross = qty × price. net = debit (Buy) or credit (Sell). fees = net − gross (signed). |
| `ICS` | `personal_stock_trades` (instrument.kind = 'fund') | Description regex: `^\s*(Buy\|Sell) (\d+) ICS \((.+?)\) @([\d.]+)`. |
| `CASHDIVIDEND` | `personal_stock_dividends` | amount = credit. instrument_id resolved from description Arabic text if it names a ticker; otherwise null. |
| `Bank Deposit` | `personal_stock_cash_movements` (kind=deposit) | amount = credit. |
| `With Drawal` | `personal_stock_cash_movements` (kind=withdrawal) | amount = debit. |
| `Cash Transfer` | `personal_stock_cash_movements` (kind=transfer_in if credit > 0 else transfer_out) | counterparty parsed from `Account(18880(\d{3}))`. Lookup that account by code → counterparty_account_id. |
| `Daily` | `personal_stock_fees` | kind = `ipo_subscription` if Arabic description mentions "اكتتاب"; else `platform_daily`. amount = debit. |
| `INTEREST` / `BANK PROFIT` | `personal_stock_interest` | direction = `charge` if debit > 0 else `credit`. period_end_date = `occurred_at`. |
| `Correction` | `personal_stock_corrections` | Best-effort match `reverses_raw_row_id` by description text + same account + opposite signs. |
| (header/footer rows) | skipped | "Operation Type" header + Open/Close Balance rows |

### 6.3 Re-process

Admin button on the Import tab. Given an upload_id:
1. Delete all core-table rows where `raw_row_id` belongs to this upload (cascade).
2. Re-run classification on the existing raw rows.
3. Update upload status.

Used when classification logic is improved or a parser bug is fixed.

### 6.4 Auto-discovery of instruments

When classification encounters an instrument name (e.g. `"T M G Holding"`) not yet in `personal_stock_instruments`:
1. Slugify the name to a canonical ticker code (`T_M_G_HOLDING`, `EZZ_STEEL`, …).
2. Insert a new row in `personal_stock_instruments` (`kind = 'stock'`, `name = original name`, `currency = 'EGP'`).
3. Use the new `id` for the current trade.

The slug rules: uppercase, replace non-alphanumeric with `_`, collapse runs of `_`, trim. Ticker codes are not the user-facing display name — `name` stays as the broker's original string.

### 6.5 Bulk-seed step

A one-shot admin button "Seed from AOLB folder" (visible only to Kareem) reads all 7 files from `C:\kareemhady\Lime Domains\Personal\AOLB\` server-side and runs the import pipeline for each. Path is configurable via `STOCK_AOLB_SEED_PATH` env var.

## 7. Per-tab content

### 7.1 Dashboard (`/personal/stocks`)

- **Top filter row**: Period chips (2024 / 2025 / 2026 / All time) + Account chips (All / 001 / 003 / 009)
- **Band 1 — Money Flow & Trading** (4 tiles): Cash In · Cash Out · Total Bought · Total Sold
- **Band 2 — Position & Returns** (4 tiles): Open Positions Cost · Dividends Earned · Realized P&L · Unrealized P&L
- **Holdings (top 10)** table: ticker · qty · avg cost · last price · value · P&L; "View all →" links to Portfolio
- **Recent activity** feed: last 6–8 rows with badges (BUY/SELL/DIV/INT/DEP/WD/FEE/TRANSFER)
- **Charts** (grid below): Portfolio value over time (stacked area) · Cumulative dividends · Realized P&L by year (bar) · Account balances over time (3 lines)

### 7.2 Portfolio (`/personal/stocks/portfolio`)

Open positions table sourced from `v_personal_stock_positions`:
- Columns: account · ticker · name · qty · avg cost · last price · price as-of · current value · unrealized P&L · % return
- Toggle: "Group by account" vs. "Group by ticker"
- Click row → drilldown modal showing all trades + dividends for that (account, instrument)

### 7.3 Transactions (`/personal/stocks/transactions`)

Unified transaction log joining trades + dividends + cash_movements + fees + interest + corrections:
- Filters: account (multi), kind (multi), instrument (search), date range
- Columns: date · account · kind · instrument · qty · amount · running balance · raw-row link
- "Raw" button on each row opens a modal with the original broker line
- "Export CSV" button respects active filters

### 7.4 Cash Flow (`/personal/stocks/cash-flow`)

Two sub-views (tabs within the tab):
- **Bank in/out**: deposits + withdrawals as a chart (monthly bars) + table
- **Balance over time**: 3 lines (001 / 003 / 009) on one chart from `v_personal_stock_account_balance`

### 7.5 Dividends (`/personal/stocks/dividends`)

- Table: ticker × year matrix. Cell = total dividends. Row totals + column totals.
- Annual totals chart (bar by year)
- "Show payments" expands a ticker to per-payment list

### 7.6 Accounts (`/personal/stocks/accounts`)

Three cards (001 / 003 / 009) on the landing view:
- Each card shows: current balance, total activity rows, last transaction date, last 3 entries
- Click card → per-account page with full activity feed (same kind filters as Transactions) + balance-over-time chart for that account

### 7.7 Prices (`/personal/stocks/prices`)

Single editable table:
- One row per **currently held** instrument (instruments with `qty_held > 0` in `v_personal_stock_positions`)
- Columns: ticker · name · qty held · avg cost · last entered price · as-of date · **[inline price input]** · **[inline date input]** · "Save"
- "Save all" button submits the dirty rows as new `personal_stock_current_prices` entries
- Price history modal per instrument (small icon at end of row)

### 7.8 Import (`/personal/stocks/import`)

- **Top section**: drag-drop zone (multi-file). On drop → progress bar per file → result panel (rows imported, reconciliation status, new instruments discovered)
- **Past uploads table**: filename · account · year · rows · status · uploaded at · "Re-process" / "Delete" buttons (delete cascades to all derived rows)
- **One-time** "Seed from AOLB folder" admin button (server reads from `STOCK_AOLB_SEED_PATH`)

## 8. KPI definitions

| KPI | Formula |
|-----|---------|
| Cash In | `Σ cash_movements.amount WHERE kind='deposit'` |
| Cash Out | `Σ cash_movements.amount WHERE kind='withdrawal'` |
| Total Bought | `Σ trades.net_amount WHERE side='buy'` |
| Total Sold | `Σ trades.net_amount WHERE side='sell'` |
| Open Positions Cost | `Σ (qty_held × avg_cost)` from `v_personal_stock_positions` |
| Dividends Earned | `Σ dividends.amount` |
| Realized P&L | `Σ (sell_price − buy_price) × matched_qty` from `v_personal_stock_realized_pnl` minus matched-trade fees |
| Unrealized P&L | `Σ qty_held × (latest_price − avg_cost)` joining positions with latest `current_prices` |

All KPIs accept optional `account_id` and `year` filters from the dashboard's chip filters.

## 9. UI / styling

- Landing tile in `/personal/page.tsx`: emerald accent (new entry in `ACCENTS` map), `TrendingUp` Lucide icon, badge `Live` (navy tone)
- Module shell reuses `PersonalShell` + `PersonalHeader` for visual continuity with Email and Boat Rental
- Tab navigation: horizontal pill row at top of every sub-page (8 tabs)
- KPI tiles: same `ix-card` pattern used in fmplus / beithady dashboards
- Charts: `recharts` (already a dependency)
- Tables: native HTML with Tailwind classes (avoid heavy table libs)
- Activity badge colors: BUY=blue, SELL=red, DIV=green, INT=amber, DEP=indigo, WD=rose, FEE=slate, TRANSFER=violet

## 10. Non-goals (v1)

- Tax / capital-gains reporting (Q5 = skip)
- Real-time EGX price feed (manual entry only — Q4)
- Order placement / trading actions (read-only view)
- Multi-user / sharing
- Mobile-optimized layouts beyond the existing responsive grid (acceptable on phone but optimized for desktop)
- USD or non-EGP currency handling (schema extensible, but no UI for it)

## 11. Open considerations (future)

- **Inter-account transfer view**: data is stored but no UI in v1. Could become a sub-view of Cash Flow if useful later.
- **PDF report export**: ad-hoc monthly summary for personal records. Out of v1 scope.
- **EGX scraper**: replace manual price entry with a daily scrape from MubasherTrade / EGX website. Investigate after v1 if manual entry is too friction-heavy.
- **Tax report**: when Egypt's CGT regime stabilizes, fold a tax-export view onto the existing realized-PnL view.

## 12. Risks

- **SpreadsheetML XML parsing edge cases**: Arabic descriptions, malformed cells. Mitigation: keep raw rows in `personal_stock_raw_rows` for re-parse, expose "Re-process" button.
- **Reconciliation mismatches**: rounding errors between broker's running balance and our sum. Mitigation: ±0.01 tolerance, surface mismatch in upload row status.
- **Manual price entry decay**: prices go stale, unrealized P&L becomes misleading. Mitigation: prices tab shows `as_of_date` prominently; dashboard tile shows "vs. last manual prices" caveat.
- **FIFO ambiguity for cross-account holdings**: same ticker held in both 001 and 003 — FIFO matches within an `(account_id, instrument_id)` pair, not pooled. This matches accounting reality (each account has its own cost basis).

## 13. File-level changes

| File | Action |
|------|--------|
| `supabase/migrations/0116_personal_stock_investment.sql` | NEW — schema + seed + views |
| `src/app/personal/page.tsx` | EDIT — add Stock Investment tile (emerald accent + TrendingUp icon) |
| `src/app/personal/stocks/layout.tsx` | NEW — shell + 8-tab navigation |
| `src/app/personal/stocks/page.tsx` | NEW — Dashboard |
| `src/app/personal/stocks/portfolio/page.tsx` | NEW |
| `src/app/personal/stocks/transactions/page.tsx` | NEW |
| `src/app/personal/stocks/cash-flow/page.tsx` | NEW |
| `src/app/personal/stocks/dividends/page.tsx` | NEW |
| `src/app/personal/stocks/accounts/page.tsx` | NEW |
| `src/app/personal/stocks/accounts/[code]/page.tsx` | NEW — per-account drill |
| `src/app/personal/stocks/prices/page.tsx` | NEW |
| `src/app/personal/stocks/import/page.tsx` | NEW |
| `src/app/personal/stocks/_components/*` | NEW — KPI tile, holdings table, recent-activity feed, charts |
| `src/app/api/personal/stocks/upload/route.ts` | NEW — file upload handler |
| `src/app/api/personal/stocks/reprocess/route.ts` | NEW |
| `src/app/api/personal/stocks/seed/route.ts` | NEW — one-shot bulk-seed |
| `src/lib/personal/stocks/parse-aolb.ts` | NEW — SpreadsheetML parser |
| `src/lib/personal/stocks/classify.ts` | NEW — op_type → core-table router |
| `src/lib/personal/stocks/instruments.ts` | NEW — slugify + auto-discover |
| `src/lib/personal/stocks/queries.ts` | NEW — typed wrappers around the 4 views |
| `src/lib/personal/stocks/parse-aolb.test.ts` | NEW — unit tests with fixtures from real .xls |
| `src/lib/personal/stocks/classify.test.ts` | NEW |
| `.env.example` | EDIT — add `STOCK_AOLB_SEED_PATH` |

## 14. Testing strategy

- **Unit tests** for the SpreadsheetML parser, classification rules, and instrument slugify, using fixtures copied from the real `.xls` files.
- **Reconciliation test**: parse each of the 7 source files, assert `Σ(credit − debit)` matches the file's `Close Balance − Open Balance`.
- **FIFO matching test**: hand-crafted buy/sell sequences for a few tickers, assert `v_personal_stock_realized_pnl` produces expected matches.
- **No e2e/integration test layer** — module is single-user, low-risk, and tested via real-data import + manual verification.

## 15. Acceptance criteria

The module ships when:
- All 7 source `.xls` files import cleanly (status='ok' on every upload) via the seed step
- Reconciliation matches every upload's Open/Close balance
- Dashboard renders all 8 KPI tiles + charts with real numbers
- Portfolio tab shows correct open positions with avg cost matching a hand-calculated spot check
- Prices tab accepts a manual entry and unrealized P&L updates immediately
- Import tab accepts a fresh .xls drag-drop and processes it without restart
- All 8 tabs render without errors at desktop + phone widths
