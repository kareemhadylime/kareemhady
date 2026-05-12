'use client';
import { PanelFrame } from '../panel-frame';
import { bandForOccupancy, BAND_CLASSES } from '../../_lib/color-thresholds';
import { BUILDING_CODES } from '@/lib/beithady-daily-report/types';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

export function BuildingsTable({ payload, onHide }: Props) {
  return (
    <PanelFrame label="🏢 Buildings · Today / MTD / Pace" onHide={onHide}>
      <div className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '1fr repeat(6, minmax(0, 0.7fr))' }}>
        <div className="px-2 py-1" />
        <Th>All</Th>
        {BUILDING_CODES.map((code) => <Th key={code}>{code}</Th>)}

        <Row label="Occupancy">
          <BandCell pct={payload.all.occupancy_today_pct} />
          {BUILDING_CODES.map((code) => (
            <BandCell key={code} pct={payload.per_building[code].occupancy_today_pct} />
          ))}
        </Row>

        <Row label="Month OTB">
          <Td>{fmtMoneyK(payload.all.revenue_mtd_usd)}</Td>
          {BUILDING_CODES.map((code) => (
            <Td key={code}>{fmtMoneyK(payload.per_building[code].revenue_mtd_usd)}</Td>
          ))}
        </Row>

        <Row label="ADR">
          <Td>${payload.all.adr_mtd_usd.toFixed(0)}</Td>
          {BUILDING_CODES.map((code) => (
            <Td key={code}>${payload.per_building[code].adr_mtd_usd.toFixed(0)}</Td>
          ))}
        </Row>

        <Row label="Bookings/d">
          <Td>{payload.all.bookings_per_day_mtd.toFixed(1)}</Td>
          {BUILDING_CODES.map((code) => (
            <Td key={code}>{payload.per_building[code].bookings_per_day_mtd.toFixed(1)}</Td>
          ))}
        </Row>
      </div>
    </PanelFrame>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1 font-semibold text-[#6077a6]/70">{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="px-2 py-1 text-[#003462] font-medium">{label}</div>
      {children}
    </>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <div className="rounded bg-[#f5f4fa] px-2 py-1 text-center text-[#003462]">{children}</div>;
}
function BandCell({ pct }: { pct: number }) {
  const band = bandForOccupancy(pct);
  return <div className={`rounded px-2 py-1 text-center ${BAND_CLASSES[band]}`}>{pct.toFixed(1)}%</div>;
}
function fmtMoneyK(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}
