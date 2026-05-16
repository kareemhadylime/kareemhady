-- 2026-05-16: Idempotency for recurring-template payments.
--
-- If the daily cron and a manual "run-now" fire within seconds of each other
-- for the same template, both could otherwise insert a payment row for the
-- same (recurring_template_id, occurred_on) pair. This partial unique index
-- makes the second insert fail with SQLSTATE 23505, so the application layer
-- can catch it and treat the retry as a no-op (return the winning row's id).
--
-- The index also accelerates the "is there already a payment for this
-- template + day?" pre-check lookup in `recordPaymentForRecurringTemplate`.

create unique index if not exists
  idx_uniq_payments_recurring_per_day
  on personal_networth_payments (recurring_template_id, occurred_on)
  where recurring_template_id is not null;
