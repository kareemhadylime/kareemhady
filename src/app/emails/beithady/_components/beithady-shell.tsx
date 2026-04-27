import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

// Branded shell wrapping every Beithady page. Inserts the BEIT HADY
// wordmark + breadcrumb structure beneath the global TopNav so the
// portfolio framing (Lime Investments) is preserved while each
// Beithady page reads as part of a coherent subsidiary brand.

type BreadcrumbItem = { label: string; href?: string };

export function BeithadyShell({
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
        <Link href="/" className="ix-link">
          Home
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/beithady" className="ix-link">
          Beit Hady
        </Link>
        {breadcrumbs.map((b, i) => (
          <span key={i} className="contents">
            <ChevronRight size={14} className="text-slate-400" />
            {b.href ? (
              <Link href={b.href} className="ix-link">
                {b.label}
              </Link>
            ) : (
              <span>{b.label}</span>
            )}
          </span>
        ))}
      </TopNav>
      <div data-bh-brand="true" className="min-h-screen flex-1">
        <div className={`${containerClass} mx-auto px-6 py-10 space-y-8`}>
          {children}
        </div>
      </div>
    </>
  );
}

export function BeithadyHeader({
  eyebrow,
  title,
  subtitle,
  right,
  showWordmark = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  showWordmark?: boolean;
}) {
  return (
    <header className="flex items-start justify-between flex-wrap gap-4">
      <div className="flex items-start gap-4">
        {showWordmark && (
          <div className="hidden sm:block w-24 h-24 relative shrink-0 rounded-xl overflow-hidden bg-white/60 dark:bg-slate-900/40 ring-1 ring-slate-200 dark:ring-slate-700">
            <Image
              src="/brand/beithady/wordmark.jpg"
              alt="Beit Hady"
              fill
              className="object-contain p-2"
              sizes="96px"
              priority
            />
          </div>
        )}
        <div>
          {eyebrow && (
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              {eyebrow}
            </p>
          )}
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: 'var(--bh-navy)', fontFamily: 'var(--font-sans), Cormorant Garamond, Playfair Display, ui-serif, Georgia, serif' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right}
    </header>
  );
}
