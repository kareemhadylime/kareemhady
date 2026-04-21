import Stripe from 'stripe';
import { stripe } from './stripe';

export type StripeTransactionDetail = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  source_amount: number | null;
  source_currency: string | null;
  description: string | null;
  statement_descriptor: string | null;
  charge_id: string | null;
  customer_id: string | null;
  receipt_email: string | null;
  metadata: Record<string, string> | null;
  created_iso: string;
};

export type StripeApiPayoutDetail = {
  payout_id: string;
  amount: number;
  currency: string;
  arrival_date_iso: string | null;
  created_iso: string;
  status: string;
  destination_id: string | null;
  destination_last4: string | null;
  destination_bank: string | null;
  method: string | null;
  transaction_count: number;
  transactions: StripeTransactionDetail[];
  net_components_amount: number;
  fee_components_amount: number;
};

export type StripeApiBreakdown = {
  api_payouts: StripeApiPayoutDetail[];
  total_amount: number;
  currency: string;
  fetched_at: string;
  error: string | null;
};

const MAX_PAYOUTS = 100;
const MAX_TXNS_PER_PAYOUT = 200;

const minorToMajor = (n: number | null | undefined): number =>
  Math.round(((Number(n) || 0) / 100) * 100) / 100;

async function listPayoutsInRange(
  client: Stripe,
  fromTs: number,
  toTs: number
): Promise<Stripe.Payout[]> {
  // Filter by arrival_date (when funds land at the bank) rather than
  // `created` (when Stripe initiated the payout). Stripe's payout
  // notification emails trigger around arrival, so this aligns the API
  // window with the email search window and catches payouts created
  // several days before the range start but arriving within it.
  const out: Stripe.Payout[] = [];
  for await (const payout of client.payouts.list({
    arrival_date: { gte: fromTs, lte: toTs },
    limit: 100,
  })) {
    out.push(payout);
    if (out.length >= MAX_PAYOUTS) break;
  }
  return out;
}

async function listTransactionsForPayout(
  client: Stripe,
  payoutId: string
): Promise<Stripe.BalanceTransaction[]> {
  const out: Stripe.BalanceTransaction[] = [];
  for await (const txn of client.balanceTransactions.list({
    payout: payoutId,
    limit: 100,
    expand: ['data.source'],
  })) {
    out.push(txn);
    if (out.length >= MAX_TXNS_PER_PAYOUT) break;
  }
  return out;
}

function extractTxnDetail(
  txn: Stripe.BalanceTransaction
): StripeTransactionDetail {
  const source = txn.source as Stripe.BalanceTransaction['source'] | null;
  let chargeId: string | null = null;
  let description: string | null = txn.description || null;
  let statementDescriptor: string | null = null;
  let customerId: string | null = null;
  let receiptEmail: string | null = null;
  let sourceAmount: number | null = null;
  let sourceCurrency: string | null = null;
  let metadata: Record<string, string> | null = null;

  if (source && typeof source === 'object' && 'object' in source) {
    const objType = source.object;
    if (objType === 'charge') {
      const c = source as Stripe.Charge;
      chargeId = c.id;
      description = c.description || description;
      statementDescriptor = c.statement_descriptor || null;
      receiptEmail = c.receipt_email || null;
      customerId =
        typeof c.customer === 'string'
          ? c.customer
          : c.customer?.id || null;
      if (c.metadata && Object.keys(c.metadata).length > 0) metadata = c.metadata;
      // Balance transaction's amount is already in settlement currency (AED).
      // The charge's amount is in the charge's currency (could be USD/EUR).
      if (c.amount && c.currency && c.currency !== txn.currency) {
        sourceAmount = c.amount;
        sourceCurrency = c.currency.toUpperCase();
      }
    } else if (objType === 'refund') {
      const r = source as Stripe.Refund;
      chargeId = typeof r.charge === 'string' ? r.charge : r.charge?.id || null;
      description = r.reason || description;
      if (r.metadata && Object.keys(r.metadata).length > 0) metadata = r.metadata;
    } else if (objType === 'payout') {
      // Skip — this is the payout debit itself, not a component transaction.
      description = '(payout debit)';
    }
  }

  return {
    id: txn.id,
    type: txn.type,
    amount: minorToMajor(txn.amount),
    currency: (txn.currency || 'aed').toUpperCase(),
    source_amount: sourceAmount != null ? minorToMajor(sourceAmount) : null,
    source_currency: sourceCurrency,
    description,
    statement_descriptor: statementDescriptor,
    charge_id: chargeId,
    customer_id: customerId,
    receipt_email: receiptEmail,
    metadata,
    created_iso: new Date(txn.created * 1000).toISOString(),
  };
}

