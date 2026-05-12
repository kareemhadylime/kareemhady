import type { AolbRawRow } from './parse-aolb';
import { parseStockDescription, parseFundDescription } from './instruments';

export type ClassifiedRow =
  | { kind: 'trade'; data: {
        side: 'buy' | 'sell';
        qty: number;
        price: number;
        grossAmount: number;
        netAmount: number;
        feesAmount: number;
        invoiceId: string | null;
        tradeDate: string;
        instrumentKind: 'stock' | 'fund';
        instrumentName: string;
      } }
  | { kind: 'dividend'; data: {
        amount: number; payDate: string; note: string | null;
        instrumentNameHint: string | null;
      } }
  | { kind: 'cash'; data: {
        kind: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out';
        amount: number;
        counterpartyAccountCode: string | null;
        occurredAt: string;
        note: string | null;
      } }
  | { kind: 'fee'; data: {
        kind: 'platform_daily' | 'ipo_subscription' | 'other';
        amount: number; occurredAt: string; note: string | null;
      } }
  | { kind: 'interest'; data: {
        direction: 'charge' | 'credit';
        amount: number; periodEndDate: string; note: string | null;
      } }
  | { kind: 'correction'; data: {
        amountDebit: number; amountCredit: number; occurredAt: string;
        note: string | null;
      } }
  | { kind: 'skipped'; reason: string };

const COUNTERPARTY_RE = /Account\(18880(\d{3})\)/;

export function classifyRow(r: AolbRawRow): ClassifiedRow {
  if (!r.opType || !r.occurredAt) return { kind: 'skipped', reason: 'no op_type / date' };
  // header row
  if (r.opType === 'Operation Type') return { kind: 'skipped', reason: 'header' };

  const op = r.opType.trim();

  if (op === 'Buy Invoice' || op === 'Sell Invoice') {
    const m = parseStockDescription(r.description);
    if (!m) return { kind: 'skipped', reason: 'unparseable trade desc' };
    const net = m.side === 'buy' ? r.debit : r.credit;
    const gross = m.qty * m.price;
    return { kind: 'trade', data: {
      side: m.side, qty: m.qty, price: m.price,
      grossAmount: gross, netAmount: net, feesAmount: net - gross,
      invoiceId: m.invoiceId, tradeDate: r.occurredAt,
      instrumentKind: 'stock', instrumentName: m.name,
    }};
  }

  if (op === 'ICS') {
    const m = parseFundDescription(r.description);
    if (!m) return { kind: 'skipped', reason: 'unparseable fund desc' };
    const net = m.side === 'buy' ? r.debit : r.credit;
    const gross = m.qty * m.price;
    return { kind: 'trade', data: {
      side: m.side, qty: m.qty, price: m.price,
      grossAmount: gross, netAmount: net, feesAmount: net - gross,
      invoiceId: null, tradeDate: r.occurredAt,
      instrumentKind: 'fund', instrumentName: m.name,
    }};
  }

  if (op === 'Bank Deposit') {
    return { kind: 'cash', data: {
      kind: 'deposit', amount: r.credit, counterpartyAccountCode: null,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'With Drawal') {
    return { kind: 'cash', data: {
      kind: 'withdrawal', amount: r.debit, counterpartyAccountCode: null,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'Cash Transfer') {
    const cp = r.description ? COUNTERPARTY_RE.exec(r.description) : null;
    const isIn = r.credit > 0;
    return { kind: 'cash', data: {
      kind: isIn ? 'transfer_in' : 'transfer_out',
      amount: isIn ? r.credit : r.debit,
      counterpartyAccountCode: cp ? cp[1] : null,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'CASHDIVIDEND') {
    return { kind: 'dividend', data: {
      amount: r.credit > 0 ? r.credit : r.debit,
      payDate: r.occurredAt,
      note: r.description,
      instrumentNameHint: null,  // Arabic name → resolve later if needed
    }};
  }

  if (op === 'Daily') {
    const isIpo = r.description ? /اكتتاب/.test(r.description) : false;
    return { kind: 'fee', data: {
      kind: isIpo ? 'ipo_subscription' : 'platform_daily',
      amount: r.debit > 0 ? r.debit : r.credit,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'INTEREST' || op === 'BANK PROFIT') {
    return { kind: 'interest', data: {
      direction: r.debit > 0 ? 'charge' : 'credit',
      amount: r.debit > 0 ? r.debit : r.credit,
      periodEndDate: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'Correction') {
    return { kind: 'correction', data: {
      amountDebit: r.debit, amountCredit: r.credit,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  return { kind: 'skipped', reason: `unknown op_type: ${op}` };
}
