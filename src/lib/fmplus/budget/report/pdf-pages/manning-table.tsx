/**
 * PDF Page 4 — Manning Table (LANDSCAPE)
 * Grouped by service line + sub-section. Mode-aware HC budgeted column.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import { LabelDual } from '../pdf-shared/label-dual';
import type { ReportData } from '../types';

const SL_LABELS: Record<string, string> = {
  hk: 'Housekeeping', mep: 'MEP', landscape: 'Landscape',
  security: 'Security', pest_ctrl: 'Pest Control', waste_mgmt: 'Waste Mgmt',
  back_office: 'Back Office',
};

function fmtN(n: number | null) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Math.round(n).toLocaleString();
}

export function ManningTablePdf({ data }: { data: ReportData }) {
  const { mode, lang } = data.meta;
  const isCustomer = mode === 'customer';

  // Group by service_line → sub_section
  const grouped = new Map<string, Map<string | null, typeof data.manning.rows>>();
  for (const row of data.manning.rows) {
    if (!grouped.has(row.service_line)) grouped.set(row.service_line, new Map());
    const slMap = grouped.get(row.service_line)!;
    if (!slMap.has(row.sub_section)) slMap.set(row.sub_section, []);
    slMap.get(row.sub_section)!.push(row);
  }

  if (data.manning.rows.length === 0) {
    return (
      <View>
        <Text style={pdfStyles.h2}>Manning Detail</Text>
        <Text style={[pdfStyles.body, pdfStyles.mt6]}>No manning lines added yet.</Text>
      </View>
    );
  }

  // Landscape column widths — total usable ~750px
  const W = { pos: 180, sub: 80, hcReq: 45, hcBud: 45, ctc: 65, cost: 70 };

  return (
    <View>
      <Text style={pdfStyles.h2}>Manning Detail</Text>
      <View style={pdfStyles.mt6} />

      {[...grouped.entries()].map(([sl, subsections]) => {
        const hasSubSections = [...subsections.keys()].some(k => k != null);
        const slTotals = data.manning.totals_by_service[sl as keyof typeof data.manning.totals_by_service];

        return (
          <View key={sl} style={{ marginBottom: 8 }} wrap={false}>
            {/* Service line header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
              <View style={pdfStyles.accentBar} />
              <Text style={[pdfStyles.h3, { marginBottom: 0, marginTop: 0 }]}>
                {SL_LABELS[sl] ?? sl}
              </Text>
            </View>

            {/* Table */}
            <View style={pdfStyles.table}>
              <View style={pdfStyles.rowHead}>
                <Text style={[pdfStyles.cell, { width: W.pos, fontFamily: 'Helvetica-Bold' }]}>Position</Text>
                {hasSubSections && <Text style={[pdfStyles.cell, { width: W.sub, fontFamily: 'Helvetica-Bold' }]}>Sub-section</Text>}
                <Text style={[pdfStyles.cellRight, { width: W.hcReq, fontFamily: 'Helvetica-Bold' }]}>HC Req.</Text>
                {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.hcBud, fontFamily: 'Helvetica-Bold' }]}>HC Bud.</Text>}
                {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.ctc, fontFamily: 'Helvetica-Bold' }]}>CTC Rate</Text>}
                {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost, fontFamily: 'Helvetica-Bold' }]}>Mthly Cost</Text>}
              </View>

              {[...subsections.entries()].flatMap(([sub, rows], _sIdx) =>
                rows.map((row, i) => (
                  <View key={`${sl}-${sub ?? 'null'}-${i}`} style={pdfStyles.row}>
                    <View style={{ width: W.pos, padding: 3 }}>
                      <LabelDual en={row.position_label_en} ar={row.position_label_ar} lang={lang} fontSize={7} />
                    </View>
                    {hasSubSections && (
                      <Text style={[pdfStyles.cell, { width: W.sub, color: PDF_THEME.colors.textSecondary }]}>
                        {i === 0 ? (sub ?? '—') : ''}
                      </Text>
                    )}
                    <Text style={[pdfStyles.cellRight, { width: W.hcReq }]}>{row.hc_required}</Text>
                    {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.hcBud }]}>{row.hc_budgeted ?? '—'}</Text>}
                    {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.ctc }]}>{fmtN(row.ctc_rate)}</Text>}
                    {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost }]}>{fmtN(row.monthly_cost)}</Text>}
                  </View>
                ))
              )}

              {/* Subtotal row */}
              {slTotals && (
                <View style={pdfStyles.rowTotal}>
                  <Text style={[pdfStyles.cellBold, { width: W.pos, color: PDF_THEME.colors.textSecondary, fontSize: 6, textTransform: 'uppercase' }]}>
                    Subtotal
                  </Text>
                  {hasSubSections && <Text style={[pdfStyles.cell, { width: W.sub }]} />}
                  <Text style={[pdfStyles.cellRight, { width: W.hcReq, fontFamily: 'Helvetica-Bold' }]}>{slTotals.hc_required}</Text>
                  {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.hcBud, fontFamily: 'Helvetica-Bold' }]}>{slTotals.hc_budgeted ?? '—'}</Text>}
                  {!isCustomer && <Text style={[pdfStyles.cell, { width: W.ctc }]} />}
                  {!isCustomer && <Text style={[pdfStyles.cell, { width: W.cost }]} />}
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
