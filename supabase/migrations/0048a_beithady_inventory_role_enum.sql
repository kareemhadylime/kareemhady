-- =====================================================================
-- Phase M.1 (part 1 of 2) — Beithady Inventory: role enum extension
-- =====================================================================
-- Postgres requires new enum values to be committed in a separate
-- transaction before they can be referenced by other DDL or DML in the
-- same session. The 14-table inventory module migration (0048b) seeds an
-- approval_rules row that references 'warehouse_manager', so that value
-- must exist first.
--
-- Q5 — adds two new Beithady roles:
--   * warehouse_manager — owns Inventory category, read elsewhere
--   * housekeeper       — limited mobile-app access via PIN gate
--
-- TS mirror in src/lib/beithady/auth.ts is updated in the same commit
-- as 0048b.

ALTER TYPE beithady_role ADD VALUE IF NOT EXISTS 'warehouse_manager';
ALTER TYPE beithady_role ADD VALUE IF NOT EXISTS 'housekeeper';
