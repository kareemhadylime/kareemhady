/**
 * PDF Page 8 — Change vs Initial (portrait)
 * Delta table per (service, category). Severity color-coded.
 * Returns null if data.change_vs_initial === null.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import type { ReportData } from '../types';

const SL_LABELS: Record<string, string> = {
  hk: 'HK', mep: 'MEP', landscape: 'LS', security: 'SEC',
  pest_ctrl: 'PEST', waste_mgmt: 'WASTE', back_office: 'BO',
};

const CAT_LABELS: Record<string, string> = {
  manning: 'Manning', ppe: 'PPE', tools: 'Tools', consumables: 'Consumables',
  transport: 'Transport', it: 'IT', governmental: 'Governmental', other: 'Other',
};

function fmtN(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Math.round(n).toLocaleString();
}

function severityColor(s: 'normal' | 'warn' | 'high') {
  if (s === 'high') return PDF_THEME.colors.red;
  if (s === 'warn') return PDF_THEME.colors.amber;
  return PDF_THEME.colors.textPrimary;
}

export function ChangeVsInitialPdf({ data }: { data: ReportData }): React.ReactElement | null {
  if (!data.change_vs_initial) return null;

  const { cells, warning } = data.change_vs_initial;

  return (
    <View>
      <Text style={pdfStyles.h2}>Change vs Initial</Text>
      <View style={pdfStyles.mt6} />

      {warning && (
        <View style={[pdfStyles.warningBox, { marginBottom: 8 }]}>
          <Text style={[pdfStyles.body, { color: PDF_THEME.colors.amber }]}>{warning}</Text>
        </View>
      )}

      {cells.length === 0 && !warning && (
        <Text style={[pdfStyles.body, pdfStyles.mt4]}>No changes from initial scenario.</Text>
      )}

      {cells.length > 0 && (
        <>
          <View style={pdfStyles.table}>
            <View style={pdfStyles.rowHead}>
              <Text style={[pdfStyles.cell, { width: 50, fontFamily: 'Helvetica-Bold' }]}>Service</Text>
              <Text style={[pdfStyles.cell, { width: 70, fontFamily: 'Helvetica-Bold' }]}>Category</Text>
              <Text style={[pdfStyles.cellRight, { width: 65, fontFamily: 'Helvetica-Bold' }]}>Initial</Text>
              <Text style={[pdfStyles.cellRight, { width: 65, fontFamily: 'Helvetica-Bold' }]}>Current</Text>
              <Text style={[pdfStyles.cellRight, { width: 65, fontFamily: 'Helvetica-Bold' }]}>Delta</Text>
              <Text style={[pdfStyles.cellRight, { width: 45, fontFamily: 'Helvetica-Bold' }]}>Δ%</Text>
            </View>

            {cells.map((cell, i) => {
              const color = severityColor(cell.severity);
              return (
                <View key={i} style={pdfStyles.row}>
                  <Text style={[pdfStyles.cell, { width: 50, color: PDF_THEME.colors.textSecondary }]}>
                    {SL_LABELS[cell.service_line] ?? cell.service_line}
                  </Text>
                  <Text style={[pdfStyles.cell, { width: 70 }]}>
                    {CAT_LABELS[cell.category] ?? cell.category}
                  </Text>
                  <Text style={[pdfStyles.cellRight, { width: 65 }]}>{fmtN(cell.initial_monthly)}</Text>
                  <Text style={[pdfStyles.cellRight, { width: 65 }]}>{fmtN(cell.current_monthly)}</Text>
                  <Text style={[pdfStyles.cellRight, { width: 65, color, fontFamily: cell.severity === 'high' ? 'Helvetica-Bold' : 'Helvetica' }]}>
                    {cell.delta_monthly >= 0 ? '+' : ''}{fmtN(cell.delta_monthly)}
                  </Text>
                  <Text style={[pdfStyles.cellRight, { width: 45, color, fontFamily: cell.severity === 'high' ? 'Helvetica-Bold' : 'Helvetica' }]}>
                    {cell.delta_pct >= 0 ? '+' : ''}{cell.delta_pct.toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            <Text style={[pdfStyles.small, { color: PDF_THEME.colors.amber }]}>&gt;5% = warn</Text>
            <Text style={[pdfStyles.small, { color: PDF_THEME.colors.red }]}>&gt;15% = high</Text>
          </View>
        </>
      )}
    </View>
  );
}
