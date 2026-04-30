-- Phase M.16 — Seed 43 additional inventory items + 28 consumption rules.
--
-- Brings the catalog from 30 → 73 SKUs, fills the empty welcome_tray /
-- maintenance / linen categories, and adds default global consumption rules
-- for the consumable subset (chemicals, sanitary, fnb, branded extras +
-- LIN-LAUNDRY-BAG). Linen / maintenance / welcome-tray fixtures get
-- is_asset=true and no rule — they don't replenish per check-in.
--
-- Costs are illustrative (EGP), real prices populated by Amazon EG sourcer.

-- ---------------------------------------------------------------------------
-- 1. Items
-- ---------------------------------------------------------------------------

WITH cat AS (SELECT code, id FROM beithady_inventory_categories)
INSERT INTO beithady_inventory_items
  (sku, name_en, name_ar, category_id, uom, default_cost_egp, currency,
   batch_tracked, expiry_tracked, is_asset, active, created_by_user)
SELECT v.sku, v.name_en, v.name_ar, c.id, v.uom, v.cost, 'EGP',
       v.batch, v.exp, v.asset, true, 'M.16-seed'
FROM (VALUES
  -- Cleaning & Sanitization (chemicals) — 10
  ('CLN-DISH-LIQ-1L',     'Dish soap 1L',                 'سائل غسل الأطباق 1 لتر',   'chemicals', 'bottle',  50,  false, false, false),
  ('CLN-DISH-SPONGE',     'Dish sponge (3-pack)',         'إسفنجة غسل أطباق 3 قطع',   'chemicals', 'pack',    25,  false, false, false),
  ('CLN-LAUNDRY-2L',      'Laundry detergent 2L',         'منظف غسيل 2 لتر',          'chemicals', 'bottle', 180,  false, false, false),
  ('CLN-FABRIC-SOFT-1L',  'Fabric softener 1L',           'منعم أقمشة 1 لتر',         'chemicals', 'bottle',  90,  false, false, false),
  ('CLN-DRAIN-500ML',     'Drain unblocker 500ml',        'مزيل انسداد المصارف 500 مل','chemicals', 'bottle',  75,  false, false, false),
  ('CLN-OVEN-500ML',      'Oven cleaner 500ml',           'منظف الفرن 500 مل',        'chemicals', 'can',    120,  false, false, false),
  ('CLN-BATHROOM-500ML',  'Bathroom cleaner spray 500ml', 'بخاخ منظف الحمام 500 مل',  'chemicals', 'bottle',  65,  false, false, false),
  ('CLN-RUBBER-GLOVES',   'Rubber gloves (pair)',         'قفازات مطاطية',            'chemicals', 'pair',    30,  false, false, false),
  ('CLN-SCRUB-BRUSH',     'Scrub brush',                  'فرشاة جلي',                'chemicals', 'pcs',     35,  false, false, false),
  ('CLN-TRASH-LARGE-90L', 'Trash bag 90L (large)',        'كيس قمامة 90 لتر',         'chemicals', 'pcs',      5,  false, false, false),

  -- Sanitary Amenities — 9
  ('SAN-SHOWER-CAP',      'Shower cap (single use)',      'بونيه استحمام',            'sanitary',  'pcs',      3,  false, false, false),
  ('SAN-DENTAL-KIT',      'Dental kit',                   'طقم أسنان',                'sanitary',  'pcs',     12,  false, true,  false),
  ('SAN-SHAVING-KIT',     'Shaving kit',                  'طقم حلاقة',                'sanitary',  'pcs',     18,  false, true,  false),
  ('SAN-SEWING-KIT',      'Sewing kit',                   'طقم خياطة',                'sanitary',  'pcs',      8,  false, false, false),
  ('SAN-COMB',            'Comb',                         'مشط',                      'sanitary',  'pcs',      5,  false, false, false),
  ('SAN-MAKEUP-WIPES',    'Makeup remover wipes (10pk)',  'مناديل مزيل مكياج 10 قطع', 'sanitary',  'pack',    30,  false, true,  false),
  ('SAN-EARBUDS',         'Cotton earbuds (50pk)',        'أعواد قطن 50 قطعة',        'sanitary',  'pack',    20,  false, false, false),
  ('SAN-NAIL-FILE',       'Nail file',                    'مبرد أظافر',               'sanitary',  'pcs',      6,  false, false, false),
  ('SAN-VANITY-KIT',      'Vanity kit pouch',             'حقيبة عناية شخصية',        'sanitary',  'pcs',     25,  false, false, false),

  -- Tray Amenities (fnb) — 5
  ('TRAY-FRUIT-BASKET',   'Welcome fruit basket',         'سلة فاكهة ترحيب',          'fnb',       'pcs',     80,  false, true,  false),
  ('TRAY-CHOCOLATE',      'Welcome chocolate piece',      'قطعة شوكولاتة ترحيب',      'fnb',       'pcs',      8,  false, true,  false),
  ('TRAY-DATES-PACK',     'Dates welcome pack',           'علبة تمر ترحيب',           'fnb',       'pack',    35,  false, true,  false),
  ('TRAY-MILK-100ML',     'UHT milk portion 100ml',       'حصة حليب 100 مل',          'fnb',       'pcs',      6,  false, true,  false),
  ('TRAY-NAPKIN',         'Paper napkin',                 'منديل ورقي',               'fnb',       'pcs',      0.50, false, false, false),

  -- Linen & Disposables — 8 (mostly assets)
  ('LIN-BEDSHEET-WHITE-Q','White bedsheet — queen',       'شرشف سرير أبيض كوين',      'linen',     'pcs',    350,  false, false, true),
  ('LIN-PILLOWCASE-WHITE','Pillowcase — white',           'كيس وسادة أبيض',           'linen',     'pcs',     80,  false, false, true),
  ('LIN-DUVET-COVER-Q',   'Duvet cover — queen',          'غطاء لحاف كوين',           'linen',     'pcs',    450,  false, false, true),
  ('LIN-TOWEL-BATH',      'Bath towel',                   'منشفة استحمام',            'linen',     'pcs',    220,  false, false, true),
  ('LIN-TOWEL-HAND',      'Hand towel',                   'منشفة يد',                 'linen',     'pcs',     90,  false, false, true),
  ('LIN-TOWEL-FACE',      'Face towel',                   'منشفة وجه',                'linen',     'pcs',     45,  false, false, true),
  ('LIN-BATH-MAT',        'Bath mat',                     'سجادة حمام',               'linen',     'pcs',    120,  false, false, true),
  ('LIN-LAUNDRY-BAG',     'Laundry bag (single use)',     'كيس غسيل يستخدم لمرة',    'consumables','pcs',     4,  false, false, false),

  -- Beit Hady Branded — 4
  ('BRN-DOOR-HANGER',     'Do-not-disturb door hanger',   'علاقة باب عدم الإزعاج',    'branded',   'pcs',      7,  false, false, false),
  ('BRN-WIFI-CARD',       'WiFi info card',               'بطاقة معلومات الواي فاي',  'branded',   'pcs',      4,  false, false, false),
  ('BRN-WELCOME-LETTER',  'Welcome letter (printed)',     'خطاب ترحيب مطبوع',         'branded',   'pcs',      3,  false, false, false),
  ('BRN-RECEIPT-PAD',     'Receipt pad',                  'دفتر إيصالات',             'branded',   'pcs',     10,  false, false, false),

  -- Welcome Tray Items — 2 (assets)
  ('WTR-FRUIT-BOWL',      'Welcome fruit bowl',           'سلطانية فاكهة ترحيب',      'welcome_tray','pcs',  180,  false, false, true),
  ('WTR-TRAY',            'Welcome tray',                 'صينية ترحيب',              'welcome_tray','pcs',  250,  false, false, true),

  -- Maintenance Parts — 5 (assets)
  ('MNT-LIGHTBULB-LED-9W','LED bulb 9W E27',              'لمبة LED 9 وات E27',       'maintenance','pcs',    45,  false, false, true),
  ('MNT-AC-FILTER',       'AC filter (washable)',         'فلتر مكيف قابل للغسل',     'maintenance','pcs',    80,  false, false, true),
  ('MNT-DOOR-HINGE',      'Door hinge',                   'مفصلة باب',                'maintenance','pcs',    35,  false, false, true),
  ('MNT-SCREW-PACK',      'Mixed screw pack',             'علبة مسامير متنوعة',       'maintenance','pack',   25,  false, false, true),
  ('MNT-WALL-PUTTY-500ML','Wall putty 500ml',             'معجون حوائط 500 مل',       'maintenance','pcs',    60,  false, false, true)
) AS v(sku, name_en, name_ar, cat_code, uom, cost, batch, exp, asset)
JOIN cat c ON c.code = v.cat_code
ON CONFLICT (sku) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Consumption rules (global) for the consumable subset only.
-- Linen / maintenance / welcome-tray fixtures get nothing — they're assets.
-- ---------------------------------------------------------------------------

