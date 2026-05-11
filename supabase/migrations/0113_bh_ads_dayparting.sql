alter table public.ads_campaigns add column if not exists schedule jsonb;

insert into public.beithady_audit_log(module, action, metadata) values
  ('ads', 'dayparting_installed', jsonb_build_object('migration', '0113_bh_ads_dayparting'));
