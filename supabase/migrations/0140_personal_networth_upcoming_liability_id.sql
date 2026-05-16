-- 2026-05-16: Extend v_personal_networth_upcoming to include liability_id
-- so the overview dashboard can wire "Mark paid" buttons through to the
-- liability mark-paid endpoint without a second lookup.

create or replace view v_personal_networth_upcoming as
  select
    'schedule'::text as source,
    sch.id as ref_id,
    li.app_user_id,
    sch.due_date,
    li.name as display_name,
    case li.kind
      when 'amortizing_loan' then 'loan_payment'
      when 'bnpl' then 'bnpl_payment'
      else 'other'
    end as category,
    (sch.principal_portion + sch.interest_portion) as amount,
    li.currency,
    li.id as liability_id
  from personal_networth_liability_schedule sch
  join personal_networth_liabilities li on li.id = sch.liability_id
  where sch.paid_on is null
    and sch.due_date <= current_date + interval '30 days'
    and li.active = true
  union all
  select
    'recurring'::text as source,
    tpl.id as ref_id,
    tpl.app_user_id,
    tpl.next_run_date as due_date,
    tpl.name as display_name,
    tpl.category::text as category,
    tpl.amount,
    tpl.currency,
    tpl.liability_id
  from personal_networth_recurring_templates tpl
  where tpl.active = true
    and tpl.next_run_date <= current_date + interval '30 days'
  order by 4 asc;
