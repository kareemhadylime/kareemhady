-- 0069: Expense ledger + multi-payment ledger per expense (universal payable model).
-- Categories cover trip-related (amenities, part_time_skipper) and general
-- (marina, fuel, repair, insurance, license, full-time skipper salary,
-- maintenance, other). Trip-related rows link to a reservation via
-- reservation_id; general rows leave it null.
--
-- DOWN:
--   drop table public.boat_rental_expense_payments;
--   drop table public.boat_rental_expenses;

create table if not exists public.boat_rental_expenses (
  id                       uuid primary key default gen_random_uuid(),
  boat_id                  uuid not null references public.boat_rental_boats(id),
  owner_id                 uuid not null references public.boat_rental_owners(id),
  reservation_id           uuid references public.boat_rental_reservations(id),
  category                 text not null check (category in (
                             'amenities','part_time_skipper',
                             'marina_docking','fuel','repair',
                             'insurance','boat_license','full_time_skipper_salary',
                             'maintenance_contract','other'
                           )),
  expense_date             date not null,
  amount_egp               numeric(10,2) not null check (amount_egp >= 0),
  description              text,
  fuel_liters              numeric(8,2),
  fuel_price_per_liter     numeric(8,2),
  fuel_tips_egp            numeric(10,2),
  skipper_id               uuid references public.boat_rental_skippers(id),
  recurring_template_id    uuid,  -- FK added in 0070 (forward ref)
  receipt_path             text,
  status                   text not null default 'open' check (status in ('open','paid','cancelled')),
  vendor_name              text,
  created_by               uuid not null references public.app_users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists idx_boat_rental_expenses_boat_date
  on public.boat_rental_expenses (boat_id, expense_date desc);
create index if not exists idx_boat_rental_expenses_open_per_owner
  on public.boat_rental_expenses (owner_id, status) where status = 'open';
create index if not exists idx_boat_rental_expenses_reservation
  on public.boat_rental_expenses (reservation_id) where reservation_id is not null;

create table if not exists public.boat_rental_expense_payments (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.boat_rental_expenses(id) on delete cascade,
  amount_egp   numeric(10,2) not null check (amount_egp > 0),
  paid_date    date not null,
  method       text not null check (method in ('cash','bank_transfer','instapay','card','other')),
  note         text,
  recorded_by  uuid not null references public.app_users(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_boat_rental_expense_payments_expense
  on public.boat_rental_expense_payments (expense_id, paid_date desc);
