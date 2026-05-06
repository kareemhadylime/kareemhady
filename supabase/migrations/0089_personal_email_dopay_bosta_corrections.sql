-- Phase: Personal Email v1.7 — rule corrections from user feedback
--
-- (1) dopay is mostly marketing (weekly@dopay.com promo blasts), not
--     bills. The seeded `from_domain: dopay.com → bills_receipts` rule
--     was over-eager. Disabling so the AI can decide per-email.
-- (2) bosta.co emails are KIKA delivery cashout receipts (Informative).
--     They were AI-routed to bills/promotions; user wants them in
--     subsidiary_kika.

-- 1. Disable the over-broad dopay rule (keep the row for audit history).
update public.personal_email_rules
set enabled = false,
    name = 'dopay (DISABLED — too marketing-heavy, AI handles)'
where match_type = 'from_domain'
  and match_value = 'dopay.com'
  and target_category = 'bills_receipts';

-- 2. New bosta.co → subsidiary_kika rule. Priority 35 sits with the
--    other KIKA routes.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (35, 'Bosta delivery (KIKA)', 'from_domain', 'bosta.co', 'subsidiary_kika')
on conflict do nothing;
