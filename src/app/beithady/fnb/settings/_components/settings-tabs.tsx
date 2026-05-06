'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '/buildings',     label: 'Buildings' },
  { slug: '/hours',         label: 'Hours' },
  { slug: '/notifications', label: 'Notifications' },
  { slug: '/receipt',       label: 'Receipt' },
  { slug: '/cancellation',  label: 'Cancellation' },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 border-b mb-4">
      {TABS.map(t => {
        const href = `/beithady/fnb/settings${t.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={t.slug}
            href={href}
            className={`px-3 py-2 text-sm font-medium ${active ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-600 dark:text-slate-300'}`}
          >{t.label}</Link>
        );
      })}
    </nav>
  );
}
