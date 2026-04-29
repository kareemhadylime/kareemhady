import Link from 'next/link';
import { Mail, Bot, Smartphone, Layers, Archive } from 'lucide-react';

const TABS = [
  { slug: 'guesty', label: 'Guesty Inbox', icon: Mail, accent: 'text-rose-600' },
  { slug: 'wa-cloud', label: 'WhatsApp Cloud', icon: Bot, accent: 'text-emerald-600' },
  { slug: 'wa-casual', label: 'WhatsApp Casual', icon: Smartphone, accent: 'text-cyan-600' },
  { slug: 'unified', label: 'Unified', icon: Layers, accent: 'text-violet-600' },
  // Phase R — 5th tab
  { slug: 'archive', label: 'Archive', icon: Archive, accent: 'text-slate-500' },
] as const;

type TabSlug = typeof TABS[number]['slug'];

export function ChannelTabs({
  active,
  archiveCount,
}: {
  active: TabSlug;
  archiveCount?: number | null;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-700 -mt-2">
      {TABS.map(t => {
        const Icon = t.icon;
        const selected = t.slug === active;
        const showBadge = t.slug === 'archive' && archiveCount != null && archiveCount > 0;
        return (
          <Link
            key={t.slug}
            href={`/beithady/communication/${t.slug}`}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition ${
              selected
                ? 'border-slate-700 dark:border-slate-300 text-slate-900 dark:text-white font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300'
            }`}
          >
            <Icon size={14} className={selected ? '' : t.accent} />
            {t.label}
            {showBadge && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {archiveCount.toLocaleString()}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
