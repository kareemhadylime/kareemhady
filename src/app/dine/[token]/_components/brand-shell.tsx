import 'server-only';
import Image from 'next/image';
import { ReactNode, Suspense } from 'react';
import { LanguageSwitcher } from './language-switcher';

export function BrandShell({
  children,
  guestName,
  buildingCode,
  unitCode,
  lang,
}: {
  children: ReactNode;
  guestName: string | null;
  buildingCode: string | null;
  unitCode: string | null;
  lang: 'en' | 'ar' | 'ru' | 'fr';
}) {
  return (
    <main className="dine-surface min-h-dvh relative" lang={lang}>
      <div className="dine-rails relative max-w-md mx-auto pb-32">
        {/* Header */}
        <section className="relative pt-10 pb-8 px-6 text-center">
          {/* Halftone decoration — top-left */}
          <Image
            src="/dine/halftone-tl.svg"
            alt=""
            width={240}
            height={240}
            className="dine-halftone"
            style={{ top: 0, left: 0 }}
          />
          {/* BH Logo */}
          <Image
            src="/dine/beithady-logo.svg"
            alt="Beit Hady"
            width={120}
            height={120}
            className="mx-auto relative z-10"
          />
          <h1 className="display mt-4 text-3xl tracking-wider relative z-10">
            IN-ROOM DINING
          </h1>
          <Suspense fallback={null}>
            <LanguageSwitcher current={lang} />
          </Suspense>
          {guestName && (
            <p
              className="mt-2 text-sm relative z-10"
              style={{ color: 'var(--bh-ink-muted)' }}
            >
              Welcome, {guestName.split(' ')[0]}
            </p>
          )}
          {buildingCode && unitCode && (
            <p
              className="mt-1 text-xs relative z-10"
              style={{ color: 'var(--bh-ink-muted)' }}
            >
              {buildingCode} · Unit {unitCode}
            </p>
          )}
        </section>

        {/* Menu content */}
        {children}

        {/* Palm silhouette decoration */}
        <Image
          src="/dine/palm-silhouette.svg"
          alt=""
          width={192}
          height={300}
          className="dine-palm"
          style={{ bottom: '8rem', right: '-2rem' }}
        />
      </div>
    </main>
  );
}
