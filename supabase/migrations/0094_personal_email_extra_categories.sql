-- Phase: Personal Email v2.1 — three extra categories
--
-- User intent (2026-05-06):
--   * `unassigned` — catch-all for emails the rule + AI pipeline could
--     not confidently sort. Pipeline cost-cap fallback now lands here
--     too (was `notifications`). AI prompt instructs the model to use
--     this slug when confidence < 0.7 instead of guessing.
--   * `lime`       — Lime Investments corporate / HQ / holding-level mail.
--   * `subsidiary_voltauto` — VoltAuto / EV / electric-mobility
--     subsidiary mail.
--
-- The auto-rule-from-move feature (server-action change in moveEmail)
-- needs no schema work — it inserts into the existing
-- `personal_email_rules` table.

insert into public.personal_email_categories
  (slug,                   display_name, tier, sort_order, gmail_label_name,    accent_color, icon_name)
values
  ('lime',                 'Lime',       2,   22, 'Lime/Corporate',   'lime',   'Building2'),
  ('subsidiary_voltauto',  'VoltAuto',   2,   28, 'Lime/VoltAuto',    'yellow', 'Zap'),
  ('unassigned',           'Unassigned', 3,   30, 'Lime/Unassigned',  'slate',  'HelpCircle')
on conflict (slug) do nothing;
