import Link from 'next/link';
import { Mail, MessageCircle, Smartphone, Activity } from 'lucide-react';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import type { InboxRow } from '@/lib/beithady/communication/inbox';
import { SlaPill } from './sla-pill';

const SOURCE_BADGES: Record<string, string> = {
  airbnb2: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  airbnb: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  'booking.com': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  direct: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  manual: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  vrbo: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
};

export function SidebarList({
  rows,
  basePath,
  selectedId,
  searchQuery,
}: {
  rows: InboxRow[];
  basePath: string;             // /emails/beithady/communication/guesty
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
    <ul className="ix-card divide-y divide-slate-200 dark:divide-slate-700 overflow-hidden">
      {rows.map(r => {
        const href = `${basePath}?c=${r.id}${searchQuery ? `&${searchQuery}` : ''}`;
        const selected = selectedId === r.id;
        const sourceLabel = (r.source || '').replace('2', '');
        const channelIcon = r.channel === 'guesty' ? Mail : r.channel === 'wa_cloud' ? Activity : Smartphone;
        const ChIcon = channelIcon;
        return (
          <li key={r.id}>
            <Link
              href={href}
              className={`flex items-start gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-slate-800/50 transition ${selected ? 'bg-slate-50 dark:bg-slate-800/70' : ''}`}
            >
              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center text-slate-600 dark:text-slate-300">
                <ChIcon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-sm truncate ${r.unread_count > 0 ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
                    {r.guest_full_name || r.guest_email || r.guest_phone || 'Unknown guest'}
                  </span>
                  {r.source && (
                    <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${SOURCE_BADGES[r.source] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {sourceLabel}
                    </span>
                  )}
                  {r.unread_count > 0 && (
                    <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-600 text-white">
                      {r.unread_count} new
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  {r.listing_nickname && <span>{r.listing_nickname} · </span>}
                  {r.building_code && <span>{r.building_code} · </span>}
                  {r.last_inbound_at ? fmtCairoDateTime(r.last_inbound_at) : '—'}
                </div>
              </div>
              <div className="shrink-0">
                <SlaPill bucket={r.sla_bucket} ageSeconds={r.sla_age_seconds} size="xs" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
