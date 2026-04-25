-- Phase: Skipper-collects-cash trip flag.
--
-- New broker option on Trip Details: "Skipper will collect cash from
-- client before boarding". When set, no broker→owner transfer is
-- expected; the cron at /api/cron/boat-rental/auto-close-skipper-cash
-- flips the reservation to paid_to_owner the day after the trip.
--
-- Also adds optional whatsapp on app_users so the trip_details
-- notification can fan out to the broker (in addition to owner+skipper).

alter table public.boat_rental_bookings
  add column if not exists skipper_collects_cash boolean not null default false,
  add column if not exists skipper_instructions  text;

alter table public.app_users
  add column if not exists whatsapp text;     -- E.164 without '+', Green-API format

-- Allow the cron to record system-initiated payments without impersonating a user.
alter table public.boat_rental_payments
  alter column recorded_by drop not null;

alter table public.boat_rental_payments
  drop constraint if exists boat_rental_payments_recorded_by_role_check;

alter table public.boat_rental_payments
  add constraint boat_rental_payments_recorded_by_role_check
    check (recorded_by_role in ('broker','owner','admin','system'));
