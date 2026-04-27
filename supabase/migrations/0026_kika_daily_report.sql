-- KIKA Daily Performance Report module.
--
-- Reuses the Beithady infrastructure (0025): no new tables. The same
-- `report_recipients`, `daily_report_snapshots`, and `daily_report_deliveries`
-- tables host KIKA rows distinguished by `report_kind = 'kika_daily'`.
--
-- 09:00 Cairo daily delivery to admin-managed WhatsApp + email recipients,
-- with a 48-hr expiring tokenized HTML link. Cron runs every 30 min from
-- 06:00–21:30 UTC and is idempotent — a recipient already marked `sent`
-- for today's snapshot is skipped, so retries through the day don't dup.
--
-- This migration is purely additive: a kika-scoped index for fast history
-- lookups and a convenience view for the Snapshot History page (Tab 4).

-- Fast lookup by report_date for the kika history page (only kika_daily
-- snapshots, descending — the same shape Beithady uses but kika-scoped).
create index if not exists daily_report_snapshots_kika_date_idx
  on public.daily_report_snapshots (report_date desc)
  where report_kind = 'kika_daily';

-- Convenience view for the 90-day calendar grid on /emails/kika/history.
-- Surfaces only the columns the page renders (no `payload` jsonb) so
-- the index-only path is hot. The page can join back to the full row
-- when the user clicks a date and wants the tokenized link.
create or replace view public.kika_snapshot_history as
  select
    id,
    report_date,
    generated_at,
    delivery_complete,
    build_attempts,
    last_build_error,
    expires_at,
    deleted_at,
    token,
    -- Surface a couple of headline metrics for the hover/calendar cell
    -- without forcing the page to deserialize the full payload.
    (payload->'totals'->>'orders')::int            as orders,
    (payload->'totals'->>'net_revenue_egp')::numeric as net_revenue_egp
  from public.daily_report_snapshots
  where report_kind = 'kika_daily';
