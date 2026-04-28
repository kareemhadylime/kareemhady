-- =============================================================
-- Phase M.15.1 — Seed: 7 unit configs + 2 categories + 4 UoMs +
-- 30 consumable items + 30 global consumption rules
-- =============================================================

-- 1) New categories per Q13
INSERT INTO beithady_inventory_categories (code, name_en, name_ar, default_uom, default_batch_tracked, default_expiry_tracked)
VALUES
  ('sanitary', 'Sanitary Amenities',  'مستلزمات صحية', 'bottle', false, true),
  ('branded',  'Beit Hady Branded',   'مطبوعات بيت هادي', 'pcs', false, false)
ON CONFLICT (code) DO NOTHING;

-- 2) Additional UoMs needed by V1 seed
INSERT INTO beithady_inventory_uoms (code, name_en, name_ar, measure_kind)
VALUES
  ('bottle', 'Bottle',  'زجاجة', 'count'),
  ('can',    'Can',     'علبة',   'count'),
  ('sachet', 'Sachet',  'كيس',    'count'),
  ('pair',   'Pair',    'زوج',    'count')
ON CONFLICT (code) DO NOTHING;

-- 3) Seven unit configurations matching real BH-26/73/435/OK shapes
INSERT INTO beithady_inventory_unit_configurations (code, name_en, name_ar, bedrooms, bathrooms, guest_capacity, tier)
VALUES
  ('STUDIO-1BA-STANDARD',  'Studio · 1 bath · Standard',         'استوديو · حمام واحد · قياسي', 0, 1.0, 2, 'standard'),
  ('1BR-1BA-STANDARD',     '1-bedroom · 1 bath · Standard',      'غرفة نوم · حمام · قياسي',     1, 1.0, 2, 'standard'),
  ('1BR-1.5BA-STANDARD',   '1-bedroom · 1.5 bath · Standard',    'غرفة نوم · حمام ونصف · قياسي', 1, 1.5, 2, 'standard'),
  ('2BR-2BA-STANDARD',     '2-bedroom · 2 bath · Standard',      'غرفتا نوم · حمامان · قياسي',  2, 2.0, 4, 'standard'),
  ('2BR-2.5BA-PREMIUM',    '2-bedroom · 2.5 bath · Premium',     'غرفتا نوم · حمامان ونصف · مميز', 2, 2.5, 4, 'premium'),
  ('3BR-2BA-STANDARD',     '3-bedroom · 2 bath · Standard',      'ثلاث غرف · حمامان · قياسي',   3, 2.0, 6, 'standard'),
  ('3BR-3BA-PREMIUM',      '3-bedroom · 3 bath · Premium',       'ثلاث غرف · ثلاثة حمامات · مميز', 3, 3.0, 6, 'premium')
ON CONFLICT (code) DO NOTHING;

-- 4) Seed 30 consumable items. Cost defaults are illustrative — real
--    prices populated via M.15.4 Amazon EG sourcer. Active=true so
--    they appear in the catalog immediately.
WITH cat AS (
  SELECT code, id FROM beithady_inventory_categories
)
INSERT INTO beithady_inventory_items
  (sku, name_en, name_ar, category_id, uom, default_cost_egp, currency, batch_tracked, expiry_tracked, active, created_by_user)
