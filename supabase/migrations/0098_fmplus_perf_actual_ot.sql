-- Actual overtime spend for a contract analytic in a date range.
-- Identifies OT lines by account name (covers 'Over Time' and 'Overtime'
-- variants — pattern matching 5x0004 alone misses 502115 / 604010).
-- Posted moves only.
--
-- Applied via Supabase MCP on 2026-05-06.

CREATE OR REPLACE FUNCTION public.fmplus_perf_actual_ot(
  p_analytic_id bigint,
  p_from        date,
  p_to          date
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(sum(ml.debit - ml.credit), 0)::numeric
  FROM public.odoo_move_lines ml
  JOIN public.odoo_accounts a               ON a.id = ml.account_id
  JOIN public.odoo_move_line_analytics mla  ON mla.move_line_id = ml.id
  WHERE mla.analytic_account_id = p_analytic_id
    AND a.account_type LIKE 'expense%'
    AND (a.name ILIKE '%over time%' OR a.name ILIKE '%overtime%')
    AND ml.parent_state = 'posted'
    AND ml.date BETWEEN p_from AND p_to;
$$;

REVOKE ALL ON FUNCTION public.fmplus_perf_actual_ot FROM public;
GRANT EXECUTE ON FUNCTION public.fmplus_perf_actual_ot TO service_role;
