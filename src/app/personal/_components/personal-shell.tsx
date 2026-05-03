import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

// Branded shell wrapping every Personal page. Single TopNav with full
// breadcrumb trail + a wide centered container. Mirrors the
// BeithadyShell / BeithadyHeader pattern but with the slate Personal
// palette.

type BreadcrumbItem = { label: string; href?: string };

export function PersonalShell({
  breadcrumbs = [],
  children,
  containerClass = 'max-w-6xl',
}: {
  breadcrumbs?: BreadcrumbItem[];
  children: React.ReactNode;
  containerClass?: string;
}) {
  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/personal" className="ix-link">Personal</Link>
        {breadcrumbs.map((b, i) => (
          <span key={i} className="contents">
            <ChevronRight size={14} className="text-slate-400" />
            {b.href ? (
              <Link href={b.href} className="ix-link">{b.label}</Link>
            ) : (
              <span>{b.label}</span>
            )}
          </span>
        ))}
      </TopNav>
      <div className="min-h-screen flex-1">
        <div className={`${containerClass} mx-auto px-6 py-10 space-y-8`}>
          {children}
        </div>
      </div>
    </>
  );
}

export function PersonalHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  right,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between flex-wrap gap-4">
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="hidden sm:flex w-20 h-20 shrink-0 rounded-2xl items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-200">
            <Icon size={36} strokeWidth={1.6} />
          </div>
        )}
        <div className="space-y-1">
          {eyebrow && (
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium">
              {eyebrow}
            </p>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}
