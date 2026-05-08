-- Tracks which reservations have already triggered a same-day-booking
-- WhatsApp alert. Primary key on reservation_id makes the alert
-- idempotent — concurrent cron ticks racing to send hit the unique
-- constraint and skip cleanly.

CREATE TABLE IF NOT EXISTS beithady_same_day_alerts (
  reservation_id   text PRIMARY KEY,
  alerted_at       timestamptz NOT NULL DEFAULT now(),
  recipients_count int NOT NULL DEFAULT 0,
  delivered_count  int NOT NULL DEFAULT 0,
  failed_count     int NOT NULL DEFAULT 0,
  message_text     text,
  errors           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beithady_same_day_alerts_alerted_at
  ON beithady_same_day_alerts (alerted_at DESC);

COMMENT ON TABLE beithady_same_day_alerts IS
  'Idempotency log for same-day-booking WhatsApp alerts (cron beithady-same-day-alerts). One row per reservation; PK prevents double-send.';
