'use client';
import { useState, useTransition } from 'react';
import { rebuildSnapshotAction } from '@/app/beithady/setup/actions';

type Props = { date: string };

/**
 * Admin-only button that triggers a server-side rebuild of the daily
 * report snapshot for `date`. Used on the EmptySnapshot screen to backfill
 * historical NULL-payload rows. The action enforces admin auth — non-admin
 * clicks land with a "forbidden" error rendered inline.
 *
 * The build itself can take 60–180s (matching the cron route's maxDuration),
 * so the calling page sets `export const maxDuration = 180`. The button
 * disables itself for the duration and reloads on success so the freshly
 * built payload renders.
 */
export function ManualRebuildButton({ date }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await rebuildSnapshotAction(date);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Hard reload — the page is a server component reading from
        // Supabase, and the new snapshot needs a fresh server render.
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md px-4 py-2 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        style={{
          background: 'var(--bh-ink)',
          color: 'var(--bh-cream)',
        }}
      >
        {pending ? 'Rebuilding (up to 3 min)…' : `Rebuild snapshot for ${date}`}
      </button>
      {error && (
        <p
          className="rounded px-2 py-1 text-[11px]"
          style={{
            background: '#fdecec',
            color: '#9a2828',
            border: '1px solid #f1bcbc',
          }}
        >
          {error === 'forbidden' ? 'Admin access required' : `Build failed — ${error}`}
        </p>
      )}
      {pending && (
        <p className="text-[10px]" style={{ color: 'var(--bh-steel)' }}>
          The build pulls reservations + reviews + payouts + AI insights. This takes a while.
        </p>
      )}
    </div>
  );
}
