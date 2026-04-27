-- 0042_beithady_mtl_backfill.sql
--
-- Infer master_listing_id from nickname-prefix convention so every
-- Beithady consumer can use simple SQL filters instead of post-fetch JS.
--
-- Why this exists: Guesty's masterListingId field is currently NULL on
-- every active Beithady listing, so domain queries had no way to tell
-- MTL parents from sub-units in pure SQL. The agents have encoded the
-- hierarchy in nicknames (BH73-3BR-SB-1 → BH73-3BR-SB-1-201), and this
-- migration teaches Postgres to read that.
--
-- Polarity matrix (post-backfill):
--   Gallery / Documents / Ads creative / Pre-arrival templates
--     -> show MTL parents + standalones
--     -> WHERE master_listing_id IS NULL
--   CRM / Communication / Calendar / Daily report / Pipeline
--     -> show bookable atoms (children + standalones), drop parents
--     -> WHERE id NOT IN (SELECT DISTINCT master_listing_id
--                         FROM guesty_listings
--                         WHERE master_listing_id IS NOT NULL)
--
-- Idempotent — safe to call after every Guesty sync. Only writes when
-- the existing value is NULL, so a real Guesty masterListingId (when
-- they finally populate it) wins over our inference.

CREATE OR REPLACE FUNCTION beithady_backfill_mtl_master_id()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  WITH best_parent AS (
    SELECT DISTINCT ON (c.id)
      c.id AS child_id,
      p.id AS parent_id
    FROM guesty_listings c
    JOIN guesty_listings p
      ON p.building_code = c.building_code
     AND p.id <> c.id
     AND p.active = true
     AND c.nickname LIKE p.nickname || '-%'
    WHERE c.active = true
      AND c.master_listing_id IS NULL
    ORDER BY c.id, length(p.nickname) DESC
  )
  UPDATE guesty_listings g
  SET master_listing_id = bp.parent_id
  FROM best_parent bp
  WHERE g.id = bp.child_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION beithady_backfill_mtl_master_id() IS
'Infers master_listing_id from nickname prefix convention (BH73-X-Y-Z is child of BH73-X-Y). Called by Guesty sync after upsert.';

-- One-shot run on existing rows. Re-running is safe (no-op once
-- everything is populated, since the WHERE clause limits to rows where
-- master_listing_id IS NULL).
SELECT beithady_backfill_mtl_master_id();
