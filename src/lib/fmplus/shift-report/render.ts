// Pure renderers for the shift report: totals computation, WhatsApp message
// builder, and the detailed HTML document.
//
// Used both client-side (form preview / send) and server-side (upload), so it
// is dependency-free.

import {
  SR_VERTICALS,
  AR_DAYS,
  formatDate,
  type ShiftKey,
  type ShiftReportConfig,
  type ShiftReportData,
  type ShiftSectionData,
  type VerticalConfig,
  type VerticalKey,
} from './types';

export interface ShiftTotals {
  actual:  number;
  planned: number;
  pct:     number;
  hasData: boolean;
}

export function computeShiftTotals(
  vcfg: Partial<Record<VerticalKey, VerticalConfig>>,
  shiftKey: ShiftKey,
  shiftData: ShiftSectionData,
): ShiftTotals {
  let actual = 0;
  let planned = 0;
  SR_VERTICALS.forEach((v) => {
    const vc = vcfg[v.key];
    if (!vc) return;
    if (!vc.shifts.includes(shiftKey)) return;
    const vData = shiftData[v.key] ?? {};
    v.roles.forEach((role) => {
      if (!(role.key in vc.roles)) return;       // only added roles
      actual  += Number(vData[role.key]) || 0;
      planned += Number(vc.roles[role.key]?.[shiftKey]) || 0;
    });
  });
  const pct = planned > 0 ? Math.round((actual / planned) * 1000) / 10 : 0;
  return { actual, planned, pct, hasData: planned > 0 || actual > 0 };
}

export interface ProjectInfo {
  name:           string;
  contractNumber?: string;
}

export function buildShiftWAMessage(
  project: ProjectInfo,
  cfg: ShiftReportConfig,
  data: ShiftReportData,
  reportUrl?: string | null,
): string {
  const vcfg  = cfg.verticals ?? {};
  const today = new Date();
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);

  const tToday = computeShiftTotals(vcfg, 'morning', data.today_morning);
  const tYestM = computeShiftTotals(vcfg, 'morning', data.yesterday_morning);
  const tYestN = computeShiftTotals(vcfg, 'night',   data.yesterday_night);

  const grandA   = tToday.actual + tYestM.actual + tYestN.actual;
  const grandP   = tToday.planned + tYestM.planned + tYestN.planned;
  const grandPct = grandP > 0 ? Math.round((grandA / grandP) * 1000) / 10 : 0;

  const pctIcon = (p: number) => (p >= 95 ? '🟢' : p >= 85 ? '🟡' : '🔴');

  const block = (emoji: string, label: string, dateLabel: string, day: string, t: ShiftTotals) => {
    const lines = [`*${emoji} ${label}*  (${day} — ${dateLabel})`];
    if (!t.hasData) lines.push('لا توجد بيانات');
    else {
      lines.push(`الفعلي: *${t.actual}*  /  التعاقدي: *${t.planned}*`);
      lines.push(`النسبة: ${pctIcon(t.pct)} *${t.pct.toFixed(1)}%*`);
    }
    return lines.join('\n');
  };

  const sep = '\n━━━━━━━━━━━━━━━━━━━━\n';
  const parts: string[] = [];

  parts.push(
    '*📋 تقرير الوردية اليومي*\n' +
    `📌 *المشروع:* ${project.name}` +
    (cfg.contractNumber ? `\n📋 *رقم العقد:* ${cfg.contractNumber}` : '') +
    `\n📅 ${AR_DAYS[today.getDay()]} — ${formatDate(today)}`,
  );
  parts.push(block('🌅', 'اليوم - الصباحية', formatDate(today), AR_DAYS[today.getDay()], tToday));
  parts.push(block('🌅', 'أمس - الصباحية',   formatDate(yest),  AR_DAYS[yest.getDay()],  tYestM));
  parts.push(block('🌙', 'أمس - المسائية',  formatDate(yest),  AR_DAYS[yest.getDay()],  tYestN));
  parts.push(
    '*📊 إجمالي التقرير*\n' +
    `الفعلي: *${grandA}*  /  التعاقدي: *${grandP}*\n` +
    `النسبة: ${pctIcon(grandPct)} *${grandPct.toFixed(1)}%*`,
  );
  if (reportUrl) parts.push(`📎 *التقرير التفصيلي:*\n${reportUrl}`);

  return parts.join(sep);
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c));
}

