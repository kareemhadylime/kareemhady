-- =====================================================================
-- Phase M.1 — Beithady Inventory Module foundation
-- =====================================================================
-- 14 core tables + 4 line-item children backing the 9-tab inventory UI.
-- Subsumes the never-shipped Phase L (Consumables) — its concepts ship
-- as widgets/views layered on these tables (zero duplicate stock).
--
-- Pre-flight findings ([docs/PHASE_M_PREFLIGHT.md]) that shaped this:
--   * No 'checked_in' state in guesty_reservations.status → auto-issue
--     fires from a daily cron, not a state-transition listener.
--     Idempotency via UNIQUE on (ref_reservation_id, type, item_id) for
--     reservation_hold transactions.
--   * beithady_tasks.id is uuid → issues.ref_task_id is uuid with
--     ON DELETE SET NULL.
--   * No AED in any active Beithady building today → V1 currency =
--     EGP + USD only (default_cost_egp + denormalised default_cost_usd).
--   * beithady_settings has no *_BH-XX keys today → mobile PIN convention
--     'inventory_pin_BH-XX' is greenfield.
--   * BH-34 has 0 Guesty listings (upcoming building); seed warehouse Day
--     1 anyway per Q15 — inventory isn't reservation-coupled.

-- ---------------------------------------------------------------------------
-- Section 1: Role enum extension (Q5 — new roles for Inventory)
-- ---------------------------------------------------------------------------
-- The ALTER TYPE ADD VALUE statements live in a sibling migration
-- 0048a_beithady_inventory_role_enum.sql that runs first. PG requires the
-- new enum values to be committed before they can be referenced by seeds
-- below (the approval_rules INSERT references 'warehouse_manager'). Both
-- migrations together comprise the M.1 deliverable.

