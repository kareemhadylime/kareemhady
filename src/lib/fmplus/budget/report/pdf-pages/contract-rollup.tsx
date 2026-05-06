/**
 * PDF Page 11 — Contract Rollup (portrait)
 * Year-over-year totals table. Returns null if data.contract_rollup === null.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import type { ReportData } from '../types';

function fmtM(n: number) {
  return (n / 1_000_000).toFixed(2) + ' M';
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

function gpColor(pct: number) {
  if (pct >= 20) return PDF_THEME.colors.green;
  if (pct >= 10) return PDF_THEME.colors.amber;
  return PDF_THEME.colors.red;
}

export function ContractRollupPdf({ data }: { data: ReportData }): React.ReactElement | null {
  if (!data.contract_rollup) return null;

  const { years, total_cost, total_revenue } = data.contract_rollup;
  const { mode } = data.meta;
  const isCustomer = mode === 'customer';

  const totalGp = total_revenue - total_cost;
  const totalGpPct = total_revenue > 0 ? (totalGp / total_revenue) * 100 : 0;

  const W = { year: 50, scenario: 60, cost: 70, rev: 70, gp: 70, gpPct: 50 };

  return (
    <View>
      <Text style={pdfStyles.h2}>Contract Rollup (Multi-Year)</Text>
      <View style={pdfStyles.mt6} />

      <View style={pdfStyles.table}>
        {/* Header */}
        <View style={pdfStyles.rowHead}>
          <Text style={[pdfStyles.cell, { width: W.year, fontFamily: 'Helvetica-Bold' }]}>Year</Text>
          <Text style={[pdfStyles.cell, { width: W.scenario, fontFamily: 'Helvetica-Bold' }]}>Scenario</Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost, fontFamily: 'Helvetica-Bold' }]}>Total Cost</Text>}
          <Text style={[pdfStyles.cellRight, { width: W.rev, fontFamily: 'Helvetica-Bold' }]}>Revenue</Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.gp, fontFamily: 'Helvetica-Bold' }]}>GP (EGP)</Text>}
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.gpPct, fontFamily: 'Helvetica-Bold' }]}>GP %</Text>}
        </View>

        {/* Year rows */}
        {years.map((y) => (
          <View key={y.year_index} style={pdfStyles.row}>
            <View style={{ width: W.year, padding: 3, flexDirection: 'row', gap: 2, alignItems: 'baseline' }}>
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>Y{y.year_index}</Text>
              {y.fiscal_year && (
                <Text style={{ fontSize: 6, color: PDF_THEME.colors.textMuted }}>FY{y.fiscal_year}</Text>
              )}
            </View>
            <Text style={[pdfStyles.cell, { width: W.scenario, textTransform: 'capitalize', color: PDF_THEME.colors.textSecondary }]}>
              {y.scenario}
            </Text>
            {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost }]}>{fmtM(y.total_cost)} M</Text>}
            <Text style={[pdfStyles.cellRight, { width: W.rev }]}>{fmtM(y.total_revenue)} M</Text>
            {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.gp }]}>{fmtM(y.gp_egp)} M</Text>}
            {!isCustomer && (
              <Text style={[pdfStyles.cellRight, { width: W.gpPct, color: gpColor(y.gp_pct), fontFamily: 'Helvetica-Bold' }]}>
                {fmtPct(y.gp_pct)}
              </Text>
            )}
          </View>
        ))}

        {/* Totals */}
        <View style={pdfStyles.rowTotal}>
          <Text style={[pdfStyles.cellBold, { width: W.year + W.scenario, fontSize: 6, textTransform: 'uppercase', color: PDF_THEME.colors.textSecondary }]}>
            Total
          </Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost, fontFamily: 'Helvetica-Bold' }]}>{fmtM(total_cost)} M</Text>}
          <Text style={[pdfStyles.cellRight, { width: W.rev, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.gold }]}>
            {fmtM(total_revenue)} M
          </Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.gp, fontFamily: 'Helvetica-Bold' }]}>{fmtM(totalGp)} M</Text>}
          {!isCustomer && (
            <Text style={[pdfStyles.cellRight, { width: W.gpPct, color: gpColor(totalGpPct), fontFamily: 'Helvetica-Bold' }]}>
              {fmtPct(totalGpPct)}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
