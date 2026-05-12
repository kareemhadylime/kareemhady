import { supabaseAdmin } from '@/lib/supabase';
import type { AccountCode, Period, DashboardKpis } from './types';

function yearBounds(period: Period): { from: string; to: string } | null {
  if (period === 'all') return null;
  return { from: `${period}-01-01`, to: `${period}-12-31` };
}

export async function getDashboardKpis(opts: {
  period: Period;
  account: AccountCode | 'all';
}): Promise<DashboardKpis> {
  const client = supabaseAdmin();
  const bounds = yearBounds(opts.period);
  const accFilter =
    opts.account === 'all'
      ? null
      : (
          await client
            .from('personal_stock_accounts')
            .select('id')
            .eq('code', opts.account)
            .maybeSingle()
        ).data?.id ?? null;

  // Fast path: no filters → use the view directly
  if (opts.period === 'all' && opts.account === 'all') {
    const v = await client
      .from('v_personal_stock_dashboard_kpis')
      .select('*')
      .single();
    // Compute unrealized P&L from positions × latest prices
    const positions = await client
      .from('v_personal_stock_positions')
      .select('instrument_id, qty_held, avg_cost');
    const prices = await client
      .from('personal_stock_current_prices')
      .select('instrument_id, price, as_of_date')
      .order('as_of_date', { ascending: false });
    const latest = new Map<number, number>();
    for (const p of prices.data ?? []) {
      if (!latest.has(p.instrument_id))
        latest.set(p.instrument_id, Number(p.price));
    }
    const unrealizedPnlEgp = (positions.data ?? []).reduce(
      (
        a: number,
        p: { instrument_id: number; qty_held: number; avg_cost: number },
      ) => {
        const lp = latest.get(p.instrument_id);
        return lp === undefined
          ? a
          : a + (lp - Number(p.avg_cost)) * Number(p.qty_held);
      },
      0,
    );
    return {
      cashInEgp: Number(v.data?.cash_in_egp ?? 0),
      cashOutEgp: Number(v.data?.cash_out_egp ?? 0),
      totalBoughtEgp: Number(v.data?.total_bought_egp ?? 0),
      totalSoldEgp: Number(v.data?.total_sold_egp ?? 0),
      dividendsEgp: Number(v.data?.dividends_egp ?? 0),
      openPositionsCostEgp: Number(v.data?.open_positions_cost_egp ?? 0),
      realizedPnlEgp: 0,
      unrealizedPnlEgp,
    };
  }

  // Filtered path: per-table sums with optional filters
  async function sumKind(
    table: string,
    col: string,
    kindCol: string,
    kindVal: string,
    dateCol: string,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = client.from(table).select(col).eq(kindCol, kindVal);
    if (accFilter !== null) q = q.eq('account_id', accFilter);
    if (bounds) q = q.gte(dateCol, bounds.from).lte(dateCol, bounds.to);
    const r = await q;
    return (r.data ?? []).reduce(
      (a: number, row: Record<string, unknown>) => a + Number(row[col] ?? 0),
      0,
    );
  }
  async function sumAll(table: string, col: string, dateCol: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = client.from(table).select(col);
    if (accFilter !== null) q = q.eq('account_id', accFilter);
    if (bounds) q = q.gte(dateCol, bounds.from).lte(dateCol, bounds.to);
    const r = await q;
    return (r.data ?? []).reduce(
      (a: number, row: Record<string, unknown>) => a + Number(row[col] ?? 0),
      0,
    );
  }

  return {
    cashInEgp: await sumKind(
      'personal_stock_cash_movements',
      'amount',
      'kind',
      'deposit',
      'occurred_at',
    ),
    cashOutEgp: await sumKind(
      'personal_stock_cash_movements',
      'amount',
      'kind',
      'withdrawal',
      'occurred_at',
    ),
    totalBoughtEgp: await sumKind(
      'personal_stock_trades',
      'net_amount',
      'side',
      'buy',
      'trade_date',
    ),
    totalSoldEgp: await sumKind(
      'personal_stock_trades',
      'net_amount',
      'side',
      'sell',
      'trade_date',
    ),
    dividendsEgp: await sumAll(
      'personal_stock_dividends',
      'amount',
      'pay_date',
    ),
    openPositionsCostEgp: 0, // requires positions view, skip for filtered path in v1
    realizedPnlEgp: 0,
    unrealizedPnlEgp: 0,
  };
}

