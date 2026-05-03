type Numeric = number | string;

function toNum(v: Numeric, label: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!isFinite(n) || isNaN(n)) {
    throw new Error(`${label} must be a finite number, got: ${JSON.stringify(v)}`);
  }
  if (n < 0) {
    throw new Error(`${label} must be non-negative, got: ${JSON.stringify(v)}`);
  }
  return n;
}

export type Balance = {
  total_paid: number;
  remaining: number;
  is_complete: boolean;
};

/**
 * Sum payment amounts and compute remaining vs total.
 * Used for both trip payments (vs trip_price) and expense payments (vs expense.amount_egp).
 */
export function computeBalance(total: Numeric, paymentAmounts: Numeric[]): Balance {
  const totalNum = toNum(total, 'total');
  const paid = paymentAmounts.reduce<number>(
    (sum, a, i) => sum + toNum(a, `paymentAmounts[${i}]`),
    0
  );
  const remaining = Math.max(0, totalNum - paid);
  return {
    total_paid: paid,
    remaining,
    is_complete: paid >= totalNum,
  };
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; overage?: number };

/**
 * Validate that a new payment amount would not overpay.
 * Returns { ok: true } or { ok: false, error: 'Would overpay by EGP X' }.
 */
export function validatePaymentAmount(
  total: Numeric,
  existingPaymentAmounts: Numeric[],
  newAmount: number
): ValidationResult {
  if (newAmount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero' };
  }
  const totalNum = toNum(total, 'total');
  const paid = existingPaymentAmounts.reduce<number>(
    (sum, a, i) => sum + toNum(a, `existingPaymentAmounts[${i}]`),
    0
  );
  const wouldBe = paid + newAmount;
  if (wouldBe > totalNum) {
    const overage = wouldBe - totalNum;
    return { ok: false, error: `Would overpay by EGP ${overage}`, overage };
  }
  return { ok: true };
}

type PaymentRow = { amount_egp: number | string; paid_at?: string };

export type PaymentSummary<T extends PaymentRow = PaymentRow> = {
  totalPaid: number;
  latestPayment: T | null;
};

/**
 * Sum payment amounts and pick the latest (last in array) payment row.
 * Used by booking detail UIs that show "total received" + "most recent payment".
 * Pass the payments array as already returned from Supabase (sorted by paid_at desc preferred,
 * but the latest pick uses array end position regardless of sort).
 */
export function summarizePayments<T extends PaymentRow>(payments: T[]): PaymentSummary<T> {
  let total = 0;
  for (const p of payments) {
    const n = typeof p.amount_egp === 'string' ? Number(p.amount_egp) : p.amount_egp;
    if (Number.isFinite(n)) total += n;
  }
  return {
    totalPaid: total,
    latestPayment: payments.length > 0 ? payments[payments.length - 1] : null,
  };
}
