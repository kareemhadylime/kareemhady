'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const LANGS: Array<{ key: 'en' | 'ar' | 'ru' | 'fr'; label: string }> = [
  { key: 'en', label: 'EN' },
  { key: 'ar', label: 'AR' },
  { key: 'ru', label: 'RU' },
  { key: 'fr', label: 'FR' },
];

export function LanguageSwitcher({ current }: { current: 'en' | 'ar' | 'ru' | 'fr' }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pick(lang: 'en' | 'ar' | 'ru' | 'fr') {
    const q = new URLSearchParams(params.toString());
    q.set('lang', lang);
    router.replace(`${pathname}?${q.toString()}`);
  }

  return (
    <nav
      aria-label="Language"
      className="text-xs flex gap-2 justify-center mt-2 relative z-10"
    >
      {LANGS.map(l => (
        <button
          key={l.key}
          onClick={() => pick(l.key)}
          className={`px-2 py-1 rounded ${current === l.key ? 'underline font-semibold' : 'opacity-70'}`}
          style={{ color: 'var(--bh-navy)' }}
        >
          {l.label}
        </button>
      ))}
    </nav>
  );
}
