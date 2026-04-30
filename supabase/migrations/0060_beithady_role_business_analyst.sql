-- =====================================================================
-- Beithady role: business_analyst
-- =====================================================================
-- Reporting / dashboard role. Reads broadly, writes only in analytics.
-- No financial-module access (Odoo P&L) — booking-channel + PriceLabs
-- numbers reach them via analytics + the (currently un-gated) pricing
-- page. No communication access (no message bodies / inbox).
--
-- Note: ALTER TYPE ... ADD VALUE must run outside a transaction in
-- Postgres < 12. Supabase runs migrations in a single transaction by
-- default, but ADD VALUE has been transaction-safe since PG 12. The
-- if-not-exists guard makes this idempotent on re-run.

alter type public.beithady_role add value if not exists 'business_analyst';
