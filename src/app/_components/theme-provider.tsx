'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Theme system: light / dark / system. Class-based dark mode (Tailwind v4
// targets via @custom-variant in globals.css). Choice persisted in
// localStorage.theme and applied early via an inline script in layout.tsx
// to avoid FOUC.

type Theme = 'light' | 'dark' | 'system';

type ThemeContextShape = {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';   // what's actually on the page
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextShape | null>(null);

const STORAGE_KEY = 'theme';

function getSystem(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyToDocument(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Init: read localStorage + system preference. Synchronous via inline
  // script in layout.tsx prevents FOUC; this just syncs React state.
  useEffect(() => {
    const stored = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as Theme | null;
    const initial: Theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setThemeState(initial);
    const sys = getSystem();
    const resolved = initial === 'system' ? sys : initial;
    setResolvedTheme(resolved);
    applyToDocument(resolved);
  }, []);

  // React to OS theme changes when in 'system' mode.
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const sys = mql.matches ? 'dark' : 'light';
      setResolvedTheme(sys);
      applyToDocument(sys);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* private browsing */ }
    const resolved = t === 'system' ? getSystem() : t;
    setResolvedTheme(resolved);
    applyToDocument(resolved);
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextShape {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Defensive: components rendered before provider wrap should still work.
    return { theme: 'system', resolvedTheme: 'light', setTheme: () => {} };
  }
  return ctx;
}

// FOUC-prevention script — embedded in <head> via dangerouslySetInnerHTML
// so it runs before React hydrates. Self-contained, no React imports.
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    if (dark) root.classList.add('dark');
    root.style.colorScheme = dark ? 'dark' : 'light';
  } catch (_) {}
})();
`;
