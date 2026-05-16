import 'server-only';
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import type { ManufacturingReport } from './kika-manufacturing';

// KIKA Manufacturing plan — A4 PDF. Pulls in the rows already sorted by the
// builder (net_to_make desc, then oldest age). Includes a header strip with
// period + headline totals so the printout is self-contained, a wide table,
// and an auto page-number footer.

const PALETTE = {
  ink: '#0f172a',
  ink2: '#334155',
  muted: '#64748b',
  brand: '#4f46e5',
  brandLight: '#eef2ff',
  line: '#e2e8f0',
  rowAlt: '#f8fafc',
  warn: '#b45309',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 50,
    paddingHorizontal: 28,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: PALETTE.ink,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: PALETTE.brand,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  brand: {
    fontSize: 9,
    color: PALETTE.brand,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.ink,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  periodLabel: {
    fontSize: 8.5,
    color: PALETTE.muted,
  },
  generatedAt: {
    fontSize: 7.5,
    color: PALETTE.muted,
    marginTop: 1,
  },
  totals: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 8,
  },
  totalCard: {
    flex: 1,
    backgroundColor: PALETTE.brandLight,
    borderRadius: 4,
    padding: 8,
  },
  totalLabel: {
    fontSize: 7,
    color: PALETTE.muted,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.ink,
    marginTop: 2,
  },
  totalSub: {
    fontSize: 7.5,
    color: PALETTE.muted,
    marginTop: 1,
  },
  table: {
    borderTopWidth: 1,
    borderTopColor: PALETTE.line,
    borderLeftWidth: 1,
    borderLeftColor: PALETTE.line,
    borderRightWidth: 1,
    borderRightColor: PALETTE.line,
  },
  thead: {
    flexDirection: 'row',
    backgroundColor: PALETTE.brandLight,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.line,
  },
  th: {
    padding: 5,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: PALETTE.ink2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.line,
  },
  rowAlt: {
    backgroundColor: PALETTE.rowAlt,
  },
  td: {
    padding: 5,
    fontSize: 8,
    color: PALETTE.ink2,
  },
  // Column widths sum to ~539 (A4 minus 2×28 padding ≈ 539pt)
  colNo: { width: 24 },
  colProduct: { width: 175 },
  colVariant: { width: 70 },
  colSku: { width: 60 },
  colOpen: { width: 45, textAlign: 'right' },
  colStock: { width: 45, textAlign: 'right' },
  colNet: { width: 55, textAlign: 'right' },
  colAge: { width: 45, textAlign: 'right' },
  productTitle: {
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.ink,
  },
  productDesc: {
    fontSize: 7,
    color: PALETTE.muted,
    marginTop: 1,
  },
  netCell: {
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: PALETTE.muted,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.line,
  },
});

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function KikaManufacturingPdf({
  report,
  generatedAt,
}: {
  report: ManufacturingReport;
  generatedAt: string;
}) {
  return (
    <Document
      title={`KIKA Manufacturing Plan ${report.fromDate} to ${report.toDate}`}
      author="Lime Investments · KIKA"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <Text style={styles.brand}>KIKA · MANUFACTURING PLAN</Text>
            <Text style={styles.title}>Products to manufacture</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.periodLabel}>
              Period: {report.label} ({report.fromDate} → {report.toDate})
            </Text>
            <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
          </View>
        </View>

        {/* Totals strip */}
        <View style={styles.totals}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Net to make</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.total_net_to_make)}</Text>
            <Text style={styles.totalSub}>units after netting stock</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Open units</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.total_open_units)}</Text>
            <Text style={styles.totalSub}>across unfulfilled orders</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Variants</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.distinct_variants)}</Text>
            <Text style={styles.totalSub}>
              from {fmt(report.totals.distinct_products)} products
            </Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Open orders</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.open_order_count)}</Text>
            <Text style={styles.totalSub}>unfulfilled in period</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, styles.colNo]}>#</Text>
            <Text style={[styles.th, styles.colProduct]}>Product</Text>
            <Text style={[styles.th, styles.colVariant]}>Variant</Text>
            <Text style={[styles.th, styles.colSku]}>SKU</Text>
            <Text style={[styles.th, styles.colOpen]}>Open</Text>
            <Text style={[styles.th, styles.colStock]}>Stock</Text>
            <Text style={[styles.th, styles.colNet]}>Net to make</Text>
            <Text style={[styles.th, styles.colAge]}>Oldest</Text>
          </View>
          {report.rows.length === 0 ? (
            <View style={styles.row}>
              <Text style={[styles.td, { width: '100%', color: PALETTE.muted }]}>
                Nothing open in this period — no manufacturing required.
              </Text>
            </View>
          ) : (
            report.rows.map((r, i) => (
              <View
                key={`${r.product_id}:${r.variant_id ?? 0}`}
                style={[styles.row, i % 2 === 1 ? styles.rowAlt : {}]}
                wrap={false}
              >
                <Text style={[styles.td, styles.colNo]}>{i + 1}</Text>
                <View style={[styles.td, styles.colProduct]}>
                  <Text style={styles.productTitle}>{r.product_title}</Text>
                  {r.short_description && (
                    <Text style={styles.productDesc}>
                      {r.short_description.length > 110
                        ? `${r.short_description.slice(0, 110)}…`
                        : r.short_description}
                    </Text>
                  )}
                </View>
                <Text style={[styles.td, styles.colVariant]}>{r.variant_title || '—'}</Text>
                <Text
                  style={[
                    styles.td,
                    styles.colSku,
                    { fontFamily: 'Helvetica-Oblique', color: PALETTE.muted },
                  ]}
                >
                  {r.sku || '—'}
                </Text>
                <Text style={[styles.td, styles.colOpen]}>{fmt(r.open_qty)}</Text>
                <Text
                  style={[
                    styles.td,
                    styles.colStock,
                    r.in_stock < 0 ? { color: PALETTE.warn } : {},
                  ]}
                >
                  {fmt(r.in_stock)}
                </Text>
                <Text style={[styles.td, styles.colNet, styles.netCell]}>
                  {fmt(r.net_to_make)}
                </Text>
                <Text style={[styles.td, styles.colAge]}>
                  {r.oldest_age_days != null ? `${r.oldest_age_days}d` : '—'}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Footer with page numbers */}
        <View style={styles.footer} fixed>
          <Text>
            KIKA · kika-swim-wear · Lime Investments · {report.totals.distinct_variants}{' '}
            variants
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
