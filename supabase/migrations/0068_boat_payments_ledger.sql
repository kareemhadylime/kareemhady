-- 0068: Drop UNIQUE constraint on boat_rental_payments(reservation_id) so the
-- table becomes a true ledger — multiple payments per trip allowed. Replaces
-- the dropped constraint with a regular index (still query by reservation_id).
--
-- Pre-deploy requirement: ALL code reads of boat_rental_payments must be
-- refactored to handle 0..N rows per reservation, NOT exactly 1. Migration
-- 0017 added a payment_idempotency table; that is independent of this change.
--
-- DOWN:
--   alter table public.boat_rental_payments
--     add constraint boat_rental_payments_reservation_id_key unique (reservation_id);
--   drop index if exists idx_boat_rental_payments_reservation;

alter table public.boat_rental_payments
  drop constraint boat_rental_payments_reservation_id_key;

create index if not exists idx_boat_rental_payments_reservation
  on public.boat_rental_payments (reservation_id, paid_at desc);
