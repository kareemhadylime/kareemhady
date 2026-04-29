'use client';
import { useEffect, useRef } from 'react';

// Phase R.4 — auto-scroll to the first inbound message whose timestamp
// is newer than the conversation's last_outbound_at. Falls back to
// scrolling to the bottom if no candidate is found. Runs once on mount.

export function AutoScrollThread({
  conversationId,
  firstUnreadId,
}: {
  conversationId: string;
  firstUnreadId: string | null;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Slight delay so DOM has paint-finished from the parent server render.
    const t = setTimeout(() => {
      const target =
        (firstUnreadId &&
          document.querySelector<HTMLElement>(
            `[data-thread-msg-id="${firstUnreadId}"]`,
          )) ||
        document.querySelector<HTMLElement>(
          `[data-thread-tail="${conversationId}"]`,
        );
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'instant', block: firstUnreadId ? 'start' : 'end' });
      }
    }, 32);
    return () => clearTimeout(t);
  }, [conversationId, firstUnreadId]);
  return null;
}
