import { Building2 } from 'lucide-react';
import type { CalendarRow } from '@/lib/beithady/operations/types';

const DOT_COLOR: Record<CalendarRow['status_dot'], string> = {
  red: 'bg-rose-500',
  orange: 'bg-orange-500',
  yellow: 'bg-amber-500',
  green: 'bg-emerald-500',
  purple: 'bg-violet-500',
  gray: 'bg-slate-300 dark:bg-slate-600',
};

const DOT_TITLE: Record<CalendarRow['status_dot'], string> = {
  red: 'Unpaid · check-in within 7 days',
  orange: 'Action needed soon',
  yellow: 'Pre-arrival message pending',
  green: 'Healthy',
  purple: 'VIP / Gold / Platinum guest arriving',
  gray: 'No upcoming reservation',
};

export function ListingRail({ row }: { row: CalendarRow }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-white dark:bg-slate-900 z-[5] min-w-0">
      <span
        className={`shrink-0 inline-block w-2 h-2 rounded-full ${DOT_COLOR[row.status_dot]}`}
        title={DOT_TITLE[row.status_dot]}
      />
      <div className="shrink-0 w-9 h-9 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
        {row.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.cover_url}
            alt={row.nickname}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Building2 size={16} className="text-slate-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--bh-navy)' }}>
          {row.nickname}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          {row.building_code && (
            <span className="px-1 py-px bg-slate-100 dark:bg-slate-800 rounded">{row.building_code}</span>
          )}
          {row.base_price_usd != null && (
            <span className="tabular-nums">${Math.round(row.base_price_usd)}/night</span>
          )}
        </div>
      </div>
    </div>
  );
}
