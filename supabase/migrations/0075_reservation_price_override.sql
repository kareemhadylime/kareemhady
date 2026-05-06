-- 0075: Track trip price overrides on boat_rental_reservations.
-- An owner or admin can change the snapshot price for a specific
-- reservation post-creation. We track who/when and preserve the
-- ORIGINAL snapshot in original_price_snapshot (set on first override
-- only) so the UI can show "was X, now Y".
--
-- DOWN:
--   alter table public.boat_rental_reservations
--     drop column if exists original_price_snapshot,
--     drop column if exists price_overridden_by,
--     drop column if exists price_overridden_at;

alter table public.boat_rental_reservations
  add column if not exists price_overridden_at      timestamptz,
  add column if not exists price_overridden_by      uuid references public.app_users(id),
  add column if not exists original_price_snapshot  numeric(10,2);
