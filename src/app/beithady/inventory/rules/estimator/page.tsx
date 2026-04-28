import Link from 'next/link';
import { Sparkles, Bed, Bath, Users, ChevronRight, AlertTriangle, ShoppingBag } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listUnitConfigSummaries, type UnitConfigSummary } from '@/lib/beithady/inventory/estimator';
import { TIER_LABEL, ESTIMATOR_GROUP_LABEL } from '@/lib/beithady/inventory/estimator-shared';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function EstimatorLandingPage() {
  await requireBeithadyPermission('inventory', 'read');
  const summaries = await listUnitConfigSummaries();

  const grandLineCount = summaries.reduce((s, x) => s + x.line_count, 0);
  const totalListings = summaries.reduce((s, x) => s + x.listing_count, 0);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Inventory', href: '/beithady/inventory' },
      { label: 'Rules', href: '/beithady/inventory/rules' },
      { label: 'Housekeeping Estimator' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Estimator"
        title="Housekeeping Setup Matrix"
        subtitle="Per-checkin items needed by unit configuration. Items + qty scale with bedrooms · bathrooms · guest count. Click a row to edit lines + source from Amazon EG."
      />

      {/* KPI strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <KpiCard label="Unit configurations" value={String(summaries.length)} tone="neutral" />
        <KpiCard label="Items per config (avg)" value={summaries.length > 0 ? String(Math.round(grandLineCount / summaries.length)) : '0'} tone="neutral" />
        <KpiCard label="Listings mapped" value={String(totalListings)} tone="neutral" />
        <KpiCard label="Total covered" value={`${summaries.filter(s => s.listing_count > 0).length}/${summaries.length} configs in use`} tone="neutral" />
      </section>

      {/* Group legend */}
      <section className="ix-card p-4">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-semibold mb-2">
          Categories tracked
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {Object.entries(ESTIMATOR_GROUP_LABEL).map(([key, label]) => (
            <span key={key} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <span>{label.emoji}</span>
              <span>{label.en}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Matrix */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--bh-heading)' }}>
          Unit configurations
        </h2>

        {summaries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="ix-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left py-2 px-4">Configuration</th>
                  <th className="text-left py-2 px-3">Tier</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Bedrooms</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Bathrooms</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Guests</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Items</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Listings</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Total / check-in</th>
                  <th className="text-right py-2 px-3 whitespace-nowrap">Per guest</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(s => <ConfigRow key={s.config.id} s={s} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ix-card p-4 border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-2 text-xs">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="text-slate-700 dark:text-slate-200">
            <strong className="text-amber-700 dark:text-amber-300">Bathroom counts need manual verification.</strong>{' '}
            Pricelabs + Guesty don&apos;t expose bathroom data — every listing is auto-assigned by bedroom count only and flagged <code>needs_review</code> until an admin confirms the bathroom count via the per-listing override panel (M.15.3 ships next).
          </div>
        </div>
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Phase M.15 · Housekeeping Estimator · M.15.1 + M.15.2 deployed
      </footer>
    </BeithadyShell>
  );
}

function ConfigRow({ s }: { s: UnitConfigSummary }) {
  const tierLabel = TIER_LABEL[s.config.tier].en;
  const tierCls = s.config.tier === 'vip'
    ? 'bg-gold-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
    : s.config.tier === 'premium'
      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const total = s.total_per_checkin_egp;
  const perGuest = s.config.guest_capacity > 0 ? total / s.config.guest_capacity : 0;

  return (
    <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
      <td className="py-3 px-4">
        <Link href={`/beithady/inventory/rules/estimator/${s.config.id}`} className="ix-link font-medium" style={{ color: 'var(--bh-heading)' }}>
          {s.config.name_en}
        </Link>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{s.config.code}</div>
      </td>
      <td className="py-3 px-3">
        <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${tierCls}`}>
          {tierLabel}
        </span>
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        <span className="inline-flex items-center gap-1 justify-end"><Bed size={11} className="text-slate-400" /> {s.config.bedrooms}</span>
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        <span className="inline-flex items-center gap-1 justify-end"><Bath size={11} className="text-slate-400" /> {s.config.bathrooms.toFixed(1)}</span>
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        <span className="inline-flex items-center gap-1 justify-end"><Users size={11} className="text-slate-400" /> {s.config.guest_capacity}</span>
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        <span className="inline-flex items-center gap-1 justify-end"><ShoppingBag size={11} className="text-slate-400" /> {s.line_count}</span>
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        {s.listing_count}
      </td>
      <td className="py-3 px-3 text-right tabular-nums font-semibold" style={{ color: 'var(--bh-heading)' }}>
        {total > 0 ? `${total.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP` : '—'}
      </td>
      <td className="py-3 px-3 text-right tabular-nums text-slate-500 dark:text-slate-300 text-xs">
        {perGuest > 0 ? `${perGuest.toFixed(0)} EGP` : '—'}
      </td>
      <td className="py-3 px-3 text-right">
        <Link
          href={`/beithady/inventory/rules/estimator/${s.config.id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          Edit <ChevronRight size={11} />
        </Link>
      </td>
    </tr>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: 'neutral' }) {
  void tone;
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300">{label}</div>
      <div className="text-lg font-bold tabular-nums text-slate-700 dark:text-slate-100">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
      <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
        <Sparkles size={24} strokeWidth={2.2} />
      </div>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--bh-heading)' }}>
        No unit configurations seeded yet
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-300">
        Run migration <code>0052d_seed_unit_configs_categories_uoms_items_rules.sql</code> to populate the matrix.
      </p>
    </div>
  );
}
