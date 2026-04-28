import Link from 'next/link';
import { Globe2, TrendingDown, TrendingUp, Sparkles, ArrowRight, Crown, Gem } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listMarketSignals, countryCoverage } from '@/lib/beithady/market/signals';
import { countryName, flagFor } from '@/lib/beithady/market/countries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { recomputeAction, runBackfillAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function MarketIntelPage() {
  await requireBeithadyPermission('analytics', 'read');

  const [signals, coverage] = await Promise.all([
    listMarketSignals(),
    countryCoverage(),
  ]);

  const underIndexed = signals.filter(s => s.signal_type === 'under_indexed').sort((a, b) => (a.delta_pct ?? 0) - (b.delta_pct ?? 0));
  const overIndexed = signals.filter(s => s.signal_type === 'over_indexed').sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0));
  const uniqueToUs = signals.filter(s => s.signal_type === 'unique_to_us').sort((a, b) => (b.our_share_pct ?? 0) - (a.our_share_pct ?? 0));
  const aligned = signals.filter(s => s.signal_type === 'aligned').sort((a, b) => (b.our_share_pct ?? 0) - (a.our_share_pct ?? 0));

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Analytics', href: '/beithady/analytics' },
      { label: 'Market Intelligence' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Market Intelligence"
        subtitle="Our guest mix vs Egypt's national tourism mix. Under-indexed countries are ad-targeting opportunities; over-indexed are our competitive moat."
        right={
          <div className="flex items-center gap-2 text-xs">
            <form action={runBackfillAction}>
              <button type="submit" className="ix-btn-secondary text-xs">Re-backfill countries</button>
            </form>
            <form action={recomputeAction}>
              <button type="submit" className="ix-btn-primary text-xs">Recompute signals</button>
            </form>
          </div>
        }
      />

      {/* Coverage banner */}
      <div className="ix-card p-4 flex items-center gap-3 text-sm">
        <Globe2 size={18} className="text-emerald-600" />
        <div className="flex-1">
          <span className="font-semibold tabular-nums">{coverage.with_country.toLocaleString()}</span>
          <span className="text-slate-500"> of </span>
          <span className="font-semibold tabular-nums">{coverage.total.toLocaleString()}</span>
          <span className="text-slate-500"> guests have a residence country resolved </span>
          <span className="font-semibold">({coverage.pct}%)</span>
          <span className="text-slate-500"> — phone E.164 + email TLD inference. The gap is guests with no phone/email at all.</span>
        </div>
      </div>

      {/* Strategic signals: 2-col grid for under/over, full row for unique */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SignalSection
          title="Under-indexed — ad targeting opportunity"
          subtitle="They visit Egypt at higher rates than they book with us. Capture them with targeted Meta + Google campaigns in their language."
          icon={TrendingDown}
          accent="amber"
          rows={underIndexed.slice(0, 12)}
        />
        <SignalSection
          title="Over-indexed — our competitive moat"
          subtitle="We capture these markets above the national mix. Worth investigating why and protecting the moat with loyalty + pre-arrival concierge."
          icon={Crown}
          accent="emerald"
          rows={overIndexed.slice(0, 12)}
        />
      </div>

      {uniqueToUs.length > 0 && (
        <SignalSection
          title="Unique to us"
          subtitle="Markets with our presence but not visible in Egypt's national mix. Emerging signals worth watching."
          icon={Gem}
          accent="violet"
          rows={uniqueToUs.slice(0, 8)}
        />
      )}

      {aligned.length > 0 && (
        <details className="ix-card p-4">
          <summary className="cursor-pointer font-semibold text-sm flex items-center gap-2">
            <TrendingUp size={14} className="text-slate-500" />
            Aligned ({aligned.length}) — our share matches the national mix within ±50%
          </summary>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {aligned.slice(0, 24).map(s => (
              <Link
                key={s.id}
                href={`/beithady/analytics/market-intel/${s.origin_country}`}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 hover:bg-stone-50 dark:hover:bg-slate-800/50 text-sm"
              >
                <span>{flagFor(s.origin_country)} {countryName(s.origin_country)}</span>
                <span className="text-xs text-slate-500 tabular-nums">{(s.our_share_pct ?? 0).toFixed(1)}%</span>
              </Link>
            ))}
          </div>
        </details>
      )}

      <p className="text-[11px] text-slate-500 flex items-center gap-2 justify-center">
        <Sparkles size={11} className="text-yellow-600" />
        Click any country card → AI persona brief (Claude haiku-4-5, generated on demand, cached 30 days).
        Inbound baseline: seeded 2024 Egypt national mix; live CAPMAS / UN feed lands in a follow-up.
      </p>
    </BeithadyShell>
  );
}

function SignalSection({
  title,
  subtitle,
  icon: Icon,
  accent,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: 'amber' | 'emerald' | 'violet';
  rows: Array<{ id: string; origin_country: string; our_share_pct: number | null; egypt_share_pct: number | null; delta_pct: number | null }>;
}) {
  const tint = {
    amber: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
    violet: 'bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
  }[accent];
  return (
    <section className="ix-card p-5 space-y-3">
      <header className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl inline-flex items-center justify-center ${tint}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No signals yet. Recompute to populate.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {rows.map(r => (
            <li key={r.id}>
              <Link
                href={`/beithady/analytics/market-intel/${r.origin_country}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-800/50 rounded transition px-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl">{flagFor(r.origin_country)}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{countryName(r.origin_country)}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      Ours: {(r.our_share_pct ?? 0).toFixed(1)}% · Egypt: {(r.egypt_share_pct ?? 0).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-bold tabular-nums ${
                    accent === 'amber' ? 'text-amber-700 dark:text-amber-300' :
                    accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' :
                    'text-violet-700 dark:text-violet-300'
                  }`}>
                    {r.delta_pct == null ? '—' : (r.delta_pct > 0 ? '+' : '') + r.delta_pct.toFixed(1) + 'pp'}
                  </div>
                  <ArrowRight size={12} className="text-slate-400 inline ml-1" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
