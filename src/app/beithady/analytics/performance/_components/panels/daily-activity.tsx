'use client';
import { PanelFrame } from '../panel-frame';
import { BUILDING_CODES, type BuildingCode, type DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; snapshotDate: string; onHide?: () => void };

const BUILDING_SHORT: Record<BuildingCode, string> = {
  'BH-26': 'BH-26',
  'BH-73': 'BH-73',
  'BH-435': 'BH-435',
  'BH-OK': 'BH-OK',
  'OTHER': 'Other',
};

type Accent = 'ink' | 'gold' | 'steel' | 'green' | 'amber' | 'red';
const ACCENT_COLOR: Record<Accent, string> = {
  ink: 'var(--bh-ink)',
  gold: 'var(--bh-gold)',
  steel: 'var(--bh-steel)',
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
};

type Sub = { text: string; tone: 'red' | 'amber' | 'info' };

export function DailyActivity({ payload, snapshotDate, onHide }: Props) {
  const all = payload.all;
  const cleaningCount = payload.cleaning_ops_today?.length ?? 0;
  const flaggedCheckins = payload.checkin_payment?.flagged?.length ?? 0;
  const cancellationsToday = payload.cancellations?.count_today ?? 0;
  const noShowsToday = payload.no_show?.no_shows?.length ?? 0;

  // Pretty date — fall back to raw string if Intl can't parse
  let humanDate = snapshotDate;
  try {
    const d = new Date(`${snapshotDate}T00:00:00`);
    if (!isNaN(d.getTime())) {
      humanDate = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {
    /* keep raw */
  }

  const checkInSubs: Sub[] = [];
  if (cleaningCount > 0) checkInSubs.push({ text: `${cleaningCount} unit${cleaningCount === 1 ? '' : 's'} need cleaning`, tone: 'red' });
  if (flaggedCheckins > 0) checkInSubs.push({ text: `${flaggedCheckins} flagged check-in${flaggedCheckins === 1 ? '' : 's'}`, tone: 'amber' });

  const checkOutSubs: Sub[] = [];
  if (flaggedCheckins > 0) checkOutSubs.push({ text: `${flaggedCheckins} payment${flaggedCheckins === 1 ? '' : 's'} flagged`, tone: 'amber' });
  if (cancellationsToday > 0) checkOutSubs.push({ text: `${cancellationsToday} cancellation${cancellationsToday === 1 ? '' : 's'} today`, tone: 'red' });

  const turnoverSubs: Sub[] = [];
  if (all.turnovers_today > 0) turnoverSubs.push({ text: 'same-day checkout + checkin', tone: 'info' });
  if (noShowsToday > 0) turnoverSubs.push({ text: `${noShowsToday} no-show${noShowsToday === 1 ? '' : 's'}`, tone: 'red' });

  const stayingSubs: Sub[] = [
    { text: `${all.occupancy_today_pct.toFixed(1)}% occupancy`, tone: 'info' },
  ];
  if (all.total_units > 0 && all.occupied_today < all.total_units) {
    stayingSubs.push({ text: `${all.total_units - all.occupied_today} unit${all.total_units - all.occupied_today === 1 ? '' : 's'} vacant`, tone: 'info' });
  }

  return (
    <section
      className="rounded-lg p-4 sm:p-5 shadow-sm"
      style={{
        background: 'var(--bh-cream)',
        border: '1px solid var(--bh-mute)',
        borderLeft: '4px solid var(--bh-ink)',
      }}
    >
      <header className="mb-3 flex items-center justify-between">
        <div
          className="font-mono text-[9px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--bh-steel)', fontWeight: 600 }}
        >
          📅 Daily activity
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-[10px]"
            style={{ color: 'var(--bh-steel)', fontFamily: 'var(--bh-heading)' }}
          >
            {humanDate}
          </span>
          {onHide && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onHide();
              }}
              className="text-[12px] text-[#6077a6] transition hover:text-[#003462] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded"
              aria-label="Hide Daily activity"
            >
              ×
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon="🛬"
          label="Check-ins"
          value={all.check_ins_today}
          accent="green"
          drillTo="/beithady/operations?view=arrivals"
          subs={checkInSubs}
          buildingBreakdown={perBuilding(payload, (b) => b.check_ins_today)}
        />
        <Tile
          icon="🛫"
          label="Check-outs"
          value={all.check_outs_today}
          accent="amber"
          drillTo="/beithady/operations?view=departures"
          subs={checkOutSubs}
          buildingBreakdown={perBuilding(payload, (b) => b.check_outs_today)}
        />
        <Tile
          icon="🔁"
          label="Turnovers"
          value={all.turnovers_today}
          accent="gold"
          drillTo="/beithady/operations?view=turnovers"
          subs={turnoverSubs}
          buildingBreakdown={perBuilding(payload, (b) => b.turnovers_today)}
        />
        <Tile
          icon="🏠"
          label="Currently staying"
          value={all.occupied_today}
          accent="ink"
          drillTo="/beithady/operations?view=in-house"
          subs={stayingSubs}
          buildingBreakdown={perBuilding(payload, (b) => b.occupied_today)}
        />
      </div>
    </section>
  );
}

type BuildingChip = { code: BuildingCode; value: number };

function perBuilding(
  payload: DailyReportPayload,
  pick: (b: DailyReportPayload['per_building'][BuildingCode]) => number,
): BuildingChip[] {
  return BUILDING_CODES
    .map((code) => ({ code, value: pick(payload.per_building[code]) }))
    .filter((c) => c.value > 0);
}

function Tile({
  icon,
  label,
  value,
  accent,
  drillTo,
  subs,
  buildingBreakdown,
}: {
  icon: string;
  label: string;
  value: number;
  accent: Accent;
  drillTo: string;
  subs: Sub[];
  buildingBreakdown: BuildingChip[];
}) {
  return (
    <a
      href={drillTo}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ outlineColor: 'var(--bh-gold)' }}
      aria-label={`${label} — ${value}. Drill into details.`}
    >
      <div
        className="flex h-full flex-col rounded-md p-3 sm:p-4"
        style={{
          background: '#ffffff',
          border: '1px solid var(--bh-mute)',
          borderLeft: `3px solid ${ACCENT_COLOR[accent]}`,
        }}
      >
        <div
          className="text-[28px] sm:text-[34px] font-bold leading-none tabular-nums"
          style={{
            color: ACCENT_COLOR[accent],
            fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif',
            letterSpacing: '-0.01em',
          }}
        >
          {value.toLocaleString('en-US')}
        </div>
        <div
          className="mt-1 flex items-center gap-1 text-[11px]"
          style={{ color: 'var(--bh-steel)' }}
        >
          <span aria-hidden="true">{icon}</span>
          <span>{label}</span>
        </div>
        {subs.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {subs.map((s, i) => (
              <li
                key={i}
                className="rounded px-2 py-1 text-[10px] leading-snug"
                style={subTone(s.tone)}
              >
                {s.text}
              </li>
            ))}
          </ul>
        )}
        {buildingBreakdown.length > 0 && (
          <ul
            className="mt-3 flex flex-wrap gap-1 border-t pt-2 text-[10px]"
            style={{ borderColor: 'var(--bh-mute)' }}
            aria-label={`${label} per building`}
          >
            {buildingBreakdown.map((chip) => (
              <li
                key={chip.code}
                className="rounded px-1.5 py-0.5 tabular-nums"
                style={{
                  background: '#f5f3ec',
                  color: 'var(--bh-ink)',
                  border: '1px solid var(--bh-mute)',
                }}
              >
                <span style={{ color: 'var(--bh-steel)' }}>{BUILDING_SHORT[chip.code]}</span>{' '}
                <span className="font-semibold">{chip.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </a>
  );
}

function subTone(tone: Sub['tone']): React.CSSProperties {
  switch (tone) {
    case 'red':
      return { background: '#fdecec', color: '#9a2828' };
    case 'amber':
      return { background: '#fdf3da', color: '#7a5300' };
    case 'info':
    default:
      return { background: '#eef3fb', color: 'var(--bh-ink)' };
  }
}
