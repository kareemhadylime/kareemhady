'use client';

import { useState, useTransition } from 'react';
import { Search, X, ExternalLink, Building2 } from 'lucide-react';
import { findAvailabilityAction, type AvailableUnit } from '../actions';

const BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK'] as const;

export function FindAvailabilityModal({ defaultStart }: { defaultStart: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => {
    const d = new Date(defaultStart + 'T00:00:00');
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [bedrooms, setBedrooms] = useState('');
  const [buildings, setBuildings] = useState<string[]>([]);
  const [results, setResults] = useState<AvailableUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = () => {
    setError(null);
    startTransition(async () => {
      const r = await findAvailabilityAction({
        startDate: start,
        endDate: end,
        bedrooms: bedrooms ? Number(bedrooms) : undefined,
        buildingCodes: buildings.length > 0 ? buildings : undefined,
      });
      if (r.ok) {
        setResults(r.units || []);
      } else {
        setError(r.error || 'Search failed');
        setResults(null);
      }
    });
  };

  const close = () => {
    setOpen(false);
    setResults(null);
    setError(null);
  };

  const toggleBuilding = (b: string) => {
    setBuildings(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
  };

  const nights = Math.max(1, Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ix-btn-primary !text-xs"
      >
        <Search size={12} /> Find availability
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto"
          onClick={close}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 max-w-3xl w-full mt-12"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <h3 className="text-sm font-bold flex-1" style={{ color: 'var(--bh-navy)' }}>
                Find availability
              </h3>
              <button onClick={close} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Check-in</span>
                  <input
                    type="date"
                    value={start}
                    onChange={e => setStart(e.target.value)}
                    className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Check-out</span>
                  <input
                    type="date"
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                    className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Min bedrooms</span>
                  <select
                    value={bedrooms}
                    onChange={e => setBedrooms(e.target.value)}
                    className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
                  >
                    <option value="">Any</option>
                    <option value="0">Studio+</option>
                    <option value="1">1+</option>
                    <option value="2">2+</option>
                    <option value="3">3+</option>
                  </select>
                </label>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Nights</span>
                  <div className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5 bg-slate-50 dark:bg-slate-800 tabular-nums">
                    {nights}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Buildings</div>
                <div className="flex flex-wrap gap-1">
                  {BUILDINGS.map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => toggleBuilding(b)}
                      className={`text-[10px] px-2 py-0.5 rounded border
                        ${buildings.includes(b)
                          ? 'bg-[var(--bh-navy)] text-white border-[var(--bh-navy)]'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={search}
                disabled={pending}
                className="ix-btn-primary !text-xs"
              >
                <Search size={12} /> {pending ? 'Searching…' : 'Search'}
              </button>

              {error && (
                <div className="text-[11px] text-rose-600">{error}</div>
              )}

              {results != null && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                  <div className="text-[11px] text-slate-500 mb-2">
                    {results.length === 0
                      ? 'No units available for the selected window.'
                      : `${results.length} unit${results.length === 1 ? '' : 's'} available · ${start} → ${end} · ${nights} night${nights === 1 ? '' : 's'}`}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {results.map(u => (
                      <div
                        key={u.listing_id}
                        className="border border-slate-200 dark:border-slate-700 rounded p-2 flex gap-2"
                      >
                        <div className="shrink-0 w-12 h-12 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                          {u.cover_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.cover_url} alt={u.nickname} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Building2 size={18} className="text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--bh-navy)' }}>
                            {u.nickname}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500">
                            {u.building_code && (
                              <span className="px-1 py-px bg-slate-100 dark:bg-slate-800 rounded">
                                {u.building_code === 'OTHER' ? 'Other' : u.building_code}
                              </span>
                            )}
                            {u.bedrooms != null && <span>{u.bedrooms === 0 ? 'Studio' : `${u.bedrooms}BR`}</span>}
                            {u.base_price_usd != null && (
                              <span className="tabular-nums">${Math.round(u.base_price_usd)}/n · ${Math.round(u.base_price_usd * nights)} total</span>
                            )}
                          </div>
                          <div className="mt-1">
                            <a
                              href={`https://app.guesty.com/listings/${u.listing_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-cyan-700 dark:text-cyan-300 hover:underline inline-flex items-center gap-0.5"
                            >
                              <ExternalLink size={9} /> Book in Guesty
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-3">
                    Direct-booking creation from this modal lands in V2 — V1 deep-links to Guesty so the agent can complete the reservation there. Both manual blocks and confirmed reservations are excluded from this list.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