export type HoldingRow = {
  accountCode: string;
  instrumentId: number;
  ticker: string;
  name: string;
  qtyHeld: number;
  avgCost: number;
  lastPrice: number | null;
  lastPriceAsOf: string | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
};

export async function getTopHoldings(limit?: number): Promise<HoldingRow[]> {
  const client = supabaseAdmin();
  const positions = await client
    .from('v_personal_stock_positions')
    .select('account_id, instrument_id, qty_held, avg_cost');
  if (!positions.data?.length) return [];

  const instrumentIds = [
    ...new Set(
      positions.data.map((p: { instrument_id: number }) => p.instrument_id),
    ),
  ];
  const accountIds = [
    ...new Set(
      positions.data.map((p: { account_id: number }) => p.account_id),
    ),
  ];

  const [instr, accs, prices] = await Promise.all([
    client
      .from('personal_stock_instruments')
      .select('id, ticker, name')
      .in('id', instrumentIds),
    client
      .from('personal_stock_accounts')
      .select('id, code')
      .in('id', accountIds),
    client
      .from('personal_stock_current_prices')
      .select('instrument_id, price, as_of_date')
      .in('instrument_id', instrumentIds)
      .order('as_of_date', { ascending: false }),
  ]);

  const latestByInstr = new Map<number, { price: number; asOf: string }>();
  for (const row of prices.data ?? []) {
    if (!latestByInstr.has(row.instrument_id)) {
      latestByInstr.set(row.instrument_id, {
        price: Number(row.price),
        asOf: row.as_of_date,
      });
    }
  }
  const instrById = new Map(
    (instr.data ?? []).map(
      (i: { id: number; ticker: string; name: string }) => [i.id, i] as const,
    ),
  );
  const acctById = new Map(
    (accs.data ?? []).map(
      (a: { id: number; code: string }) => [a.id, a.code] as const,
    ),
  );

  const rows: HoldingRow[] = positions.data.map(
    (p: {
      account_id: number;
      instrument_id: number;
      qty_held: number;
      avg_cost: number;
    }) => {
      const ins = instrById.get(p.instrument_id) as
        | { id: number; ticker: string; name: string }
        | undefined;
      const lp = latestByInstr.get(p.instrument_id) ?? null;
      const qty = Number(p.qty_held);
      const avg = Number(p.avg_cost);
      const cv = lp ? qty * lp.price : null;
      const up = lp ? (lp.price - avg) * qty : null;
      return {
        accountCode: acctById.get(p.account_id) ?? '???',
        instrumentId: p.instrument_id,
        ticker: ins?.ticker ?? '?',
        name: ins?.name ?? '?',
        qtyHeld: qty,
        avgCost: avg,
        lastPrice: lp?.price ?? null,
        lastPriceAsOf: lp?.asOf ?? null,
        currentValue: cv,
        unrealizedPnl: up,
        unrealizedPnlPct:
          up !== null && avg > 0 ? ((lp!.price - avg) / avg) * 100 : null,
      };
    },
  );

  rows.sort(
    (a, b) =>
      (b.currentValue ?? b.qtyHeld * b.avgCost) -
      (a.currentValue ?? a.qtyHeld * a.avgCost),
  );
  return limit ? rows.slice(0, limit) : rows;
}

export type ActivityKind =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'deposit'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'fee'
  | 'interest_charge'
  | 'interest_credit'
  | 'correction';

