-- 0119_personal_stock_position_overrides.sql
-- Position overrides table: lets the user assert authoritative qty + avg_cost
-- per (account, instrument) when the computed positions disagree with the broker.
--
-- The need came from a 2026-05-13 audit comparing the DB (which computes positions
-- from buy/sell trades) against the broker dashboard. Findings:
--   - Silent inter-account stock transfers (e.g. 220k Emaar Misr moved 001→003)
--     are not recorded as Buy/Sell invoices anywhere in the AOLB exports.
--   - ACT Financial had an IPO subscription allocation (~1.38M shares) that does
--     not appear in any Invoice row.
-- These off-invoice events make the trade-derived positions wrong. Overrides are
-- the manual escape valve.
--
-- The v_personal_stock_positions view is recreated to honor overrides via a
-- FULL OUTER JOIN: override row wins when present; otherwise compute from trades.
-- The dashboard KPIs view is recreated (depends on positions view via cascade).

begin;

create table personal_stock_position_overrides (
  id            uuid primary key default gen_random_uuid(),
  account_id    int not null references personal_stock_accounts(id),
  instrument_id int not null references personal_stock_instruments(id),
  qty_held      numeric(18,6) not null check (qty_held >= 0),
  avg_cost      numeric(18,6) not null check (avg_cost >= 0),
  note          text,
  as_of_date    date not null,
  entered_at    timestamptz not null default now(),
  entered_by    text,
  unique (account_id, instrument_id)
);

drop view if exists v_personal_stock_dashboard_kpis;
drop view if exists v_personal_stock_positions;

create view v_personal_stock_positions as
  with computed as (
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
  )
  select
    coalesce(o.account_id, c.account_id) as account_id,
    coalesce(o.instrument_id, c.instrument_id) as instrument_id,
    coalesce(o.qty_held, c.qty_held) as qty_held,
    coalesce(o.avg_cost, c.avg_cost) as avg_cost,
    (o.id is not null) as overridden
  from computed c
  full outer join personal_stock_position_overrides o
    on o.account_id = c.account_id and o.instrument_id = c.instrument_id
  where coalesce(o.qty_held, c.qty_held) > 0;

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
