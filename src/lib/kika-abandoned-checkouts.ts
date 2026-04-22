import { supabaseAdmin } from './supabase';

// Abandoned checkout report for Kika. A checkout that was never completed
// into an order is recoverable revenue — every open row has an
// `abandoned_checkout_url` Shopify generates for resume-via-email flows.
//
// Period filtering uses the checkout's `created_at`. We count a row as
// "recoverable in period" when completed_at is NULL AND created_at falls
// inside the window. Even old-but-still-open carts thus show up whenever
// the user widens the period.

export type KikaAbandonedReport = {
  period: { from: string; to: string; label: string };
  totals: {
    abandoned_in_period: number;           // completed_at IS NULL
    completed_in_period: number;           // completed_at IS NOT NULL (became orders)
    all_in_period: number;
    recovery_rate_pct: number | null;      // completed / all * 100
    recoverable_revenue: number;           // sum(total_price) where completed_at IS NULL
    avg_cart_value: number | null;         // over abandoned only
    currency: string | null;
  };
  with_email_count: number;                // emailable abandoned (has a non-null email)
  with_email_pct: number | null;           // over abandoned
  top_abandoned: Array<{
    id: number;
    email: string | null;
    customer_name: string | null;
    total_price: number | null;
    line_items_count: number | null;
    created_at: string | null;
    abandoned_checkout_url: string | null;
    age_hours: number | null;              // now - created_at, null if created_at missing
  }>;
};

function numberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function buildKikaAbandonedReport(params: {
  fromDate: string;
  toDate: string;
  label: string;
}): Promise<KikaAbandonedReport> {
  const sb = supabaseAdmin();

  type Row = {
    id: number;
    email: string | null;
    customer_name: string | null;
    currency: string | null;
    total_price: number | null;
    line_items_count: number | null;
    abandoned_checkout_url: string | null;
    created_at: string | null;
    completed_at: string | null;
  };

  const rows: Row[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('shopify_abandoned_checkouts')
      .select(
        'id, email, customer_name, currency, total_price, line_items_count, abandoned_checkout_url, created_at, completed_at'
      )
      .gte('created_at', `${params.fromDate}T00:00:00Z`)
      .lt('created_at', `${params.toDate}T23:59:59Z`)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`abandoned query: ${error.message}`);
    const chunk = (data as Row[]) || [];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    offset += PAGE;
  }

  const abandoned = rows.filter(r => !r.completed_at);
  const completed = rows.filter(r => !!r.completed_at);
  const allCount = rows.length;

  const recoverableRevenue = abandoned.reduce(
    (s, r) => s + (numberOrNull(r.total_price) || 0),
    0
  );
  const avgCartValue = abandoned.length > 0
    ? recoverableRevenue / abandoned.length
    : null;

  const recoveryRate =
    allCount > 0 ? (completed.length / allCount) * 100 : null;

  const withEmail = abandoned.filter(r => !!r.email).length;
  const withEmailPct =
    abandoned.length > 0 ? (withEmail / abandoned.length) * 100 : null;

  const currency = rows.find(r => r.currency)?.currency || null;

  const now = Date.now();
  const topAbandoned = abandoned
    .slice()
    .sort((a, b) => (numberOrNull(b.total_price) || 0) - (numberOrNull(a.total_price) || 0))
    .slice(0, 15)
    .map(r => {
      const ageHours =
        r.created_at
          ? Math.max(0, (now - new Date(r.created_at).getTime()) / 3_600_000)
          : null;
      return {
        id: r.id,
        email: r.email,
        customer_name: r.customer_name,
        total_price: numberOrNull(r.total_price),
        line_items_count: r.line_items_count,
        created_at: r.created_at,
        abandoned_checkout_url: r.abandoned_checkout_url,
        age_hours:
          ageHours != null && Number.isFinite(ageHours)
            ? Number(ageHours.toFixed(1))
            : null,
      };
    });

  return {
    period: { from: params.fromDate, to: params.toDate, label: params.label },
    totals: {
      abandoned_in_period: abandoned.length,
      completed_in_period: completed.length,
      all_in_period: allCount,
      recovery_rate_pct:
        recoveryRate != null ? Number(recoveryRate.toFixed(1)) : null,
      recoverable_revenue: Number(recoverableRevenue.toFixed(2)),
      avg_cart_value:
        avgCartValue != null ? Number(avgCartValue.toFixed(2)) : null,
      currency,
    },
    with_email_count: withEmail,
    with_email_pct:
      withEmailPct != null ? Number(withEmailPct.toFixed(1)) : null,
    top_abandoned: topAbandoned,
  };
}
