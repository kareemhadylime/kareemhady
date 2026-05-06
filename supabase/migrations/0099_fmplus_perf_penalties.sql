-- Penalties for a contract analytic in a date range, broken down by service line.
-- Account pattern: 5{service}1001 = Shortage Penalties, 5{service}1002 = KPI's Penalties.
-- Posted moves only.
-- Applied via Supabase MCP on 2026-05-06.

CREATE OR REPLACE FUNCTION public.fmplus_perf_penalties(
  p_analytic_id bigint,
  p_from        date,
  p_to          date
)
RETURNS TABLE (
  service_code  text,
  penalty_type  text,
  amount        numeric,
  lines         integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE substring(a.code from 1 for 2)
      WHEN '50' THEN 'hk'
      WHEN '51' THEN 'mep'
      WHEN '52' THEN 'security'
      WHEN '53' THEN 'landscape'
      WHEN '54' THEN 'pest_ctrl'
      WHEN '55' THEN 'waste_mgmt'
      ELSE 'other'
    END AS service_code,
    CASE substring(a.code from 5 for 2)
      WHEN '01' THEN 'shortage'
      WHEN '02' THEN 'kpi'
      ELSE 'other'
    END AS penalty_type,
    sum(ml.debit - ml.credit)::numeric AS amount,
    count(*)::integer AS lines
  FROM public.odoo_move_lines ml
  JOIN public.odoo_accounts a ON a.id = ml.account_id
  JOIN public.odoo_move_line_analytics mla ON mla.move_line_id = ml.id
  WHERE mla.analytic_account_id = p_analytic_id
    AND a.code ~ '^5[0-9]100[12]$'
    AND ml.parent_state = 'posted'
    AND ml.date BETWEEN p_from AND p_to
  GROUP BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.fmplus_perf_penalties FROM public;
GRANT EXECUTE ON FUNCTION public.fmplus_perf_penalties TO service_role;
