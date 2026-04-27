import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'KIKA Daily Report · 90-day History',
};

type HistoryRow = {
  id: string;
  report_date: string;
  generated_at: string;
  delivery_complete: boolean;
  build_attempts: number;
  last_build_error: string | null;
  expires_at: string;
  deleted_at: string | null;
  token: string;
  orders: number | null;
  net_revenue_egp: number | null;
};

function fmtEgp(n: number | null): string {
  if (n === null) return '—';
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `EGP ${Math.round(n / 1000)}k`;
  return 'EGP ' + Math.round(n).toLocaleString('en-US');
}

function fmtDate(ymd: string): { weekday: string; day: string; month: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: dt.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short' }),
    day: String(d).padStart(2, '0'),
    month: dt.toLocaleString('en-US', { timeZone: 'UTC', month: 'short' }),
  };
}

export default async function KikaHistoryPage() {
  const me = await getCurrentUser();
  if (!me) notFound();
  if (!me.is_admin) notFound();

  const sb = supabaseAdmin();
  // Pull last 90 days from the kika_snapshot_history view (defined in 0026).
  // The view exposes orders + net_revenue_egp without forcing payload deserialize.
  const { data } = await sb
    .from('kika_snapshot_history')
    .select(
      'id, report_date, generated_at, delivery_complete, build_attempts, last_build_error, expires_at, deleted_at, token, orders, net_revenue_egp'
    )
    .order('report_date', { ascending: false })
    .limit(90);
  const rows = (data as HistoryRow[] | null) || [];

  // Group by month for visual scanning
  const grouped = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const key = r.report_date.slice(0, 7);
    const arr = grouped.get(key) || [];
    arr.push(r);
    grouped.set(key, arr);
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <TopNav />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <Link
            href="/emails"
            className="hover:text-pink-700 dark:hover:text-pink-400"
          >
            Domains
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            href="/emails/kika"
            className="hover:text-pink-700 dark:hover:text-pink-400"
          >
            KIKA
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            href="/emails/kika/setup"
            className="hover:text-pink-700 dark:hover:text-pink-400"
          >
            Setup
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-700 dark:text-slate-200">History</span>
        </nav>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          KIKA Report Snapshot History
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Last 90 days. Click any non-expired date to open its hosted A4 report.
          Expired snapshots show ✕ — content auto-deletes 48h after generation.
        </p>

        {rows.length === 0 ? (
          <div className="mt-6 ix-card p-10 text-center">
            <p className="text-slate-500 text-sm">
              No snapshots yet. The first will appear after tomorrow&apos;s 09:00
              Cairo cron tick.
            </p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([month, monthRows]) => (
            <section key={month} className="mt-6 ix-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-pink-700 dark:text-pink-400 mb-3">
                {new Date(month + '-01').toLocaleString('en-US', {
                  timeZone: 'UTC',
                  month: 'long',
                  year: 'numeric',
                })}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
                {monthRows.map(r => {
                  const isExpired =
                    new Date(r.expires_at).getTime() < Date.now() ||
                    !!r.deleted_at;
                  const f = fmtDate(r.report_date);
                  const cell = (
                    <div
                      className={`rounded-md border p-2.5 text-center transition ${
                        isExpired
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                          : r.delivery_complete
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 hover:border-emerald-400 hover:shadow'
                            : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30'
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {f.weekday}
                      </div>
                      <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {f.day}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {f.month}
                      </div>
                      <div className="mt-1 text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                        {fmtEgp(r.net_revenue_egp)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {r.orders !== null ? `${r.orders} orders` : '—'}
                      </div>
                      {isExpired && (
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                          ✕ expired
                        </div>
                      )}
                    </div>
                  );
                  return isExpired ? (
                    <div key={r.id}>{cell}</div>
                  ) : (
                    <Link
                      key={r.id}
                      href={`/r/kika/${encodeURIComponent(r.token)}`}
                      target="_blank"
                      className="block"
                    >
                      {cell}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
