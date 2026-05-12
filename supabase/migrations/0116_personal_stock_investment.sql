-- 0116_personal_stock_investment.sql
-- Personal Stock Investment module: normalized schema for AOLB broker statements.
-- Adds 2 lookup tables, 2 audit tables, 7 core tables, seeds the 3 accounts.
-- Views are added separately in 0117 to keep DDL focused.

begin;

-- ============================================================
-- 1) LOOKUP TABLES
-- ============================================================

create table personal_stock_accounts (
  id          serial primary key,
  code        text not null unique,
  kind        text not null check (kind in ('trading','margin','fund')),
  currency    text not null default 'EGP',
  notes       text,
  created_at  timestamptz not null default now()
);

insert into personal_stock_accounts (code, kind, currency, notes) values
  ('001', 'trading', 'EGP', 'AOLB primary trading account'),
  ('003', 'margin',  'EGP', 'AOLB margin trading account (carries debit balance)'),
  ('009', 'fund',    'EGP', 'AOLB investment account holding ICS Makaseb 2nd Edition Fund');

create table personal_stock_instruments (
  id          serial primary key,
  kind        text not null check (kind in ('stock','fund')),
  ticker      text not null unique,
  name        text not null,
  currency    text not null default 'EGP',
  notes       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 2) AUDIT TABLES
-- ============================================================

create table personal_stock_uploads (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,
  account_id    int not null references personal_stock_accounts(id),
  year          int not null,
  sha256        text not null unique,
  row_count     int not null default 0,
  status        text not null check (status in ('ok','reconcile_mismatch','parse_error')),
  status_note   text,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   text
);
create index on personal_stock_uploads (account_id, year);

create table personal_stock_raw_rows (
  id             uuid primary key default gen_random_uuid(),
  upload_id      uuid not null references personal_stock_uploads(id) on delete cascade,
  row_index      int not null,
  details        text,
  occurred_at    date,
  op_type        text,
  description    text,
  debit          numeric(18,4),
  credit         numeric(18,4),
  balance_after  numeric(18,4),
  dc_flag        text,
  unique (upload_id, row_index)
);
create index on personal_stock_raw_rows (op_type);
create index on personal_stock_raw_rows (occurred_at);

-- ============================================================
-- 3) CORE TABLES
-- ============================================================

create table personal_stock_trades (
  id              uuid primary key default gen_random_uuid(),
  raw_row_id      uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id      int not null references personal_stock_accounts(id),
  instrument_id   int not null references personal_stock_instruments(id),
  side            text not null check (side in ('buy','sell')),
  qty             numeric(18,6) not null check (qty > 0),
  price           numeric(18,6) not null check (price >= 0),
  gross_amount    numeric(18,4) not null,
  net_amount      numeric(18,4) not null,
  fees_amount     numeric(18,4) not null,
  invoice_id      text,
  trade_date      date not null
);
create index on personal_stock_trades (account_id, trade_date);
create index on personal_stock_trades (instrument_id, trade_date);

create table personal_stock_dividends (
  id              uuid primary key default gen_random_uuid(),
  raw_row_id      uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id      int not null references personal_stock_accounts(id),
  instrument_id   int references personal_stock_instruments(id),
  amount          numeric(18,4) not null,
  pay_date        date not null,
  note            text
);
create index on personal_stock_dividends (account_id, pay_date);

create table personal_stock_cash_movements (
  id                       uuid primary key default gen_random_uuid(),
  raw_row_id               uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id               int not null references personal_stock_accounts(id),
  kind                     text not null check (kind in ('deposit','withdrawal','transfer_in','transfer_out')),
  amount                   numeric(18,4) not null check (amount >= 0),
  counterparty_account_id  int references personal_stock_accounts(id),
  occurred_at              date not null,
  note                     text
);
create index on personal_stock_cash_movements (account_id, occurred_at);
create index on personal_stock_cash_movements (kind);

create table personal_stock_fees (
  id           uuid primary key default gen_random_uuid(),
  raw_row_id   uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id   int not null references personal_stock_accounts(id),
  kind         text not null check (kind in ('platform_daily','ipo_subscription','other')),
  amount       numeric(18,4) not null,
  occurred_at  date not null,
  note         text
);
create index on personal_stock_fees (account_id, occurred_at);

create table personal_stock_interest (
  id                uuid primary key default gen_random_uuid(),
  raw_row_id        uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id        int not null references personal_stock_accounts(id),
  direction         text not null check (direction in ('charge','credit')),
  amount            numeric(18,4) not null check (amount >= 0),
  period_end_date   date not null,
  note              text
);
create index on personal_stock_interest (account_id, period_end_date);

create table personal_stock_corrections (
  id                     uuid primary key default gen_random_uuid(),
  raw_row_id             uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id             int not null references personal_stock_accounts(id),
  reverses_raw_row_id    uuid references personal_stock_raw_rows(id),
  amount_debit           numeric(18,4) not null default 0,
  amount_credit          numeric(18,4) not null default 0,
  occurred_at            date not null,
  note                   text
);
create index on personal_stock_corrections (account_id, occurred_at);

create table personal_stock_current_prices (
  id              uuid primary key default gen_random_uuid(),
  instrument_id   int not null references personal_stock_instruments(id),
  price           numeric(18,6) not null check (price >= 0),
  as_of_date      date not null,
  entered_at      timestamptz not null default now(),
  entered_by      text,
  note            text
);
create index on personal_stock_current_prices (instrument_id, as_of_date desc);

commit;
