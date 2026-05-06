-- Actual ex-VAT revenue for a contract analytic in a date range.
-- Revenue is the sum of CREDIT balances on income-type accounts where the move
-- line touches the given analytic account. Posted moves only.
--
-- Applied via Supabase MCP on 2026-05-06.

CREATE OR REPLACE FUNCTION public.fmplus_perf_actual_revenue(
  p_analytic_id bigint,
  p_from        date,
  p_to          date
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(sum(ml.credit - ml.debit), 0)::numeric
  FROM public.odoo_move_lines ml
  JOIN public.odoo_accounts a               ON a.id = ml.account_id
  JOIN public.odoo_move_line_analytics mla  ON mla.move_line_id = ml.id
  WHERE mla.analytic_account_id = p_analytic_id
    AND a.account_type IN ('income', 'income_other')
    AND ml.parent_state = 'posted'
    AND ml.date BETWEEN p_from AND p_to;
$$;

REVOKE ALL ON FUNCTION public.fmplus_perf_actual_revenue FROM public;
GRANT EXECUTE ON FUNCTION public.fmplus_perf_actual_revenue TO service_role;
