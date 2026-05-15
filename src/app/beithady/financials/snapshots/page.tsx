import Link from 'next/link';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
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
    <BeithadyShell
      breadcrumbs={[
        { label: 'Financials', href: '/beithady/financials' },
        { label: 'Snapshots' },
      ]}
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title="Snapshots · Consolidated"
        subtitle="Frozen opening-balance snapshots by period"
      />

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
                          style={{
                            display: 'inline-block',
                            padding: '1px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            ...(v.status === 'frozen'
                              ? { backgroundColor: '#dcfce7', color: '#166534' }
                              : v.status === 'draft'
                                ? { backgroundColor: '#fef3c7', color: '#854d0e' }
                                : { backgroundColor: 'var(--bh-cream)', color: 'var(--bh-steel)' }),
                          }}
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
    </BeithadyShell>
  );
}
