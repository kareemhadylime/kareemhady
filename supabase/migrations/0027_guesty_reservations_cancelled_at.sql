-- Daily-report v2: pin cancellation date for the cancellations section.
--
-- Previously the report read `updated_at_odoo` (=Guesty's `updatedAt`)
-- to find "today's cancellations". Verified via SQL on 2026-04-26 that
-- `MAX(updated_at_odoo) for status='canceled'` was 2026-02-23 — over
-- 2 months stale. The Guesty sync's RESERVATION_FIELDS didn't request
-- `cancelledAt` so the field was never persisted, AND the sparse `raw`
-- jsonb (only requested fields stored) couldn't be used as a fallback.
--
-- Fix in two parts:
--   1. (this migration) add a dedicated cancelled_at column
--   2. (run-guesty-sync.ts) extend RESERVATION_FIELDS to include
--      cancelledAt + lastUpdatedAt, then map them into this column
--      on each upsert. Backfill happens on the next nightly sync.

alter table public.guesty_reservations
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_guesty_res_cancelled_at
  on public.guesty_reservations (cancelled_at desc)
  where cancelled_at is not null;
