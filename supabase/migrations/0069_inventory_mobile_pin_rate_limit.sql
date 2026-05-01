-- 2026-05-02 Inventory module audit — C4: mobile PIN rate-limit + audit
-- See INVENTORY_AUDIT_2026_05_02.md.
--
-- The mobile cleaner app (`/beithady/inventory/m`) gates access with a
-- 6-digit PIN per building. Pre-fix:
--   - No attempt counter, no IP lockout, no logging of failures.
--   - Brute-forceable (1M combos in hours over a fast connection).
--   - Comment in mobile-pin.ts said "Rate-limit-friendly (caller should
--     track failed attempts)" but no caller did.
--
-- This migration adds a table that records EVERY PIN attempt (success +
-- failure) with IP and user agent. The application reads this table to
-- enforce a per-IP lockout (5 failures in 5 min → 5 min lockout).

CREATE TABLE IF NOT EXISTS beithady_inventory_mobile_pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code text NOT NULL,
  ip text,                  -- nullable in case the request lacks the header
  user_agent text,
  cleaner_name text,        -- captured on attempt so we can investigate brute-forces
  success boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Lockout lookup (per IP, recent failures)
CREATE INDEX IF NOT EXISTS bi_mobile_pin_attempts_ip_time
  ON beithady_inventory_mobile_pin_attempts (ip, attempted_at DESC)
  WHERE NOT success;

-- Per-warehouse audit lookup
CREATE INDEX IF NOT EXISTS bi_mobile_pin_attempts_wh_time
  ON beithady_inventory_mobile_pin_attempts (warehouse_code, attempted_at DESC);

COMMENT ON TABLE beithady_inventory_mobile_pin_attempts IS
'Audit fix C4 (0069): every PIN login attempt at /beithady/inventory/m. The application enforces a per-IP lockout (5 failures in 5 min) by counting recent NOT success rows. Cleared by hand or by a TTL job; rows are tiny.';
