'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type DrawerView = 'arrivals' | 'departures' | 'turnovers' | 'inhouse';
export type DrawerBuilding = 'all' | 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK' | 'OTHER';

type Reservation = {
  id: string;
  confirmation_code: string | null;
  guest_name: string | null;
  listing_id: string | null;
  /** Server-marked leg — avoids client-side date comparison to determine role. */
  leg: 'checkout' | 'checkin' | 'inhouse';
  listing_nickname: string | null;
  building_code: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  guests: number | null;
  source: string | null;
  status: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  view: DrawerView;
  date: string;
  initialBuilding: DrawerBuilding;
};

const VIEW_LABELS: Record<DrawerView, string> = {
  arrivals: 'Check-ins',
  departures: 'Check-outs',
  turnovers: 'Turnovers',
  inhouse: 'Currently Staying',
};

const BUILDINGS: Array<{ code: DrawerBuilding; label: string }> = [
  { code: 'all', label: 'All' },
  { code: 'BH-26', label: 'BH-26' },
  { code: 'BH-73', label: 'BH-73' },
  { code: 'BH-435', label: 'BH-435' },
  { code: 'BH-OK', label: 'BH-OK' },
  { code: 'OTHER', label: 'Other' },
];

function normalizeChannel(source: string | null): string {
  const raw = (source || '').trim().toLowerCase();
  if (!raw) return 'Direct';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw.includes('vrbo') || raw.includes('homeaway')) return 'Vrbo';
  if (raw.includes('expedia')) return 'Expedia';
  if (raw === 'manual' || raw.includes('direct') || raw.includes('website')) return 'Direct';
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanDate(ymd: string): string {
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

function statusBadgeStyle(status: string | null): React.CSSProperties {
  switch (status) {
    case 'checked_in': return { background: '#dcf5e5', color: '#1a6634' };
    case 'checked_out': return { background: '#fdf3da', color: '#7a5300' };
    default: return { background: '#eef3fb', color: '#003462' };
  }
}

// ── Turnover-specific grouped rendering ─────────────────────────────────────
// Each turnover unit contributes 2 reservation rows (checkout + checkin).
// Group them by listing_id and render as a single paired card.

type TurnoverUnit = {
  key: string;
  nickname: string | null;
  buildingCode: string | null;
  checkout?: Reservation;
  checkin?: Reservation;
};

function groupTurnovers(data: Reservation[]): TurnoverUnit[] {
  const map = new Map<string, TurnoverUnit>();
  for (const r of data) {
    const key = r.listing_id ?? r.listing_nickname ?? r.id;
    if (!map.has(key)) {
      map.set(key, { key, nickname: r.listing_nickname, buildingCode: r.building_code });
    }
    const unit = map.get(key)!;
    // Use server-stamped leg — no client-side date comparison needed.
    if (r.leg === 'checkout') unit.checkout = r;
    else if (r.leg === 'checkin') unit.checkin = r;
  }
  return [...map.values()];
}

function TurnoverList({ data }: { data: Reservation[] }) {
  const units = groupTurnovers(data);
  return (
    <ul className="space-y-2">
      {units.map((unit) => (
        <li
          key={unit.key}
          className="overflow-hidden rounded-lg"
          style={{ border: '1px solid var(--bh-mute)' }}
        >
          {/* Unit name header */}
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ background: '#f0ece0', borderBottom: '1px solid var(--bh-mute)' }}
          >
            <span
              className="text-[12px] font-semibold"
              style={{ color: 'var(--bh-ink)', fontFamily: 'Cormorant Garamond, Georgia, serif' }}
            >
              {unit.nickname || unit.buildingCode || 'Unit TBD'}
            </span>
            {unit.buildingCode && unit.nickname && (
              <span className="text-[10px]" style={{ color: 'var(--bh-steel)' }}>
                {unit.buildingCode}
              </span>
            )}
          </div>
          {/* Checkout leg */}
          {unit.checkout && <TurnoverLeg r={unit.checkout} role="out" />}
          {/* Divider */}
          {unit.checkout && unit.checkin && (
            <div style={{ borderTop: '1px solid var(--bh-mute)' }} />
          )}
          {/* Checkin leg */}
          {unit.checkin && <TurnoverLeg r={unit.checkin} role="in" />}
        </li>
      ))}
    </ul>
  );
}

function TurnoverLeg({ r, role }: { r: Reservation; role: 'in' | 'out' }) {
  return (
    <div className="px-3 py-2" style={{ background: '#ffffff' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide"
            style={role === 'out'
              ? { background: '#fdf3da', color: '#7a5300' }
              : { background: '#dcf5e5', color: '#1a6634' }}
          >
            {role === 'out' ? '↑ OUT' : '↓ IN'}
          </span>
          <p
            className="min-w-0 truncate text-[12px] font-semibold leading-snug"
            style={{ color: 'var(--bh-ink)', fontFamily: 'Cormorant Garamond, Georgia, serif' }}
          >
            {r.guest_name || 'Guest'}
          </p>
        </div>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: '#eef3fb', color: 'var(--bh-ink)' }}
        >
          {normalizeChannel(r.source)}
        </span>
      </div>
      <div
        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]"
        style={{ color: 'var(--bh-steel)' }}
      >
        {r.nights != null && r.nights > 0 && (
          <span>{r.nights} night{r.nights === 1 ? '' : 's'}</span>
        )}
        {r.guests != null && r.guests > 0 && (
          <span>{r.guests} guest{r.guests === 1 ? '' : 's'}</span>
        )}
        {r.check_in_date && (
          <span><span className="opacity-60">In </span>{r.check_in_date}</span>
        )}
        {r.check_out_date && (
          <span><span className="opacity-60">Out </span>{r.check_out_date}</span>
        )}
        {r.confirmation_code && (
          <span
            className="rounded px-1 py-0.5 font-mono"
            style={statusBadgeStyle(r.status)}
          >
            {r.confirmation_code}
          </span>
        )}
      </div>
    </div>
  );
}

