'use client';

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Kpis = {
  totalAssetsEgp: number;
  totalLiabilitiesEgp: number;
  netWorthEgp: number;
  stocksPipeEgp: number;
  deltaSinceLastSnapshotEgp: number;
  deltaPct: number | null;
};

type SnapshotPoint = {
  takenAt: string;
  netWorthEgp: number;
};

export function HeroKpi({
  kpis,
  snapshots,
}: {
  kpis: Kpis;
  snapshots: SnapshotPoint[];
}) {
  const router = useRouter();
  const [snapping, setSnapping] = useState(false);
  const [snapError, setSnapError] = useState<string | null>(null);

  const delta = Number(kpis.deltaSinceLastSnapshotEgp ?? 0);
  const tone =
    delta > 0
      ? 'text-emerald-600'
      : delta < 0
        ? 'text-rose-600'
        : 'text-slate-500';

  async function snapshotNow() {
    setSnapping(true);
    setSnapError(null);
    try {
      const res = await fetch('/api/personal/networth/snapshot', {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Snapshot failed');
      router.refresh();
    } catch (e) {
      setSnapError(e instanceof Error ? e.message : String(e));
    } finally {
      setSnapping(false);
    }
  }

  return (
    <div className="ix-card p-6 flex items-center justify-between gap-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500">
          Net Worth
        </div>
        <div className="text-4xl font-bold mt-1">
          EGP {Number(kpis.netWorthEgp).toLocaleString()}
        </div>
        <div className={`mt-1 text-sm font-medium ${tone}`}>
          {delta >= 0 ? '▲' : '▼'} EGP {Math.abs(delta).toLocaleString()}
          {kpis.deltaPct !== null && <> ({kpis.deltaPct}%)</>}
          <span className="text-slate-400"> vs last snapshot</span>
        </div>
      </div>
      <div className="hidden md:block flex-1 max-w-md h-16">
        {snapshots.length > 0 ? (
          <ResponsiveContainer>
            <LineChart data={snapshots}>
              <Line
                type="monotone"
                dataKey="netWorthEgp"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
              />
              <Tooltip
                formatter={(v: number) =>
                  `EGP ${Number(v).toLocaleString()}`
                }
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.takenAt ?? ''
                }
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            No snapshots yet — click &ldquo;Snapshot now&rdquo; to record your first
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <button
          onClick={snapshotNow}
          disabled={snapping}
          className="ix-btn-secondary"
        >
          {snapping ? 'Snapshotting…' : 'Snapshot now'}
        </button>
        {snapError && (
          <span className="text-xs text-rose-600">{snapError}</span>
        )}
      </div>
    </div>
  );
}
