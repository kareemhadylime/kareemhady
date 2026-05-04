'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '',          label: 'Orders'    },
  { slug: '/menu',     label: 'Menu'      },
  { slug: '/analytics',label: 'Analytics' },
  { slug: '/settings', label: 'Settings'  },
  { slug: '/audit',    label: 'Audit'     },
];

export function FnbTabs() {
  const pathname = usePathname();
  const base = '/beithady/fnb';
  return (
    <nav className="ix-tabs flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-4">
      {TABS.map(t => {
        const href = base + t.slug;
        const active = t.slug === ''
          ? pathname === base
          : pathname?.startsWith(href);
        return (
          <Link
            key={t.slug || 'orders'}
            href={href}
            className={`px-3 py-2 text-sm font-medium ${active ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-600 dark:text-slate-300'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
