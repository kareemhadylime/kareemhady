-- Phase C.5 follow-up: granular outbound kill switches.
-- Replaces single beithady_outbound_paused with one switch per
-- automation + one for manual inbox sends. All seeded TRUE per user
-- Q3 (carry over current paused state).

insert into public.beithady_settings (key, value, description, updated_at)
values
  ('beithady_pause_manual_outbound',     'true'::jsonb,
    'Pauses outbound sends triggered by an agent typing in the inbox composer.', now()),
  ('beithady_pause_ai_auto_reply',       'true'::jsonb,
    'Pauses AI auto-reply orchestrator.', now()),
  ('beithady_pause_pre_arrival',         'true'::jsonb,
    'Pauses Phase F pre-arrival template dispatch.', now()),
  ('beithady_pause_csat_survey',         'true'::jsonb,
    'Pauses Phase F CSAT survey dispatch.', now()),
  ('beithady_pause_boarding_pass',       'true'::jsonb,
    'Pauses Phase F boarding-pass auto-dispatch.', now()),
  ('beithady_pause_loyalty_notifications','true'::jsonb,
    'Pauses Phase F loyalty tier-change notifications.', now()),
  ('beithady_pause_upsell_offer',        'true'::jsonb,
    'Pauses Phase F upsell offer campaigns.', now()),
  ('beithady_pause_cancel_risk_reconfirm','true'::jsonb,
    'Pauses K.2 cancel-risk WhatsApp re-confirm.', now()),
  ('beithady_pause_morning_brief',       'true'::jsonb,
    'Pauses K.1 Daily Morning Brief WhatsApp distribution.', now()),
  ('beithady_pause_late_reply_digest',   'true'::jsonb,
    'Pauses late-reply digest WhatsApp dispatch.', now()),
  ('beithady_pause_vip_digest',          'true'::jsonb,
    'Pauses VIP digest WhatsApp dispatch.', now()),
  ('beithady_pause_daily_report_dispatch','true'::jsonb,
    'Pauses Beithady daily report WhatsApp distribution.', now())
on conflict (key) do nothing;
