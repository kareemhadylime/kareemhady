-- Phase C.5 follow-up: booking-status filter for unified inbox.
--
-- Joins beithady_conversations with guesty_reservations and computes a
-- categorical booking_status_variant column matching the
-- ReservationVariant TS enum in src/lib/beithady/communication/reservation-status.ts.
--
-- Variants:
--   inquiry      — unconfirmed quote
--   future       — confirmed/reserved with check_in > today
--   in_house     — confirmed/checked_in/checked_out with today in [check_in, check_out]
--   past         — confirmed/checked_out with check_out < today
--   cancelled    — canceled/cancelled/declined/closed
--   pending_sync — reservation_id set but row not yet in guesty_reservations
--   none         — no reservation_id (cold lead)
--
-- "Today" is computed in Africa/Cairo wall-time to match Guesty's
-- check_in_date / check_out_date (which are property-tz wall dates).

create or replace view public.bh_conversations_with_booking_status as
select
  c.*,
  case
    when c.reservation_id is null then 'none'
    when r.id is null then 'pending_sync'
    when lower(coalesce(r.status, '')) in ('canceled', 'cancelled', 'declined', 'closed') then 'cancelled'
    when lower(coalesce(r.status, '')) = 'inquiry' then 'inquiry'
    when lower(coalesce(r.status, '')) in ('confirmed', 'reserved', 'checked_in', 'checked_out')
         and r.check_in_date is not null
         and r.check_out_date is not null
         and ((now() at time zone 'Africa/Cairo')::date) between r.check_in_date and r.check_out_date
      then 'in_house'
    when lower(coalesce(r.status, '')) in ('confirmed', 'checked_out')
         and r.check_out_date is not null
         and ((now() at time zone 'Africa/Cairo')::date) > r.check_out_date
      then 'past'
    when lower(coalesce(r.status, '')) in ('confirmed', 'reserved')
         and (r.check_in_date is null or ((now() at time zone 'Africa/Cairo')::date) < r.check_in_date)
      then 'future'
    else 'pending_sync'
  end as booking_status_variant
from public.beithady_conversations c
left join public.guesty_reservations r on r.id = c.reservation_id;

comment on view public.bh_conversations_with_booking_status
  is 'Phase C.5 — joins conversations with reservations and computes booking_status_variant for inbox filtering. Variants match ReservationVariant in reservation-status.ts.';
