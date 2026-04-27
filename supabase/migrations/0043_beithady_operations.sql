-- 0043_beithady_operations.sql
--
-- Phase J.1 foundation: Operations Calendar.
--
-- Pre-flight notes that shaped this migration:
--   * guesty_reservations.raw.money carries hostPayout / fareAccommodation /
--     commission / currency. We use these as the source of truth for
--     "total amount" since there's no totalAmount column.
--   * No per-night price calendar exists today; pricelabs_listing_snapshots
--     gives recommended_base_price per listing per snapshot date. Cells
--     use that as a flat per-listing price (V1).
--   * beithady_boarding_passes has no ID-upload or smart-lock fields, so
--     V1 risk score does NOT include them. Pre-arrival readiness comes
--     from beithady_pre_arrival_messages.sent_at.
--   * comp_median_usd is per (building_code, bedroom_bucket) in
--     pricelabs_market_snapshots — joined later in code, not in the view.
--   * Permission matrix lives in code (src/lib/beithady/auth.ts), not DB,
--     so the DO-block at the bottom is a no-op when the table doesn't
--     exist.

-- ---------------------------------------------------------------------------
-- Reservation overrides + cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_reservation_overrides (
  reservation_id text PRIMARY KEY,

  -- AI risk score (1 = clean, 10 = on-fire). Refreshed every 30 min by cron.
  risk_score smallint CHECK (risk_score BETWEEN 1 AND 10),
  risk_breakdown jsonb,

  -- Cached payment status (derived; refreshed by recompute_payment RPC).
  payment_status text CHECK (payment_status IN ('paid','partial','unpaid','n_a')),
  payment_total_cents bigint,
  payment_paid_cents bigint,
  payment_balance_cents bigint,
  payment_currency text DEFAULT 'USD',
  payment_due_by timestamptz,
  payment_source text CHECK (payment_source IN ('guesty','stripe','manual','channel')),

  -- Denormalised flags for fast grid filtering
  flagged_unpaid boolean NOT NULL DEFAULT false,
  flagged_prearrival_missing boolean NOT NULL DEFAULT false,
  flagged_overdue_message boolean NOT NULL DEFAULT false,

  -- Manual fields (agent overrides)
  manual_notes text,
  manual_block_reason text CHECK (manual_block_reason IN ('owner_stay','maintenance','hold','other')),
  is_manual_block boolean NOT NULL DEFAULT false,

  -- Cleaning gap detection
  next_checkin_gap_hours smallint,

  -- Audit
  last_recomputed_at timestamptz,
  updated_by_user text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bro_flagged_unpaid
  ON beithady_reservation_overrides (flagged_unpaid) WHERE flagged_unpaid;
CREATE INDEX IF NOT EXISTS idx_bro_risk_score
  ON beithady_reservation_overrides (risk_score) WHERE risk_score IS NOT NULL;

COMMENT ON TABLE beithady_reservation_overrides IS
'Per-reservation cache of risk score + payment status + manual overrides. Powers the Operations Calendar grid filters and drawer.';

-- ---------------------------------------------------------------------------
-- Saved views (per-user filter presets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_calendar_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id text NOT NULL,
  scope text NOT NULL DEFAULT 'private' CHECK (scope IN ('private','shared')),
  filters_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcsv_owner ON beithady_calendar_saved_views (owner_user_id);

-- ---------------------------------------------------------------------------
-- Manual blocks (owner stays, maintenance, holds — separate from reservations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_calendar_manual_blocks (
  id text PRIMARY KEY DEFAULT ('mb_' || replace(gen_random_uuid()::text, '-', '')),
  listing_id text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date > start_date),
  reason text NOT NULL CHECK (reason IN ('owner_stay','maintenance','hold','other')),
  notes text,
  guesty_synced boolean NOT NULL DEFAULT false,
  guesty_sync_error text,
  guesty_synced_at timestamptz,
  created_by_user text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcmb_listing_dates
  ON beithady_calendar_manual_blocks (listing_id, start_date, end_date);

-- ---------------------------------------------------------------------------
-- Grid view — joined snapshot for the calendar query
-- ---------------------------------------------------------------------------
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

  -- Beithady guest profile (Phase B)
  bg.id AS beithady_guest_id,
  bg.loyalty_tier,
  bg.lifetime_spend_usd,
  bg.lifetime_stays,
  bg.vip AS is_vip,

  -- Override fields (cache)
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

  -- Boarding pass (Phase F)
  bp.viewed_at AS boarding_viewed_at,
  bp.view_count AS boarding_view_count,
  bp.token IS NOT NULL AS boarding_pass_exists,

  -- Pre-arrival (Phase F)
  pam.sent_at AS prearrival_sent_at,
  pam.scheduled_for AS prearrival_scheduled_for
FROM guesty_reservations r
LEFT JOIN guesty_listings l ON l.id = r.listing_id
LEFT JOIN beithady_guests bg ON (
  (bg.email IS NOT NULL AND r.guest_email IS NOT NULL AND lower(bg.email) = lower(r.guest_email))
  OR (bg.phone_e164 IS NOT NULL AND r.guest_phone IS NOT NULL AND bg.phone_e164 = r.guest_phone)
)
LEFT JOIN beithady_reservation_overrides o ON o.reservation_id = r.id
LEFT JOIN beithady_boarding_passes bp ON bp.reservation_id = r.id
LEFT JOIN beithady_pre_arrival_messages pam ON pam.reservation_id = r.id;

COMMENT ON VIEW beithady_reservation_grid_v IS
'Joined view powering the Operations Calendar grid + drawer Overview tab.';

-- ---------------------------------------------------------------------------
-- Anomaly view (banner above the grid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW beithady_calendar_anomalies_v AS
SELECT
  COUNT(*) FILTER (WHERE o.flagged_unpaid) AS unpaid_count,
  SUM(o.payment_balance_cents) FILTER (WHERE o.flagged_unpaid) AS unpaid_balance_cents,
  COUNT(*) FILTER (WHERE o.flagged_prearrival_missing) AS prearrival_missing_count,
  COUNT(*) FILTER (WHERE o.next_checkin_gap_hours < 3 AND o.next_checkin_gap_hours > 0) AS cleaning_gap_count
FROM beithady_reservation_overrides o
JOIN guesty_reservations r ON r.id = o.reservation_id
WHERE r.check_out_date >= CURRENT_DATE - INTERVAL '7 days'
  AND r.check_in_date <= CURRENT_DATE + INTERVAL '90 days'
  AND r.status NOT IN ('canceled');

-- ---------------------------------------------------------------------------
-- RPC: recompute payment status for one reservation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beithady_calendar_recompute_payment(p_reservation_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_channel text;
  v_total numeric;
  v_currency text;
  v_check_in date;
  v_payment_status text;
  v_payment_source text;
BEGIN
  SELECT
    r.status,
    COALESCE(r.integration_platform, r.source),
    COALESCE((r.raw->'money'->>'hostPayout')::numeric, r.host_payout, 0)
      + COALESCE((r.raw->'money'->>'commission')::numeric, 0),
    COALESCE(r.raw->'money'->>'currency', r.currency, 'USD'),
    r.check_in_date
  INTO v_status, v_channel, v_total, v_currency, v_check_in
  FROM guesty_reservations r
  WHERE r.id = p_reservation_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_status = 'canceled' THEN
    v_payment_status := 'n_a';
    v_payment_source := 'channel';
  ELSIF v_status = 'inquiry' THEN
    v_payment_status := 'unpaid';
    v_payment_source := 'guesty';
  ELSIF v_status = 'confirmed' AND v_channel ~* '(airbnb|booking|vrbo|expedia|hopper)' THEN
    v_payment_status := 'paid';
    v_payment_source := 'channel';
  ELSE
    -- Direct/Website/manual/unknown: caller should query Stripe to refine.
    v_payment_status := 'unpaid';
    v_payment_source := 'guesty';
  END IF;

  INSERT INTO beithady_reservation_overrides
    (reservation_id, payment_status, payment_total_cents, payment_currency,
     payment_source, flagged_unpaid, last_recomputed_at, updated_at)
  VALUES
    (p_reservation_id, v_payment_status, ROUND(v_total*100)::bigint, v_currency,
     v_payment_source,
     v_payment_status IN ('unpaid','partial')
       AND v_check_in - CURRENT_DATE <= 7
       AND v_check_in >= CURRENT_DATE,
     now(), now())
  ON CONFLICT (reservation_id) DO UPDATE SET
    payment_status = EXCLUDED.payment_status,
    payment_total_cents = EXCLUDED.payment_total_cents,
    payment_currency = EXCLUDED.payment_currency,
    payment_source = EXCLUDED.payment_source,
    flagged_unpaid = EXCLUDED.flagged_unpaid,
    last_recomputed_at = now(),
    updated_at = now();
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: recompute risk score for one reservation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beithady_calendar_recompute_risk(p_reservation_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment text;
  v_check_in date;
  v_status text;
  v_loyalty text;
  v_prearrival timestamptz;
  v_score numeric := 1;
  v_breakdown jsonb := '{}'::jsonb;
  v_flagged_pre boolean := false;
BEGIN
  SELECT o.payment_status, r.check_in_date, r.status,
         bg.loyalty_tier, pam.sent_at
    INTO v_payment, v_check_in, v_status, v_loyalty, v_prearrival
  FROM guesty_reservations r
  LEFT JOIN beithady_reservation_overrides o ON o.reservation_id = r.id
  LEFT JOIN beithady_guests bg ON (
    (bg.email IS NOT NULL AND r.guest_email IS NOT NULL AND lower(bg.email) = lower(r.guest_email))
  )
  LEFT JOIN beithady_pre_arrival_messages pam ON pam.reservation_id = r.id
  WHERE r.id = p_reservation_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Payment risk (max +3)
  IF v_payment = 'unpaid' AND v_check_in - CURRENT_DATE <= 7 AND v_check_in >= CURRENT_DATE THEN
    v_score := v_score + 3;
    v_breakdown := v_breakdown || jsonb_build_object('payment', 3);
  ELSIF v_payment = 'partial' THEN
    v_score := v_score + 1.5;
    v_breakdown := v_breakdown || jsonb_build_object('payment', 1.5);
  ELSE
    v_breakdown := v_breakdown || jsonb_build_object('payment', 0);
  END IF;

  -- Pre-arrival readiness (max +1.5)
  IF v_prearrival IS NULL AND v_check_in - CURRENT_DATE <= 2 AND v_check_in >= CURRENT_DATE THEN
    v_score := v_score + 1.5;
    v_breakdown := v_breakdown || jsonb_build_object('prearrival', 1.5);
    v_flagged_pre := true;
  ELSIF v_prearrival IS NULL AND v_check_in - CURRENT_DATE <= 5 AND v_check_in >= CURRENT_DATE THEN
    v_score := v_score + 0.5;
    v_breakdown := v_breakdown || jsonb_build_object('prearrival', 0.5);
  ELSE
    v_breakdown := v_breakdown || jsonb_build_object('prearrival', 0);
  END IF;

  -- Inquiry status: +1 (uncertain booking)
  IF v_status = 'inquiry' THEN
    v_score := v_score + 1;
    v_breakdown := v_breakdown || jsonb_build_object('inquiry', 1);
  END IF;

  -- Loyalty: VIPs get -1 (lower risk because they're trusted; surfaces priority)
  IF v_loyalty IN ('vip','platinum','gold') THEN
    v_score := GREATEST(v_score - 1, 1);
    v_breakdown := v_breakdown || jsonb_build_object('vip_discount', -1);
  END IF;

  -- Clamp 1..10
  v_score := LEAST(GREATEST(ROUND(v_score)::int, 1), 10);

  INSERT INTO beithady_reservation_overrides
    (reservation_id, risk_score, risk_breakdown,
     flagged_prearrival_missing, last_recomputed_at, updated_at)
  VALUES
    (p_reservation_id, v_score::int, v_breakdown,
     v_flagged_pre, now(), now())
  ON CONFLICT (reservation_id) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    risk_breakdown = EXCLUDED.risk_breakdown,
    flagged_prearrival_missing = EXCLUDED.flagged_prearrival_missing,
    last_recomputed_at = now(),
    updated_at = now();
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: bulk recompute (cron entry point)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beithady_calendar_recompute_all_active()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer := 0;
  rid text;
BEGIN
  FOR rid IN
    SELECT id FROM guesty_reservations
    WHERE check_out_date >= CURRENT_DATE - INTERVAL '7 days'
      AND check_in_date <= CURRENT_DATE + INTERVAL '90 days'
  LOOP
    PERFORM beithady_calendar_recompute_payment(rid);
    PERFORM beithady_calendar_recompute_risk(rid);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION beithady_calendar_recompute_all_active() IS
'Cron entry point. Refreshes payment status + risk score for all reservations in [today-7, today+90].';

-- One-shot recompute on existing reservations so the grid has data immediately.
SELECT beithady_calendar_recompute_all_active();
