import Link from 'next/link';
import { ChevronLeft, Sparkles, Users, Crown, RotateCw } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getSignalForCountry, ourGuestCountByCountry } from '@/lib/beithady/market/signals';
import { getOrGeneratePersona, isStale } from '@/lib/beithady/market/persona';
import { countryName, flagFor } from '@/lib/beithady/market/countries';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { regenPersonaAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SIGNAL_BADGE: Record<string, string> = {
  under_indexed: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  over_indexed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  unique_to_us: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
  aligned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

export default async function CountryDrillPage({ params }: { params: Promise<{ country: string }> }) {
  await requireBeithadyPermission('analytics', 'read');
  const { country } = await params;
  const c = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) notFound();

  const [signal, guestCount, personaResult] = await Promise.all([
    getSignalForCountry(c),
    ourGuestCountByCountry(c),
    getOrGeneratePersona(c),
  ]);
  if (!signal) notFound();

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Analytics', href: '/beithady/analytics' },
      { label: 'Market Intelligence', href: '/beithady/analytics/market-intel' },
      { label: countryName(c) },
    ]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Market Intelligence"
        title={`${flagFor(c)} ${countryName(c)}`}
        subtitle={`Strategic signal classification: ${signal.signal_type.replace('_', ' ')}.`}
        right={
          <Link href="/beithady/analytics/market-intel" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All countries
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Our share" value={`${(signal.our_share_pct ?? 0).toFixed(1)}%`} />
        <Stat label="Egypt national share" value={`${(signal.egypt_share_pct ?? 0).toFixed(1)}%`} />
        <Stat
          label="Delta (us − Egypt)"
          value={signal.delta_pct == null ? '—' : `${signal.delta_pct > 0 ? '+' : ''}${signal.delta_pct.toFixed(1)}pp`}
          accent={signal.delta_pct == null ? undefined : signal.delta_pct > 0 ? 'emerald' : 'amber'}
        />
        <Stat label="Signal" value={signal.signal_type.replace('_', ' ')} signalBadge={SIGNAL_BADGE[signal.signal_type]} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Our guests" value={guestCount.total.toLocaleString()} icon={Users} />
        <Stat label="Returning" value={guestCount.returning.toLocaleString()} icon={Crown} />
        <Stat label="Lifetime spend USD" value={`$${guestCount.lifetime_spend_usd.toLocaleString()}`} />
      </div>

      <section className="ix-card p-6 space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="font-semibold">AI persona brief</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Claude haiku-4-5. Cached 30 days.
                {signal.ai_persona_at && (
                  <span> Last updated {new Date(signal.ai_persona_at).toLocaleDateString()} ({isStale(signal.ai_persona_at) ? 'stale' : 'fresh'}).</span>
                )}
              </p>
            </div>
          </div>
          <form action={regenPersonaAction.bind(null, c)}>
            <button type="submit" className="ix-btn-secondary text-xs">
              <RotateCw size={12} /> Regenerate
            </button>
          </form>
        </header>
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-200">
          {personaResult.persona || (
            <em className="text-slate-500">
              Persona not yet generated. Click "Regenerate" — typically takes ~2s and costs ~$0.001.
            </em>
          )}
        </div>
        {personaResult.generated && (
          <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
            ✓ Just generated and cached.
          </p>
        )}
      </section>

      <section className="ix-card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Next actions</h3>
        <ul className="text-sm space-y-1 text-slate-600 dark:text-slate-300 list-disc pl-5">
          {signal.signal_type === 'under_indexed' && (
            <>
              <li>Spawn a Meta CTWA campaign targeting {countryName(c)} (Phase H)</li>
              <li>Translate top 5 listing titles + descriptions into the local language</li>
              <li>Add country-specific upsell items (cuisine prefs, language hosts)</li>
            </>
          )}
          {signal.signal_type === 'over_indexed' && (
            <>
              <li>Audit returning-guest rate vs national average — protect the moat</li>
              <li>Activate VIP tier perks for top spenders from {countryName(c)}</li>
              <li>Solicit testimonials in their language for landing pages</li>
            </>
          )}
          {signal.signal_type === 'unique_to_us' && (
            <>
              <li>Investigate referral patterns — how do {countryName(c)} guests find us?</li>
              <li>Capture the channel + double down before competitors notice</li>
            </>
          )}
          {signal.signal_type === 'aligned' && (
            <>
              <li>Maintain current spend — performance is on par with national mix</li>
              <li>Watch monthly delta for trend changes</li>
            </>
          )}
          <li>
            <Link href={`/beithady/crm?country=${c}`} className="ix-link">
              View {guestCount.total} {countryName(c)} guests in CRM →
            </Link>
          </li>
        </ul>
      </section>
    </BeithadyShell>
  );
}

function Stat({
  label,
  value,
  accent,
  icon: Icon,
  signalBadge,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'amber';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  signalBadge?: string;
}) {
  const cls = accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : accent === 'amber' ? 'text-amber-700 dark:text-amber-300'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
        {Icon && <Icon size={10} />}
        {label}
      </div>
      {signalBadge ? (
        <div className="mt-1">
          <span className={`text-xs uppercase tracking-wide font-semibold px-2 py-0.5 rounded ${signalBadge}`}>
            {value}
          </span>
        </div>
      ) : (
        <div className={`text-xl font-bold tabular-nums mt-0.5 ${cls}`}>{value}</div>
      )}
    </div>
  );
}
