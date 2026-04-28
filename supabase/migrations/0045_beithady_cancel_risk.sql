-- 0045_beithady_cancel_risk.sql
--
-- Phase K.2 — Cancellation risk score + re-confirmation tracking.
--
-- Layered on top of J.1's operational risk_score (which models "is
-- this booking healthy right now?"). Cancel risk models "is this
-- booking likely to cancel before check-in?" — so finance can plug
-- the leak.

ALTER TABLE beithady_reservation_overrides
  ADD COLUMN IF NOT EXISTS cancel_risk_score smallint
    CHECK (cancel_risk_score IS NULL OR cancel_risk_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS cancel_risk_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS last_reconfirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconfirmation_response text
    CHECK (reconfirmation_response IS NULL
      OR reconfirmation_response IN ('confirmed','changed','cancelled','no_response'));

CREATE INDEX IF NOT EXISTS idx_bro_cancel_risk
  ON beithady_reservation_overrides (cancel_risk_score DESC NULLS LAST)
  WHERE cancel_risk_score IS NOT NULL;

COMMENT ON COLUMN beithady_reservation_overrides.cancel_risk_score IS
'0-100 likelihood the booking will cancel before check-in. Refreshed every 30 min by the operations-recompute cron. See migration 0045 for the rule-based scorer.';

CREATE OR REPLACE FUNCTION beithady_calendar_recompute_cancel_risk(p_reservation_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_channel text;
  v_check_in date;
  v_created_at timestamptz;
  v_payment text;
  v_lifetime_stays integer;
  v_last_inbound timestamptz;
  v_score numeric := 0;
  v_breakdown jsonb := '{}'::jsonb;
  v_lead_days integer;
  v_silent_days integer;
  v_d_to_check_in integer;
  v_inc numeric;
BEGIN
  SELECT
    r.status,
    COALESCE(r.integration_platform, r.source),
    r.check_in_date,
    COALESCE((r.raw->>'createdAt')::timestamptz, r.created_at_odoo, r.synced_at),
    o.payment_status,
    COALESCE(bg.lifetime_stays, 0),
    c.last_inbound_at
  INTO v_status, v_channel, v_check_in, v_created_at, v_payment, v_lifetime_stays, v_last_inbound
  FROM guesty_reservations r
  LEFT JOIN beithady_reservation_overrides o ON o.reservation_id = r.id
  LEFT JOIN beithady_guests bg ON (
    bg.email IS NOT NULL AND r.guest_email IS NOT NULL AND lower(bg.email) = lower(r.guest_email)
  )
  LEFT JOIN beithady_conversations c ON c.reservation_id = r.id
  WHERE r.id = p_reservation_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_d_to_check_in := v_check_in - CURRENT_DATE;

  IF v_status = 'inquiry' THEN
    v_inc := 30;
    v_score := v_score + v_inc;
    v_breakdown := v_breakdown || jsonb_build_object('inquiry_status', v_inc);
  END IF;

  IF v_created_at IS NOT NULL THEN
    v_lead_days := (v_check_in - v_created_at::date);
    IF v_lead_days > 60 THEN v_inc := 20;
    ELSIF v_lead_days > 30 THEN v_inc := 12;
    ELSIF v_lead_days > 14 THEN v_inc := 5;
    ELSE v_inc := 0;
    END IF;
    IF v_inc > 0 THEN
      v_score := v_score + v_inc;
      v_breakdown := v_breakdown || jsonb_build_object('lead_time', v_inc);
    END IF;
  END IF;

  IF v_payment = 'unpaid' AND v_d_to_check_in <= 7 AND v_d_to_check_in >= 0 THEN
    v_score := v_score + 25;
    v_breakdown := v_breakdown || jsonb_build_object('unpaid_imminent', 25);
  ELSIF v_payment = 'unpaid' THEN
    v_score := v_score + 10;
    v_breakdown := v_breakdown || jsonb_build_object('unpaid', 10);
  ELSIF v_payment = 'partial' THEN
    v_score := v_score + 5;
    v_breakdown := v_breakdown || jsonb_build_object('partial_payment', 5);
  END IF;

  IF v_channel ILIKE '%booking%' THEN
    v_score := v_score + 15;
    v_breakdown := v_breakdown || jsonb_build_object('channel_booking', 15);
  ELSIF v_channel ILIKE '%manual%' OR v_channel ILIKE '%direct%' THEN
    v_score := v_score + 5;
    v_breakdown := v_breakdown || jsonb_build_object('channel_direct', 5);
  END IF;

  IF v_lifetime_stays = 0 THEN
    v_score := v_score + 15;
    v_breakdown := v_breakdown || jsonb_build_object('first_time', 15);
  ELSIF v_lifetime_stays >= 3 THEN
    v_score := GREATEST(v_score - 20, 0);
    v_breakdown := v_breakdown || jsonb_build_object('returning', -20);
  END IF;

  IF v_d_to_check_in <= 14 AND v_last_inbound IS NOT NULL THEN
    v_silent_days := EXTRACT(epoch FROM (now() - v_last_inbound))::int / 86400;
    IF v_silent_days > 7 THEN
      v_score := v_score + 15;
      v_breakdown := v_breakdown || jsonb_build_object('silence', 15);
    ELSIF v_silent_days > 3 THEN
      v_score := v_score + 5;
      v_breakdown := v_breakdown || jsonb_build_object('silence', 5);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM beithady_reservation_overrides
    WHERE reservation_id = p_reservation_id
      AND last_reconfirmation_sent_at IS NOT NULL
      AND last_reconfirmation_sent_at > now() - interval '7 days'
  ) THEN
    v_score := GREATEST(v_score - 25, 0);
    v_breakdown := v_breakdown || jsonb_build_object('reconfirmation_recent', -25);
  END IF;

  IF v_status = 'canceled' OR v_d_to_check_in < 0 THEN
    v_score := 0;
    v_breakdown := jsonb_build_object('inactive', 0);
  END IF;

  v_score := LEAST(GREATEST(ROUND(v_score)::int, 0), 100);

  INSERT INTO beithady_reservation_overrides
    (reservation_id, cancel_risk_score, cancel_risk_breakdown, updated_at)
  VALUES (p_reservation_id, v_score::int, v_breakdown, now())
  ON CONFLICT (reservation_id) DO UPDATE SET
    cancel_risk_score = EXCLUDED.cancel_risk_score,
    cancel_risk_breakdown = EXCLUDED.cancel_risk_breakdown,
    updated_at = now();
END;
$$;

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
    PERFORM beithady_calendar_recompute_cancel_risk(rid);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
