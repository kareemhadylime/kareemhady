import Link from 'next/link';
import type { PortfolioCard } from '@/lib/fmplus/budget/portfolio';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

const SERVICE_LABELS: Record<ServiceLine, string> = {
  hk: 'HK',
  mep: 'MEP',
  landscape: 'Landscape',
  security: 'Security',
  pest_ctrl: 'Pest',
  waste_mgmt: 'Waste',
  back_office: 'Back Office',
};

const HEALTH_COLOR: Record<PortfolioCard['health'], string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

function formatM(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M EGP`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} K EGP`;
  return `${n.toFixed(0)} EGP`;
}

export function ContractCard({ card }: { card: PortfolioCard }) {
  const editUrl = `/fmplus/financial/budget/edit?contract=${card.contract_id}&year=${card.current_year_index || 1}`;
  return (
    <Link
      href={editUrl}
      className="block bg-bg-tertiary border border-border rounded-lg p-4 hover:border-accent transition-colors"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-text-primary truncate">{card.project_name}</div>
          <div className="text-[11px] text-text-secondary mt-0.5">
            {card.customer ? `${card.customer} · ` : ''}
            Year tracking: {card.year_tracking}
            {card.total_years > 1 ? ` · ${card.total_years}-year deal` : ''}
          </div>
        </div>
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${HEALTH_COLOR[card.health]}`}
          title={`Health: ${card.health}`}
        ></span>
      </div>

      {/* Service chips */}
      {card.service_lines.length > 0 && (
        <div className="flex flex-wrap gap-1.5 my-2">
          {card.service_lines.map(sl => (
            <span
              key={sl}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                sl === 'back_office'
                  ? 'bg-bg-secondary text-text-secondary border-border'
                  : 'bg-green-500/15 text-green-400 border-green-500/30'
              }`}
            >
              {SERVICE_LABELS[sl]}
            </span>
          ))}
        </div>
      )}

      {/* 3-KPI grid */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div>
          <div className="text-[9px] text-text-secondary uppercase">Year</div>
          <div className="font-semibold text-text-primary text-sm">{card.current_year_label}</div>
        </div>
        <div>
          <div className="text-[9px] text-text-secondary uppercase">Contract</div>
          <div className="font-semibold text-text-primary text-sm tabular-nums">
            {card.contract_value > 0 ? formatM(card.contract_value) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-text-secondary uppercase">Y Revenue</div>
          <div className="font-semibold text-text-primary text-sm tabular-nums">
            {card.current_year_revenue > 0 ? formatM(card.current_year_revenue) : '—'}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border flex justify-between items-center text-[11px] flex-wrap gap-1">
        <span className="text-text-secondary">
          &#9601;&#9602;&#9603;&#9604;&#9605;&#9606;&#9607;&#9608;
          {card.yoy_revenue_change != null && (
            <span className={card.yoy_revenue_change >= 0 ? ' text-green-400' : ' text-amber-400'}>
              {' '}{card.yoy_revenue_change >= 0 ? '+' : ''}{(card.yoy_revenue_change * 100).toFixed(1)}% YoY
            </span>
          )}
        </span>
        {card.mob_total > 0 && card.mob_roi_pct !== null ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/15 text-blue-400">
            Mob ROI: {(card.mob_roi_pct * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-bg-secondary text-text-secondary">
            Mob ROI: n/a
          </span>
        )}
      </div>
    </Link>
  );
}
