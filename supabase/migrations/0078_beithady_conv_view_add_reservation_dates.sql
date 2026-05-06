-- Phase C.5 follow-up: extend bh_conversations_with_booking_status view
-- with reservation stay dates + status so the inbox sidebar can show
-- "May 6 → May 8 · 2N" alongside the guest name. Without this, two
-- distinct reservations from the same guest on the same listing
-- (Airbnb threads are per-reservation, not per-guest) look like
-- duplicates in the sidebar.
--
-- Note: postgres `create or replace view` requires the leading columns
-- to keep their names + order. New columns must be appended at the end,
-- after the existing booking_status_variant column.
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
  end as booking_status_variant,
  r.status         as reservation_status,
  r.check_in_date  as reservation_check_in_date,
  r.check_out_date as reservation_check_out_date,
  r.nights         as reservation_nights
from public.beithady_conversations c
left join public.guesty_reservations r on r.id = c.reservation_id;

comment on view public.bh_conversations_with_booking_status
  is 'Phase C.5 — joins conversations with reservations and exposes reservation dates + status + booking_status_variant for inbox listing and filtering.';
