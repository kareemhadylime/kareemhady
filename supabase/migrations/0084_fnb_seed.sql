-- =====================================================================
-- Phase F — Seed initial menu (EN only; AR/RU/FR via AI translate post-deploy)
-- =====================================================================

INSERT INTO public.fnb_categories (slug, sort_order, name_en, hours_start, hours_end)
VALUES
  ('breakfast',     1, 'Breakfast',     '08:00', '14:00'),
  ('sandwiches',    2, 'Sandwiches',    '08:00', '23:59'),
  ('salads-and-kids', 3, 'Salads & Kids', '08:00', '23:59')
ON CONFLICT (slug) DO NOTHING;

WITH cats AS (
  SELECT id, slug FROM public.fnb_categories
)
INSERT INTO public.fnb_items
  (slug, category_id, sort_order, name_en, description_en, price_usd)
SELECT v.slug, cats.id, v.sort_order, v.name, v.description, v.price
FROM (VALUES
  ('all-day-breakfast', 'breakfast', 1, 'All-Day Breakfast',
    'Two eggs your way over sliced toasted bread, served with roasted potatoes and a side of sausage.',
    7.00),
  ('smoked-salmon-toast', 'breakfast', 2, 'Smoked Salmon Toast',
    'Toasted sourdough topped with smoked salmon, cream cheese and dill, with a side of house crackers.',
    19.00),
  ('cheese-olives-croissant', 'breakfast', 3, 'Cheese & Olives Croissant',
    'Buttery croissant filled with delicacy white cheese, olives and a drizzle of olive oil. Served with roasted golden potatoes.',
    8.00),
  ('oriental-breakfast', 'breakfast', 4, 'Oriental Breakfast',
    'Ful with vegetables served with local taameya and greens with a side of baladi bread and tahini.',
    8.00),
  ('sausage-sandwich', 'sandwiches', 1, 'Sausage Sandwich',
    'Grilled Alexandrian sausage served in panini bread served with waffle fries and our house sauce.',
    12.00),
  ('baguette-sub', 'sandwiches', 2, 'Baguette Sub',
    'Tender chicken and beef bacon layered in a crispy baguette served with a side of waffle fries and house sauce.',
    16.00),
  ('beit-hady-burger', 'sandwiches', 3, 'Beit Hady Burger',
    'Two beef patties topped with lettuce, tomatoes, and mushrooms served in a brioche bun with a side of waffle fries.',
    13.00),
  ('caesar-salad', 'salads-and-kids', 1, 'Caesar Salad',
    'Crisp romaine, parmesan, garlic croutons and our classic Caesar dressing.',
    9.00),
  ('greek-salad', 'salads-and-kids', 2, 'Greek Salad',
    'Tomato, cucumber, kalamata olives and feta with a drizzle of extra virgin olive oil.',
    13.00),
  ('kids-meal', 'salads-and-kids', 3, 'Kids Meal',
    'Six pieces of breaded chicken with a generous side of waffle fries and ketchup.',
    7.00)
) AS v(slug, cat_slug, sort_order, name, description, price)
JOIN cats ON cats.slug = v.cat_slug
ON CONFLICT (slug) DO NOTHING;

-- Modifiers (2 from PDF: Sausage Ful upgrade, grilled chicken add-on)
WITH items AS (SELECT id, slug FROM public.fnb_items)
INSERT INTO public.fnb_item_modifiers
  (item_id, sort_order, name_en, price_delta_usd)
SELECT items.id, v.sort_order, v.name, v.delta
FROM (VALUES
  ('oriental-breakfast', 1, 'Replace Ful w/ Sausage Ful', 3.00),
  ('caesar-salad',       1, 'Add Grilled Chicken',         5.00)
) AS v(item_slug, sort_order, name, delta)
JOIN items ON items.slug = v.item_slug;
