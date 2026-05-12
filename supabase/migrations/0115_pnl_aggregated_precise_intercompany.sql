-- Split intercompany elimination into two precise mechanisms:
--
-- 1. p_exclude_partner_ids (existing) — now applied to INCOME/INCOME_OTHER
--    accounts only.  This eliminates Egypt co.5 "Revenue from hospitality"
--    (401009, 2.1 M) billed to Dubai, while leaving expense accounts alone.
--
-- 2. p_exclude_account_codes (new) — eliminates specific expense pass-through
--    accounts regardless of partner.  Used for Dubai co.10 "COST OF
--    HOSPITALITY" (510104, 2.1 M) which is the direct cost-side counterpart
--    of the eliminated income.
--
-- Why the split matters:
--   Dubai also books 502116 "Tax Compensation" (294 K) against the Egypt
--   partner (27007).  That is a real VAT cost — Dubai pays Egypt's tax on its
--   behalf — and has no P&L counterpart in Egypt (Egypt books it to a VAT
--   liability account, 225001).  The previous single-pass partner filter
--   incorrectly excluded it, understating consolidated CoR by ~294 K vs Odoo.

CREATE OR REPLACE FUNCTION public.pnl_aggregated(
  p_from                 date,
  p_to                   date,
  p_company_ids          bigint[],
  p_building_code        text     DEFAULT NULL::text,
  p_lob_label            text     DEFAULT NULL::text,
  p_exclude_partner_ids  bigint[] DEFAULT NULL::bigint[],
  p_exclude_account_codes text[]  DEFAULT NULL::text[]
)
RETURNS TABLE(code text, name text, account_type text, sum_balance numeric, line_count bigint)
LANGUAGE sql
STABLE
AS $function$
  with filtered as (
    select ml.id, ml.balance, ml.account_id
    from public.odoo_move_lines ml
    join public.odoo_accounts acct on acct.id = ml.account_id
    where ml.date between p_from and p_to
      and ml.company_id = any(p_company_ids)
      and ml.parent_state in ('draft', 'posted')
      -- Income-side intercompany elimination: exclude revenue lines where the
      -- partner is an intercompany entity (e.g. Egypt 401009 "Revenue from
      -- hospitality" 2.1 M billed to Dubai partner 27005).
      -- Expense accounts are NOT filtered by partner — costs like 502116 "Tax
      -- Compensation" tagged to an intercompany partner are real operational
      -- costs that must appear in the consolidated P&L.
      and (
        p_exclude_partner_ids is null
        or acct.account_type not in ('income', 'income_other')
        or ml.partner_id is null
        or not (ml.partner_id = any(p_exclude_partner_ids))
      )
      -- Expense-side intercompany elimination: exclude specific pass-through
      -- cost accounts that directly offset the eliminated intercompany revenue
      -- (e.g. Dubai 510104 "COST OF HOSPITALITY" 2.1 M → partner Egypt 27007).
      and (
        p_exclude_account_codes is null
        or not (acct.code = any(p_exclude_account_codes))
      )
      and (
        (p_building_code is null and p_lob_label is null)
        or exists (
          select 1 from public.odoo_move_line_analytics mla
          join public.odoo_analytic_accounts aa on aa.id = mla.analytic_account_id
          where mla.move_line_id = ml.id
            and (p_building_code is null or aa.building_code = p_building_code)
            and (p_lob_label is null or aa.lob_label = p_lob_label)
        )
      )
  )
  select
    coalesce(a.code, '') as code,
    a.name,
    coalesce(a.account_type, '') as account_type,
    sum(f.balance) as sum_balance,
    count(*) as line_count
  from filtered f
  join public.odoo_accounts a on a.id = f.account_id
  group by a.code, a.name, a.account_type;
$function$;
