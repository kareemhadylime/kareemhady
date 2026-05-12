-- 0118_personal_stock_fifo.sql
-- FIFO matching for realized P&L on stock + fund trades.
-- For each (account, instrument), match sells against the oldest open buy lots.
-- Produces one row per matched lot, with realized gain (gain_egp).

begin;

drop view if exists v_personal_stock_realized_pnl;
drop function if exists personal_stock_fifo_match();

create function personal_stock_fifo_match()
returns table (
  account_id     int,
  instrument_id  int,
  buy_trade_id   uuid,
  sell_trade_id  uuid,
  matched_qty    numeric,
  buy_price      numeric,
  sell_price     numeric,
  buy_fees       numeric,    -- proportional buy-side fees on this lot
  sell_fees      numeric,    -- proportional sell-side fees on this lot
  buy_date       date,
  sell_date      date,
  gain_egp       numeric     -- (sell_price - buy_price) * matched_qty - allocated_fees
)
language plpgsql
as $$
#variable_conflict use_column
declare
  buy_row record;
  sell_row record;
  v_remaining numeric;
  v_sell_fee_per_unit numeric;
  v_match_qty numeric;
  v_buy_fees_alloc numeric;
  v_sell_fees_alloc numeric;
  v_realized numeric;
begin
  -- Temp table to hold remaining buy lots per (account, instrument), oldest first.
  create temporary table if not exists tmp_open_buys (
    seq          serial primary key,
    account_id   int,
    instrument_id int,
    buy_trade_id uuid,
    qty_remaining numeric,
    price        numeric,
    fee_per_unit numeric,
    trade_date   date
  ) on commit drop;
  delete from tmp_open_buys;

  -- Process trades in chronological order, partitioned by (account, instrument).
  for sell_row in
    select t.id as trade_id, t.account_id, t.instrument_id, t.side, t.qty, t.price,
           t.trade_date, t.fees_amount
    from personal_stock_trades t
    order by t.account_id, t.instrument_id, t.trade_date, t.id
  loop
    if sell_row.side = 'buy' then
      insert into tmp_open_buys (account_id, instrument_id, buy_trade_id, qty_remaining, price, fee_per_unit, trade_date)
        values (sell_row.account_id, sell_row.instrument_id, sell_row.trade_id, sell_row.qty, sell_row.price,
                case when sell_row.qty > 0 then sell_row.fees_amount / sell_row.qty else 0 end,
                sell_row.trade_date);
    else
      -- Sell: consume oldest open buys for this (account, instrument)
      v_remaining := sell_row.qty;
      v_sell_fee_per_unit := case when sell_row.qty > 0 then sell_row.fees_amount / sell_row.qty else 0 end;

      for buy_row in
        select b.seq, b.account_id, b.instrument_id, b.buy_trade_id, b.qty_remaining, b.price, b.fee_per_unit, b.trade_date
        from tmp_open_buys b
        where b.account_id = sell_row.account_id
          and b.instrument_id = sell_row.instrument_id
          and b.qty_remaining > 0
        order by b.trade_date, b.seq
      loop
        if v_remaining <= 0 then exit; end if;

        v_match_qty := least(v_remaining, buy_row.qty_remaining);
        v_buy_fees_alloc := buy_row.fee_per_unit * v_match_qty;
        v_sell_fees_alloc := v_sell_fee_per_unit * v_match_qty;
        v_realized := (sell_row.price - buy_row.price) * v_match_qty - v_buy_fees_alloc - v_sell_fees_alloc;

        account_id := sell_row.account_id;
        instrument_id := sell_row.instrument_id;
        buy_trade_id := buy_row.buy_trade_id;
        sell_trade_id := sell_row.trade_id;
        matched_qty := v_match_qty;
        buy_price := buy_row.price;
        sell_price := sell_row.price;
        buy_fees := v_buy_fees_alloc;
        sell_fees := v_sell_fees_alloc;
        buy_date := buy_row.trade_date;
        sell_date := sell_row.trade_date;
        gain_egp := v_realized;
        return next;

        update tmp_open_buys set qty_remaining = qty_remaining - v_match_qty where seq = buy_row.seq;
        v_remaining := v_remaining - v_match_qty;
      end loop;
    end if;
  end loop;
end;
$$;

create view v_personal_stock_realized_pnl as
  select * from personal_stock_fifo_match();

commit;
