import { Crown, RotateCcw } from 'lucide-react';
import type { ThreadGuestStats } from '@/lib/beithady/communication/inbox';

// Q.4 #2 — Guest history badge. Reads beithady_guests lifetime_stays
// and loyalty fields (already populated by the CRM ingest in Phase D).
// Hidden for first-stay guests since the absence of history is itself
// information conveyed by the CRM 360° link in the header.

const TIER_STYLES: Record<string, { dot: string; label: string }> = {
  none:   { dot: 'bg-slate-400',   label: 'New' },
  bronze: { dot: 'bg-amber-700',   label: 'Bronze' },
  silver: { dot: 'bg-slate-400',   label: 'Silver' },
  gold:   { dot: 'bg-yellow-500',  label: 'Gold' },
  platinum: { dot: 'bg-violet-500', label: 'Platinum' },
};

export function GuestHistoryBadge({ stats }: { stats: ThreadGuestStats | null }) {
  if (!stats) return null;
  const stays = stats.lifetime_stays || 0;
  const nights = stats.lifetime_nights || 0;
  if (stays < 1) return null;

  const tier = (stats.loyalty_tier || 'none').toLowerCase();
  const tierMeta = TIER_STYLES[tier] || TIER_STYLES.none;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
      title={`Returning guest · ${stays} stay${stays === 1 ? '' : 's'} · ${nights} nights total`}
    >
      <RotateCcw size={10} />
      <span className="font-semibold">
        {stays} {stays === 1 ? 'past stay' : 'past stays'}
      </span>
      <span className="text-slate-400 dark:text-slate-500">·</span>
      <span>{nights}n total</span>
      {stats.vip && <Crown size={10} className="text-amber-500" />}
      {tier !== 'none' && (
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${tierMeta.dot}`} />
          {tierMeta.label}
        </span>
      )}
    </span>
  );
}
