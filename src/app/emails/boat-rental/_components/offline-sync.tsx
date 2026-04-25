'use client';

import { useEffect } from 'react';
import { flushQueueForeground } from '@/lib/offline/mark-paid-queue';
import { cacheBookings, type CachedBooking } from '@/lib/offline/booking-cache';
import { useToast } from '@/app/_components/toast';

// Mounted in broker + owner layouts. Two side-effects:
//   1. On mount, attempt to flush any queued Mark-Paid actions from
//      previous offline sessions (handles iOS, where SW background sync
//      isn't supported).
//   2. On 'online' event, drain again. Toast surfaced when items move.
export function OfflineFlushOnOnline() {
  const { toast } = useToast();
  useEffect(() => {
    let mounted = true;
    async function run(reason: 'mount' | 'online') {
      const result = await flushQueueForeground();
      if (!mounted) return;
      if (result.sent > 0) {
        toast(
          reason === 'online'
            ? `Synced ${result.sent} pending action${result.sent === 1 ? '' : 's'}`
            : `Flushed ${result.sent} pending action${result.sent === 1 ? '' : 's'}`,
          { kind: 'success' }
        );
      }
    }
    run('mount');
    function onOnline() { run('online'); }
    window.addEventListener('online', onOnline);
    return () => {
      mounted = false;
      window.removeEventListener('online', onOnline);
    };
  }, [toast]);
  return null;
}

// Drop-in side-effect: pages render this with their server-fetched rows
// to write them to IndexedDB so an offline reload still surfaces them.
export function CacheBookingsHydrator({ rows, role }: { rows: CachedBooking[]; role: 'broker' | 'owner' }) {
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const stamped: CachedBooking[] = rows.map(r => ({ ...r, role, cached_at: Date.now() }));
    cacheBookings(stamped).catch(() => { /* swallow */ });
  }, [rows, role]);
  return null;
}
