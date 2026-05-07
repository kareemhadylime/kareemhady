// Beithady · Fee Audit · audit-trail recorder.
// Append-only log of every observed change to fees / terms / rates.
// Called from the sync extensions; renders sparkline data via /history endpoint.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export async function recordFeeChange(args: {
  listing_id: string;
  fee_type: string;            // 'cleaning' | 'min_nights' | 'tax_rate' | 'base_price' | …
  channel?: string;
  prev_value?: number | null;
  new_value: number | null;
  prev_meta?: Record<string, unknown>;
  new_meta?: Record<string, unknown>;
}): Promise<void> {
  // No-op if value unchanged
  if (
    args.prev_value != null &&
    args.new_value != null &&
    Math.abs(args.prev_value - args.new_value) < 0.001
  )
    return;

  const sb = supabaseAdmin();
  await sb.from('beithady_listing_fee_history').insert({
    listing_id: args.listing_id,
    fee_type: args.fee_type,
    channel: args.channel || null,
    prev_value: args.prev_value ?? null,
    new_value: args.new_value,
    prev_meta: args.prev_meta || null,
    new_meta: args.new_meta || null,
  });
}

export async function getFeeHistory(
  listingId: string,
  feeType?: string
): Promise<
  Array<{
    fee_type: string;
    channel: string | null;
    prev_value: number | null;
    new_value: number | null;
    recorded_at: string;
  }>
> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_listing_fee_history')
    .select('fee_type, channel, prev_value, new_value, recorded_at')
    .eq('listing_id', listingId)
    .gte(
      'recorded_at',
      new Date(Date.now() - 90 * 86400000).toISOString()
    )
    .order('recorded_at', { ascending: true });
  if (feeType) q = q.eq('fee_type', feeType);
  const { data } = await q;
  return (data as Array<{
    fee_type: string;
    channel: string | null;
    prev_value: number | null;
    new_value: number | null;
    recorded_at: string;
  }> | null) || [];
}
