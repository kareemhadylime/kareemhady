/**
 * PDF Page 9 — Variance Snapshot (portrait)
 * KPI tiles: YTD Budget / YTD Actual / Variance %.
 * Returns null if data.variance_snapshot === null.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import type { ReportData } from '../types';

function fmtM(n: number) {
  return (n / 1_000_000).toFixed(2) + ' M EGP';
}

export function VarianceSnapshotPdf({ data }: { data: ReportData }): React.ReactElement | null {
  if (!data.variance_snapshot) return null;

  const { ytd_budget, ytd_actual, variance_pct } = data.variance_snapshot;
  const varEgp = ytd_actual - ytd_budget;
  const vpColor = variance_pct <= 0
    ? PDF_THEME.colors.green    // under budget = good
    : variance_pct <= 5
    ? PDF_THEME.colors.amber
    : PDF_THEME.colors.red;

  return (
    <View>
      <Text style={pdfStyles.h2}>Variance Snapshot (YTD)</Text>
      <View style={pdfStyles.mt6} />

      <View style={pdfStyles.kpiRow}>
        <View style={pdfStyles.kpiTile}>
          <Text style={pdfStyles.kpiLabel}>YTD Budget</Text>
          <Text style={pdfStyles.kpiValue}>{fmtM(ytd_budget)}</Text>
        </View>
        <View style={pdfStyles.kpiTile}>
          <Text style={pdfStyles.kpiLabel}>YTD Actual</Text>
          <Text style={pdfStyles.kpiValue}>{fmtM(ytd_actual)}</Text>
        </View>
        <View style={pdfStyles.kpiTile}>
          <Text style={pdfStyles.kpiLabel}>Variance (EGP)</Text>
          <Text style={[pdfStyles.kpiValue, { color: varEgp <= 0 ? PDF_THEME.colors.green : PDF_THEME.colors.red }]}>
            {varEgp >= 0 ? '+' : ''}{fmtM(varEgp)}
          </Text>
        </View>
        <View style={pdfStyles.kpiTile}>
          <Text style={pdfStyles.kpiLabel}>Variance %</Text>
          <Text style={[pdfStyles.kpiValue, { color: vpColor }]}>
            {variance_pct >= 0 ? '+' : ''}{variance_pct.toFixed(1)}%
          </Text>
        </View>
      </View>

      <Text style={[pdfStyles.small, pdfStyles.mt4]}>
        Positive variance = actual exceeds budget (overspend).
        Negative = under budget.
      </Text>
    </View>
  );
}
