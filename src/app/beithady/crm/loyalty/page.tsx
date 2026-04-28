import { Crown, Sparkles, RefreshCw, Users } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getLoyaltyTiers } from '@/lib/beithady/engagement/loyalty-config';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { runLoyaltyTickAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function LoyaltyPage() {
  await requireBeithadyPermission('crm', 'read');
  const sb = supabaseAdmin();

  const [tiers, { data: counts }] = await Promise.all([
    getLoyaltyTiers(),
    sb.from('beithady_guests').select('loyalty_tier'),
  ]);

  const countByTier = new Map<string, number>();
  for (const r of (counts as Array<{ loyalty_tier: string }> | null) || []) {
    countByTier.set(r.loyalty_tier, (countByTier.get(r.loyalty_tier) || 0) + 1);
  }
  const totalGuests = (counts as Array<unknown> | null)?.length || 0;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'CRM', href: '/beithady/crm' },
      { label: 'Loyalty' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Loyalty"
        title="Loyalty tiers"
        subtitle="Auto-tier on lifetime stays. Tier promotions trigger an automated WhatsApp congrats. Platinum guests are auto-promoted to VIP."
        right={
          <form action={runLoyaltyTickAction}>
            <button type="submit" className="ix-btn-secondary text-xs">
              <RefreshCw size={12} /> Recompute now
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {tiers.map(t => {
          const cnt = countByTier.get(t.tier) || 0;
          const pct = totalGuests > 0 ? Math.round((cnt / totalGuests) * 100) : 0;
          const perks = Object.entries(t.perks).filter(([, v]) => !!v);
          return (
            <div key={t.tier} className="ix-card p-5 space-y-3 relative overflow-hidden">
              <div
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 blur-2xl"
                style={{ backgroundColor: t.display_color }}
              />
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-xl inline-flex items-center justify-center text-2xl"
                  style={{ backgroundColor: t.display_color + '20', color: t.display_color }}
                >
                  {t.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold" style={{ color: 'var(--bh-navy)' }}>
                      {t.label}
                    </h3>
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      ≥ {t.min_stays} stays
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    <span className="font-semibold tabular-nums">{cnt.toLocaleString()}</span> guests · {pct}% of base
                  </div>
                </div>
              </div>
              {perks.length > 0 ? (
                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                  {perks.map(([k, v]) => (
                    <li key={k} className="flex items-center gap-2">
                      <Sparkles size={10} style={{ color: t.display_color }} />
                      {prettyPerk(k, v)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                  No perks at this tier.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="ix-card p-4 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <Crown size={14} className="text-yellow-600" />
        Tier thresholds + perks + congrats templates are stored in
        <code>beithady_loyalty_config</code> and editable via Supabase Studio.
        <Users size={14} className="text-slate-400 ml-2" />
        Recompute happens nightly at 06:00 Cairo via the
        <code>beithady-loyalty-tick</code> cron.
      </div>
    </BeithadyShell>
  );
}

function prettyPerk(key: string, value: unknown): string {
  if (key === 'late_checkout') return 'Late checkout when available';
  if (key === 'upgrade_when_available') return 'Free upgrade when available';
  if (key === 'welcome_gift') return 'Welcome gift on arrival';
  if (key === 'vip_flag') return 'VIP concierge';
  if (key === 'direct_book_discount_pct') return `${value}% off direct rebookings`;
  return `${key}: ${String(value)}`;
}
