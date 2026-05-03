-- 0070: Recurring expense templates (Marina monthly, Insurance yearly, etc.)
-- and owner_settings (default fuel price, preferred marina vendor, lang prefs).
--
-- Templates have an active flag and next_run_date; the daily cron picks rows
-- where next_run_date <= today and inserts an expense (status='open'),
-- then advances next_run_date.
--
-- DOWN:
--   drop table public.boat_rental_owner_settings;
--   drop table public.boat_rental_recurring_expense_templates;

create table if not exists public.boat_rental_recurring_expense_templates (
  id              uuid primary key default gen_random_uuid(),
  boat_id         uuid not null references public.boat_rental_boats(id) on delete cascade,
  owner_id        uuid not null references public.boat_rental_owners(id),
  category        text not null check (category in (
                    'amenities','part_time_skipper',
                    'marina_docking','fuel','repair',
                    'insurance','boat_license','full_time_skipper_salary',
                    'maintenance_contract','other'
                  )),
  vendor_name     text,
  amount_egp      numeric(10,2) not null check (amount_egp > 0),
  frequency       text not null check (frequency in ('monthly','quarterly','yearly')),
  day_of_period   int not null check (day_of_period between 1 and 28),
  month_of_year   int check (month_of_year between 1 and 12),
  description     text,
  active          boolean not null default true,
  next_run_date   date not null,
  last_run_date   date,
  created_by      uuid not null references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_boat_rental_recurring_due
  on public.boat_rental_recurring_expense_templates (next_run_date) where active = true;

-- Add the deferred FK from expenses → templates.
alter table public.boat_rental_expenses
  add constraint boat_rental_expenses_recurring_template_fk
  foreign key (recurring_template_id) references public.boat_rental_recurring_expense_templates(id);

create table if not exists public.boat_rental_owner_settings (
  owner_id                  uuid primary key references public.boat_rental_owners(id) on delete cascade,
  default_fuel_price_per_l  numeric(8,2),
  preferred_marina_vendor   text,
  notification_lang         text not null default 'en' check (notification_lang in ('en','ar')),
  reminder_24h_lang         text not null default 'ar' check (reminder_24h_lang in ('en','ar')),
  whatsapp                  text,
  prefs_json                jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
