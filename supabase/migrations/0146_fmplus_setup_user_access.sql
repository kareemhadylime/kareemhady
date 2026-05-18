-- Add FM+ Setup user fields to app_users.
-- All columns nullable so existing rows continue to work without backfill.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS full_name    text,
  ADD COLUMN IF NOT EXISTS fmplus_role  text,
  ADD COLUMN IF NOT EXISTS fmplus_perms jsonb;

-- Constrain fmplus_role to the canonical preset values (NULL allowed).
ALTER TABLE app_users
  ADD CONSTRAINT app_users_fmplus_role_check
  CHECK (
    fmplus_role IS NULL
    OR fmplus_role IN (
      'operations_manager',
      'site_manager',
      'shift_submitter',
      'budget_manager',
      'financials_viewer'
    )
  );

-- Helpful index for the Setup user list: filter by fmplus_role presence.
CREATE INDEX IF NOT EXISTS app_users_fmplus_role_idx
  ON app_users(fmplus_role)
  WHERE fmplus_role IS NOT NULL;
