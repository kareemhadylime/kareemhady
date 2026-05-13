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
    // Realized P&L from FIFO view
    const pnl = await client
      .from('v_personal_stock_realized_pnl')
      .select('gain_egp');
    const realizedPnlEgp = (pnl.data ?? []).reduce(
      (a: number, r: { gain_egp: number | string | null }) =>
        a + Number(r.gain_egp ?? 0),
      0,
    );
    return {
      cashInEgp: Number(v.data?.cash_in_egp ?? 0),
      cashOutEgp: Number(v.data?.cash_out_egp ?? 0),
      totalBoughtEgp: Number(v.data?.total_bought_egp ?? 0),
      totalSoldEgp: Number(v.data?.total_sold_egp ?? 0),
      dividendsEgp: Number(v.data?.dividends_egp ?? 0),
      openPositionsCostEgp: Number(v.data?.open_positions_cost_egp ?? 0),
      realizedPnlEgp,
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
  accountId: number;
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
  overridden: boolean;
};

export async function getTopHoldings(limit?: number): Promise<HoldingRow[]> {
  const client = supabaseAdmin();
  const positions = await client
    .from('v_personal_stock_positions')
    .select('account_id, instrument_id, qty_held, avg_cost, overridden');
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
      overridden: boolean;
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
        accountId: p.account_id,
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
        overridden: Boolean(p.overridden),
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

export async function getDividendsByYear(): Promise<
  { year: number; amount: number }[]
> {
  const client = supabaseAdmin();
  const r = await client
    .from('personal_stock_dividends')
    .select('pay_date, amount');
  const m = new Map<number, number>();
  for (const row of r.data ?? []) {
    const y = parseInt(row.pay_date.slice(0, 4), 10);
    m.set(y, (m.get(y) ?? 0) + Number(row.amount));
  }
  return [...m.entries()]
    .map(([year, amount]) => ({ year, amount }))
    .sort((a, b) => a.year - b.year);
}

export async function getAccountBalanceSeries(): Promise<
  { date: string; '001': number; '003': number; '009': number }[]
> {
  const client = supabaseAdmin();
  const r = await client
    .from('v_personal_stock_account_balance')
    .select('account_id, occurred_at, balance_egp')
    .order('occurred_at', { ascending: true });
  const accs = await client
    .from('personal_stock_accounts')
    .select('id, code');
  const codeById = new Map(
    (accs.data ?? []).map(
      (a: { id: number; code: string }) => [a.id, a.code] as const,
    ),
  );
  const byMonth = new Map<
    string,
    { '001': number; '003': number; '009': number }
  >();
  for (const row of r.data ?? []) {
    const ym = row.occurred_at.slice(0, 7);
    const code = codeById.get(row.account_id) as '001' | '003' | '009';
    if (!code) continue;
    const cur = byMonth.get(ym) ?? { '001': 0, '003': 0, '009': 0 };
    cur[code] = Number(row.balance_egp);
    byMonth.set(ym, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}

export async function getRealizedPnlByYear(): Promise<
  { year: number; amount: number }[]
> {
  const client = supabaseAdmin();
  const r = await client
    .from('v_personal_stock_realized_pnl')
    .select('sell_date, gain_egp');
  const m = new Map<number, number>();
  for (const row of r.data ?? []) {
    const y = parseInt(row.sell_date.slice(0, 4), 10);
    m.set(y, (m.get(y) ?? 0) + Number(row.gain_egp ?? 0));
  }
  return [...m.entries()]
    .map(([year, amount]) => ({ year, amount }))
    .sort((a, b) => a.year - b.year);
}

export async function getPortfolioCostSeries(): Promise<
  { date: string; cost: number }[]
> {
  const client = supabaseAdmin();
  const trades = await client
    .from('personal_stock_trades')
    .select('side, qty, price, trade_date')
    .order('trade_date', { ascending: true });
  const monthly = new Map<string, number>();
  let running = 0;
  for (const t of trades.data ?? []) {
    const ym = t.trade_date.slice(0, 7);
    const delta = (t.side === 'buy' ? 1 : -1) * Number(t.qty) * Number(t.price);
    running += delta;
    monthly.set(ym, running);
  }
  return [...monthly.entries()].map(([date, cost]) => ({ date, cost }));
}

export type TxnFilters = {
  account?: AccountCode | 'all';
  kinds?: ActivityKind[];
  from?: string;
  to?: string;
  limit?: number;
};

export async function getTransactions(f: TxnFilters): Promise<ActivityRow[]> {
  // Re-use the union logic from getRecentActivity with large limit, filter in memory.
  // <2k rows total → fine.
  const all = await getRecentActivity(100000);
  return all
    .filter((r) => {
      if (f.account && f.account !== 'all' && r.accountCode !== f.account)
        return false;
      if (f.kinds && f.kinds.length && !f.kinds.includes(r.kind)) return false;
      if (f.from && r.occurredAt < f.from) return false;
      if (f.to && r.occurredAt > f.to) return false;
      return true;
    })
    .slice(0, f.limit ?? 500);
}

// ─── Position overrides ──────────────────────────────────────────────────────

export type OverrideRow = {
  id: string;
  accountId: number;
  accountCode: string;
  instrumentId: number;
  ticker: string;
  name: string;
  qtyHeld: number;
  avgCost: number;
  note: string | null;
  asOfDate: string;
  enteredAt: string;
  enteredBy: string | null;
};

export async function getAllOverrides(): Promise<OverrideRow[]> {
  const client = supabaseAdmin();
  const [overrides, accs, ins] = await Promise.all([
    client
      .from('personal_stock_position_overrides')
      .select('id, account_id, instrument_id, qty_held, avg_cost, note, as_of_date, entered_at, entered_by')
      .order('entered_at', { ascending: false }),
    client.from('personal_stock_accounts').select('id, code'),
    client.from('personal_stock_instruments').select('id, ticker, name'),
  ]);
  const acct = new Map<number, string>((accs.data ?? []).map((a) => [a.id, a.code]));
  const inst = new Map<number, { ticker: string; name: string }>(
    (ins.data ?? []).map((i) => [i.id, { ticker: i.ticker, name: i.name }]),
  );
  return (overrides.data ?? []).map((o) => ({
    id: o.id,
    accountId: o.account_id,
    accountCode: acct.get(o.account_id) ?? '?',
    instrumentId: o.instrument_id,
    ticker: inst.get(o.instrument_id)?.ticker ?? '?',
    name: inst.get(o.instrument_id)?.name ?? '?',
    qtyHeld: Number(o.qty_held),
    avgCost: Number(o.avg_cost),
    note: o.note,
    asOfDate: o.as_of_date,
    enteredAt: o.entered_at,
    enteredBy: o.entered_by,
  }));
}

export async function getInstrumentsList(): Promise<
  Array<{ id: number; ticker: string; name: string; kind: string }>
> {
  const client = supabaseAdmin();
  const r = await client
    .from('personal_stock_instruments')
    .select('id, ticker, name, kind')
    .order('name');
  return (r.data ?? []).map((i) => ({
    id: i.id,
    ticker: i.ticker,
    name: i.name,
    kind: i.kind,
  }));
}

export async function getAccountsList(): Promise<
  Array<{ id: number; code: string; kind: string }>
> {
  const client = supabaseAdmin();
  const r = await client
    .from('personal_stock_accounts')
    .select('id, code, kind')
    .order('code');
  return (r.data ?? []).map((a) => ({ id: a.id, code: a.code, kind: a.kind }));
}

// ─── Capital & margin summary ────────────────────────────────────────────────
// Today's snapshot of the user's real money in the broker account:
//   - my_equity        = sum(cash) + sum(stocks at cost)
//   - cash_on_hand     = sum of POSITIVE cash balances (positive accounts)
//   - margin_loan      = sum of NEGATIVE cash balances, absolute (the debit owed)
//   - stocks_at_cost   = sum(qty_held * avg_cost) across v_personal_stock_positions
//   - total_interest_paid + total_fees_paid = lifetime cost of trading

export type AccountSnapshot = {
  accountId: number;
  accountCode: string;
  cashEgp: number;             // signed; negative = margin debit
  stocksAtCostEgp: number;
  equityEgp: number;           // cash + stocks
  asOf: string | null;         // date of last ledger row
};

export type CapitalSummary = {
  myEquityEgp: number;
  cashOnHandEgp: number;        // sum of positive cash balances
  marginLoanEgp: number;        // sum of |negative cash balances|
  stocksAtCostEgp: number;
  totalInterestPaidEgp: number;
  totalFeesPaidEgp: number;
  marginRatioPct: number | null;  // margin / stocks_at_cost, on margin accounts only
  // Lifetime bank flows (net of correction reversals — "Cancel" rows)
  bankInGrossEgp: number;          // sum of Bank Deposits as-reported
  bankInCancelledEgp: number;      // correction debits that reversed deposits
  bankInNetEgp: number;            // effective money in from bank
  bankOutGrossEgp: number;         // sum of Withdrawals as-reported
  bankOutCancelledEgp: number;     // correction credits that reversed withdrawals
  bankOutNetEgp: number;           // effective money out to bank
  feeRefundsEgp: number;           // correction credits that reversed fees (NOT withdrawals)
  perAccount: AccountSnapshot[];
};

export async function getCapitalSummary(): Promise<CapitalSummary> {
  const client = supabaseAdmin();

  const [
    accs,
    balanceRows,
    positions,
    interestRows,
    feeRows,
    bankInRows,
    bankOutRows,
    correctionRows,
  ] = await Promise.all([
    client.from('personal_stock_accounts').select('id, code'),
    // last balance per account
    client
      .from('v_personal_stock_account_balance')
      .select('account_id, balance_egp, occurred_at, row_index')
      .order('occurred_at', { ascending: false })
      .order('row_index', { ascending: false }),
    client
      .from('v_personal_stock_positions')
      .select('account_id, qty_held, avg_cost'),
    client.from('personal_stock_interest').select('direction, amount'),
    client.from('personal_stock_fees').select('amount'),
    client.from('personal_stock_cash_movements').select('amount').eq('kind', 'deposit'),
    client.from('personal_stock_cash_movements').select('amount').eq('kind', 'withdrawal'),
    client
      .from('personal_stock_corrections')
      .select('amount_debit, amount_credit, note'),
  ]);

  const accountById = new Map(
    (accs.data ?? []).map((a) => [a.id, a.code] as const),
  );

  // Latest balance per account
  const latestBalance = new Map<
    number,
    { balance: number; asOf: string }
  >();
  for (const r of balanceRows.data ?? []) {
    if (!latestBalance.has(r.account_id)) {
      latestBalance.set(r.account_id, {
        balance: Number(r.balance_egp),
        asOf: r.occurred_at,
      });
    }
  }

  // Stocks at cost per account
  const stocksByAccount = new Map<number, number>();
  for (const p of positions.data ?? []) {
    const cost = Number(p.qty_held) * Number(p.avg_cost);
    stocksByAccount.set(
      p.account_id,
      (stocksByAccount.get(p.account_id) ?? 0) + cost,
    );
  }

  // Build per-account snapshot
  const perAccount: AccountSnapshot[] = [];
  for (const [id, code] of accountById) {
    const bal = latestBalance.get(id);
    const cash = bal?.balance ?? 0;
    const stocks = stocksByAccount.get(id) ?? 0;
    perAccount.push({
      accountId: id,
      accountCode: code,
      cashEgp: cash,
      stocksAtCostEgp: stocks,
      equityEgp: cash + stocks,
      asOf: bal?.asOf ?? null,
    });
  }
  perAccount.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const cashOnHandEgp = perAccount.reduce(
    (a, s) => a + (s.cashEgp > 0 ? s.cashEgp : 0),
    0,
  );
  const marginLoanEgp = perAccount.reduce(
    (a, s) => a + (s.cashEgp < 0 ? -s.cashEgp : 0),
    0,
  );
  const stocksAtCostEgp = perAccount.reduce(
    (a, s) => a + s.stocksAtCostEgp,
    0,
  );
  const myEquityEgp = perAccount.reduce((a, s) => a + s.equityEgp, 0);

  const totalInterestPaidEgp = (interestRows.data ?? []).reduce(
    (a, r) => a + (r.direction === 'charge' ? Number(r.amount) : -Number(r.amount)),
    0,
  );
  const totalFeesPaidEgp = (feeRows.data ?? []).reduce(
    (a, r) => a + Number(r.amount),
    0,
  );

  const marginRatioPct =
    stocksAtCostEgp > 0 ? (marginLoanEgp / stocksAtCostEgp) * 100 : null;

  // Bank flows + correction netting.
  // Heuristic for correction classification (based on note text + sign):
  //   - amount_debit > 0  → reverses an INFLOW. We assume it cancels a Bank Deposit
  //                          (only known pattern in real data: note = "Cancel" pairing
  //                          with the 14M deposit on 001/2024).
  //   - amount_credit > 0:
  //       · note contains Arabic "تحويل نقدي" (cash transfer) → reverses a Withdrawal
  //       · otherwise → reverses a Fee / Daily charge (refund)
  //
  // This isn't 100% rigorous — corrections could in principle reverse anything —
  // but it covers the observed cases and avoids netting wrongly.
  const bankInGrossEgp = (bankInRows.data ?? []).reduce(
    (a, r) => a + Number(r.amount ?? 0),
    0,
  );
  const bankOutGrossEgp = (bankOutRows.data ?? []).reduce(
    (a, r) => a + Number(r.amount ?? 0),
    0,
  );

  let bankInCancelledEgp = 0;
  let bankOutCancelledEgp = 0;
  let feeRefundsEgp = 0;
  for (const c of correctionRows.data ?? []) {
    const debit = Number(c.amount_debit ?? 0);
    const credit = Number(c.amount_credit ?? 0);
    const note = String(c.note ?? '');
    if (debit > 0) {
      bankInCancelledEgp += debit;
    }
    if (credit > 0) {
      // Arabic "تحويل نقدي" = "cash transfer (to bank)" — withdrawal cancellation
      if (/تحويل نقدي/.test(note)) {
        bankOutCancelledEgp += credit;
      } else {
        feeRefundsEgp += credit;
      }
    }
  }
  const bankInNetEgp = bankInGrossEgp - bankInCancelledEgp;
  const bankOutNetEgp = bankOutGrossEgp - bankOutCancelledEgp;

  return {
    myEquityEgp,
    cashOnHandEgp,
    marginLoanEgp,
    stocksAtCostEgp,
    totalInterestPaidEgp,
    totalFeesPaidEgp,
    marginRatioPct,
    bankInGrossEgp,
    bankInCancelledEgp,
    bankInNetEgp,
    bankOutGrossEgp,
    bankOutCancelledEgp,
    bankOutNetEgp,
    feeRefundsEgp,
    perAccount,
  };
}
