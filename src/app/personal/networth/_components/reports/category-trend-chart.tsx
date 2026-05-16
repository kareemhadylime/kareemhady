'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

// V1: render a single area for total monthly outflow over the trailing
// 12 months ending at the picker month. A stacked-per-category variant
// is on the wishlist but with 12 categories the chart gets unreadable —
// the table above already breaks down by category.
type Point = { label: string; total: number };

export function CategoryTrendChart({ year, month }: { year: number; month: number }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Walk backwards from (year, month) for 12 sequential months, then
    // fire the requests in parallel. For a single-tenant module this is
    // cheaper than building a separate `/trend` endpoint.
    const reqs: Promise<Point | null>[] = [];
    for (let i = 11; i >= 0; i--) {
      let m = month - i;
      let y = year;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      reqs.push(
        fetch(`/api/personal/networth/reports/monthly?year=${y}&month=${m}`, {
          cache: 'no-store',
        })
          .then(r => r.json())
          .then(j =>
            j.ok
              ? { label: j.report.monthLabel as string, total: Number(j.report.totalEgp) }
              : null,
          )
          .catch(() => null),
      );
    }

    Promise.all(reqs)
      .then(results => {
        if (cancelled) return;
        const filtered = results.filter((p): p is Point => p != null);
        if (filtered.length === 0) {
          setError('No trend data available.');
        }
        setPoints(filtered);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  return (
    <section className="ix-card p-5">
      <h3 className="text-base font-semibold mb-3 text-slate-900 dark:text-slate-50">
        12-month trend
      </h3>
      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={v =>
                  Math.abs(v) >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(0)}k`
                      : String(v)
                }
              />
              <Tooltip
                formatter={(v: number) => `EGP ${v.toLocaleString()}`}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                name="Total monthly outflow (EGP)"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
