// Beithady · Fee Audit · XLSX export with sheets per fee category.

import 'server-only';
import ExcelJS from 'exceljs';
import type { FeeAuditData } from './types';
import { ANOMALY_LABEL } from './types';

export async function renderFeeAuditXlsx(data: FeeAuditData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Beit Hady · Fee Audit';
  wb.created = new Date(data.runAt);

  // Sheet 1: Listings cross-reference
  const ws1 = wb.addWorksheet('Listings');
  ws1.addRow([
    'Listing', 'Building', 'Bedrooms', 'Bathrooms', 'Capacity',
    'Cleaning', 'Pet Fee', 'Extra Guest', 'Security Deposit',
    'Min Nights', 'Min Nights per Channel',
    'Total Tax %', 'Has Full Data',
  ]).font = { bold: true };
  for (const l of data.listings) {
    const taxPct = l.taxes
      .filter(t => typeof t.rate_pct === 'number')
      .reduce((s, t) => s + (t.rate_pct || 0), 0);
    ws1.addRow([
      l.nickname,
      l.building,
      l.bedrooms,
      l.bathrooms,
      l.capacity,
      l.cleaning_fee,
      l.pet_fee,
      l.extra_guest_fee,
      l.security_deposit,
      l.min_nights_default,
      JSON.stringify(l.min_nights_per_channel),
      taxPct,
      l.has_full_data ? 'YES' : 'NO',
    ]);
  }
  ws1.columns.forEach(c => { c.width = 16; });
  ws1.getColumn(1).width = 26;

  // Sheet 2: Daily rates per channel
  const ws2 = wb.addWorksheet('Daily × Channel');
  ws2.addRow([
    'Listing', 'Date', 'Base Price USD', 'Weekend',
    'Channel', 'Guest Gross USD', 'Host Net USD',
    'Cleaning', 'Tax', 'Channel Commission', 'Guest Service Fee',
  ]).font = { bold: true };
  const lookup = new Map(data.listings.map(l => [l.id, l]));
  for (const d of data.daily) {
    const l = lookup.get(d.listing_id);
    for (const c of d.per_channel) {
      ws2.addRow([
        l?.nickname || d.listing_id,
        d.date,
        d.base_price_usd,
        d.is_weekend ? 'YES' : '',
        c.channel,
        c.guest_gross_usd,
        c.host_net_usd,
        c.breakdown.cleaning_usd,
        c.breakdown.taxes_usd,
        c.breakdown.channel_commission_usd,
        c.breakdown.guest_service_fee_usd,
      ]);
    }
  }
  ws2.columns.forEach(c => { c.width = 14; });
  ws2.getColumn(1).width = 24;

  // Sheet 3: Anomalies
  const ws3 = wb.addWorksheet('Anomalies');
  ws3.addRow(['Severity', 'Kind', 'Listing', 'Channel', 'Date', 'Message']).font = { bold: true };
  for (const a of data.anomalies) {
    ws3.addRow([
      a.severity,
      ANOMALY_LABEL[a.kind],
      a.listing_nickname,
      a.channel || '',
      a.date || '',
      a.message,
    ]);
  }
  ws3.columns.forEach(c => { c.width = 18; });
  ws3.getColumn(6).width = 80;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
