-- Phase 7.2: Odoo financials — chart of accounts, move lines, partners.
-- Enables the Beithady Financials rule (Phase 7.3): P&L with account-code
-- prefix grouping matching the Feb 2026 Consolidated P&L format, plus
-- payables split by Vendor / Employee / Owner.

-- Extend the sync log with three new counters. These columns default to 0
-- so existing rows (from Phase 7.1) remain valid.
alter table public.odoo_sync_runs
  add column if not exists accounts_synced int not null default 0;
alter table public.odoo_sync_runs
  add column if not exists move_lines_synced int not null default 0;
alter table public.odoo_sync_runs
  add column if not exists partners_synced int not null default 0;

create table if not exists public.odoo_accounts (
  id bigint primary key,                      -- Odoo account.account.id
  code text,                                  -- '400100', '504103', etc.
  name text not null,
  account_type text,                          -- income / expense / liability_payable / asset_receivable / etc.
  company_ids bigint[] not null default '{}'::bigint[],
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_odoo_accounts_code on public.odoo_accounts (code);
create index if not exists idx_odoo_accounts_type on public.odoo_accounts (account_type);
create index if not exists idx_odoo_accounts_code_prefix on public.odoo_accounts (substring(code, 1, 3));

create table if not exists public.odoo_partners (
  id bigint primary key,                      -- Odoo res.partner.id
  name text not null,
  email text,
  phone text,
  is_company boolean,
  active boolean,
  supplier_rank int not null default 0,
  customer_rank int not null default 0,
  is_employee boolean not null default false,
  is_owner boolean not null default false,
  category_ids bigint[] not null default '{}'::bigint[],
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_odoo_partners_supplier on public.odoo_partners (supplier_rank) where supplier_rank > 0;
create index if not exists idx_odoo_partners_owner on public.odoo_partners (is_owner) where is_owner;
create index if not exists idx_odoo_partners_employee on public.odoo_partners (is_employee) where is_employee;

create table if not exists public.odoo_move_lines (
  id bigint primary key,                      -- Odoo account.move.line.id
  move_id bigint not null,                    -- Odoo account.move.id (parent)
  company_id bigint not null references public.odoo_companies(id) on delete cascade,
  account_id bigint references public.odoo_accounts(id) on delete set null,
  partner_id bigint references public.odoo_partners(id) on delete set null,
  date date,                                  -- line effective date (= move.date)
  name text,                                  -- line label
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  balance numeric(18,2) not null default 0,   -- debit - credit, always in company currency
  amount_residual numeric(18,2) not null default 0,  -- unpaid balance for AR/AP reconciliation
  currency text,                              -- transaction currency ISO (EGP/USD/AED)
  amount_currency numeric(18,2),              -- amount in transaction currency
  analytic_distribution jsonb,                -- { "account_id": percentage } for per-building P&L
  parent_state text,                          -- 'draft' | 'posted' | 'cancel' (from account.move.state)
  move_type text,                             -- 'out_invoice' | 'in_invoice' | 'entry' | etc.
  reconciled boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists idx_odoo_ml_company on public.odoo_move_lines (company_id);
create index if not exists idx_odoo_ml_account on public.odoo_move_lines (account_id);
create index if not exists idx_odoo_ml_partner on public.odoo_move_lines (partner_id);
create index if not exists idx_odoo_ml_date on public.odoo_move_lines (date desc);
create index if not exists idx_odoo_ml_move on public.odoo_move_lines (move_id);
create index if not exists idx_odoo_ml_parent_state on public.odoo_move_lines (parent_state);
create index if not exists idx_odoo_ml_analytic on public.odoo_move_lines using gin (analytic_distribution);