export type ActivityRow = {
  kind: ActivityKind;
  occurredAt: string;
  accountCode: string;
  amount: number;
  instrumentTicker?: string;
  qty?: number;
  price?: number;
  note?: string;
};

export async function getRecentActivity(limit = 8): Promise<ActivityRow[]> {
  const client = supabaseAdmin();
  const fetchLimit = Math.max(limit, 100);
  const [tr, dv, cm, fe, it, co, accs, ins] = await Promise.all([
    client
      .from('personal_stock_trades')
      .select(
        'account_id, instrument_id, side, qty, price, net_amount, trade_date',
      )
      .order('trade_date', { ascending: false })
      .limit(fetchLimit),
    client
      .from('personal_stock_dividends')
      .select('account_id, amount, pay_date, note')
      .order('pay_date', { ascending: false })
      .limit(fetchLimit),
    client
      .from('personal_stock_cash_movements')
      .select('account_id, kind, amount, occurred_at, note')
      .order('occurred_at', { ascending: false })
      .limit(fetchLimit),
    client
      .from('personal_stock_fees')
      .select('account_id, amount, occurred_at, note')
      .order('occurred_at', { ascending: false })
      .limit(fetchLimit),
    client
      .from('personal_stock_interest')
      .select('account_id, direction, amount, period_end_date, note')
      .order('period_end_date', { ascending: false })
      .limit(fetchLimit),
    client
      .from('personal_stock_corrections')
      .select('account_id, amount_debit, amount_credit, occurred_at, note')
      .order('occurred_at', { ascending: false })
      .limit(fetchLimit),
    client.from('personal_stock_accounts').select('id, code'),
    client.from('personal_stock_instruments').select('id, ticker'),
  ]);
  const acct = new Map(
    (accs.data ?? []).map(
      (a: { id: number; code: string }) => [a.id, a.code] as const,
    ),
  );
  const tick = new Map(
    (ins.data ?? []).map(
      (i: { id: number; ticker: string }) => [i.id, i.ticker] as const,
    ),
  );

  const out: ActivityRow[] = [];
  for (const t of tr.data ?? [])
    out.push({
      kind: t.side as ActivityKind,
      occurredAt: t.trade_date,
      accountCode: acct.get(t.account_id) ?? '?',
      amount: Number(t.net_amount),
      instrumentTicker: tick.get(t.instrument_id),
      qty: Number(t.qty),
      price: Number(t.price),
    });
  for (const d of dv.data ?? [])
    out.push({
      kind: 'dividend',
      occurredAt: d.pay_date,
      accountCode: acct.get(d.account_id) ?? '?',
      amount: Number(d.amount),
      note: d.note ?? undefined,
    });
  for (const c of cm.data ?? [])
    out.push({
      kind: c.kind as ActivityKind,
      occurredAt: c.occurred_at,
      accountCode: acct.get(c.account_id) ?? '?',
      amount: Number(c.amount),
      note: c.note ?? undefined,
    });
  for (const f of fe.data ?? [])
    out.push({
      kind: 'fee',
      occurredAt: f.occurred_at,
      accountCode: acct.get(f.account_id) ?? '?',
      amount: Number(f.amount),
      note: f.note ?? undefined,
    });
  for (const i of it.data ?? [])
    out.push({
      kind:
        i.direction === 'charge' ? 'interest_charge' : 'interest_credit',
      occurredAt: i.period_end_date,
      accountCode: acct.get(i.account_id) ?? '?',
      amount: Number(i.amount),
      note: i.note ?? undefined,
    });
  for (const x of co.data ?? [])
    out.push({
      kind: 'correction',
      occurredAt: x.occurred_at,
      accountCode: acct.get(x.account_id) ?? '?',
      amount: Number(x.amount_credit) - Number(x.amount_debit),
      note: x.note ?? undefined,
    });

  out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return out.slice(0, limit);
}
