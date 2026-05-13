import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { listSnapshots } from '@/lib/beithady/financials/snapshots';

export const dynamic = 'force-dynamic';

export default async function SnapshotsPage() {
  const snaps = await listSnapshots({ scope: 'consolidated' });
  const byPeriod = new Map<string, typeof snaps>();
  for (const s of snaps) {
    const arr = byPeriod.get(s.period_end) ?? [];
    arr.push(s);
    byPeriod.set(s.period_end, arr);
  }

  return (
    <>
      <TopNav>
        <Link href="/beithady" className="ix-link">
          BEITHADY
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/beithady/financials" className="ix-link">
          Financials
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Snapshots</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <Link
          href="/beithady/financials"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Financials
        </Link>
        <header>
          <h1 className="text-2xl font-bold">Snapshots · Consolidated</h1>
          <p className="text-sm text-slate-500">Frozen opening-balance snapshots by period</p>
        </header>

        {byPeriod.size === 0 ? (
          <p className="text-sm text-slate-500">No snapshots found. Import a ledger to create the first one.</p>
        ) : (
          <div className="space-y-4">
            {[...byPeriod.entries()]
              .sort((a, b) => (a[0] < b[0] ? 1 : -1))
              .map(([period, versions]) => (
                <div key={period} className="rounded-lg border border-slate-200 p-4">
                  <div className="text-sm font-semibold mb-2">{period}</div>
                  <ul className="space-y-1">
                    {versions
                      .sort((a, b) => b.version - a.version)
                      .map((v) => (
                        <li key={v.id} className="text-sm flex items-center gap-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              v.status === 'frozen'
                                ? 'bg-green-100 text-green-800'
                                : v.status === 'draft'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {v.status}
                          </span>
                          <span>v{v.version}</span>
                          <span className="text-slate-500">
                            {v.frozen_at ? `frozen ${v.frozen_at.slice(0, 10)}` : ''}
                          </span>
                          <Link
                            href={`/beithady/financials/snapshots/${v.id}`}
                            className="ml-auto text-xs text-slate-600 hover:underline"
                          >
                            View detail →
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </main>
    </>
  );
}