-- ---------------------------------------------------------------------------
-- Section 2: Categories (hierarchical, with seed of 7 root categories
-- + 8 UoMs as a separate config table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  parent_id uuid REFERENCES beithady_inventory_categories(id) ON DELETE SET NULL,
  is_consumable boolean NOT NULL DEFAULT true,
  is_asset boolean NOT NULL DEFAULT false,
  default_uom text NOT NULL DEFAULT 'pcs',
  default_batch_tracked boolean NOT NULL DEFAULT false,
  default_expiry_tracked boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bic_parent ON beithady_inventory_categories (parent_id);

INSERT INTO beithady_inventory_categories
  (code, name_en, name_ar, is_consumable, is_asset,
   default_uom, default_batch_tracked, default_expiry_tracked, sort_order)
VALUES
  ('consumables',     'Consumables',         'مستهلكات',          true,  false, 'pcs',  false, false, 10),
  ('linen',           'Linen',               'مفروشات',           true,  false, 'pcs',  false, false, 20),
  ('fnb',             'F&B',                 'مأكولات ومشروبات',  true,  false, 'pcs',  true,  true,  30),
  ('chemicals',       'Chemicals',           'مواد كيميائية',     true,  false, 'L',    true,  true,  40),
  ('maintenance',     'Maintenance Parts',   'قطع غيار صيانة',    true,  false, 'pcs',  false, false, 50),
  ('welcome_tray',    'Welcome Tray Items',  'عناصر صينية الترحيب', true, false, 'pcs', true,  true,  60),
  ('assets',          'Assets',              'أصول',              false, true,  'pcs',  false, false, 70)
ON CONFLICT (code) DO NOTHING;

-- UoMs as a config table (so UI can show a typed dropdown)
CREATE TABLE IF NOT EXISTS beithady_inventory_uoms (
  code text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  measure_kind text NOT NULL CHECK (measure_kind IN ('count','mass','volume','length','area')),
  sort_order smallint NOT NULL DEFAULT 100
);

INSERT INTO beithady_inventory_uoms (code, name_en, name_ar, measure_kind, sort_order) VALUES
  ('pcs',  'Pieces',     'قطعة',   'count',  10),
  ('roll', 'Roll',       'لفة',    'count',  20),
  ('pack', 'Pack',       'علبة',   'count',  30),
  ('box',  'Box',        'صندوق',  'count',  40),
  ('kg',   'Kilogram',   'كجم',    'mass',   50),
  ('g',    'Gram',       'جرام',   'mass',   60),
  ('L',    'Litre',      'لتر',    'volume', 70),
  ('mL',   'Millilitre', 'مل',     'volume', 80)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Section 3: Warehouses (Q1 hybrid model — locational tree + categorical tag)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  building_code text,                                            -- BH-26/73/435/OK/34/OTHER
  parent_id uuid REFERENCES beithady_inventory_warehouses(id) ON DELETE RESTRICT,
  category_tag text CHECK (category_tag IN
    ('linen','fnb','maintenance','chemicals','general','welcome_tray')),
  manager_user_id text,                                          -- text to match beithady_calendar_manual_blocks.created_by_user pattern
  address_line text,
  geo_lat numeric,
  geo_lng numeric,
  pin_code text,                                                 -- seeded via beithady_settings; mirrored here for fast lookup
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biw_building ON beithady_inventory_warehouses (building_code);
CREATE INDEX IF NOT EXISTS idx_biw_parent ON beithady_inventory_warehouses (parent_id);
CREATE INDEX IF NOT EXISTS idx_biw_active ON beithady_inventory_warehouses (active) WHERE active;

-- Seed 6 main warehouses (Q15 — all 5 buildings + OTHER, Day 1)
INSERT INTO beithady_inventory_warehouses
  (code, name_en, name_ar, building_code, category_tag, active, notes)
VALUES
  ('WH-BH26-MAIN',   'BH-26 Main Storage',   'مخزن BH-26 الرئيسي',   'BH-26',  'general', true, 'Main warehouse for BH-26 (22 active units).'),
  ('WH-BH73-MAIN',   'BH-73 Main Storage',   'مخزن BH-73 الرئيسي',   'BH-73',  'general', true, 'Main warehouse for BH-73 (28 bookable atoms).'),
  ('WH-BH435-MAIN',  'BH-435 Main Storage',  'مخزن BH-435 الرئيسي',  'BH-435', 'general', true, 'Main warehouse for BH-435 (14 active units, mgmt fee model).'),
  ('WH-BHOK-MAIN',   'BH-OK Main Storage',   'مخزن BH-OK الرئيسي',   'BH-OK',  'general', true, 'Main warehouse for BH-OK (9 active units).'),
  ('WH-BH34-MAIN',   'BH-34 Main Storage',   'مخزن BH-34 الرئيسي',   'BH-34',  'general', true, 'Main warehouse for BH-34 (upcoming, 0 Guesty units today).'),
  ('WH-OTHER-MAIN',  'Other Storage',        'مخزن متفرقات',          'OTHER',  'general', true, 'Catch-all for out-of-scope units (Madinaty, Mall of Mansoura, etc.).')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Section 4: Vendors (Registration with KYC workflow — NEW Tab 4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  trade_name text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','kyc','approved','suspended')),
  tax_id text,
  commercial_reg_no text,
  vat_no text,
  payment_terms_days smallint NOT NULL DEFAULT 0,
  default_currency text NOT NULL DEFAULT 'EGP'
    CHECK (default_currency IN ('EGP','USD','AED')),
  contact_name text,
  contact_phone text,
  contact_email text,
  whatsapp_e164 text,
  address_line text,
  city text,
  country text NOT NULL DEFAULT 'Egypt',
  bank_name text,
  bank_iban text,
  bank_account text,
  amazon_eg_storefront_url text,
  primary_categories text[] NOT NULL DEFAULT '{}',
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  notes text,
  approved_by_user text,
  approved_at timestamptz,
  created_by_user text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biv_status ON beithady_inventory_vendors (status);
CREATE INDEX IF NOT EXISTS idx_biv_categories ON beithady_inventory_vendors USING gin (primary_categories);

-- Seed 1 dummy approved vendor so first GRN test isn't blocked by KYC.
INSERT INTO beithady_inventory_vendors
  (code, legal_name, trade_name, status, default_currency, country,
   primary_categories, notes, approved_by_user, approved_at, created_by_user)
VALUES
  ('VEN-AMAZON-EG', 'Amazon.eg (placeholder)', 'Amazon EG',
   'approved', 'EGP', 'Egypt',
   ARRAY['consumables','fnb','chemicals','maintenance','welcome_tray'],
   'Seeded vendor for ad-hoc Amazon EG purchases. Replace with line-item supplier when known.',
   'system_seed', now(), 'system_seed')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Section 5: Items (master)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  category_id uuid NOT NULL REFERENCES beithady_inventory_categories(id) ON DELETE RESTRICT,
  uom text NOT NULL REFERENCES beithady_inventory_uoms(code),
  brand text,
  barcode text,
  primary_vendor_id uuid REFERENCES beithady_inventory_vendors(id) ON DELETE SET NULL,
  photo_url text,                                                -- supabase storage URL in beithady-inventory bucket
  description text,
  min_qty numeric NOT NULL DEFAULT 0,
  max_qty numeric,
  reorder_qty numeric,
  default_cost_egp numeric NOT NULL DEFAULT 0,
  default_cost_usd numeric,                                      -- denormalised, refreshed nightly from fx_rates
  currency text NOT NULL DEFAULT 'EGP' CHECK (currency IN ('EGP','USD')),
  avg_cost_egp numeric NOT NULL DEFAULT 0,                       -- weighted-average, recomputed on GRN post (Q2)
  last_cost_egp numeric,
  batch_tracked boolean NOT NULL DEFAULT false,                  -- Q3 — auto-on for F&B + Chemicals via category default
  expiry_tracked boolean NOT NULL DEFAULT false,
  owner_billable boolean NOT NULL DEFAULT false,                 -- Q10 — register UI in V2; flag exists today
  is_asset boolean NOT NULL DEFAULT false,                       -- Q14 — V1 consumables only; flag for V2
  serial_tracked boolean NOT NULL DEFAULT false,                 -- V2
  amazon_eg_url text,                                            -- "Order from Amazon" deep-link
  active boolean NOT NULL DEFAULT true,
  created_by_user text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bii_category ON beithady_inventory_items (category_id);
CREATE INDEX IF NOT EXISTS idx_bii_vendor ON beithady_inventory_items (primary_vendor_id);
CREATE INDEX IF NOT EXISTS idx_bii_active ON beithady_inventory_items (active) WHERE active;
CREATE INDEX IF NOT EXISTS idx_bii_barcode ON beithady_inventory_items (barcode) WHERE barcode IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Section 6: Stock balance (item × warehouse × batch)
-- ---------------------------------------------------------------------------
-- batch_no = '__bulk__' for non-batch-tracked items so the composite PK
-- still works without nullable columns.
CREATE TABLE IF NOT EXISTS beithady_inventory_stock (
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES beithady_inventory_warehouses(id) ON DELETE RESTRICT,
  batch_no text NOT NULL DEFAULT '__bulk__',
  qty_on_hand numeric NOT NULL DEFAULT 0,
  qty_reserved numeric NOT NULL DEFAULT 0,
  avg_cost_egp numeric NOT NULL DEFAULT 0,
  expiry_date date,
  last_movement_at timestamptz,
  PRIMARY KEY (item_id, warehouse_id, batch_no)
);

CREATE INDEX IF NOT EXISTS idx_bis_warehouse ON beithady_inventory_stock (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_bis_low_stock
  ON beithady_inventory_stock (item_id, warehouse_id) WHERE qty_on_hand < 5;
CREATE INDEX IF NOT EXISTS idx_bis_expiring
  ON beithady_inventory_stock (expiry_date) WHERE expiry_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Section 7: Transactions ledger (immutable audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN
    ('receipt','issue','transfer_out','transfer_in','adjustment','reservation_hold','count_adjust')),
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES beithady_inventory_warehouses(id) ON DELETE RESTRICT,
  batch_no text NOT NULL DEFAULT '__bulk__',
  qty_delta numeric NOT NULL,                                    -- +ve for receipt/transfer_in, -ve for issue/transfer_out
  unit_cost_egp numeric NOT NULL DEFAULT 0,
  doc_type text,                                                 -- 'grn'|'issue'|'transfer'|'count'|'adjust'
  doc_id uuid,                                                   -- FK varies by doc_type, no enforced FK
  doc_line_no smallint,
  ref_reservation_id text,                                       -- guesty_reservations.id is text
  ref_task_id uuid REFERENCES beithady_tasks(id) ON DELETE SET NULL,
  created_by_user text,
  note text
);

CREATE INDEX IF NOT EXISTS idx_bit_ts ON beithady_inventory_transactions (ts DESC);
CREATE INDEX IF NOT EXISTS idx_bit_item ON beithady_inventory_transactions (item_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_bit_warehouse ON beithady_inventory_transactions (warehouse_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_bit_doc ON beithady_inventory_transactions (doc_type, doc_id);
CREATE INDEX IF NOT EXISTS idx_bit_reservation ON beithady_inventory_transactions (ref_reservation_id) WHERE ref_reservation_id IS NOT NULL;

-- Idempotency for reservation_hold auto-issues — prevents the daily cron
-- from re-issuing if it scans the same reservation twice (Risk #1).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bit_reservation_hold
  ON beithady_inventory_transactions (ref_reservation_id, item_id, warehouse_id)
  WHERE type = 'reservation_hold';

-- Make this table append-only at the application level. We don't add a DB
-- trigger blocking UPDATE/DELETE — corrections happen via reverse adjustment.
COMMENT ON TABLE beithady_inventory_transactions IS
'Immutable inventory ledger. Corrections via reverse adjustment, never UPDATE/DELETE.';

-- ---------------------------------------------------------------------------
-- Section 8: Purchase Orders + lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no text NOT NULL UNIQUE,                                    -- 'PO-2026-0001' generated in app code
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','sent','partial','closed','cancelled','rejected')),
  vendor_id uuid NOT NULL REFERENCES beithady_inventory_vendors(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES beithady_inventory_warehouses(id) ON DELETE SET NULL,
  expected_delivery date,
  sub_total_egp numeric NOT NULL DEFAULT 0,
  notes text,
  approver_user text,
  approved_at timestamptz,
  rejected_reason text,
  whatsapp_sent_at timestamptz,
  created_by_user text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bipo_status ON beithady_inventory_purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_bipo_vendor ON beithady_inventory_purchase_orders (vendor_id);

CREATE TABLE IF NOT EXISTS beithady_inventory_po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES beithady_inventory_purchase_orders(id) ON DELETE CASCADE,
  line_no smallint NOT NULL,
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE RESTRICT,
  qty_ordered numeric NOT NULL,
  qty_received numeric NOT NULL DEFAULT 0,
  unit_cost_egp numeric NOT NULL,
  note text,
  UNIQUE (po_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_bipol_po ON beithady_inventory_po_lines (po_id);

-- ---------------------------------------------------------------------------
-- Section 9: GRNs + lines (Receiving Tab 6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_no text NOT NULL UNIQUE,                                   -- 'GRN-2026-0001'
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','pending_approval','approved','posted','rejected')),
  vendor_id uuid NOT NULL REFERENCES beithady_inventory_vendors(id) ON DELETE RESTRICT,
  po_id uuid REFERENCES beithady_inventory_purchase_orders(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES beithady_inventory_warehouses(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  sub_total_egp numeric NOT NULL DEFAULT 0,
  notes text,
  approver_user text,
  approved_at timestamptz,
  posted_at timestamptz,
  rejected_reason text,
  created_by_user text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bign_status ON beithady_inventory_grns (status);
CREATE INDEX IF NOT EXISTS idx_bign_vendor ON beithady_inventory_grns (vendor_id);
CREATE INDEX IF NOT EXISTS idx_bign_warehouse ON beithady_inventory_grns (warehouse_id);

CREATE TABLE IF NOT EXISTS beithady_inventory_grn_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES beithady_inventory_grns(id) ON DELETE CASCADE,
  line_no smallint NOT NULL,
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE RESTRICT,
  qty_received numeric NOT NULL,
  qty_rejected numeric NOT NULL DEFAULT 0,
  unit_cost_egp numeric NOT NULL,
  batch_no text NOT NULL DEFAULT '__bulk__',
  expiry_date date,
  qc_photo_url text,
  note text,
  UNIQUE (grn_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_bignl_grn ON beithady_inventory_grn_lines (grn_id);

-- ---------------------------------------------------------------------------
-- Section 10: Issues + lines (Dispensing Tab 7 — 6 types)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_no text NOT NULL UNIQUE,                                 -- 'ISS-2026-0001'
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','pending_approval','approved','posted','rejected')),
  type text NOT NULL CHECK (type IN
    ('per_reservation','maintenance_task','welcome_tray','owner_request','damage_writeoff','transfer_out')),
  warehouse_id uuid NOT NULL REFERENCES beithady_inventory_warehouses(id) ON DELETE RESTRICT,
  ref_reservation_id text,                                       -- guesty_reservations.id is text
  ref_task_id uuid REFERENCES beithady_tasks(id) ON DELETE SET NULL,
  ref_owner text,
  ref_kit_id uuid,                                               -- FK added after kits table created
  ref_transfer_id uuid,                                          -- self-FK to companion transfer_in issue (paired)
  sub_total_egp numeric NOT NULL DEFAULT 0,
  notes text,
  photo_url text,                                                -- mandatory for damage_writeoff + welcome_tray (Gold+)
  approver_user text,
  approved_at timestamptz,
  posted_at timestamptz,
  rejected_reason text,
  created_by_user text,
  created_via text NOT NULL DEFAULT 'manual'                    -- 'manual'|'auto_rule'|'mobile_pin'|'wa_inbound'
    CHECK (created_via IN ('manual','auto_rule','mobile_pin','wa_inbound')),
  cleaner_session_name text,                                     -- C2 — PIN+name session
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biis_status ON beithady_inventory_issues (status);
CREATE INDEX IF NOT EXISTS idx_biis_type ON beithady_inventory_issues (type);
CREATE INDEX IF NOT EXISTS idx_biis_warehouse ON beithady_inventory_issues (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_biis_reservation ON beithady_inventory_issues (ref_reservation_id) WHERE ref_reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS beithady_inventory_issue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES beithady_inventory_issues(id) ON DELETE CASCADE,
  line_no smallint NOT NULL,
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE RESTRICT,
  qty numeric NOT NULL,
  batch_no_picked text NOT NULL DEFAULT '__bulk__',
  unit_cost_egp numeric NOT NULL DEFAULT 0,
  note text,
  UNIQUE (issue_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_biisl_issue ON beithady_inventory_issue_lines (issue_id);

-- ---------------------------------------------------------------------------
-- Section 11: Kits (Welcome Trays + cleaning kits — Tab 7 sub-feature)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  trigger text NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual','tier_silver','tier_gold','tier_platinum','seasonal_ramadan','seasonal_xmas')),
  season_start date,
  season_end date,
  photo_required_on_issue boolean NOT NULL DEFAULT false,
  building_filter text[] NOT NULL DEFAULT '{}',                  -- empty = all buildings
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by_user text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beithady_inventory_kit_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES beithady_inventory_kits(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE RESTRICT,
  qty numeric NOT NULL,
  UNIQUE (kit_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_bikc_kit ON beithady_inventory_kit_components (kit_id);

-- Now we can backfill the FK on issues.ref_kit_id
ALTER TABLE beithady_inventory_issues
  ADD CONSTRAINT fk_biis_kit FOREIGN KEY (ref_kit_id)
  REFERENCES beithady_inventory_kits(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Section 12: Approval rules (Q4 — configurable matrix, seeded with defaults)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN
    ('grn','issue','po','adjustment','count','transfer')),
  condition_field text NOT NULL CHECK (condition_field IN
    ('sub_total_egp','always','type','variance_pct')),
  condition_op text NOT NULL CHECK (condition_op IN ('>','>=','=','<','always')),
  condition_value text,                                          -- text so it can hold numeric or enum value
  approver_role beithady_role NOT NULL,
  description text,
  sort_order smallint NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO beithady_inventory_approval_rules
  (doc_type, condition_field, condition_op, condition_value, approver_role, description, sort_order)
VALUES
  -- GRN thresholds (Q4 defaults)
  ('grn',        'sub_total_egp', '>',  '5000',           'warehouse_manager', 'GRN > 5,000 EGP needs warehouse_manager', 10),
  ('grn',        'sub_total_egp', '>',  '25000',          'finance',           'GRN > 25,000 EGP additionally needs finance', 20),
  -- Issue thresholds
  ('issue',      'sub_total_egp', '>',  '1000',           'warehouse_manager', 'Issue > 1,000 EGP needs warehouse_manager', 30),
  -- PO thresholds
  ('po',         'sub_total_egp', '>',  '10000',          'finance',           'PO > 10,000 EGP needs finance', 40),
  -- Issue type-specific (always-routed)
  ('issue',      'type',          '=',  'damage_writeoff','manager',           'All damage write-offs need manager', 50),
  ('issue',      'type',          '=',  'damage_writeoff','finance',           'All damage write-offs additionally need finance', 51),
  ('issue',      'type',          '=',  'owner_request', 'manager',            'All owner requests need manager (then bills owner)', 60),
  -- Adjustments + counts always
  ('adjustment', 'always',        'always', NULL,         'warehouse_manager', 'All adjustments need warehouse_manager', 70),
  ('count',      'variance_pct',  '>',  '10',             'warehouse_manager', 'Count variance >10% needs warehouse_manager', 80),
  -- Transfers
  ('transfer',   'sub_total_egp', '>',  '5000',           'warehouse_manager', 'Transfer > 5,000 EGP needs warehouse_manager (both sides)', 90)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Section 13: Counts + adjustments (Tab 9)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_no text NOT NULL UNIQUE,                               -- 'CNT-2026-0001'
  type text NOT NULL CHECK (type IN ('cycle','physical')),
  warehouse_id uuid NOT NULL REFERENCES beithady_inventory_warehouses(id) ON DELETE RESTRICT,
  scheduled_for date,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','pending_approval','posted','cancelled')),
  variance_total_egp numeric NOT NULL DEFAULT 0,
  approver_user text,
  approved_at timestamptz,
  posted_at timestamptz,
  notes text,
  created_by_user text,
  cleaner_session_name text,                                     -- C2 — PIN+name
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bics_warehouse ON beithady_inventory_count_sessions (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_bics_status ON beithady_inventory_count_sessions (status);

CREATE TABLE IF NOT EXISTS beithady_inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES beithady_inventory_count_sessions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE RESTRICT,
  batch_no text NOT NULL DEFAULT '__bulk__',
  expected_qty numeric NOT NULL,
  counted_qty numeric,
  variance_qty numeric GENERATED ALWAYS AS (counted_qty - expected_qty) STORED,
  variance_value_egp numeric,
  photo_url text,
  note text,
  UNIQUE (session_id, item_id, batch_no)
);

CREATE INDEX IF NOT EXISTS idx_bicl_session ON beithady_inventory_count_lines (session_id);

-- ---------------------------------------------------------------------------
-- Section 14: Consumption rules (Phase L rules engine, integrated)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beithady_inventory_consumption_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','building','listing','category')),
  scope_value text,                                              -- NULL for global; building_code / listing_id / category code otherwise
  item_id uuid NOT NULL REFERENCES beithady_inventory_items(id) ON DELETE CASCADE,
  formula_kind text NOT NULL CHECK (formula_kind IN
    ('per_guest_per_night','per_night','per_checkin','per_2_guests_per_night','fixed_per_stay')),
  qty numeric NOT NULL,
  loss_factor_pct numeric NOT NULL DEFAULT 12,                   -- Phase L default of 12-15%
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_user text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_value, item_id, formula_kind)
);

CREATE INDEX IF NOT EXISTS idx_bicr_scope ON beithady_inventory_consumption_rules (scope, scope_value);
CREATE INDEX IF NOT EXISTS idx_bicr_item ON beithady_inventory_consumption_rules (item_id);

-- ---------------------------------------------------------------------------
-- Section 15: Mobile cleaner PIN seed (Q6 — building-shared PIN V1)
-- ---------------------------------------------------------------------------
-- Seed each building's PIN as a 6-digit numeric. Admin can rotate from
-- /emails/beithady/inventory/settings later (M.2 ships a basic settings
-- panel for PIN rotation).
INSERT INTO beithady_settings (key, value)
SELECT 'inventory_pin_' || code, jsonb_build_object('pin', lpad(((random() * 999999)::int)::text, 6, '0'))
FROM beithady_inventory_warehouses
WHERE building_code IS NOT NULL
  AND parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM beithady_settings s WHERE s.key = 'inventory_pin_' || beithady_inventory_warehouses.code
  );

-- ---------------------------------------------------------------------------
-- Section 16: Permission-matrix update (in code)
-- ---------------------------------------------------------------------------
-- The Beithady permission matrix is defined in src/lib/beithady/auth.ts —
-- updated in the same commit to add 'inventory' BeithadyCategory and the
-- new 'warehouse_manager' + 'housekeeper' role mappings. No DB-side rows.
COMMENT ON TYPE beithady_role IS
'Beithady fine-grained roles. Mirrored in src/lib/beithady/auth.ts BEITHADY_ROLES const. Adding a value here requires updating the const + PERMISSIONS map.';