WITH item AS (SELECT sku, id FROM beithady_inventory_items)
INSERT INTO beithady_inventory_consumption_rules
  (scope, scope_value, item_id, formula_kind, qty, loss_factor_pct, active, notes)
SELECT 'global', NULL, i.id, v.formula_kind, v.qty, v.loss, true, v.notes
FROM (VALUES
  -- Cleaning extras (10)
  ('CLN-DISH-LIQ-1L',     'fractional_per_checkin',   0.05, 0.0,  '1 bottle per 20 check-ins'),
  ('CLN-DISH-SPONGE',     'fractional_per_checkin',   0.10, 0.0,  '1 sponge pack per 10 check-ins'),
  ('CLN-LAUNDRY-2L',      'fractional_per_checkin',   0.05, 0.0,  '1 bottle per 20 check-ins'),
  ('CLN-FABRIC-SOFT-1L',  'fractional_per_checkin',   0.05, 0.0,  '1 bottle per 20 check-ins'),
  ('CLN-DRAIN-500ML',     'fractional_per_checkin',   0.02, 0.0,  '1 bottle per 50 check-ins'),
  ('CLN-OVEN-500ML',      'fractional_per_checkin',   0.02, 0.0,  '1 can per 50 check-ins'),
  ('CLN-BATHROOM-500ML',  'per_bathroom_per_checkin', 0.10, 0.0,  '1 bottle per 10 checkins per bathroom'),
  ('CLN-RUBBER-GLOVES',   'fractional_per_checkin',   0.10, 0.0,  '1 pair per 10 check-ins'),
  ('CLN-SCRUB-BRUSH',     'fractional_per_checkin',   0.05, 0.0,  '1 brush per 20 check-ins'),
  ('CLN-TRASH-LARGE-90L', 'fixed_per_stay',           1,    0.0,  '1 large kitchen trash bag per stay'),

  -- Sanitary extras (9 — all per_bathroom or per_guest)
  ('SAN-SHOWER-CAP',      'per_guest_per_checkin',    1,    0.0,  '1 shower cap per guest'),
  ('SAN-DENTAL-KIT',      'per_guest_per_checkin',    1,    0.0,  '1 dental kit per guest'),
  ('SAN-SHAVING-KIT',     'per_guest_per_checkin',    1,    0.0,  '1 shaving kit per guest'),
  ('SAN-SEWING-KIT',      'fixed_per_stay',           1,    0.0,  '1 sewing kit per stay'),
  ('SAN-COMB',            'per_guest_per_checkin',    1,    0.0,  '1 comb per guest'),
  ('SAN-MAKEUP-WIPES',    'per_bathroom_per_checkin', 1,    0.0,  '1 pack per bathroom'),
  ('SAN-EARBUDS',         'per_bathroom_per_checkin', 0.5,  0.0,  '1 pack per 2 bathrooms'),
  ('SAN-NAIL-FILE',       'fixed_per_stay',           1,    0.0,  '1 nail file per stay'),
  ('SAN-VANITY-KIT',      'per_bathroom_per_checkin', 1,    0.0,  '1 vanity kit per bathroom'),

  -- Tray extras (5)
  ('TRAY-FRUIT-BASKET',   'fixed_per_stay',           1,    0.0,  '1 fruit basket per stay'),
  ('TRAY-CHOCOLATE',      'per_guest_per_checkin',    2,    0.0,  '2 pieces per guest'),
  ('TRAY-DATES-PACK',     'fixed_per_stay',           1,    0.0,  '1 pack per stay'),
  ('TRAY-MILK-100ML',     'per_guest_per_checkin',    1,    0.0,  '1 portion per guest'),
  ('TRAY-NAPKIN',         'per_guest_per_checkin',    4,    5.0,  '4 napkins per guest'),

  -- Linen consumable (1) — laundry bag
  ('LIN-LAUNDRY-BAG',     'fixed_per_stay',           1,    0.0,  '1 laundry bag per stay'),

  -- Branded extras (4)
  ('BRN-DOOR-HANGER',     'fixed_per_stay',           1,    0.0,  '1 door hanger per stay'),
  ('BRN-WIFI-CARD',       'fixed_per_stay',           1,    0.0,  '1 WiFi card per stay'),
  ('BRN-WELCOME-LETTER',  'fixed_per_stay',           1,    0.0,  '1 welcome letter per stay'),
  ('BRN-RECEIPT-PAD',     'fixed_per_stay',           0.05, 0.0,  '1 pad per 20 check-ins')
) AS v(sku, formula_kind, qty, loss, notes)
JOIN item i ON i.sku = v.sku
ON CONFLICT DO NOTHING;
