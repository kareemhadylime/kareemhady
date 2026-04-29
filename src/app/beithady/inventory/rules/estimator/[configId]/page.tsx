import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Bed, Bath, Users, ChevronLeft, ExternalLink, Pencil, Info } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { computeEstimatorOutput } from '@/lib/beithady/inventory/estimator';
import {
  TIER_LABEL,
  ESTIMATOR_GROUP_LABEL,
  FORMULA_KIND_LABEL,
  SCOPE_LABEL,
  AMAZON_STATUS_LABEL,
  type EstimatorCategoryGroup,
  type EstimatorLine,
} from '@/lib/beithady/inventory/estimator-shared';
import { BeithadyShell, BeithadyHeader } from '../../../../_components/beithady-shell';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GROUP_ORDER: EstimatorCategoryGroup[] = ['cleaning', 'sanitary', 'tray', 'linen', 'branded', 'misc'];

export default async function EstimatorConfigDetailPage({
  params,
}: {
  params: Promise<{ configId: string }>;
}) {
  await requireBeithadyPermission('inventory', 'read');
  const { configId } = await params;

  const output = await computeEstimatorOutput(configId);
  if (!output) notFound();

  const { unit_config: config, lines, totals_by_group, total_per_checkin_egp, total_per_guest_egp } = output;
  const tierLabel = TIER_LABEL[config.tier].en;
  const tierCls =
    config.tier === 'vip'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
      : config.tier === 'premium'
        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';

  const linesByGroup = new Map<EstimatorCategoryGroup, EstimatorLine[]>();
  for (const l of lines) {
    if (!linesByGroup.has(l.group)) linesByGroup.set(l.group, []);
    linesByGroup.get(l.group)!.push(l);
  }

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Rules', href: '/beithady/inventory/rules' },
        { label: 'Housekeeping Estimator', href: '/beithady/inventory/rules/estimator' },
        { label: config.code },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow={`Beit Hady · Inventory · Estimator · ${config.code}`}
        title={config.name_en}
        subtitle={`Per-checkin item breakdown for this configuration. Lines come from consumption rules; the most-specific rule wins (listing > unit_config > category > building > global).`}
        right={
          <Link
            href="/beithady/inventory/rules/estimator"
            className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <ChevronLeft size={12} /> Back to matrix
          </Link>
        }
      />

      {/* Config summary strip */}
      <section className="ix-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-700 dark:text-slate-200">
          <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${tierCls}`}>
            {tierLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bed size={12} className="text-slate-400" /> {config.bedrooms} bedroom{config.bedrooms === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath size={12} className="text-slate-400" /> {config.bathrooms.toFixed(1)} bathroom{config.bathrooms === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={12} className="text-slate-400" /> {config.guest_capacity} guests
          </span>
          <code className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{config.code}</code>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300">Total / check-in</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--bh-heading)' }}>
              {total_per_checkin_egp > 0
                ? `${total_per_checkin_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`
                : '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300">Per guest</div>
            <div className="text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-100">
              {total_per_guest_egp > 0 ? `${total_per_guest_egp.toFixed(0)} EGP` : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* Group totals */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
        {GROUP_ORDER.map(g => {
          const label = ESTIMATOR_GROUP_LABEL[g];
          const value = totals_by_group[g] || 0;
          const count = (linesByGroup.get(g) || []).length;
          return (
            <div key={g} className="ix-card p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300">
                <span>{label.emoji}</span>
                <span>{label.en}</span>
              </div>
              <div className="text-base font-bold tabular-nums text-slate-700 dark:text-slate-100 mt-1">
                {value > 0 ? `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP` : '—'}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {count} item{count === 1 ? '' : 's'}
              </div>
            </div>
          );
        })}
      </section>

      {/* Edit hint */}
      <section className="ix-card p-3 border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/20">
        <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
          <Info size={14} className="text-cyan-600 dark:text-cyan-300 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-700 dark:text-cyan-200">Editing lines:</strong>{' '}
            quantities and formulas live in the consumption-rules table. To override a value for this configuration only, add a new rule with scope <code>unit_config</code> and scope-value <code className="font-mono">{config.id}</code> on the{' '}
            <Link href="/beithady/inventory/rules" className="ix-link underline">
              consumption rules page
            </Link>
            . Per-listing tweaks use the listing override panel (M.15.3, ships next).
          </div>
        </div>
      </section>

      {/* Lines grouped by category */}
      {lines.length === 0 ? (
        <section className="ix-card p-10 text-center text-sm text-slate-500 dark:text-slate-300">
          No active consumption rules resolve to items for this configuration. Add rules on the{' '}
          <Link href="/beithady/inventory/rules" className="ix-link underline">
            rules page
          </Link>{' '}
          and refresh.
        </section>
      ) : (
        GROUP_ORDER.map(g => {
          const groupLines = linesByGroup.get(g) || [];
          if (groupLines.length === 0) return null;
          const label = ESTIMATOR_GROUP_LABEL[g];
          const groupTotal = totals_by_group[g] || 0;

          return (
            <section key={g} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--bh-heading)' }}>
                  <span>{label.emoji}</span>
                  <span>{label.en}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal normal-case">
                    {groupLines.length} item{groupLines.length === 1 ? '' : 's'}
                  </span>
                </h2>
                <div className="text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-100">
                  {groupTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP
                </div>
              </div>

              <div className="ix-card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="text-left py-2 px-3">Item</th>
                      <th className="text-left py-2 px-3">Formula</th>
                      <th className="text-right py-2 px-3 whitespace-nowrap">Base qty</th>
                      <th className="text-right py-2 px-3 whitespace-nowrap">Computed</th>
                      <th className="text-right py-2 px-3 whitespace-nowrap">Loss %</th>
                      <th className="text-right py-2 px-3 whitespace-nowrap">Effective</th>
                      <th className="text-right py-2 px-3 whitespace-nowrap">Unit cost</th>
                      <th className="text-right py-2 px-3 whitespace-nowrap">Line total</th>
                      <th className="text-left py-2 px-3 whitespace-nowrap">Source</th>
                      <th className="text-left py-2 px-3 whitespace-nowrap">Rule scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupLines.map(l => <LineRow key={l.item_id} l={l} />)}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Phase M.15 · Housekeeping Estimator · per-config breakdown
      </footer>
    </BeithadyShell>
  );
}

function LineRow({ l }: { l: EstimatorLine }) {
  const scopeCls =
    l.rule_scope === 'unit_config'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
      : l.rule_scope === 'listing'
        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'
        : l.rule_scope === 'category'
          ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200'
          : l.rule_scope === 'building'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

  const amazonStatus = l.amazon_eg_status;
  const amazonMeta = amazonStatus ? AMAZON_STATUS_LABEL[amazonStatus] : null;
  const amazonToneCls =
    amazonMeta?.tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
      : amazonMeta?.tone === 'warn'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
        : amazonMeta?.tone === 'err'
          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
          : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

  return (
    <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
      <td className="py-2 px-3">
        <div className="font-mono text-[11px] text-slate-700 dark:text-slate-200">{l.item_sku}</div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[220px]">{l.item_name_en}</div>
      </td>
      <td className="py-2 px-3 text-[11px] text-slate-600 dark:text-slate-300">
        {FORMULA_KIND_LABEL[l.formula_kind]}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        {fmtQty(l.base_qty)} <span className="text-[10px] text-slate-400">{l.uom}</span>
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        {fmtQty(l.computed_qty)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
        {l.loss_factor_pct > 0 ? `${l.loss_factor_pct}%` : '—'}
      </td>
      <td className="py-2 px-3 text-right tabular-nums font-medium text-slate-700 dark:text-slate-100">
        {fmtQty(l.effective_qty)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
        {l.unit_cost_egp > 0 ? `${l.unit_cost_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP` : '—'}
      </td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: 'var(--bh-heading)' }}>
        {l.line_total_egp > 0 ? `${l.line_total_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP` : '—'}
      </td>
      <td className="py-2 px-3">
        {l.amazon_eg_url ? (
          <a
            href={l.amazon_eg_url}
            target="_blank"
            rel="noreferrer noopener"
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${amazonToneCls} hover:underline`}
            title={amazonMeta?.en || 'Amazon EG'}
          >
            Amazon EG
            <ExternalLink size={10} />
          </a>
        ) : (
          <span className="text-[10px] text-slate-400 italic">No source</span>
        )}
      </td>
      <td className="py-2 px-3">
        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${scopeCls}`}>
          {l.rule_scope === 'unit_config' && <Pencil size={9} />}
          {SCOPE_LABEL[l.rule_scope].split(' ')[0]}
        </span>
      </td>
    </tr>
  );
}

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < 0.01) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