export function ActivityDrawer({ open, onClose, view, date, initialBuilding }: Props) {
  const [building, setBuilding] = useState<DrawerBuilding>(initialBuilding);
  const [data, setData] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Reset building to initialBuilding each time the drawer opens
  useEffect(() => {
    if (open) setBuilding(initialBuilding);
    else setData(null);
  }, [open, initialBuilding]);

  // Fetch whenever open + any of (view, date, building) changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/beithady/daily-reservations?date=${date}&view=${view}&building=${building}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) => {
        if (!cancelled) {
          setData(json.reservations ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError('Could not load reservations');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [open, view, date, building]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // Turnovers: each unit appears as 2 rows (checkout + checkin); count unique units.
  const count = (view === 'turnovers' && data != null)
    ? new Set(data.map((r) => r.listing_id ?? r.listing_nickname ?? r.id)).size
    : (data?.length ?? 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${VIEW_LABELS[view]} details`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col"
        style={{
          background: 'var(--bh-cream)',
          borderLeft: '1px solid var(--bh-mute)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ background: 'var(--bh-ink)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div>
            <p
              className="font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--bh-gold)', fontWeight: 600 }}
            >
              {VIEW_LABELS[view]}
            </p>
            <p
              className="mt-0.5 text-[13px]"
              style={{ color: 'var(--bh-cream)', fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 600 }}
            >
              {humanDate(date)}
              {!loading && data && (
                <span className="ml-2 text-[11px] font-normal opacity-70">
                  {view === 'turnovers'
                    ? `${count} turnover${count === 1 ? '' : 's'}`
                    : `${count} reservation${count === 1 ? '' : 's'}`}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
            style={{ color: 'var(--bh-cream)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Building filter chips */}
        <div
          className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-2.5"
          style={{ background: '#f0ece0', borderBottom: '1px solid var(--bh-mute)' }}
        >
          {BUILDINGS.map((b) => {
            const active = building === b.code;
            return (
              <button
                key={b.code}
                type="button"
                onClick={() => setBuilding(b.code)}
                className="shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none"
                style={
                  active
                    ? { background: 'var(--bh-ink)', color: 'var(--bh-cream)' }
                    : { background: 'var(--bh-cream)', color: 'var(--bh-steel)', border: '1px solid var(--bh-mute)' }
                }
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="space-y-2.5 pt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[72px] animate-pulse rounded-lg"
                  style={{ background: '#e8e4d8' }}
                />
              ))}
            </div>
          )}

          {!loading && fetchError && (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--bh-steel)' }}>
              {fetchError}
            </p>
          )}

          {!loading && !fetchError && data !== null && data.length === 0 && (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--bh-steel)' }}>
              No reservations found
              {building !== 'all' && ` for ${building}`}
            </p>
          )}

          {!loading && !fetchError && data && data.length > 0 && (
            view === 'turnovers' ? (
              <TurnoverList data={data} />
            ) : (
              <ul className="space-y-2">
                {data.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg p-3"
                    style={{ background: '#ffffff', border: '1px solid var(--bh-mute)' }}
                  >
                    {/* Top row: name + channel badge */}
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="min-w-0 truncate text-[13px] font-semibold leading-snug"
                        style={{ color: 'var(--bh-ink)', fontFamily: 'Cormorant Garamond, Georgia, serif' }}
                      >
                        {r.guest_name || 'Guest'}
                      </p>
                      <span
                        className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: '#eef3fb', color: 'var(--bh-ink)' }}
                      >
                        {normalizeChannel(r.source)}
                      </span>
                    </div>

                    {/* Unit + stay meta */}
                    <p className="mt-0.5 text-[11px]" style={{ color: 'var(--bh-steel)' }}>
                      {r.listing_nickname || r.building_code || 'Unit TBD'}
                      {r.nights != null && r.nights > 0 && ` · ${r.nights} night${r.nights === 1 ? '' : 's'}`}
                      {r.guests != null && r.guests > 0 && ` · ${r.guests} guest${r.guests === 1 ? '' : 's'}`}
                    </p>

                    {/* Dates + code row */}
                    <div
                      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]"
                      style={{ color: 'var(--bh-steel)' }}
                    >
                      {r.check_in_date && (
                        <span>
                          <span className="opacity-60">In </span>
                          {r.check_in_date}
                        </span>
                      )}
                      {r.check_out_date && (
                        <span>
                          <span className="opacity-60">Out </span>
                          {r.check_out_date}
                        </span>
                      )}
                      {r.confirmation_code && (
                        <span
                          className="rounded px-1.5 py-0.5 font-mono"
                          style={statusBadgeStyle(r.status)}
                        >
                          {r.confirmation_code}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        {/* Footer hint */}
        <div
          className="shrink-0 px-5 py-3 text-[10px]"
          style={{ color: 'var(--bh-steel)', borderTop: '1px solid var(--bh-mute)' }}
        >
          Press <kbd className="rounded border px-1 font-mono text-[9px]" style={{ borderColor: 'var(--bh-mute)' }}>Esc</kbd> or tap outside to close
        </div>
      </aside>
    </>
  );
}
