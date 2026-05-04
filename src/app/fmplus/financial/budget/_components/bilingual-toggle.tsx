'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';

const STORAGE_KEY = 'fmplus_budget_lang';

/**
 * Tiny bilingual toggle: stores 'en' | 'ar' in localStorage and applies
 * `dir="rtl"` to the document root when 'ar'. Fully client-side for v2.0;
 * server-side cookie persistence can be added in v2.1 if needed.
 */
export function BilingualToggle() {
  const [lang, setLang] = useState<'en' | 'ar'>('en');

  useEffect(() => {
    const stored = (typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null) as 'en' | 'ar' | null;
    if (stored === 'en' || stored === 'ar') {
      setLang(stored);
      document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr';
    }
  }, []);

  const toggle = () => {
    const next: 'en' | 'ar' = lang === 'en' ? 'ar' : 'en';
    setLang(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    }
  };

  return (
    <button type="button" onClick={toggle}
      className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5"
      title={lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}>
      <Languages size={13} />
      <span>{lang === 'en' ? 'EN' : 'ع'}</span>
      <span className="text-slate-500 dark:text-slate-400">/</span>
      <span className="text-slate-500 dark:text-slate-400">{lang === 'en' ? 'ع' : 'EN'}</span>
    </button>
  );
}
