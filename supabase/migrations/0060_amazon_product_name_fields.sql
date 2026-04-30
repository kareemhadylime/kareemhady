-- Phase M.16 — capture the canonical Amazon EG product name + brand without
-- overwriting the operator's curated SKU naming.
--
-- The sourcer writes here; the items page UI compares these to the row's
-- own name_en + brand to detect mismatches (e.g., operator pasted a URL
-- for a slightly different product) and offers a one-click "review &
-- update SKU details" flow.

ALTER TABLE beithady_inventory_items
  ADD COLUMN IF NOT EXISTS amazon_eg_product_name_en text,
  ADD COLUMN IF NOT EXISTS amazon_eg_product_name_ar text,
  ADD COLUMN IF NOT EXISTS amazon_eg_brand text;

COMMENT ON COLUMN beithady_inventory_items.amazon_eg_product_name_en IS
  'Canonical product title pulled from the Amazon EG product page by the sourcer. Compared to name_en for mismatch detection — never auto-overwrites name_en (the operator''s curated SKU label).';
COMMENT ON COLUMN beithady_inventory_items.amazon_eg_brand IS
  'Brand pulled from the Amazon EG product page by the sourcer. Compared to brand for mismatch detection.';