SELECT v.sku, v.name_en, v.name_ar, c.id, v.uom, v.default_cost_egp, 'EGP', v.batch, v.exp, true, 'M.15.1-seed'
FROM (VALUES
  -- Cleaning & Sanitization (8) — chemicals category
  ('CLN-BLEACH-1L',          'Bleach 1L',                       'كلور 1 لتر',                    'chemicals', 'bottle', 35.00,  false, false),
  ('CLN-APC-1L',             'All-purpose cleaner 1L',          'منظف متعدد الاستخدامات 1 لتر',  'chemicals', 'bottle', 45.00,  false, false),
  ('CLN-GLANCE-500ML',       'Glance window cleaner 500ml',     'منظف الزجاج جلانس 500 مل',      'chemicals', 'bottle', 60.00,  false, false),
  ('CLN-PLEDGE-300ML',       'Pledge wood polish 300ml',        'بليدج ملمع الأخشاب 300 مل',     'chemicals', 'can',    85.00,  false, false),
  ('CLN-ANTIFLY-400ML',      'Anti-flies spray 400ml',          'بخاخ مبيد الذباب 400 مل',       'chemicals', 'can',    55.00,  false, true),
  ('CLN-TOILET-750ML',       'Toilet bowl cleaner 750ml',       'منظف المرحاض 750 مل',           'chemicals', 'bottle', 50.00,  false, false),
  ('CLN-FLOOR-DISIN-1L',     'Floor disinfectant 1L',           'مطهر أرضيات 1 لتر',             'chemicals', 'bottle', 40.00,  false, false),
  ('CLN-MICROFIBER',         'Microfiber cloth',                'منشفة ميكروفايبر',              'consumables','pcs',    25.00,  false, false),
  -- Sanitary Amenities (8) — sanitary category
  ('SAN-TOILET-ROLL',        'Toilet paper roll',               'لفة ورق تواليت',                'sanitary',  'roll',   12.00,  false, false),
  ('SAN-SHAMPOO-30ML',       'Shampoo bottle 30ml (single use)','شامبو 30 مل',                   'sanitary',  'bottle', 6.00,   false, true),
  ('SAN-CONDITIONER-30ML',   'Conditioner bottle 30ml',         'بلسم 30 مل',                    'sanitary',  'bottle', 6.50,   false, true),
  ('SAN-SHOWERGEL-30ML',     'Shower gel bottle 30ml',          'سائل استحمام 30 مل',           'sanitary',  'bottle', 6.50,   false, true),
  ('SAN-HANDSOAP-30ML',      'Hand soap bottle 30ml',           'صابون يد 30 مل',                'sanitary',  'bottle', 5.00,   false, true),
  ('SAN-BODYLOTION-30ML',    'Body lotion bottle 30ml',         'لوشن جسم 30 مل',                'sanitary',  'bottle', 7.00,   false, true),
  ('SAN-TISSUE-BOX',         'Tissue box',                      'علبة مناديل',                   'sanitary',  'box',    18.00,  false, false),
  ('SAN-COTTON-PADS',        'Cotton pads pack',                'علبة قطن',                       'sanitary',  'pack',   15.00,  false, false),
  -- Tray Amenities (7) — fnb category
  ('TRAY-WATER-500ML',       'Bottled water 500ml',             'مياه معدنية 500 مل',            'fnb',       'bottle', 7.00,   false, true),
  ('TRAY-TEABAG',            'Tea bag',                         'كيس شاي',                       'fnb',       'pcs',    1.50,   false, true),
  ('TRAY-COFFEE-SACHET',     'Coffee sachet',                   'كيس قهوة',                       'fnb',       'sachet', 4.00,   false, true),
  ('TRAY-SUGAR-SACHET',      'Sugar sachet',                    'كيس سكر',                        'fnb',       'sachet', 0.50,   false, true),
  ('TRAY-CREAMER-SACHET',    'Powdered creamer sachet',         'كيس قشدة بودرة',                 'fnb',       'sachet', 1.50,   false, true),
  ('TRAY-COOKIES-PACK',      'Welcome cookies pack',            'علبة بسكويت ترحيب',             'fnb',       'pack',   25.00,  false, true),
  ('TRAY-CUP-DISP',          'Disposable cup',                  'كوب يستخدم لمرة واحدة',         'fnb',       'pcs',    2.00,   false, false),
  -- Linen consumables (3 V1) — consumables category
  ('LIN-TRASH-KITCHEN',      'Trash bag (kitchen)',             'كيس قمامة مطبخ',                'consumables','pcs',    3.00,   false, false),
  ('LIN-TRASH-BATHROOM',     'Trash bag (bathroom)',            'كيس قمامة حمام',                'consumables','pcs',    1.50,   false, false),
  ('LIN-SLIPPERS',           'Disposable slippers (pair)',      'شبشب يستخدم لمرة واحدة',        'consumables','pair',   15.00,  false, false),
  -- Branded (4) — branded category
  ('BRN-WELCOME-CARD',       'Beit Hady welcome card',          'بطاقة ترحيب بيت هادي',          'branded',   'pcs',    8.00,   false, false),
  ('BRN-NOTEPAD',            'Beit Hady notepad',               'دفتر ملاحظات بيت هادي',         'branded',   'pcs',    12.00,  false, false),
  ('BRN-PEN',                'Beit Hady pen',                   'قلم بيت هادي',                  'branded',   'pcs',    6.00,   false, false),
  ('BRN-KEY-ENVELOPE',       'Beit Hady key envelope',          'مظروف مفاتيح بيت هادي',         'branded',   'pcs',    5.00,   false, false)
) AS v(sku, name_en, name_ar, cat_code, uom, default_cost_egp, batch, exp)
JOIN cat c ON c.code = v.cat_code
ON CONFLICT (sku) DO NOTHING;

-- 5) Default consumption rules — global scope, formula_kind handles
--    per-bedroom/bathroom/guest scaling automatically. ~30 rules.
WITH item AS (
  SELECT sku, id FROM beithady_inventory_items
)
INSERT INTO beithady_inventory_consumption_rules
  (scope, scope_value, item_id, formula_kind, qty, loss_factor_pct, active, notes)
