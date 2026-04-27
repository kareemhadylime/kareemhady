import { Crown, CheckCircle2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { LOYALTY_TIERS } from '@/lib/beithady/crm/loyalty';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

const PERK_LABELS: Record<string, string> = {
  late_checkout: 'Late checkout when available',
  upgrade_when_available: 'Free unit upgrade when available',
  welcome_gift: 'Branded welcome gift on arrival',
  vip_flag: 'Auto-flagged VIP across all channels',
  direct_book_discount_pct: 'Direct rebooking discount',
};

export default async function BeithadyLoyaltyPage() {
  await requireBeithadyPermission('crm', 'read');
  const sb = supabaseAdmin();

  // Per-tier counts (single roundtrip, all 5 buckets).
  const tiers = ['none', 'bronze', 'silver', 'gold', 'platinum'] as const;
  const counts = await Promise.all(
    tiers.map(async t => {
      const { count } = await sb
        .from('beithady_guests')
        .select('id', { count: 'exact', head: true })
        .eq('loyalty_tier', t);
      return { tier: t, count: count ?? 0 };
    })
  );
  const countsByTier = new Map(counts.map(c => [c.tier, c.count]));

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'CRM', href: '/emails/beithady/crm' },
      { label: 'Loyalty' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Loyalty"
        title="Loyalty tiers"
        subtitle="Read-only in Phase B — auto-promotion runs in the daily CRM sync. Phase F adds the per-tier perk editor and welcome-gift workflow."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {LOYALTY_TIERS.map(t => {
          const count = countsByTier.get(t.tier) ?? 0;
          const perks = Object.entries(t.perks).filter(([, v]) => v);
          return (
            <div key={t.tier} className="ix-card p-5 space-y-3 relative overflow-hidden">
              <div
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 blur-2xl pointer-events-none"
                style={{ backgroundColor: t.display_color }}
              />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-3xl">{t.emoji}</div>
                  <h2 className="font-semibold mt-1" style={{ color: t.display_color }}>{t.label}</h2>
                  <p className="text-xs text-slate-500">≥ {t.min_stays} stay{t.min_stays === 1 ? '' : 's'}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">Guests</div>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
                    {count.toLocaleString()}
                  </div>
                </div>
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                {perks.length === 0 ? (
                  <li className="italic text-slate-400">No perks at this tier</li>
                ) : (
                  perks.map(([k, v]) => (
                    <li key={k} className="flex items-start gap-2">
                      <CheckCircle2 size={12} className="text-emerald-600 mt-0.5 shrink-0" />
                      <span>
                        {PERK_LABELS[k] || k}
                        {k === 'direct_book_discount_pct' && typeof v === 'number' ? ` (${v}%)` : ''}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="ix-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Crown size={14} className="text-yellow-600" />
          How tiers are assigned
        </h2>
        <ol className="text-sm text-slate-700 dark:text-slate-200 space-y-1 list-decimal pl-5">
          <li>Daily CRM sync (07:30 / 08:30 Cairo) recomputes <code>lifetime_stays</code> from completed/active reservations in Guesty.</li>
          <li>Tier is set to the highest tier whose <code>min_stays</code> threshold is met.</li>
          <li>Platinum guests are also auto-flagged VIP.</li>
          <li>Phase F lights up: tier-change WhatsApp message · welcome-gift dispatch · per-tier upsell offers · direct-rebook discount link.</li>
        </ol>
      </div>
    </BeithadyShell>
  );
}
