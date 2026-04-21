-- Phase 7.1: Odoo 18 finance data ingestion (invoices + companies only)
-- Scope: company_id IN (4, 5, 10)
--   4  = A1HOSPITALITY (owner of BH-435; Lime 50% stake)
--   5  = Beithady Hospitality - (EGYPT)
--   10 = Beithady Hospitality FZCO - (Dubai)
-- Analytic-account-to-invoice mapping and per-building P&L join deferred to
-- Phase 7.2 (requires reading account.move.line.analytic_distribution).

create table if not exists public.odoo_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual',
  status text not null default 'running',
  companies_synced int not null default 0,
  invoices_synced int not null default 0,
  error text
);

create table if not exists public.odoo_companies (
  id bigint primary key,
  name text not null,
  country text,
  currency text,
  in_scope boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.odoo_invoices (
  id bigint primary key,
  name text,
  move_type text not null,
  state text not null,
  company_id bigint not null references public.odoo_companies(id) on delete cascade,
  partner_id bigint,
  partner_name text,
  invoice_date date,
  amount_total numeric(18,2),
  currency text,
  odoo_created_at timestamptz,
  odoo_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists idx_odoo_invoices_company on public.odoo_invoices (company_id);
create index if not exists idx_odoo_invoices_date on public.odoo_invoices (invoice_date desc);
create index if not exists idx_odoo_invoices_partner on public.odoo_invoices (partner_id);
create index if not exists idx_odoo_invoices_type on public.odoo_invoices (move_type);
create index if not exists idx_odoo_sync_runs_started on public.odoo_sync_runs (started_at desc);
