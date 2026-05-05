/**
 * PDF Page 6 — Mobilization (portrait)
 * detail shape → table; summary shape → single card.
 * Returns null if data.mobilization === null (caller skips page).
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import { LabelDual } from '../pdf-shared/label-dual';
import type { ReportData } from '../types';

const CAT_LABELS: Record<string, string> = {
  capex: 'CapEx',
  opex_one_time: 'OpEx One-Time',
  training: 'Training',
  recruitment: 'Recruitment',
};

function fmtN(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Math.round(n).toLocaleString();
}

export function MobilizationPdf({ data }: { data: ReportData }): React.ReactElement | null {
  if (!data.mobilization) return null;

  const { lang } = data.meta;
  const mob = data.mobilization;

  // Customer mode: summary card
  if ('summary_text' in mob) {
    return (
      <View>
        <Text style={pdfStyles.h2}>Mobilization</Text>
        <View style={pdfStyles.mt6} />
        <View style={[pdfStyles.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFDE7', borderColor: PDF_THEME.colors.gold }]}>
          <Text style={pdfStyles.body}>{mob.summary_text}</Text>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.black }}>
            {fmtN(mob.total_egp)} EGP
          </Text>
        </View>
      </View>
    );
  }

  // Internal mode: detail table
  const total = mob.detail.reduce((s, l) => s + l.total, 0);
  const W = { cat: 70, label: 130, qty: 30, unit: 60, total: 65, amort: 45 };

  return (
    <View>
      <Text style={pdfStyles.h2}>Mobilization</Text>
      <View style={pdfStyles.mt6} />

      <View style={pdfStyles.table}>
        {/* Header */}
        <View style={pdfStyles.rowHead}>
          <Text style={[pdfStyles.cell, { width: W.cat, fontFamily: 'Helvetica-Bold' }]}>Category</Text>
          <Text style={[pdfStyles.cell, { width: W.label, fontFamily: 'Helvetica-Bold' }]}>Item</Text>
          <Text style={[pdfStyles.cellRight, { width: W.qty, fontFamily: 'Helvetica-Bold' }]}>Qty</Text>
          <Text style={[pdfStyles.cellRight, { width: W.unit, fontFamily: 'Helvetica-Bold' }]}>Unit Cost</Text>
          <Text style={[pdfStyles.cellRight, { width: W.total, fontFamily: 'Helvetica-Bold' }]}>Total</Text>
          <Text style={[pdfStyles.cellRight, { width: W.amort, fontFamily: 'Helvetica-Bold' }]}>Amort. (mo)</Text>
        </View>

        {/* Lines */}
        {mob.detail.map((line, i) => (
          <View key={i} style={pdfStyles.row}>
            <Text style={[pdfStyles.cell, { width: W.cat, color: PDF_THEME.colors.textSecondary }]}>
              {CAT_LABELS[line.category] ?? line.category}
            </Text>
            <View style={{ width: W.label, padding: 3 }}>
              <LabelDual en={line.label_en} ar={line.label_ar} lang={lang} fontSize={7} />
            </View>
            <Text style={[pdfStyles.cellRight, { width: W.qty }]}>{line.qty}</Text>
            <Text style={[pdfStyles.cellRight, { width: W.unit }]}>{fmtN(line.unit_cost)}</Text>
            <Text style={[pdfStyles.cellRight, { width: W.total, fontFamily: 'Helvetica-Bold' }]}>{fmtN(line.total)}</Text>
            <Text style={[pdfStyles.cellRight, { width: W.amort, color: PDF_THEME.colors.textSecondary }]}>{line.amortization_months}</Text>
          </View>
        ))}

        {/* Total row */}
        <View style={pdfStyles.rowTotal}>
          <Text style={[pdfStyles.cell, { width: W.cat + W.label + W.qty + W.unit, fontSize: 6, textTransform: 'uppercase', color: PDF_THEME.colors.textSecondary }]}>
            Total Mobilization
          </Text>
          <Text style={[pdfStyles.cellRight, { width: W.total, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.gold }]}>
            {fmtN(total)}
          </Text>
          <Text style={[pdfStyles.cell, { width: W.amort }]} />
        </View>
      </View>
    </View>
  );
}
