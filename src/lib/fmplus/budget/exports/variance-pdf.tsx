import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { BudgetVarianceReportV2 } from '../variance';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const styles = StyleSheet.create({
  page:    { padding: 24, fontSize: 8, fontFamily: 'Helvetica' },
  h1:      { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  meta:    { fontSize: 7, color: '#666', marginBottom: 8 },
  kpiRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingTop: 4, paddingBottom: 4, borderTop: '1px solid #ccc', borderBottom: '1px solid #ccc' },
  kpi:     { flex: 1, alignItems: 'center' },
  kpiLabel:{ fontSize: 7, color: '#666' },
  kpiValue:{ fontSize: 9, fontWeight: 700, marginTop: 2 },
  sectionTitle: { fontSize: 9, fontWeight: 700, marginTop: 8, marginBottom: 3, paddingBottom: 2, borderBottom: '1px solid #999' },
  table:   { display: 'flex', flexDirection: 'column' },
  row:     { flexDirection: 'row', borderBottom: '0.5px solid #eee' },
  rowHead: { backgroundColor: '#f5f5f5', fontWeight: 700 },
  rowTotal:{ backgroundColor: '#fafafa', fontWeight: 700, marginTop: 2 },
  catCell: { padding: 3, width: 80, borderRight: '0.5px solid #eee', fontWeight: 700 },
  monCell: { padding: 3, width: 36, borderRight: '0.5px solid #eee', textAlign: 'right' },
  totCell: { padding: 3, width: 50, borderRight: '0.5px solid #eee', textAlign: 'right' },
  pctCell: { padding: 3, width: 40, textAlign: 'right' },
  green:   { color: '#2e7d32' },
  amber:   { color: '#ed6c02' },
  red:     { color: '#c62828' },
});

function fmt(n: number): string {
  if (n === 0) return '—';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Math.round(n).toString();
}

function colorStyle(color: 'green' | 'amber' | 'red') {
  return color === 'green' ? styles.green : color === 'amber' ? styles.amber : styles.red;
}

export function VariancePdfDocumentV2({ report }: { report: BudgetVarianceReportV2 }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.h1}>{report.contract_name}</Text>
        <Text style={styles.meta}>
          Y{report.year_index}{report.fiscal_year ? ` (FY ${report.fiscal_year})` : ''}
          {' · '}{report.scenario}{' · '}status: {report.status}
          {'  · generated '}{new Date(report.generated_at).toLocaleString()}
        </Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>YTD Budget</Text>
            <Text style={styles.kpiValue}>{(report.total_budget / 1_000_000).toFixed(2)} M EGP</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>YTD Actual</Text>
            <Text style={styles.kpiValue}>{(report.total_actual / 1_000_000).toFixed(2)} M EGP</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Variance</Text>
            <Text style={styles.kpiValue}>{((report.total_actual - report.total_budget) / 1_000_000).toFixed(2)} M</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Variance %</Text>
            <Text style={styles.kpiValue}>{report.total_variance_pct != null ? `${(report.total_variance_pct * 100).toFixed(1)}%` : '—'}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Unmapped</Text>
            <Text style={styles.kpiValue}>{(report.unmapped_actuals / 1_000_000).toFixed(2)} M</Text>
          </View>
        </View>

        {report.segments.map(seg => (
          <View key={seg.service_line} wrap={false}>
            <Text style={styles.sectionTitle}>{seg.service_line.toUpperCase()}</Text>
            <View style={styles.table}>
              <View style={[styles.row, styles.rowHead]}>
                <Text style={styles.catCell}>Category</Text>
                {MONTHS.map(m => <Text key={m} style={styles.monCell}>{m}</Text>)}
                <Text style={styles.totCell}>YTD</Text>
                <Text style={styles.pctCell}>Var %</Text>
              </View>
              {seg.categories.map(cat => (
                <View key={cat.category} style={styles.row}>
                  <Text style={styles.catCell}>{cat.label_en}</Text>
                  {cat.cells.map(c => (
                    <Text key={c.month} style={[styles.monCell, colorStyle(c.color)]}>{fmt(c.actual)}</Text>
                  ))}
                  <Text style={[styles.totCell, colorStyle(cat.ytd_color)]}>{fmt(cat.ytd_actual)}</Text>
                  <Text style={[styles.pctCell, colorStyle(cat.ytd_color)]}>
                    {cat.ytd_variance_pct != null ? `${(cat.ytd_variance_pct * 100).toFixed(0)}%` : '—'}
                  </Text>
                </View>
              ))}
              <View style={[styles.row, styles.rowTotal]}>
                <Text style={styles.catCell}>{seg.service_line.toUpperCase()} TOTAL</Text>
                <Text style={[styles.totCell, { width: 36 * 12 + 50, textAlign: 'right' }]}>
                  Budget: {fmt(seg.segment_budget)} · Actual: {fmt(seg.segment_actual)}
                </Text>
                <Text style={styles.pctCell}>
                  {seg.segment_variance_pct != null ? `${(seg.segment_variance_pct * 100).toFixed(1)}%` : '—'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
