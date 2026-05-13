-- supabase/migrations/0079_hc_estimator_snapshots.sql
create table if not exists hc_estimator_snapshots (
  id          uuid primary key default gen_random_uuid(),
  month_key   text not null unique,  -- "2026-04"
  data        jsonb not null,        -- serialised HKBaseData
  created_at  timestamptz default now()
);