SELECT 'global', NULL, i.id, v.formula_kind, v.qty, v.loss, true, v.notes
FROM (VALUES
  -- Cleaning (fractional per checkin — chemicals shared across stays)
  ('CLN-BLEACH-1L',         'fractional_per_checkin',   0.05, 0.0,  'Approx 1 bottle per 20 check-ins'),
  ('CLN-APC-1L',            'fractional_per_checkin',   0.10, 0.0,  '1 bottle per 10 check-ins'),
  ('CLN-GLANCE-500ML',      'fractional_per_checkin',   0.10, 0.0,  '1 bottle per 10 check-ins'),
  ('CLN-PLEDGE-300ML',      'fractional_per_checkin',   0.05, 0.0,  '1 can per 20 check-ins'),
  ('CLN-ANTIFLY-400ML',     'fractional_per_checkin',   0.05, 0.0,  '1 can per 20 check-ins'),
  ('CLN-TOILET-750ML',      'per_bathroom_per_checkin', 0.10, 0.0,  '1 bottle per 10 checkins per bathroom'),
  ('CLN-FLOOR-DISIN-1L',    'fractional_per_checkin',   0.10, 0.0,  '1 bottle per 10 check-ins'),
  ('CLN-MICROFIBER',        'fixed_per_stay',           2,    10.0, '2 cloths per stay, 10pct loss factor'),
  -- Sanitary (per bathroom or per bedroom)
  ('SAN-TOILET-ROLL',       'per_bathroom_per_checkin', 2,    0.0,  '2 rolls per bathroom per stay'),
  ('SAN-SHAMPOO-30ML',      'per_bathroom_per_checkin', 2,    0.0,  '2 single-use bottles per bathroom'),
  ('SAN-CONDITIONER-30ML',  'per_bathroom_per_checkin', 2,    0.0,  '2 single-use bottles per bathroom'),
  ('SAN-SHOWERGEL-30ML',    'per_bathroom_per_checkin', 2,    0.0,  '2 single-use bottles per bathroom'),
  ('SAN-HANDSOAP-30ML',     'per_bathroom_per_checkin', 1,    0.0,  '1 single-use bottle per bathroom'),
  ('SAN-BODYLOTION-30ML',   'per_bathroom_per_checkin', 1,    0.0,  '1 single-use bottle per bathroom'),
  ('SAN-TISSUE-BOX',        'per_bedroom_per_checkin',  1,    0.0,  '1 box per bedroom'),
  ('SAN-COTTON-PADS',       'per_bathroom_per_checkin', 1,    0.0,  '1 pack per bathroom'),
  -- Tray (per guest)
  ('TRAY-WATER-500ML',      'per_guest_per_checkin',    2,    0.0,  '2 bottles per guest welcome tray'),
  ('TRAY-TEABAG',           'per_guest_per_checkin',    4,    0.0,  '4 bags per guest'),
  ('TRAY-COFFEE-SACHET',    'per_guest_per_checkin',    2,    0.0,  '2 sachets per guest'),
  ('TRAY-SUGAR-SACHET',     'per_guest_per_checkin',    4,    0.0,  '4 sachets per guest'),
  ('TRAY-CREAMER-SACHET',   'per_guest_per_checkin',    2,    0.0,  '2 sachets per guest'),
  ('TRAY-COOKIES-PACK',     'fixed_per_stay',           1,    0.0,  '1 cookies pack per check-in'),
  ('TRAY-CUP-DISP',         'per_guest_per_checkin',    2,    5.0,  '2 cups per guest'),
  -- Linen
  ('LIN-TRASH-KITCHEN',     'fixed_per_stay',           2,    0.0,  '2 kitchen trash bags per stay'),
  ('LIN-TRASH-BATHROOM',    'per_bathroom_per_checkin', 1,    0.0,  '1 bathroom trash bag per bathroom'),
  ('LIN-SLIPPERS',          'per_guest_per_checkin',    1,    0.0,  '1 pair per guest'),
  -- Branded (Q13 — fixed per stay)
  ('BRN-WELCOME-CARD',      'fixed_per_stay',           1,    0.0,  '1 welcome card per stay'),
  ('BRN-NOTEPAD',           'fixed_per_stay',           1,    0.0,  '1 notepad per stay'),
  ('BRN-PEN',               'fixed_per_stay',           1,    0.0,  '1 pen per stay'),
  ('BRN-KEY-ENVELOPE',      'fixed_per_stay',           1,    0.0,  '1 key envelope per stay')
) AS v(sku, formula_kind, qty, loss, notes)
JOIN item i ON i.sku = v.sku
ON CONFLICT DO NOTHING;
