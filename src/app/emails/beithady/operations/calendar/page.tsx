import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getCalendarGridData } from '@/lib/beithady/operations/calendar-data';
import { getReservationDetail } from '@/lib/beithady/operations/reservation-detail';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { CalendarGrid } from './_components/calendar-grid';
import { HeaderBar } from './_components/header-bar';
import { AnomalyBanner } from './_components/anomaly-banner';
import { ReservationDrawer } from './_components/drawer';
import { SavedViewsMenu } from './_components/saved-views-menu';
import { ChannelMix } from './_components/channel-mix';
import { listViews } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_DAYS = 28;
const VALID_DAYS = [7, 14, 28] as const;
const VALID_BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK'] as const;
const VALID_STATUS = ['all', 'confirmed', 'inquiry', 'canceled'] as const;
const VALID_RISK = ['all', 'unpaid', 'prearrival_missing', 'vip'] as const;

function parseStartDate(s?: string): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!s) return d;
  const m = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : null;
  if (!m || isNaN(m.getTime())) return d;
  return m;
}

function parseDays(s?: string): number {
  const n = Number(s || DEFAULT_DAYS);
  return (VALID_DAYS as readonly number[]).includes(n) ? n : DEFAULT_DAYS;
}

function parseBuildings(s?: string): string[] {
  if (!s) return [];
  const parts = s.split(',').filter(Boolean);
  return parts.filter(p => (VALID_BUILDINGS as readonly string[]).includes(p));
}

function parseChannels(s?: string): string[] {
  if (!s) return [];
  return s.split(',').filter(Boolean);
}

function parseStatus(s?: string): 'all' | 'confirmed' | 'inquiry' | 'canceled' {
  if (s && (VALID_STATUS as readonly string[]).includes(s)) {
    return s as 'all' | 'confirmed' | 'inquiry' | 'canceled';
  }
  return 'all';
}

function parseRisk(s?: string): 'all' | 'unpaid' | 'prearrival_missing' | 'vip' {
  if (s && (VALID_RISK as readonly string[]).includes(s)) {
    return s as 'all' | 'unpaid' | 'prearrival_missing' | 'vip';
  }
  return 'all';
}

export default async function OperationsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    days?: string;
    buildings?: string;
    channels?: string;
    status?: string;
    risk?: string;
    q?: string;
    reservation?: string;
  }>;
}) {
  await requireBeithadyPermission('operations', 'read');
  const sp = await searchParams;
  const startDate = parseStartDate(sp.from);
  const daysCount = parseDays(sp.days);
  const filters = {
    buildings: parseBuildings(sp.buildings),
    channels: parseChannels(sp.channels),
    statusFilter: parseStatus(sp.status),
    riskFilter: parseRisk(sp.risk),
    search: sp.q || undefined,
  };

  const [data, detail, views] = await Promise.all([
    getCalendarGridData({ startDate, daysCount, filters }),
    sp.reservation ? getReservationDetail(sp.reservation) : Promise.resolve(null),
    listViews(),
  ]);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/emails/beithady/operations' },
      { label: 'Multi-Calendar' },
    ]} containerClass="max-w-[1600px]">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="Multi-Calendar"
        subtitle={`${data.rows.length} bookable units · ${data.reservations.length} reservations in window · ${data.windowStart} → ${data.windowEnd}`}
        right={<SavedViewsMenu initialViews={views} />}
      />
      <AnomalyBanner anomalies={data.anomalies} />
      <ChannelMix reservations={data.reservations} />
      <HeaderBar
        startDate={data.windowStart}
        daysCount={daysCount}
        filters={filters}
      />
      <CalendarGrid data={data} />
      {detail && <ReservationDrawer detail={detail} />}
    </BeithadyShell>
  );
}
