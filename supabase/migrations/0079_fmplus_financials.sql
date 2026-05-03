-- supabase/migrations/0079_fmplus_financials.sql
-- Phase 11: FMPLUS Financials sub-module.
-- Adds two RPCs that aggregate odoo_move_lines for the FMPLUS company.
-- No schema changes — reuses Beithady-era tables.

create or replace function public.pnl_aggregated_multiperiod(
  p_periods         jsonb,
  p_company_ids     bigint[],
  p_plan_ids        bigint[]    default null,
  p_account_ids     bigint[]    default null,
  p_include_drafts  boolean     default true
)
returns table(
  period_key   text,
  code         text,
  name         text,
  account_type text,
  sum_balance  numeric,
  line_count   integer
)
language plpgsql
stable as $$
declare
  v_states text[];
  v_period record;
begin
  v_states := case when p_include_drafts then array['draft','posted'] else array['posted'] end;

  for v_period in
    select
      pp->>'key'  as key,
      (pp->>'from')::date as from_date,
      (pp->>'to')::date   as to_date
    from jsonb_array_elements(p_periods) as pp
  loop
    return query
    select
      v_period.key as period_key,
      coalesce(a.code, '')                  as code,
      coalesce(a.name, '')                  as name,
      coalesce(a.account_type, '')          as account_type,
      sum(ml.balance)::numeric              as sum_balance,
      count(*)::integer                     as line_count
    from public.odoo_move_lines ml
    left join public.odoo_accounts a on a.id = ml.account_id
    where ml.company_id = any(p_company_ids)
      and ml.parent_state = any(v_states)
      and ml.date >= v_period.from_date
      and ml.date <= v_period.to_date
      and (
        (p_plan_ids is null and p_account_ids is null)
        or
        (p_plan_ids is not null and exists (
          select 1
          from public.odoo_move_line_analytics mla
          join public.odoo_analytic_accounts aa on aa.id = mla.analytic_account_id
          where mla.move_line_id = ml.id
            and (aa.plan_id = any(p_plan_ids) or aa.root_plan_id = any(p_plan_ids))
        ))
        or
        (p_account_ids is not null and exists (
          select 1
          from public.odoo_move_line_analytics mla
          where mla.move_line_id = ml.id
            and mla.analytic_account_id = any(p_account_ids)
        ))
      )
    group by a.code, a.name, a.account_type;
  end loop;
end;
$$;

comment on function public.pnl_aggregated_multiperiod is
  'Multi-period P&L aggregation for FMPLUS Financials.';

create or replace function public.fmplus_active_accounts(
  p_plan_id     bigint,
  p_from        date,
  p_to          date,
  p_company_ids bigint[]
)
returns table(
  account_id   bigint,
  name         text,
  abs_balance  numeric
)
language sql
stable as $$
  select
    aa.id        as account_id,
    aa.name      as name,
    sum(abs(ml.balance))::numeric as abs_balance
  from public.odoo_move_line_analytics mla
  join public.odoo_analytic_accounts aa  on aa.id = mla.analytic_account_id
  join public.odoo_move_lines ml         on ml.id = mla.move_line_id
  where (aa.plan_id = p_plan_id or aa.root_plan_id = p_plan_id)
    and ml.company_id = any(p_company_ids)
    and ml.parent_state in ('draft','posted')
    and ml.date >= p_from
    and ml.date <= p_to
  group by aa.id, aa.name
  having sum(abs(ml.balance)) > 0
  order by sum(abs(ml.balance)) desc;
$$;

comment on function public.fmplus_active_accounts is
  'Returns analytic accounts with non-zero activity in a (plan, period). Drives picker auto-prune.';
