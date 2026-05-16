-- 2026-05-16: v_personal_networth_current was previously anchored on
-- personal_networth_settings, which meant users who had assets/liabilities
-- but had not yet visited /setup got zero rows back and a dashboard full of
-- "EGP 0" even when their data was non-empty. This rewrites the anchor as a
-- UNION across settings + active assets + active liabilities so the view
-- returns a row as soon as ANY personal-networth data exists for the user.

create or replace view v_personal_networth_current as
  with latest_prices as (
    select distinct on (instrument_id) instrument_id, price
    from personal_stock_current_prices
    order by instrument_id, as_of_date desc, entered_at desc
  ),
  holdings_value as (
    select coalesce(sum(pos.qty_held * lp.price), 0::numeric) as value_egp
    from v_personal_stock_positions pos
    left join latest_prices lp on lp.instrument_id = pos.instrument_id
  ),
  latest_account_balances as (
    select distinct on (account_id) account_id, balance_egp
    from v_personal_stock_account_balance
    order by account_id, occurred_at desc nulls last, row_index desc
  ),
  cash_balance as (
    select coalesce(sum(balance_egp), 0::numeric) as cash_egp
    from latest_account_balances
  ),
  stocks_value as (
    select hv.value_egp + cb.cash_egp as amount_egp
    from holdings_value hv, cash_balance cb
  ),
  assets_total as (
    select app_user_id,
      sum(balance * fx_lookup(currency, current_date)) as amount_egp
    from personal_networth_assets
    where active = true
    group by app_user_id
  ),
  liabilities_total as (
    select app_user_id,
      sum(current_balance * fx_lookup(currency, current_date)) as amount_egp
    from personal_networth_liabilities
    where active = true
    group by app_user_id
  ),
  known_users as (
    -- A row appears in the view if the user has any personal_networth_*
    -- presence. Stocks alone don't anchor (no app_user_id on the stocks
    -- pipeline), but the moment a user adds any asset/liability/setting,
    -- their stocks pipe shows up here too.
    select app_user_id from personal_networth_settings
    union
    select distinct app_user_id from personal_networth_assets where active
    union
    select distinct app_user_id from personal_networth_liabilities where active
  )
  select
    u.app_user_id,
    coalesce(a.amount_egp, 0::numeric) + coalesce(sv.amount_egp, 0::numeric) as total_assets_egp,
    coalesce(l.amount_egp, 0::numeric) as total_liabilities_egp,
    coalesce(a.amount_egp, 0::numeric) + coalesce(sv.amount_egp, 0::numeric) - coalesce(l.amount_egp, 0::numeric) as net_worth_egp,
    coalesce(sv.amount_egp, 0::numeric) as stocks_pipe_egp
  from known_users u
  left join assets_total a on a.app_user_id = u.app_user_id
  left join liabilities_total l on l.app_user_id = u.app_user_id
  cross join stocks_value sv;
