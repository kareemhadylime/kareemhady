import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type SignalType = 'under_indexed' | 'over_indexed' | 'unique_to_us' | 'aligned';

export type MarketSignal = {
  id: string;
  signal_type: SignalType;
  origin_country: string;
  our_share_pct: number | null;
  egypt_share_pct: number | null;
  delta_pct: number | null;
  ai_persona: string | null;
  ai_persona_lang: string | null;
  ai_persona_at: string | null;
  computed_at: string;
};

export async function listMarketSignals(): Promise<MarketSignal[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_market_signals')
    .select('*')
    .order('signal_type', { ascending: true })
    .order('our_share_pct', { ascending: false, nullsFirst: false })
    .limit(500);
  return (data as MarketSignal[] | null) || [];
}

export async function getSignalForCountry(country: string): Promise<MarketSignal | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_market_signals')
    .select('*')
    .eq('origin_country', country.toUpperCase())
    .maybeSingle();
  return (data as MarketSignal | null) || null;
}

export async function ourGuestCountByCountry(country: string): Promise<{ total: number; returning: number; lifetime_spend_usd: number }> {
  const sb = supabaseAdmin();
  const c = country.toUpperCase();
  const [{ count: total }, { count: returning }, { data: spendRow }] = await Promise.all([
    sb.from('beithady_guests').select('id', { count: 'exact', head: true }).eq('residence_country', c),
    sb.from('beithady_guests').select('id', { count: 'exact', head: true }).eq('residence_country', c).gte('lifetime_stays', 2),
    sb.from('beithady_guests').select('lifetime_spend_usd').eq('residence_country', c),
  ]);
  const spend = ((spendRow as Array<{ lifetime_spend_usd: number }> | null) || []).reduce(
    (s, r) => s + (Number(r.lifetime_spend_usd) || 0),
    0
  );
  return {
    total: total ?? 0,
    returning: returning ?? 0,
    lifetime_spend_usd: Math.round(spend),
  };
}

// Recompute signals on demand (used by the cron + manual refresh)
export async function recomputeSignals(): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('beithady_compute_market_signals');
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

// Backfill residence_country (used by Phase G migration + on demand)
export async function runCountryBackfill(): Promise<{
  guests_total: number;
  before_count: number;
  after_count: number;
  by_phone: number;
  by_email: number;
}> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('beithady_backfill_residence_country');
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number>;
  return {
    guests_total: row?.guests_total ?? 0,
    before_count: row?.before_count ?? 0,
    after_count: row?.after_count ?? 0,
    by_phone: row?.by_phone ?? 0,
    by_email: row?.by_email ?? 0,
  };
}

// Coverage stat for the dashboard
export async function countryCoverage(): Promise<{ with_country: number; total: number; pct: number }> {
  const sb = supabaseAdmin();
  const [{ count: total }, { count: withCountry }] = await Promise.all([
    sb.from('beithady_guests').select('id', { count: 'exact', head: true }),
    sb.from('beithady_guests').select('id', { count: 'exact', head: true }).not('residence_country', 'is', null),
  ]);
  const t = total ?? 0;
  const w = withCountry ?? 0;
  return { with_country: w, total: t, pct: t > 0 ? Math.round((w / t) * 100) : 0 };
}
