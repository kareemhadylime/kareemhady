-- Variation Order spend for a contract analytic in a date range, broken down by sub-category.
-- Accounts: 570* family. Posted moves only.
-- Sub-categories: 57000* = manning, 5701* = consumables, 5704* = transport, else = other.
-- Applied via Supabase MCP on 2026-05-06.

CREATE OR REPLACE FUNCTION public.fmplus_perf_variation_orders(
  p_analytic_id bigint,
  p_from        date,
  p_to          date
)
RETURNS TABLE (
  category text,
  amount   numeric,
  lines    integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN a.code ~ '^57000[0-9]+$' THEN 'manning'
      WHEN a.code ~ '^5701[0-9]+$'  THEN 'consumables'
      WHEN a.code ~ '^5704[0-9]+$'  THEN 'transport'
      ELSE 'other'
    END AS category,
    sum(ml.debit - ml.credit)::numeric AS amount,
    count(*)::integer AS lines
  FROM public.odoo_move_lines ml
  JOIN public.odoo_accounts a ON a.id = ml.account_id
  JOIN public.odoo_move_line_analytics mla ON mla.move_line_id = ml.id
  WHERE mla.analytic_account_id = p_analytic_id
    AND a.code ~ '^57[0-9]+$'
    AND a.account_type LIKE 'expense%'
    AND ml.parent_state = 'posted'
    AND ml.date BETWEEN p_from AND p_to
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

REVOKE ALL ON FUNCTION public.fmplus_perf_variation_orders FROM public;
GRANT EXECUTE ON FUNCTION public.fmplus_perf_variation_orders TO service_role;
