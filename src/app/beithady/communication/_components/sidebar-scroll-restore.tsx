'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Audit fix M-4: preserve sidebar scroll position across conversation
// selection. The sidebar is a server-rendered <ul>; clicking a
// conversation triggers a Next.js navigation which scrolls the list
// back to the top, losing the operator's place in a long inbox.
//
// This client wrapper attaches to the nearest scrollable ancestor of
// its child (typically the <ul> itself), saves scrollTop to
// sessionStorage on every scroll (debounced via rAF), and restores
// on mount.
//
// Key is per basePath (NOT including ?c=) so navigating between
// conversations within the same inbox tab restores correctly, but
// switching inbox tabs gets a fresh scroll position.

export function SidebarScrollRestore({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Build a stable key per (path, sort, status, etc — but NOT ?c=)
  const key = (() => {
    const sp = new URLSearchParams(searchParams?.toString() || '');
    sp.delete('c');
    sp.delete('sent');
    sp.delete('send_error');
    sp.delete('send_status');
    sp.delete('fallback');
    sp.delete('switch_revert');
    sp.delete('switch_hint');
    return `bh-comm-sidebar-scroll:${pathname}?${sp.toString()}`;
  })();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Find the nearest scrollable ancestor (the wrapper itself or a parent
    // with overflow-y).
    let scrollable: HTMLElement | null = el;
    while (scrollable) {
      const style = window.getComputedStyle(scrollable);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
      scrollable = scrollable.parentElement;
    }
    if (!scrollable) return;

    // Restore
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const top = parseFloat(saved);
        if (Number.isFinite(top)) scrollable.scrollTop = top;
      }
    } catch { /* ignore */ }

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        try {
          sessionStorage.setItem(key, String(scrollable!.scrollTop));
        } catch { /* quota / private mode */ }
      });
    };
    scrollable.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollable.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [key]);

  return <div ref={ref}>{children}</div>;
}