export async function fetchStripePayoutBreakdown(
  fromIso: string,
  toIso: string
): Promise<StripeApiBreakdown> {
  const fetchedAt = new Date().toISOString();
  let client: Stripe;
  try {
    client = stripe();
  } catch (e: any) {
    return {
      api_payouts: [],
      total_amount: 0,
      currency: 'AED',
      fetched_at: fetchedAt,
      error: String(e?.message || e),
    };
  }

  const fromTs = Math.floor(new Date(fromIso).getTime() / 1000);
  const toTs = Math.floor(new Date(toIso).getTime() / 1000);

  let payouts: Stripe.Payout[];
  try {
    payouts = await listPayoutsInRange(client, fromTs, toTs);
  } catch (e: any) {
    return {
      api_payouts: [],
      total_amount: 0,
      currency: 'AED',
      fetched_at: fetchedAt,
      error: `payouts.list failed: ${String(e?.message || e)}`,
    };
  }

  const details = await Promise.all(
    payouts.map(async p => {
      let transactions: Stripe.BalanceTransaction[] = [];
      try {
        transactions = await listTransactionsForPayout(client, p.id);
      } catch {
        // swallow per-payout failures; return empty txn list so the payout
        // still shows up with its header info
      }

      const components = transactions
        .filter(t => t.type !== 'payout')
        .map(extractTxnDetail);
      const netComponentsAmount = components.reduce(
        (s, t) => s + (t.amount || 0),
        0
      );
      // Per-transaction Stripe fees are embedded in each BalanceTransaction.fee
      // (in settlement minor units), so summing across components gives the
      // total fee captured within this payout.
      const feeComponentsAmount = transactions.reduce(
        (s, t) => s + minorToMajor(t.fee || 0),
        0
      );

      const destId =
        typeof p.destination === 'string'
          ? p.destination
          : (p.destination as Stripe.ExternalAccount | null)?.id || null;
      let destLast4: string | null = null;
      let destBank: string | null = null;
      if (
        p.destination &&
        typeof p.destination === 'object' &&
        'object' in p.destination
      ) {
        const d = p.destination as Stripe.BankAccount | Stripe.Card;
        if (d.object === 'bank_account') {
          destLast4 = d.last4 || null;
          destBank = d.bank_name || null;
        } else if (d.object === 'card') {
          destLast4 = d.last4 || null;
          destBank = d.brand || null;
        }
      }

      return {
        payout_id: p.id,
        amount: minorToMajor(p.amount),
        currency: (p.currency || 'aed').toUpperCase(),
        arrival_date_iso: p.arrival_date
          ? new Date(p.arrival_date * 1000).toISOString()
          : null,
        created_iso: new Date(p.created * 1000).toISOString(),
        status: p.status || 'unknown',
        destination_id: destId,
        destination_last4: destLast4,
        destination_bank: destBank,
        method: p.method || null,
        transaction_count: components.length,
        transactions: components,
        net_components_amount: Math.round(netComponentsAmount * 100) / 100,
        fee_components_amount: Math.round(feeComponentsAmount * 100) / 100,
      } as StripeApiPayoutDetail;
    })
  );

  const totalAmount = details.reduce((s, d) => s + (d.amount || 0), 0);
  const currency = details[0]?.currency || 'AED';

  return {
    api_payouts: details,
    total_amount: Math.round(totalAmount * 100) / 100,
    currency,
    fetched_at: fetchedAt,
    error: null,
  };
}
