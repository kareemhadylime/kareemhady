-- Phase: Personal Email v2.0 — Technology category + sender routing refinements
--
-- User intent (2026-05-04, "refine /personal/email" task):
--   * AliExpress, SABIS                              → spam
--   * PriceLabs (was beithady)                       → action_required (RED)
--   * Any "payment declined / failed / required /    → action_required (RED)
--     missed payment / invoice unpaid / overdue /
--     past due" subject
--   * RBC, Arabeya Online                            → banking
--     (Banque Misr, Mashreq, RAKBank already mapped)
--   * Temu                                           → promotions
--   * Temu "your temu order" (transactional)         → personal
--   * GoDaddy / Vercel / Supabase / Anthropic /
--     OpenAI / iSmartLife / GitHub / AWS / Slack /
--     Linear / Cloudflare                            → technology  (new bucket)
--   * GoDaddy renewals / domain expiry subjects      → action_required
--   * Vercel "deployment failed" / "build failed"    → notifications
--     (mute from Technology — they're noisy CI signal)
--   * CCC.net work email                             → subsidiary_fmplus
--   * ecm.ae                                         → personal
--     ("payment required" subject already covered
--      by the priority-12 payment rules above)
--
-- Re-targets where needed: PriceLabs and the existing tech-vendor
-- from_domain rules in `notifications` move to `technology`.

-- 1. New "Technology" category. Tier 3 (skim/skip), sortOrder 15 sits
--    between Newsletters (10) and Notifications (20).
insert into public.personal_email_categories
  (slug, display_name, tier, sort_order, gmail_label_name, accent_color, icon_name)
values
  ('technology', 'Technology', 3, 15, 'Lime/Technology', 'cyan', 'Cpu')
on conflict (slug) do nothing;

-- 2. Re-target PriceLabs from subsidiary_beithady → action_required.
--    Pricing/billing alerts are billing-critical and the user wants
--    a RED urgency flag so they never miss one.
update public.personal_email_rules
set target_category = 'action_required',
    name = 'PriceLabs (action required)',
    priority = 15
where match_type = 'from_domain'
  and match_value = 'pricelabs.co';

-- 3. Re-target tech-vendor from_domain rules notifications → technology.
update public.personal_email_rules
set target_category = 'technology'
where target_category = 'notifications'
  and match_type = 'from_domain'
  and match_value in (
    'github.com', 'vercel.com', 'aws.amazon.com', 'slack.com',
    'linear.app', 'supabase.com', 'email.openai.com'
  );

-- 4. New banks (priority 19 — same tier as the existing banking
--    from_domain rules, fires before security at 20).
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (19, 'RBC',                       'from_domain', 'rbc.com',                'banking'),
  (19, 'RBC Royal Bank',            'from_domain', 'royalbank.com',          'banking'),
  (19, 'Arabeya Online Brokerage',  'from_domain', 'arabeyaonline.com',      'banking'),
  (19, 'Arabeya Online (alt)',      'from_domain', 'arabeya.com',            'banking')
on conflict do nothing;

-- 5. Spam senders (priority 60).
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (60, 'AliExpress',                'from_domain', 'aliexpress.com',         'spam'),
  (60, 'AliExpress mail',           'from_domain', 'mail.aliexpress.com',    'spam'),
  (60, 'AliExpress notice',         'from_domain', 'notice.aliexpress.com',  'spam'),
  (60, 'SABIS',                     'from_domain', 'sabis.net',              'spam'),
  (60, 'SABIS (alt)',               'from_domain', 'sabis.org',              'spam')
on conflict do nothing;

-- 6. Temu — promotions by default; transactional "your temu order"
--    rides the priority-14 transactional rule below.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (60, 'Temu promotions',           'from_domain', 'temu.com',               'promotions'),
  (60, 'Temu (alt domain)',         'from_domain', 'temumail.com',           'promotions')
on conflict do nothing;

-- 7. Technology category — tech vendors. Priority 80 matches the old
--    notifications routing the user is replacing.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (80, 'GoDaddy',                   'from_domain', 'godaddy.com',            'technology'),
  (80, 'GoDaddy (secureserver)',    'from_domain', 'secureserver.net',       'technology'),
  (80, 'Anthropic / Claude',        'from_domain', 'anthropic.com',          'technology'),
  (80, 'OpenAI / ChatGPT',          'from_domain', 'openai.com',             'technology'),
  (80, 'OpenAI account',            'from_domain', 'tm.openai.com',          'technology'),
  (80, 'Cloudflare',                'from_domain', 'cloudflare.com',         'technology'),
  (80, 'iSmartLife',                'from_domain', 'ismartlife.me',          'technology'),
  (80, 'iSmartLife (Tuya)',         'from_domain', 'tuya.com',               'technology'),
  (80, 'Supabase io',               'from_domain', 'supabase.io',            'technology')
on conflict do nothing;

-- 8. Domain renewal / expiry subjects → action_required (priority 14
--    beats Technology at 80, beats banking at 19, beats security at 20).
--    Scoped to domain-renewal phrasing so it doesn't over-route every
--    "newsletter renewal" email.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (14, 'Domain expiring (subject)',     'subject_contains', 'expiring',         'action_required'),
  (14, 'Domain expired (subject)',      'subject_contains', 'expired domain',   'action_required'),
  (14, 'Auto-renewal cancelled',        'subject_contains', 'auto-renewal',     'action_required'),
  (14, 'Renew your (subject)',          'subject_contains', 'renew your',       'action_required'),
  (14, 'Renew now (subject)',           'subject_contains', 'renew now',        'action_required')
on conflict do nothing;

-- 9. Transactional "your temu order" — beats Temu→promotions at 60.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (14, 'Temu order confirmed (transactional)',
       'subject_contains', 'your temu order',  'personal')
on conflict do nothing;

-- 10. Payment-related urgency rules (priority 12 — highest precedence
--     among the user-requested set, beats banking at 19 and security
--     at 20). Catches real payment-action subjects that should land in
--     action_required regardless of sender.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (12, 'Payment declined',          'subject_contains', 'payment declined',  'action_required'),
  (12, 'Payment failed',            'subject_contains', 'payment failed',    'action_required'),
  (12, 'Payment missed',            'subject_contains', 'missed payment',    'action_required'),
  (12, 'Payment required',          'subject_contains', 'payment required',  'action_required'),
  (12, 'Invoice unpaid',            'subject_contains', 'invoice unpaid',    'action_required'),
  (12, 'Invoice overdue',           'subject_contains', 'overdue',           'action_required'),
  (12, 'Past due',                  'subject_contains', 'past due',          'action_required')
on conflict do nothing;

-- 11. Vercel deployment failures → notifications (mute them from the
--     Technology box; they're CI noise from active dev pushes). Fires
--     before Vercel→technology because notifications wins at 70 < 80.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (70, 'Vercel deploy failed (mute)', 'subject_contains', 'deployment failed', 'notifications'),
  (70, 'Vercel build failed (mute)',  'subject_contains', 'build failed',      'notifications')
on conflict do nothing;

-- 12. CCC.net (Consolidated Contractors Co. work email) → FM+ Work.
--     Priority 30 — same tier as travel/Beithady from_domain rules.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (30, 'CCC.net (work)',           'from_domain', 'ccc.net',                'subsidiary_fmplus'),
  (30, 'CCC Egypt',                'from_domain', 'ccc-eg.com',             'subsidiary_fmplus')
on conflict do nothing;

-- 13. ecm.ae default → personal. Payment-required subjects ride
--     priority 12 above (action_required). Personal goes through the
--     AI re-classifier (ALWAYS_AI_CATEGORIES) so the AI can override
--     to action_required when the body actually demands it.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (40, 'ecm.ae',                    'from_domain', 'ecm.ae',                'personal')
on conflict do nothing;
