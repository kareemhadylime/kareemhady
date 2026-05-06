-- AR aging by contract analytic account.
-- Returns one row per unreconciled AR move line (out_invoice / out_refund)
-- whose move touches the given analytic account. Days_overdue is computed
-- against payment_terms_days (caller provides; pass NULL to treat all
-- outstanding as "within terms").
--
-- Applied via Supabase MCP on 2026-05-06.

CREATE OR REPLACE FUNCTION public.fmplus_perf_ar_aging(
  p_analytic_id        bigint,
  p_payment_terms_days integer
)
RETURNS TABLE (
  move_id          bigint,
  line_id          bigint,
  partner_id       bigint,
  partner_name     text,
  invoice_ref      text,
  invoice_date     date,
  amount_residual  numeric,
  currency         text,
  days_outstanding integer,
  days_overdue     integer,
  bucket           text
)
LANGUAGE sql
STABLE
AS $$
  WITH terms AS (
    SELECT coalesce(p_payment_terms_days, 0)::int AS d
  ),
  ar AS (
    SELECT
      ml.id          AS line_id,
      ml.move_id,
      ml.partner_id,
      ml.name        AS invoice_ref,
      ml.date        AS invoice_date,
      ml.amount_residual,
      ml.currency,
      (CURRENT_DATE - ml.date)::int AS days_outstanding
    FROM public.odoo_move_lines ml
    WHERE ml.move_type IN ('out_invoice', 'out_refund')
      AND ml.parent_state = 'posted'
      AND ml.reconciled = false
      AND ml.amount_residual <> 0
      AND ml.move_id IN (
        SELECT DISTINCT ml2.move_id
        FROM public.odoo_move_lines ml2
        JOIN public.odoo_move_line_analytics mla
          ON mla.move_line_id = ml2.id
        WHERE mla.analytic_account_id = p_analytic_id
      )
  )
  SELECT
    a.move_id,
    a.line_id,
    a.partner_id,
    coalesce(p.name, '(no partner)') AS partner_name,
    a.invoice_ref,
    a.invoice_date,
    a.amount_residual,
    a.currency,
    a.days_outstanding,
    GREATEST(0, a.days_outstanding - t.d) AS days_overdue,
    CASE
      WHEN a.days_outstanding <= t.d                THEN 'within_terms'
      WHEN a.days_outstanding - t.d <= 30           THEN 'overdue_1_30'
      WHEN a.days_outstanding - t.d <= 60           THEN 'overdue_31_60'
      WHEN a.days_outstanding - t.d <= 90           THEN 'overdue_61_90'
      ELSE                                                'overdue_90_plus'
    END AS bucket
  FROM ar a
  CROSS JOIN terms t
  LEFT JOIN public.odoo_partners p ON p.id = a.partner_id
  ORDER BY a.days_outstanding DESC;
$$;

REVOKE ALL ON FUNCTION public.fmplus_perf_ar_aging FROM public;
GRANT EXECUTE ON FUNCTION public.fmplus_perf_ar_aging TO service_role;
