-- 0117_personal_stock_views.sql
-- Non-FIFO views over the Stock Investment normalized schema.
-- The realized-P&L view is added in 0118 alongside the FIFO matching function.

begin;

create view v_personal_stock_positions as
  with buys as (
    select account_id, instrument_id,
           sum(qty) as total_buy_qty,
           sum(net_amount) as total_buy_net
    from personal_stock_trades where side = 'buy' group by account_id, instrument_id
  ),
  sells as (
    select account_id, instrument_id, sum(qty) as total_sell_qty
    from personal_stock_trades where side = 'sell' group by account_id, instrument_id
  )
  select
    b.account_id,
    b.instrument_id,
    coalesce(b.total_buy_qty, 0) - coalesce(s.total_sell_qty, 0) as qty_held,
    case when coalesce(b.total_buy_qty, 0) > 0
         then b.total_buy_net / b.total_buy_qty else null end as avg_cost
  from buys b
  left join sells s on s.account_id = b.account_id and s.instrument_id = b.instrument_id
  where coalesce(b.total_buy_qty, 0) - coalesce(s.total_sell_qty, 0) > 0;

create view v_personal_stock_account_balance as
  select
    raw.upload_id,
    u.account_id,
    raw.occurred_at,
    raw.row_index,
    raw.credit - raw.debit as delta,
    sum(raw.credit - raw.debit)
      over (partition by u.account_id
            order by raw.occurred_at nulls last, raw.row_index
            rows between unbounded preceding and current row) as balance_egp
  from personal_stock_raw_rows raw
  join personal_stock_uploads u on u.id = raw.upload_id
  where raw.occurred_at is not null;

create view v_personal_stock_dashboard_kpis as
  with cash_in as (
    select coalesce(sum(amount), 0) as v from personal_stock_cash_movements where kind = 'deposit'
  ),
  cash_out as (
    select coalesce(sum(amount), 0) as v from personal_stock_cash_movements where kind = 'withdrawal'
  ),
  bought as (
    select coalesce(sum(net_amount), 0) as v from personal_stock_trades where side = 'buy'
  ),
  sold as (
    select coalesce(sum(net_amount), 0) as v from personal_stock_trades where side = 'sell'
  ),
  divs as (
    select coalesce(sum(amount), 0) as v from personal_stock_dividends
  ),
  open_cost as (
    select coalesce(sum(qty_held * avg_cost), 0) as v from v_personal_stock_positions
  )
  select
    (select v from cash_in)  as cash_in_egp,
    (select v from cash_out) as cash_out_egp,
    (select v from bought)   as total_bought_egp,
    (select v from sold)     as total_sold_egp,
    (select v from divs)     as dividends_egp,
    (select v from open_cost) as open_positions_cost_egp;

commit;
