// Beithady · Fee Audit · channel commission lookup with fallback to
// historical-average derivation when config is missing.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';

export type ChannelFeeConfig = {
  channel: string;
  host_commission_pct: number;
  guest_service_pct: number;
  guest_service_min: number | null;
  guest_service_max: number | null;
  notes: string | null;
};

const CHANNEL_BUCKET_TO_CONFIG: Record<ChannelBucket, string> = {
  airbnb: 'airbnb',
  booking_com: 'booking_com',
  other_ota: 'vrbo',         // best-effort default
  manual: 'manual',
};

let _cache: { data: ChannelFeeConfig[]; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

export async function loadChannelFeeConfig(): Promise<ChannelFeeConfig[]> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.data;
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_channel_fees_config').select('*');
  const rows = (data as ChannelFeeConfig[] | null) || [];
  _cache = { data: rows, ts: Date.now() };
  return rows;
}

export async function getChannelFee(
  channel: ChannelBucket
): Promise<ChannelFeeConfig> {
  const all = await loadChannelFeeConfig();
  const key = CHANNEL_BUCKET_TO_CONFIG[channel];
  return (
    all.find(r => r.channel === key) ?? {
      channel: key,
      host_commission_pct: 0,
      guest_service_pct: 0,
      guest_service_min: null,
      guest_service_max: null,
      notes: 'fallback',
    }
  );
}

// Historical-average commission derivation — runs once per cron and stores
// the averages back in beithady_channel_fees_config so subsequent reports
// don't re-derive. Per Q2 ratification.
export async function refreshHistoricalCommissionAverages(): Promise<{
  updated: string[];
}> {
  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('guesty_reservations')
    .select('source, host_payout, guest_paid')
    .gte('check_in_date', new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10))
    .in('status', ['confirmed', 'checked_in', 'checked_out', 'closed']);

  type R = { source: string | null; host_payout: number | null; guest_paid: number | null };
  const list = (rows as R[] | null) || [];

  const buckets = new Map<string, { commission: number[]; count: number }>();
  for (const r of list) {
    if (!r.source || !r.host_payout || !r.guest_paid) continue;
    const ch = (r.source || '').toLowerCase().trim();
    let key: string;
    if (ch.includes('airbnb')) key = 'airbnb';
    else if (ch.includes('booking')) key = 'booking_com';
    else if (/(vrbo|expedia|agoda|hotels)/i.test(ch)) key = 'vrbo';
    else key = 'manual';
    const guest = Number(r.guest_paid);
    const host = Number(r.host_payout);
    if (guest <= 0) continue;
    const commissionPct = ((guest - host) / guest) * 100;
    if (commissionPct < 0 || commissionPct > 50) continue; // sanity
    const b = buckets.get(key) || { commission: [], count: 0 };
    b.commission.push(commissionPct);
    b.count += 1;
    buckets.set(key, b);
  }

  const updated: string[] = [];
  for (const [channel, b] of buckets) {
    if (b.commission.length < 5) continue; // need a sample to trust
    const avg =
      b.commission.reduce((s, x) => s + x, 0) / b.commission.length;
    await sb
      .from('beithady_channel_fees_config')
      .update({
        host_commission_pct: Math.round(avg * 10) / 10,
        notes: `Historical avg from ${b.count} reservations (last 365 d). ${new Date().toISOString().slice(0, 10)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('channel', channel);
    updated.push(`${channel}=${avg.toFixed(1)}%`);
  }
  _cache = null; // invalidate
  return { updated };
}
