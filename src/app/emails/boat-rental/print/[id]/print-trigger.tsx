'use client';

import { useEffect } from 'react';

// Fires window.print() once the page has had a moment for images to
// finish loading. We don't wait synchronously for every <img> onload
// because the print preview will block; an idle delay is plenty.

export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        // Some embedded browsers throw — user can hit ⌘P / Ctrl+P manually.
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}
