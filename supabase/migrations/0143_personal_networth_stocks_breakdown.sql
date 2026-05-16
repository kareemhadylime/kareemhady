-- 2026-05-16: Decompose the stocks "pipe-in" into its three components so
-- the overview dashboard can show them as separate slices instead of a
-- single net number that hides margin debt under "stocks_pipe_egp".
--
-- The personal/stocks module exposes:
--   - positions held (qty × latest price)        — always >= 0
--   - net cash balance across broker accounts    — can be ±
--
-- Net cash can be negative when the user runs margin. That negative number
-- is conceptually a LIABILITY (borrowed from broker), not a negative asset.
-- The original v_personal_networth_current netted everything into one
-- stocks_pipe_egp number, which (a) hid the margin position from the
-- liability donut, and (b) made the asset donut omit stocks entirely when
-- the net came out negative.

-- 1) New helper view exposing the three components separately.
create or replace view v_personal_networth_stocks_breakdown as
  with latest_prices as (
    select distinct on (instrument_id) instrument_id, price
    from personal_stock_current_prices
    order by instrument_id, as_of_date desc, entered_at desc
  ),
  positions_value as (
    select coalesce(sum(pos.qty_held * lp.price), 0::numeric) as positions_egp
    from v_personal_stock_positions pos
    left join latest_prices lp on lp.instrument_id = pos.instrument_id
  ),
  latest_account_balances as (
    select distinct on (account_id) account_id, balance_egp
    from v_personal_stock_account_balance
    order by account_id, occurred_at desc nulls last, row_index desc
  ),
  cash_total as (
    select coalesce(sum(balance_egp), 0::numeric) as net_cash_egp
    from latest_account_balances
  )
  select
    pv.positions_egp,
    greatest(ct.net_cash_egp, 0::numeric) as cash_egp,
    greatest(-ct.net_cash_egp, 0::numeric) as margin_egp
  from positions_value pv
  cross join cash_total ct;

-- 2) Rewrite v_personal_networth_current to split stocks across the
-- assets/liabilities sides. stocks_pipe_egp is kept as a derived back-compat
-- column (positions + cash - margin = same net number as before) so any
-- existing callers that read it don't break.
create or replace view v_personal_networth_current as
  with assets_total as (
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
    select app_user_id from personal_networth_settings
    union
    select distinct app_user_id from personal_networth_assets where active
    union
    select distinct app_user_id from personal_networth_liabilities where active
  ),
  s as (
    select positions_egp, cash_egp, margin_egp from v_personal_networth_stocks_breakdown
  )
  select
    u.app_user_id,
    coalesce(a.amount_egp, 0::numeric) + s.positions_egp + s.cash_egp as total_assets_egp,
    coalesce(l.amount_egp, 0::numeric) + s.margin_egp as total_liabilities_egp,
    coalesce(a.amount_egp, 0::numeric) + s.positions_egp + s.cash_egp
      - coalesce(l.amount_egp, 0::numeric) - s.margin_egp as net_worth_egp,
    (s.positions_egp + s.cash_egp - s.margin_egp) as stocks_pipe_egp
  from known_users u
  left join assets_total a on a.app_user_id = u.app_user_id
  left join liabilities_total l on l.app_user_id = u.app_user_id
  cross join s;