function pctClass(p: number): string {
  return p >= 95 ? 'good' : p >= 85 ? 'warn' : 'bad';
}

export function buildShiftReportHtml(
  project: ProjectInfo,
  cfg: ShiftReportConfig,
  data: ShiftReportData,
): string {
  const vcfg  = cfg.verticals ?? {};
  const today = new Date();
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);

  const shiftBlockHtml = (title: string, emoji: string, dayLabel: string, dateLabel: string,
                          shiftKey: ShiftKey, shiftData: ShiftSectionData): string => {
    const totals = computeShiftTotals(vcfg, shiftKey, shiftData);
    if (!totals.hasData) {
      return `<div class="shift"><h2>${emoji} ${escapeHtml(title)}</h2>` +
        '<div class="empty">لا توجد بيانات لهذه الوردية</div></div>';
    }
    let rowsHtml = '';
    SR_VERTICALS.forEach((v) => {
      const vc = vcfg[v.key];
      if (!vc || !vc.shifts.includes(shiftKey)) return;
      const addedRoles = v.roles.filter((r) => r.key in vc.roles);
      if (addedRoles.length === 0) return;
      const vData = shiftData[v.key] ?? {};
      let vActual = 0, vPlanned = 0;
      addedRoles.forEach((r) => {
        vActual  += Number(vData[r.key]) || 0;
        vPlanned += Number(vc.roles[r.key]?.[shiftKey]) || 0;
      });
      const vPct = vPlanned > 0 ? Math.round((vActual / vPlanned) * 1000) / 10 : 0;
      rowsHtml += `<tr class="vh"><td colspan="4">${v.icon} ${escapeHtml(v.nameAr)}` +
        `  <span class="vtot">(الفعلي ${vActual} / التعاقدي ${vPlanned} = ` +
        `<span class="${pctClass(vPct)}">${vPct.toFixed(1)}%</span>)</span></td></tr>`;
      addedRoles.forEach((r) => {
        const actual  = Number(vData[r.key]) || 0;
        const planned = Number(vc.roles[r.key]?.[shiftKey]) || 0;
        const rPct    = planned > 0 ? Math.round((actual / planned) * 1000) / 10 : (actual > 0 ? 100 : 0);
        rowsHtml += '<tr>' +
          `<td>${escapeHtml(r.labelAr)}</td>` +
          `<td class="num">${actual}</td>` +
          `<td class="num">${planned}</td>` +
          `<td class="num ${pctClass(rPct)}">${planned > 0 ? rPct.toFixed(1) + '%' : '—'}</td>` +
          '</tr>';
      });
    });
    return '<div class="shift">' +
      `<h2>${emoji} ${escapeHtml(title)} <span class="day">${escapeHtml(dayLabel)} — ${escapeHtml(dateLabel)}</span></h2>` +
      '<div class="tot-row">' +
        '<span>الإجمالي</span>' +
        `<span>الفعلي: <b>${totals.actual}</b> &nbsp;/&nbsp; التعاقدي: <b>${totals.planned}</b></span>` +
        `<span class="${pctClass(totals.pct)}"><b>${totals.pct.toFixed(1)}%</b></span>` +
      '</div>' +
      '<table><thead><tr><th>الوظيفة</th><th>الفعلي</th><th>التعاقدي</th><th>النسبة</th></tr></thead>' +
      `<tbody>${rowsHtml}</tbody></table></div>`;
  };

  const tToday = computeShiftTotals(vcfg, 'morning', data.today_morning);
  const tYestM = computeShiftTotals(vcfg, 'morning', data.yesterday_morning);
  const tYestN = computeShiftTotals(vcfg, 'night',   data.yesterday_night);
  const gA = tToday.actual + tYestM.actual + tYestN.actual;
  const gP = tToday.planned + tYestM.planned + tYestN.planned;
  const gPct = gP > 0 ? Math.round((gA / gP) * 1000) / 10 : 0;

  return '<!doctype html><html dir="rtl" lang="ar"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>تقرير الوردية — ${escapeHtml(project.name)}</title>` +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    '*{box-sizing:border-box}' +
    'body{font-family:"Cairo","Segoe UI",sans-serif;background:#f3f5f9;margin:0;padding:16px;color:#1A1A2E}' +
    '.wrap{max-width:880px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden}' +
    '.head{background:linear-gradient(135deg,#1A1A2E 0%,#16213E 100%);color:#fff;padding:24px 28px;border-bottom:4px solid #EEB91D}' +
    '.head h1{margin:0;font-size:22px;font-weight:800}' +
    '.head .meta{margin-top:8px;font-size:13px;color:#cdd5e6;line-height:1.7}' +
    '.head .meta b{color:#FDCF00}' +
    '.body{padding:22px 26px}' +
    '.grand{background:#FDCF0012;border:1px solid #EEB91D44;border-radius:10px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:22px}' +
    '.grand .lbl{font-weight:700;color:#1A1A2E;font-size:14px}' +
    '.grand .vals{font-size:14px;color:#444}' +
    '.grand .pct{font-size:22px;font-weight:800}' +
    '.shift{margin-bottom:24px;border:1px solid #e5e9f0;border-radius:10px;overflow:hidden}' +
    '.shift h2{margin:0;padding:12px 16px;background:#f8f9fc;border-bottom:1px solid #e5e9f0;font-size:15px;font-weight:700;color:#1A1A2E;display:flex;justify-content:space-between;align-items:center}' +
    '.shift h2 .day{font-size:12px;color:#7A8BA8;font-weight:400}' +
    '.tot-row{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#f3f5f9;font-size:13px;flex-wrap:wrap;gap:8px}' +
    '.tot-row b{color:#1A1A2E}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#fafbfd;font-size:11px;font-weight:600;color:#666;padding:8px 12px;text-align:right;border-bottom:1px solid #e5e9f0}' +
    'th.num,td.num{text-align:center;width:80px}' +
    'td{padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f2f7}' +
    'tr.vh td{background:#FDCF0008;color:#1A1A2E;font-weight:700;font-size:13px;padding:9px 12px}' +
    '.vh .vtot{color:#666;font-weight:500;font-size:12px;margin-right:6px}' +
    '.good{color:#22C55E;font-weight:700}' +
    '.warn{color:#F59E0B;font-weight:700}' +
    '.bad{color:#EF4444;font-weight:700}' +
    '.empty{padding:18px;text-align:center;color:#888;font-style:italic;font-size:13px}' +
    '.foot{padding:14px 26px;background:#fafbfd;border-top:1px solid #e5e9f0;text-align:center;font-size:11px;color:#888}' +
    '.print{display:inline-block;background:#EEB91D;color:#1A1A2E;padding:8px 18px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;margin-top:6px;cursor:pointer;border:0;font-family:inherit}' +
    '@media print{body{background:#fff;padding:0}.wrap{box-shadow:none;max-width:none}.print{display:none}}' +
    '</style></head><body>' +
    '<div class="wrap">' +
    '<div class="head">' +
      '<h1>📋 تقرير الوردية اليومي</h1>' +
      '<div class="meta">' +
        `<b>المشروع:</b> ${escapeHtml(project.name)}` +
        (cfg.contractNumber ? `  &nbsp;·&nbsp;  <b>رقم العقد:</b> ${escapeHtml(cfg.contractNumber)}` : '') +
        `<br><b>التاريخ:</b> ${AR_DAYS[today.getDay()]} — ${formatDate(today)}` +
      '</div>' +
    '</div>' +
    '<div class="body">' +
      '<div class="grand">' +
        '<span class="lbl">📊 إجمالي التقرير</span>' +
        `<span class="vals">الفعلي <b>${gA}</b>  /  التعاقدي <b>${gP}</b></span>` +
        `<span class="pct ${pctClass(gPct)}">${gPct.toFixed(1)}%</span>` +
      '</div>' +
      shiftBlockHtml('اليوم — الصباحية', '🌅', AR_DAYS[today.getDay()], formatDate(today), 'morning', data.today_morning) +
      shiftBlockHtml('أمس — الصباحية',   '🌅', AR_DAYS[yest.getDay()],  formatDate(yest),  'morning', data.yesterday_morning) +
      shiftBlockHtml('أمس — المسائية',  '🌙', AR_DAYS[yest.getDay()],  formatDate(yest),  'night',   data.yesterday_night) +
      '<div style="text-align:center;margin-top:8px"><button class="print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>' +
    '</div>' +
    `<div class="foot">FMPLUS · Lime Investments · ${new Date().toLocaleString('ar-EG')}</div>` +
    '</div></body></html>';
}
