-- 0118_bh_financials_balance_snapshots.sql
-- BH Financials — Beginning Balances & Snapshot Module
-- 5 new tables; seeds the 31-Dec-2025 consolidated v1 snapshot from the
-- current TS const beithady-opening-balance-2026.ts so behavior is
-- value-identical on day 1.
-- Note: filed as 0118 (not 0117) because 0117 was taken by the parallel
-- personal-stock-investment session.

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
