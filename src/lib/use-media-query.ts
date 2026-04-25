'use client';

import { useEffect, useState } from 'react';

// SSR-safe media query hook. Returns `undefined` on first server render so
// downstream components can decide between "render desktop layout for SEO"
// and "render nothing until we know" without hydration mismatch.

export function useMediaQuery(query: string): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

// Common breakpoints — match Tailwind defaults so logic stays in sync.
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

// "Mobile" effectively means "below md breakpoint" in this app.
export function useIsMobile(): boolean | undefined {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`);
}

export function useIsNarrow(): boolean | undefined {
  // Phone-portrait specifically (below sm).
  return useMediaQuery(`(max-width: ${BREAKPOINTS.sm - 1}px)`);
}

export function usePrefersReducedMotion(): boolean | undefined {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
