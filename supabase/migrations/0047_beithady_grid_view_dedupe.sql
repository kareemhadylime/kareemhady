-- 0047_beithady_grid_view_dedupe.sql
-- Fix the long-standing row explosion in beithady_reservation_grid_v.
--
-- Problem
-- -------
-- The view did 4 LEFT JOINs (beithady_guests / overrides / boarding_passes /
-- pre_arrival_messages) without any guarantee they were 1:1 against the
-- reservation. The worst offender was beithady_guests: ~200 guest profiles
-- share the placeholder email `booking@beithady.com` (used by Booking.com
-- as a masked guest contact), and ~204 reservations carry that same
-- placeholder. The email/phone match in the join produced a 200×204 cross
-- product. Net effect on the live view: 48,005 rows for 6,951 distinct
-- reservations (~6.9x inflation).
--
-- Downstream impact: finance-brief revenue / MTD / payout forecasts were
-- all multiplied by the explosion factor; the morning-brief WhatsApp on
-- 2026-04-28 reported "412 bookings yesterday" instead of ~15.
--
-- Fix
-- ---
-- 1. Replace the 1:N LEFT JOINs with LATERAL subqueries that pick exactly
--    one row per reservation.
-- 2. For beithady_guests, exclude generic placeholder emails so we don't
--    arbitrarily attach a stranger's loyalty profile to a placeholder
--    reservation. (The list is editable here — extend as new placeholders
--    surface.)
-- 3. Expose created_at_odoo so finance/ops queries can use the booking
--    creation timestamp without going back to guesty_reservations.

CREATE OR REPLACE VIEW beithady_reservation_grid_v AS
SELECT
  r.id AS reservation_id,
  r.confirmation_code,
  r.platform_confirmation_code,
  r.status,
  r.integration_platform AS channel,
  r.source AS source_label,
  r.listing_id,
  r.listing_nickname,
  r.guest_name,
  r.guest_email,
  r.guest_phone,
  r.check_in_date,
  r.check_out_date,
  r.nights,
  r.guests AS guest_count,
  r.cancelled_at,

  -- Money: prefer raw.money (richer), fall back to columns.
  COALESCE((r.raw->'money'->>'hostPayout')::numeric, r.host_payout) AS host_payout,
  COALESCE((r.raw->'money'->>'fareAccommodation')::numeric, r.fare_accommodation) AS fare_accommodation,
  COALESCE((r.raw->'money'->>'commission')::numeric, 0) AS commission,
  COALESCE((r.raw->'money'->>'cleaningFee')::numeric, r.cleaning_fee) AS cleaning_fee,
  COALESCE(r.raw->'money'->>'currency', r.currency, 'USD') AS currency,

  -- Listing
  l.title AS listing_title,
  l.building_code,

  -- Beithady guest profile (single best match — see lateral below)
  bg.id AS beithady_guest_id,
  bg.loyalty_tier,
  bg.lifetime_spend_usd,
  bg.lifetime_stays,
  bg.is_vip,

  -- Overrides (1:1 by unique constraint, but kept defensive)
  o.risk_score,
  o.risk_breakdown,
  o.payment_status,
  o.payment_total_cents,
  o.payment_paid_cents,
  o.payment_balance_cents,
  o.payment_currency,
  o.payment_source,
  o.flagged_unpaid,
  o.flagged_prearrival_missing,
  o.next_checkin_gap_hours,
  o.is_manual_block,
  o.manual_notes,

  -- Boarding pass (most recent if multiple ever exist)
  bp.boarding_viewed_at,
  bp.boarding_view_count,
  bp.boarding_pass_exists,

  -- Pre-arrival message (most recent scheduled)
  pam.prearrival_sent_at,
  pam.prearrival_scheduled_for,

  -- Booking creation timestamp (used by finance brief for accrual semantics).
  -- Appended at the end so CREATE OR REPLACE doesn't fail Postgres' rule
  -- against changing existing column positions.
  r.created_at_odoo
FROM guesty_reservations r
LEFT JOIN guesty_listings l ON l.id = r.listing_id

LEFT JOIN LATERAL (
  SELECT
    bg.id,
    bg.loyalty_tier,
    bg.lifetime_spend_usd,
    bg.lifetime_stays,
    bg.vip AS is_vip
  FROM beithady_guests bg
  WHERE
    -- Exclude generic placeholders so they don't fan out into a random
    -- profile. Add new ones here as they surface.
    (
      r.guest_email IS NOT NULL
      AND lower(r.guest_email) NOT IN (
        'booking@beithady.com',
        'noreply@guesty.com',
        'guest@airbnb.com'
      )
      AND bg.email IS NOT NULL
      AND lower(bg.email) = lower(r.guest_email)
    )
    OR (
      bg.phone_e164 IS NOT NULL
      AND r.guest_phone IS NOT NULL
      AND bg.phone_e164 = r.guest_phone
    )
  ORDER BY
    COALESCE(bg.lifetime_stays, 0) DESC,
    COALESCE(bg.lifetime_spend_usd, 0) DESC,
    bg.created_at DESC NULLS LAST
  LIMIT 1
) bg ON TRUE

LEFT JOIN beithady_reservation_overrides o ON o.reservation_id = r.id

LEFT JOIN LATERAL (
  SELECT
    bp.viewed_at AS boarding_viewed_at,
    bp.view_count AS boarding_view_count,
    (bp.token IS NOT NULL) AS boarding_pass_exists
  FROM beithady_boarding_passes bp
  WHERE bp.reservation_id = r.id
  ORDER BY bp.created_at DESC NULLS LAST
  LIMIT 1
) bp ON TRUE

LEFT JOIN LATERAL (
  SELECT
    pam.sent_at AS prearrival_sent_at,
    pam.scheduled_for AS prearrival_scheduled_for
  FROM beithady_pre_arrival_messages pam
  WHERE pam.reservation_id = r.id
  ORDER BY
    pam.scheduled_for DESC NULLS LAST,
    pam.created_at DESC NULLS LAST
  LIMIT 1
) pam ON TRUE;

COMMENT ON VIEW beithady_reservation_grid_v IS
'Joined view powering Operations Calendar, drawer, morning briefs, cancel-risk. '
'1:1 per reservation_id (LATERAL LIMIT 1 dedup on guests/boarding_pass/pre_arrival).';
