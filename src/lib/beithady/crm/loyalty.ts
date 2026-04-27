// Loyalty tier ladder. Phase B reads from this hardcoded constant;
// Phase F migrates these to the beithady_loyalty_config table so the
// thresholds + perks become editable in Settings without a deploy.

export type LoyaltyTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

export type LoyaltyTierConfig = {
  tier: LoyaltyTier;
  label: string;
  emoji: string;
  min_stays: number;
  display_color: string;          // hex used by tier badges
  perks: {
    late_checkout?: boolean;
    upgrade_when_available?: boolean;
    welcome_gift?: boolean;
    vip_flag?: boolean;
    direct_book_discount_pct?: number;
  };
};

export const LOYALTY_TIERS: LoyaltyTierConfig[] = [
  {
    tier: 'none',
    label: 'New',
    emoji: '·',
    min_stays: 0,
    display_color: '#94A3B8',
    perks: {},
  },
  {
    tier: 'bronze',
    label: 'Bronze',
    emoji: '🥉',
    min_stays: 2,
    display_color: '#CD7F32',
    perks: { late_checkout: true },
  },
  {
    tier: 'silver',
    label: 'Silver',
    emoji: '🥈',
    min_stays: 4,
    display_color: '#C0C0C0',
    perks: { late_checkout: true, upgrade_when_available: true },
  },
  {
    tier: 'gold',
    label: 'Gold',
    emoji: '🥇',
    min_stays: 6,
    display_color: '#D4A93A',
    perks: { late_checkout: true, upgrade_when_available: true, welcome_gift: true },
  },
  {
    tier: 'platinum',
    label: 'Platinum',
    emoji: '💎',
    min_stays: 10,
    display_color: '#E5E4E2',
    perks: {
      late_checkout: true,
      upgrade_when_available: true,
      welcome_gift: true,
      vip_flag: true,
      direct_book_discount_pct: 10,
    },
  },
];

export function tierForStays(stays: number): LoyaltyTier {
  // Walk descending so we pick the highest tier whose threshold is satisfied.
  for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
    if (stays >= LOYALTY_TIERS[i].min_stays) return LOYALTY_TIERS[i].tier;
  }
  return 'none';
}

export function tierConfig(tier: LoyaltyTier): LoyaltyTierConfig {
  return LOYALTY_TIERS.find(t => t.tier === tier) ?? LOYALTY_TIERS[0];
}

// Bronze+ qualifies as "returning"
export function isReturning(stays: number): boolean {
  return stays >= 2;
}
