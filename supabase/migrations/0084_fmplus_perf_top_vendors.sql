-- Top-5 vendors RPC for the FM+ Performance Dashboard.
-- Returns total spend per partner against a contract's analytic account
-- between [p_from, p_to], ordered desc.
--
-- Applied via Supabase MCP on 2026-05-06.

CREATE OR REPLACE FUNCTION public.fmplus_perf_top_vendors(
  p_analytic_id bigint,
  p_from        date,
  p_to          date,
  p_limit       integer DEFAULT 5
)
RETURNS TABLE (
  partner_id     integer,
  partner_name   text,
  spend          numeric,
  invoice_count  integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id::integer                               AS partner_id,
    coalesce(p.name, '(no partner)')            AS partner_name,
    sum(ml.debit - ml.credit)::numeric          AS spend,
    count(distinct ml.move_id)::integer         AS invoice_count
  FROM public.odoo_move_lines ml
  JOIN public.odoo_move_line_analytics mla ON mla.move_line_id = ml.id
  LEFT JOIN public.odoo_partners p ON p.id = ml.partner_id
  WHERE mla.analytic_account_id = p_analytic_id
    AND ml.date BETWEEN p_from AND p_to
    AND ml.parent_state = 'posted'
    AND (ml.debit - ml.credit) > 0
  GROUP BY p.id, p.name
  ORDER BY spend DESC, p.id DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.fmplus_perf_top_vendors FROM public;
GRANT EXECUTE ON FUNCTION public.fmplus_perf_top_vendors TO service_role;
