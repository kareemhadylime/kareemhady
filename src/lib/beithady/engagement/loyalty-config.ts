import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { LOYALTY_TIERS as STATIC_TIERS, type LoyaltyTier, type LoyaltyTierConfig } from '@/lib/beithady/crm/loyalty';

// Reads loyalty tier config from beithady_loyalty_config (Phase F).
// Falls back to the hardcoded LOYALTY_TIERS constant when the DB
// table is empty (defensive — Phase F migration seeds it). Cached
// per cold-start since tiers rarely change.

let _cache: { rows: LoyaltyTierConfig[]; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getLoyaltyTiers(): Promise<LoyaltyTierConfig[]> {
  if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) return _cache.rows;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_loyalty_config')
    .select('tier, label, emoji, min_stays, perks, display_color, message_template')
    .order('min_stays', { ascending: true });
  const rows = (data as Array<{
    tier: LoyaltyTier;
    label: string;
    emoji: string | null;
    min_stays: number;
    perks: Record<string, unknown>;
    display_color: string | null;
  }> | null) || null;
  if (!rows || rows.length === 0) {
    _cache = { rows: STATIC_TIERS, loadedAt: Date.now() };
    return STATIC_TIERS;
  }
  const mapped: LoyaltyTierConfig[] = rows.map(r => ({
    tier: r.tier,
    label: r.label,
    emoji: r.emoji ?? '·',
    min_stays: r.min_stays,
    display_color: r.display_color ?? '#94A3B8',
    perks: r.perks as LoyaltyTierConfig['perks'],
  }));
  _cache = { rows: mapped, loadedAt: Date.now() };
  return mapped;
}

export function clearLoyaltyCache(): void {
  _cache = null;
}

export async function getMessageTemplate(tier: LoyaltyTier): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_loyalty_config')
    .select('message_template')
    .eq('tier', tier)
    .maybeSingle();
  return (data as { message_template: string | null } | null)?.message_template ?? null;
}
