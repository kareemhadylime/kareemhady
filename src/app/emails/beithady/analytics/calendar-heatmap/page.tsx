import Link from 'next/link';
import { CalendarRange, ArrowRight } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { buildHeatmap } from '@/lib/beithady/market/calendar';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function colorFor(pct: number): { bg: string; text: string } {
  if (pct === 0) return { bg: 'bg-emerald-100 dark:bg-emerald-950', text: 'text-emerald-800 dark:text-emerald-200' };
  if (pct <= 25) return { bg: 'bg-emerald-200 dark:bg-emerald-900', text: 'text-emerald-900 dark:text-emerald-100' };
  if (pct <= 50) return { bg: 'bg-yellow-200 dark:bg-yellow-900', text: 'text-yellow-900 dark:text-yellow-100' };
  if (pct <= 75) return { bg: 'bg-orange-300 dark:bg-orange-800', text: 'text-orange-900 dark:text-orange-100' };
  if (pct < 100) return { bg: 'bg-rose-400 dark:bg-rose-700', text: 'text-rose-50' };
  return { bg: 'bg-rose-600 dark:bg-rose-600', text: 'text-white' };
}

function isWeekendUTC(dateIso: string): boolean {
  const d = new Date(dateIso + 'T00:00:00Z').getUTCDay();
  return d === 5 || d === 6; // Fri/Sat = weekend in EG/SA
}

function dateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  const mo = d.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  return `${day} ${mo}`;
}

export default async function CalendarHeatmapPage() {
  await requireBeithadyPermission('analytics', 'read');
  const heatmap = await buildHeatmap(90);

  // Pick "biggest gap" cells (occupancy <= 25, sorted by upcoming-ness)
  const gaps = heatmap.rows.flatMap(r =>
    r.cells.filter(c => c.occupancy_pct <= 25)
  ).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Analytics', href: '/emails/beithady/analytics' },
      { label: 'Calendar Heatmap' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Calendar Heatmap"
        subtitle={`Occupancy per building × day, next 90 days. Click a low-occupancy cell to spawn a targeted campaign.`}
      />

      {heatmap.rows.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          No active listings synced yet. Run the Guesty sync first.
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-slate-500 mr-1">Occupancy:</span>
            <Swatch pct={0} label="0% (gap)" />
            <Swatch pct={25} label="≤25%" />
            <Swatch pct={50} label="≤50%" />
            <Swatch pct={75} label="≤75%" />
            <Swatch pct={99} label="<100%" />
            <Swatch pct={100} label="full" />
          </div>

          {/* Heatmap grid */}
          <div className="ix-card p-3 overflow-x-auto">
            <div className="min-w-max">
              <div className="grid grid-cols-[120px_repeat(91,28px)] gap-px text-[10px] mb-1">
                <div className="font-semibold text-slate-500">Building</div>
                {heatmap.rows[0]?.cells.map(c => (
                  <div
                    key={c.date}
                    className={`text-center ${isWeekendUTC(c.date) ? 'font-semibold text-rose-600' : 'text-slate-500'}`}
                    title={c.date}
                  >
                    {new Date(c.date + 'T00:00:00Z').getUTCDate()}
                  </div>
                ))}
              </div>
              {heatmap.rows.map(row => (
                <div key={row.building_code} className="grid grid-cols-[120px_repeat(91,28px)] gap-px mb-px">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 self-center">
                    {row.building_code}
                    <span className="ml-1 text-[10px] text-slate-400">({row.total_units}u)</span>
                  </div>
                  {row.cells.map(cell => {
                    const c = colorFor(cell.occupancy_pct);
                    const adLink = `/emails/beithady/ads?building=${row.building_code}&date=${cell.date}&signal=gap`;
                    return (
                      <Link
                        key={cell.date}
                        href={adLink}
                        title={`${row.building_code} · ${dateLabel(cell.date)} · ${cell.booked}/${cell.total_units} (${cell.occupancy_pct}%)`}
                        className={`h-6 ${c.bg} ${c.text} text-center text-[10px] tabular-nums cursor-pointer hover:ring-2 hover:ring-slate-400 rounded-sm flex items-center justify-center transition`}
                      >
                        {cell.occupancy_pct < 100 ? cell.occupancy_pct : ''}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Action: top gaps to attack */}
          {gaps.length > 0 && (
            <section className="ix-card p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <CalendarRange size={16} className="text-amber-600" />
                Biggest gaps to fill — next 90 days
              </h2>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {gaps.map(g => (
                  <li key={`${g.building_code}-${g.date}`} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <span className="font-semibold">{g.building_code}</span>{' '}
                      <span className="text-slate-500">· {dateLabel(g.date)}</span>{' '}
                      <span className="text-xs text-slate-400">({g.booked}/{g.total_units} booked, {g.occupancy_pct}%)</span>
                    </div>
                    <Link
                      href={`/emails/beithady/ads?building=${g.building_code}&date=${g.date}&signal=gap`}
                      className="ix-btn-primary text-xs"
                    >
                      Spawn campaign <ArrowRight size={12} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="text-[11px] text-slate-500 text-center">
        Source: <code>guesty_reservations</code> ∩ <code>guesty_listings</code> active.
        Excludes inquiry/cancelled. Updated on every page load.
        Click any cell → Phase H Ads campaign builder pre-filled with building + date.
      </p>
    </BeithadyShell>
  );
}

function Swatch({ pct, label }: { pct: number; label: string }) {
  const c = colorFor(pct);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-4 h-4 rounded ${c.bg}`} />
      <span className="text-slate-500">{label}</span>
    </span>
  );
}
