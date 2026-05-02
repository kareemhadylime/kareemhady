-- 2026-05-02 Communication module audit — C-E3
-- Library asset soft-delete.
--
-- Pre-fix: deleteListingAssetAction did an unconditional DELETE on the
-- row + storage.remove on the blob. Library URLs are stored LIVE in
-- past message bodies (Guesty path) and attachment slots (wa_casual
-- path) — when the asset is deleted, every historical message that
-- referenced it 404s in the guest's WhatsApp / Airbnb thread (we no
-- longer copy-on-send; that's a separate bigger refactor).
--
-- This migration adds a `deleted_at` column. The action now soft-
-- deletes (sets the timestamp + leaves the storage object) so past
-- references keep working. Read paths filter `deleted_at IS NULL` so
-- the library picker doesn't show deleted assets.
--
-- Live data: 0 rows in beithady_listing_assets, so no backfill needed.

ALTER TABLE public.beithady_listing_assets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bh_listing_assets_active
  ON public.beithady_listing_assets(listing_id, category, sort_order, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.beithady_listing_assets.deleted_at IS
'Audit fix C-E3 (0072). Soft-delete timestamp. NULL = active. Set by deleteListingAssetAction; the library picker filters on IS NULL. Storage object is preserved so historical messages that linked to the URL keep working.';
