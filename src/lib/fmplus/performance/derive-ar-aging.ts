// src/lib/fmplus/performance/derive-ar-aging.ts
import { supabaseAdmin } from '@/lib/supabase';
import type { ArAgingBlock, ArAgingLine, ArBucket, ArBucketTotal } from './types';

const BUCKET_ORDER: ArBucket[] = ['within_terms', 'overdue_1_30', 'overdue_31_60', 'overdue_61_90', 'overdue_90_plus'];

export async function arAging(args: {
  project_id: number;
  payment_terms_days: number | null;
}): Promise<ArAgingBlock | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('fmplus_perf_ar_aging', {
    p_analytic_id: args.project_id,
    p_payment_terms_days: args.payment_terms_days,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    move_id: number;
    line_id: number;
    partner_id: number | null;
    partner_name: string;
    invoice_ref: string | null;
    invoice_date: string;
    amount_residual: number | string;
    currency: string | null;
    days_outstanding: number;
    days_overdue: number;
    bucket: ArBucket;
  }>;
  if (rows.length === 0) return null;

  const lines: ArAgingLine[] = rows.map(r => ({
    move_id: r.move_id,
    line_id: r.line_id,
    partner_id: r.partner_id,
    partner_name: r.partner_name,
    invoice_ref: r.invoice_ref,
    invoice_date: r.invoice_date,
    amount_residual: typeof r.amount_residual === 'string' ? Number.parseFloat(r.amount_residual) : r.amount_residual,
    currency: r.currency,
    days_outstanding: r.days_outstanding,
    days_overdue: r.days_overdue,
    bucket: r.bucket,
  }));

  const bucketMap: Record<ArBucket, ArBucketTotal> = Object.fromEntries(
    BUCKET_ORDER.map(b => [b, { bucket: b, count: 0, amount: 0 }]),
  ) as Record<ArBucket, ArBucketTotal>;
  let total = 0;
  let withinTerms = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  for (const l of lines) {
    bucketMap[l.bucket].count += 1;
    bucketMap[l.bucket].amount += l.amount_residual;
    total += l.amount_residual;
    if (l.bucket === 'within_terms') withinTerms += l.amount_residual;
    else { overdueAmount += l.amount_residual; overdueCount += 1; }
  }
  return {
    payment_terms_days: args.payment_terms_days,
    total_outstanding: total,
    within_terms_amount: withinTerms,
    overdue_amount: overdueAmount,
    overdue_count: overdueCount,
    buckets: BUCKET_ORDER.map(b => bucketMap[b]),
    lines,
  };
}
