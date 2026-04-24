'use client';

import { useEffect, useState } from 'react';

// Displays HH:MM:SS remaining until `until` (ISO timestamp). Once the
// countdown hits zero, it shows "Expired" in muted text — the parent
// should re-render on next server request, but until then this is the
// clearest signal the broker can see.
export function HoldCountdown({ until }: { until: string }) {
  const target = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const remaining = Math.max(0, target - now);
  if (remaining <= 0) {
    return <span className="text-rose-600 font-semibold tabular-nums">Expired — refresh</span>;
  }
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const sec = Math.floor((remaining % 60_000) / 1000);
  const color = remaining < 15 * 60 * 1000 ? 'text-rose-600' : remaining < 30 * 60 * 1000 ? 'text-amber-600' : 'text-emerald-700';
  return (
    <span className={`tabular-nums font-semibold ${color}`}>
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}
