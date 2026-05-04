// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { BudgetVarianceReport } from '../types';

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

const styles = StyleSheet.create({
  page:    { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  h1:      { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  meta:    { fontSize: 8, color: '#666', marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  table:   { display: 'flex', flexDirection: 'column', borderTop: '1px solid #ccc' },
  row:     { flexDirection: 'row', borderBottom: '1px solid #eee' },
  cell:    { padding: 3, flex: 1, borderRight: '1px solid #eee' },
  cellSm:  { padding: 3, width: 28, borderRight: '1px solid #eee', textAlign: 'right' },
  cellMd:  { padding: 3, width: 50, borderRight: '1px solid #eee', textAlign: 'right' },
  catCell: { padding: 3, width: 80, borderRight: '1px solid #eee', fontWeight: 700 },
  totalRow:{ backgroundColor: '#f5f5f5', fontWeight: 700 },
});

export function VariancePdfDocument({ report }: { report: BudgetVarianceReport }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.h1}>{report.project_name} — Variance Report</Text>
        <Text style={styles.meta}>FY {report.fiscal_year} · Scenario: {report.scenario} · Status: {report.status} · Generated {new Date().toISOString().slice(0,10)}</Text>

        {report.segments.map(seg => (
          <View key={seg.segment_id} wrap={false}>
            <Text style={styles.sectionTitle}>{seg.service_line.toUpperCase()}{seg.is_stub ? ' (stub — no variance)' : ''}</Text>
            <View style={styles.table}>
              <View style={styles.row}>
                <Text style={styles.catCell}>Category</Text>
                {MONTHS.map(m => <Text key={m} style={styles.cellSm}>{new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}</Text>)}
                <Text style={styles.cellMd}>YTD B</Text>
                <Text style={styles.cellMd}>YTD A</Text>
                <Text style={styles.cellMd}>Var</Text>
                <Text style={styles.cellMd}>Var %</Text>
              </View>
              {seg.categories.map(cat => (
                <View key={cat.category} style={styles.row}>
                  <Text style={styles.catCell}>{cat.category}</Text>
                  {MONTHS.map(m => {
                    const c = cat.cells.find(x => x.month === m);
                    return <Text key={m} style={styles.cellSm}>{c ? Math.round(c.budget / 1000) + 'k' : '—'}</Text>;
                  })}
                  <Text style={styles.cellMd}>{Math.round(cat.ytd.budget).toLocaleString()}</Text>
                  <Text style={styles.cellMd}>{Math.round(cat.ytd.actual).toLocaleString()}</Text>
                  <Text style={styles.cellMd}>{Math.round(cat.ytd.variance).toLocaleString()}</Text>
                  <Text style={styles.cellMd}>{cat.ytd.variance_pct == null ? '—' : cat.ytd.variance_pct.toFixed(1) + '%'}</Text>
                </View>
              ))}
              <View style={[styles.row, styles.totalRow]}>
                <Text style={styles.catCell}>Total</Text>
                {MONTHS.map(m => <Text key={m} style={styles.cellSm}>—</Text>)}
                <Text style={styles.cellMd}>{Math.round(seg.ytd.budget).toLocaleString()}</Text>
                <Text style={styles.cellMd}>{Math.round(seg.ytd.actual).toLocaleString()}</Text>
                <Text style={styles.cellMd}>{Math.round(seg.ytd.variance).toLocaleString()}</Text>
                <Text style={styles.cellMd}>{seg.ytd.variance_pct == null ? '—' : seg.ytd.variance_pct.toFixed(1) + '%'}</Text>
              </View>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
