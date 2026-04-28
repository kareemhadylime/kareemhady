'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wifi, WifiOff, Bell } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Phase J.8 — Supabase Realtime bridge for the Operations Calendar.
// Subscribes to reservation + override + manual block changes and
// triggers router.refresh() so the grid + drawer reflect upstream
// edits without a manual reload. Refreshes are debounced (1.5s) so a
// burst of payment/risk recompute writes doesn't spam navigation.
//
// Visible affordance: small "Live" pill in the corner showing connection
// state. Tapping the pill opens a dropdown listing the most recent
// changes since page load.

type RealtimeEvent = {
  id: string;
  ts: number;
  source: 'reservation' | 'override' | 'block' | 'message';
  summary: string;
};

const DEBOUNCE_MS = 1500;
const MAX_LOG = 20;

export function RealtimeBridge() {
  const router = useRouter();
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [open, setOpen] = useState(false);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();

    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        router.refresh();
      }, DEBOUNCE_MS);
    };

    const pushEvent = (ev: Omit<RealtimeEvent, 'id' | 'ts'>) => {
      setEvents(prev => [
        { ...ev, id: Math.random().toString(36).slice(2), ts: Date.now() },
        ...prev,
      ].slice(0, MAX_LOG));
      scheduleRefresh();
    };

    const channel = sb.channel('beithady-operations-calendar', {
      config: { broadcast: { self: false } },
    });

    channel
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'guesty_reservations' },
        (payload) => {
          const row = (payload.new || payload.old) as { id?: string; status?: string } | null;
          pushEvent({
            source: 'reservation',
            summary: `${payload.eventType} ${row?.id ? row.id.slice(-6) : '?'}${row?.status ? ` · ${row.status}` : ''}`,
          });
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'beithady_reservation_overrides' },
        (payload) => {
          const row = (payload.new || payload.old) as { reservation_id?: string; payment_status?: string; risk_score?: number } | null;
          pushEvent({
            source: 'override',
            summary: `${row?.reservation_id?.slice(-6) || '?'} · ${row?.payment_status || ''}${row?.risk_score != null ? ` · risk ${row.risk_score}` : ''}`,
          });
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'beithady_calendar_manual_blocks' },
        (payload) => {
          const row = (payload.new || payload.old) as { listing_id?: string; reason?: string } | null;
          pushEvent({
            source: 'block',
            summary: `${payload.eventType} block · ${row?.listing_id?.slice(-8) || ''} · ${row?.reason || ''}`,
          });
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beithady_messages' },
        (payload) => {
          const row = payload.new as { reservation_id?: string; direction?: string; channel?: string } | null;
          if (!row?.reservation_id) return;
          pushEvent({
            source: 'message',
            summary: `${row.direction || ''} ${row.channel || ''} · ${row.reservation_id.slice(-6)}`,
          });
        }
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('live');
        else if (s === 'CHANNEL_ERROR' || s === 'CLOSED' || s === 'TIMED_OUT') setStatus('offline');
      });

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      sb.removeChannel(channel);
    };
  }, [router]);

  const recentCount = events.length;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded
          ${status === 'live'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200'
            : status === 'connecting'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-200'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-200'}`}
        title={status === 'live' ? 'Realtime connected' : status === 'offline' ? 'Realtime disconnected' : 'Connecting…'}
      >
        {status === 'live' ? <Wifi size={10} /> : <WifiOff size={10} />}
        <span className="uppercase tracking-wide">{status}</span>
        {recentCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-0.5">
            <Bell size={9} />
            {recentCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1 w-64 ix-card p-2 z-40 shadow-lg text-xs">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1 px-1">
              Recent activity
            </div>
            {events.length === 0 ? (
              <div className="px-1 py-3 text-slate-500 text-[11px]">No changes yet.</div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-0.5">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-center gap-1 px-1 py-0.5 text-[11px]">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0
                      ${ev.source === 'reservation' ? 'bg-cyan-500'
                        : ev.source === 'override' ? 'bg-violet-500'
                        : ev.source === 'block' ? 'bg-rose-500'
                        : 'bg-amber-500'}`}
                    />
                    <span className="truncate flex-1">{ev.summary}</span>
                    <span className="text-[9px] text-slate-400 tabular-nums">
                      {Math.round((Date.now() - ev.ts) / 1000)}s
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-slate-400 px-1 pt-2 border-t border-slate-200 dark:border-slate-700 mt-1">
              Auto-refreshes after a 1.5s burst window.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
