-- Phase 5 — Mobile-aware app. Adds idempotency_key column to
-- boat_rental_payments so the offline Mark-Paid background-sync queue
-- can replay queued requests without creating duplicate payments when
-- the same action lands twice (e.g., owner taps Mark Paid offline,
-- queue fires, then user reloads and the page tries again).
--
-- Partial unique index lets pre-existing rows keep their NULL keys
-- without conflicts.

alter table public.boat_rental_payments
  add column if not exists idempotency_key uuid;

create unique index if not exists boat_rental_payments_idempotency_key_uk
  on public.boat_rental_payments (idempotency_key)
  where idempotency_key is not null;
