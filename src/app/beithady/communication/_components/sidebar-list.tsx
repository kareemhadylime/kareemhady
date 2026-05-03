import Link from 'next/link';
import { Mail, MessageCircle, Smartphone, Activity, CalendarDays } from 'lucide-react';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import type { InboxRow } from '@/lib/beithady/communication/inbox';
import type { SlaBucket } from '@/lib/beithady/communication/sla';
import { fmtDateRange } from '@/lib/beithady/communication/reservation-status';
import { SlaPill } from './sla-pill';
import { SidebarScrollRestore } from './sidebar-scroll-restore';

const SOURCE_BADGES: Record<string, string> = {
  airbnb2: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  airbnb: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  'booking.com': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  direct: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  manual: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  vrbo: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
};

// "Awaiting reply" left-edge stripe + inline pill — only renders when
// the guest sent the last message AND we haven't replied yet
// (sla_age_seconds !== null). Stripe + pill colors track the SLA
// bucket so the urgency is conveyed at a glance:
//   green ≤ 1h, yellow 1-4h, orange 4-12h, red > 12h.
const AWAITING_STRIPE: Record<NonNullable<SlaBucket>, string> = {
  green: 'border-l-emerald-500',
  yellow: 'border-l-yellow-500',
  orange: 'border-l-orange-500',
  red: 'border-l-rose-500',
  none: 'border-l-transparent',
};

const AWAITING_PILL: Record<NonNullable<SlaBucket>, string> = {
  green: 'bg-emerald-600 text-white',
  yellow: 'bg-yellow-600 text-white',
  orange: 'bg-orange-600 text-white',
  red: 'bg-rose-600 text-white',
  none: 'bg-slate-500 text-white',
};

const AWAITING_TINT: Record<NonNullable<SlaBucket>, string> = {
  green: 'bg-emerald-50/40 dark:bg-emerald-950/10',
  yellow: 'bg-yellow-50/40 dark:bg-yellow-950/10',
  orange: 'bg-orange-50/40 dark:bg-orange-950/10',
  red: 'bg-rose-50/40 dark:bg-rose-950/10',
  none: '',
};

export function SidebarList({
  rows,
  basePath,
  selectedId,
  searchQuery,
}: {
  rows: InboxRow[];
  basePath: string;             // /beithady/communication/guesty
  selectedId?: string | null;
  searchQuery?: string;          // preserves filter query string when clicking
}) {
  if (!rows.length) {
    return (
      <div className="ix-card p-6 text-sm text-slate-500 text-center">
        <MessageCircle size={20} className="mx-auto text-slate-300 mb-2" />
        No conversations match the current filter.
      </div>
    );
  }
  return (
    <SidebarScrollRestore>
    <ul className="ix-card divide-y divide-slate-200 dark:divide-slate-700 overflow-hidden">
      {rows.map(r => {
        const href = `${basePath}?c=${r.id}${searchQuery ? `&${searchQuery}` : ''}`;
        const selected = selectedId === r.id;
        const sourceLabel = (r.source || '').replace('2', '');
        const channelIcon = r.channel === 'guesty' ? Mail : r.channel === 'wa_cloud' ? Activity : Smartphone;
        const ChIcon = channelIcon;
        // Awaiting reply = guest sent last message and we haven't
        // replied yet. We prefer `is_unanswered` (timestamp-derived
        // freshness from main's Phase C.5 follow-up) over
        // sla_age_seconds, since the latter only updates on the 5-min
        // SLA recompute. For these rows we apply a 4px left stripe +
        // AWAITING REPLY pill keyed to the SLA bucket.
        const awaiting = r.is_unanswered && !r.archived_at;
        const bucketKey: NonNullable<SlaBucket> = (r.sla_bucket ?? 'none') as NonNullable<SlaBucket>;
        const stripeCls = awaiting ? `border-l-4 ${AWAITING_STRIPE[bucketKey]}` : 'border-l-4 border-l-transparent';
        const tintCls = awaiting && !selected ? AWAITING_TINT[bucketKey] : '';
        return (
          <li key={r.id}>
            <Link
              href={href}
              className={`flex items-start gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-slate-800/50 transition ${stripeCls} ${tintCls} ${selected ? 'bg-slate-50 dark:bg-slate-800/70' : ''}`}
            >
              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center text-slate-600 dark:text-slate-300">
                <ChIcon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Phase C.5 follow-up — "new" badge driven by
                      is_unanswered (timestamp-derived truth) rather
                      than Guesty's state_read flag (which lags when
                      we reply via API but Guesty UI isn't opened to
                      mark read). */}
                  <span className={`text-sm truncate ${r.is_unanswered ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
                    {r.guest_full_name || r.guest_email || r.guest_phone || 'Unknown guest'}
                  </span>
                  {awaiting && (
                    <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${AWAITING_PILL[bucketKey]}`}>
                      Awaiting reply
                    </span>
                  )}
                  {r.source && (
                    <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${SOURCE_BADGES[r.source] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {sourceLabel}
                    </span>
                  )}
                  {r.is_unanswered && (
                    <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-600 text-white">
                      NEW
                    </span>
                  )}
                  {r.archived_at && (
                    <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      archived
                    </span>
                  )}
                </div>
                {/* R.4 — compact mobile row: hide listing/building line on `< sm` to give 2x more conversations on phones */}
                <div className="text-xs text-slate-500 truncate mt-0.5 hidden sm:block">
                  {r.listing_nickname && <span>{r.listing_nickname} · </span>}
                  {r.building_code && <span>{r.building_code} · </span>}
                  {r.last_inbound_at ? fmtCairoDateTime(r.last_inbound_at) : '—'}
                </div>
                {/* Stay-range disambiguator. Same guest can have multiple
                    Airbnb threads (one per reservation) — without dates
                    they look identical in the sidebar. */}
                {(r.reservation_check_in_date && r.reservation_check_out_date) && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1">
                    <CalendarDays size={10} className="shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {fmtDateRange(r.reservation_check_in_date, r.reservation_check_out_date)}
                    </span>
                    {r.reservation_nights ? (
                      <span className="text-slate-400">· {r.reservation_nights}N</span>
                    ) : null}
                  </div>
                )}
                <div className="text-[11px] text-slate-500 truncate mt-0.5 sm:hidden">
                  {r.last_inbound_at ? fmtCairoDateTime(r.last_inbound_at) : '—'}
                </div>
              </div>
              <div className="shrink-0">
                <SlaPill bucket={r.sla_bucket} ageSeconds={r.sla_age_seconds} lastInboundAt={r.last_inbound_at} size="xs" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
    </SidebarScrollRestore>
  );
}
