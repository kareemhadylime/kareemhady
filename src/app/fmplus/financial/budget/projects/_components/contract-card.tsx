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
    <div
      className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-indigo-500 transition-colors"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-2 gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{card.project_name}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
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
                  ? 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  : 'bg-emerald-100 dark:bg-green-500/15 text-emerald-700 dark:text-green-400 border-emerald-200 dark:border-green-500/30'
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
          <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Year</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{card.current_year_label}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Contract</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm tabular-nums">
            {card.contract_value > 0 ? formatM(card.contract_value) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Y Revenue</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm tabular-nums">
            {card.current_year_revenue > 0 ? formatM(card.current_year_revenue) : '—'}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-[11px] flex-wrap gap-1">
        <span className="text-slate-500 dark:text-slate-400">
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
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            Mob ROI: n/a
          </span>
        )}
      </div>

      {/* Action row */}
      <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex gap-2 items-center">
        <Link href={editUrl}
          className="text-[11px] flex-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-center font-semibold">
          Open Editor
        </Link>
        <Link href={`/fmplus/financial/budget/projects/${card.contract_id}`}
          className="text-[11px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded font-semibold inline-flex items-center gap-1"
          title="Edit contract metadata, manage services, delete">
          &#9881; Edit
        </Link>
      </div>
    </div>
  );
}
