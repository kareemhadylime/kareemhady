'use client';
import { useEffect } from 'react';

// Phase R.4 — auto-scroll to the first inbound message whose timestamp
// is newer than the conversation's last_outbound_at. Falls back to
// scrolling to the bottom if no candidate is found.
//
// Audit fix C-A4 / agent finding #4: previously had `const fired =
// useRef(false)` + `if (fired.current) return` guard, which made
// auto-scroll fire only on the very first mount in a session. After
// the parent now remounts ThreadPane on conversation switch (via
// `key={header.id}`), the guard is also redundant — and removing it
// additionally lets us scroll to a new unread when `firstUnreadId`
// changes mid-conversation (realtime/poll-driven). The deps array
// already gates the effect to fire only when those props change.

export function AutoScrollThread({
  conversationId,
  firstUnreadId,
}: {
  conversationId: string;
  firstUnreadId: string | null;
}) {
  useEffect(() => {
    // Slight delay so DOM has paint-finished from the parent server render.
    const t = setTimeout(() => {
      // Audit fix M-6: use CSS.escape to safely interpolate IDs into
      // querySelector — defends against future ID schemes that could
      // contain `"`, `]`, or other selector metacharacters. Today
      // these are UUIDs (safe) but the escape is cheap insurance.
      const safeUnread = firstUnreadId && typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(firstUnreadId)
        : firstUnreadId;
      const safeConv = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(conversationId)
        : conversationId;
      const target =
        (safeUnread &&
          document.querySelector<HTMLElement>(
            `[data-thread-msg-id="${safeUnread}"]`,
          )) ||
        document.querySelector<HTMLElement>(
          `[data-thread-tail="${safeConv}"]`,
        );
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'instant', block: firstUnreadId ? 'start' : 'end' });
      }
    }, 32);
    return () => clearTimeout(t);
  }, [conversationId, firstUnreadId]);
  return null;
}
