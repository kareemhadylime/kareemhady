-- Phase: Personal Email v2.0.1 — gaps surfaced by post-reshuffle audit
--
-- Spot-check after migration 0092 + reshuffle showed real emails landing
-- in the wrong bucket because of subdomain / TLD / typo gaps:
--   * `bmuae_notification@banquemisr.ae`        — Banque Misr UAE notify
--     domain (not the "gulf-" subdomain we already had)
--   * `alerts@mashreqneobiz.com`                — Mashreq Neo Biz product
--   * `invoices@arabeyaonline.net`              — .net TLD variant of
--     arabeyaonline.com
--   * `temu@commerce.temuemail.com`             — actual Temu sender
--     domain is `temuemail.com` (with the E), not `temumail.com`
--     which was a typo in 0092

-- 1. Banks — additional domains.
insert into public.personal_email_rules
  (priority, name, match_type, match_value, target_category)
values
  (19, 'Banque Misr UAE (notify)',  'from_domain', 'banquemisr.ae',         'banking'),
  (19, 'Mashreq Neo Biz',           'from_domain', 'mashreqneobiz.com',     'banking'),
  (19, 'Arabeya Online (.net)',     'from_domain', 'arabeyaonline.net',     'banking')
on conflict do nothing;

-- 2. Temu typo fix — real sender is temuemail.com.
update public.personal_email_rules
set match_value = 'temuemail.com',
    name = 'Temu mail relay'
where match_type = 'from_domain'
  and match_value = 'temumail.com';
