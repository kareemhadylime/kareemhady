-- FX rates lookup table (anything → USD).
-- Refreshed weekly by /api/cron/fx-rates-refresh from open.er-api.com.
-- Seeded with hand-picked sane defaults so ROAS calc never silently
-- returns 0 for non-USD bookings if the cron hasn't run yet.

create table if not exists public.fx_rates_usd (
  currency      text primary key,
  rate_to_usd   numeric(14, 8) not null,
  as_of_date    date not null default current_date,
  source        text default 'manual',
  updated_at    timestamptz not null default now()
);

alter table public.fx_rates_usd enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fx_rates_usd' and policyname='fx_rates_usd_all') then
    create policy fx_rates_usd_all on public.fx_rates_usd for all using (true) with check (true);
  end if;
end $$;

-- Seed plausible defaults (as of late 2024 / early 2025). Cron will overwrite
-- with live rates on first run.
insert into public.fx_rates_usd (currency, rate_to_usd, source) values
  ('USD', 1.00,       'seed'),
  ('EGP', 0.0203,     'seed'),
  ('AED', 0.2723,     'seed'),
  ('EUR', 1.08,       'seed'),
  ('GBP', 1.27,       'seed'),
  ('SAR', 0.2666,     'seed'),
  ('KWD', 3.25,       'seed'),
  ('QAR', 0.2747,     'seed'),
  ('JOD', 1.41,       'seed'),
  ('RUB', 0.0098,     'seed'),
  ('PLN', 0.25,       'seed'),
  ('CZK', 0.043,      'seed')
on conflict (currency) do nothing;

insert into public.beithady_audit_log(module, action, metadata) values
  ('ads', 'fx_rates_table_installed',
   jsonb_build_object('migration', '0105_fx_rates_usd', 'seeded_count', 12));
