'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '',          label: 'Housekeeping' },
  { slug: '/security', label: 'Security'     },
];

export function HCTabs() {
  const pathname = usePathname();
  const base = '/beithady/analytics/headcount';
  return (
    <nav className="ix-tabs flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-6">
      {TABS.map(t => {
        const href = base + t.slug;
        const active = t.slug === '' ? pathname === base : pathname?.startsWith(href);
        return (
          <Link
            key={t.slug || 'hk'}
            href={href}
            className={`px-3 py-2 text-sm font-medium ${
              active
                ? 'text-cyan-600 border-b-2 border-cyan-600'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
