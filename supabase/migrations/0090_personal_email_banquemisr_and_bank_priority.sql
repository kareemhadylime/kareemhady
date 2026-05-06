-- Phase: Personal Email v1.8 — Banque Misr + bank rule priority bump
--
-- User flagged that emails from `bmib@gulf-banquemisr.ae` ("Bank Misr
-- UAE: One Time Password") were landing in Security instead of Banking.
-- Two issues:
--
-- (1) Banque Misr domains weren't seeded.
-- (2) The seeded `subject_contains: password → security` rule at priority
--     20 fires before the banking from_domain rules at priority 22, so
--     ANY bank's password / OTP email goes to Security.
--
-- Fix: bump every banking from_domain rule from priority 22 → 19 so it
-- runs BEFORE the security subject patterns at 20. A bank-from-bank
-- email always goes to Banking, even when it carries OTP/password
-- subjects. (Non-bank Google/etc. OTP rules at priority 20 still win
-- for those services.)

update public.personal_email_rules
set priority = 19
where target_category = 'banking'
  and match_type = 'from_domain'
  and priority = 22;

-- Add Banque Misr domains. Egypt main + UAE (gulf) branch.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (19, 'Banque Misr Egypt',     'from_domain', 'banquemisr.com.eg',  'banking'),
  (19, 'Banque Misr',           'from_domain', 'banquemisr.com',     'banking'),
  (19, 'Banque Misr Gulf (UAE)','from_domain', 'gulf-banquemisr.ae', 'banking')
on conflict do nothing;
