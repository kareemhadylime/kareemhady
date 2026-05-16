import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PickerReport } from './kika-picker';

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
  brand: {
    fontSize: 9,
    color: PALETTE.brand,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: PALETTE.ink },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end' },
  scopeLabel: { fontSize: 8.5, color: PALETTE.muted },
  generatedAt: { fontSize: 7.5, color: PALETTE.muted, marginTop: 1 },
  totals: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  totalCard: { flex: 1, backgroundColor: PALETTE.brandLight, borderRadius: 4, padding: 8 },
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
  totalSub: { fontSize: 7.5, color: PALETTE.muted, marginTop: 1 },
  sectionH: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.ink,
    marginTop: 10,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.line,
  },
  bucketH: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#3730a3',
    backgroundColor: PALETTE.brandLight,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 6,
    marginBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
  },
  orderNo: {
    width: 50,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: PALETTE.brand,
  },
  orderMid: { flex: 1, fontSize: 8.5 },
  orderCust: { fontFamily: 'Helvetica-Bold', color: PALETTE.ink2 },
  orderLine: { fontSize: 7.5, color: PALETTE.muted, marginTop: 1 },
  orderAge: { width: 30, fontSize: 7.5, color: PALETTE.muted, textAlign: 'right' },
  itemsThead: {
    flexDirection: 'row',
    backgroundColor: PALETTE.rowAlt,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.line,
  },
  itemsTh: {
    padding: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    color: PALETTE.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  itemsRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
  },
  itemsTd: { padding: 3, fontSize: 8.5 },
  colProduct: { width: 240 },
  colSku: { width: 80 },
  colOrders: { width: 50, textAlign: 'right' },
  colUnits: { width: 50, textAlign: 'right' },
  productCell: { fontFamily: 'Helvetica-Bold', color: PALETTE.ink },
  variantCell: { color: PALETTE.muted, fontSize: 8 },
  skuMono: { fontFamily: 'Courier', fontSize: 7.5, color: PALETTE.muted },
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

export function KikaPickerPdf({
  report,
  generatedAt,
}: {
  report: PickerReport;
  generatedAt: string;
}) {
  return (
    <Document
      title={`KIKA Picker Report ${report.scope_label}`}
      author="Lime Investments · KIKA"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>KIKA · PICKER REPORT</Text>
            <Text style={styles.title}>Orders to fulfill</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.scopeLabel}>Scope: {report.scope_label}</Text>
            <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Open orders</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.open_orders)}</Text>
            <Text style={styles.totalSub}>unfulfilled · not cancelled</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total lines</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.total_lines)}</Text>
            <Text style={styles.totalSub}>remaining SKU instances</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total units</Text>
            <Text style={styles.totalValue}>{fmt(report.totals.total_units)}</Text>
            <Text style={styles.totalSub}>physical units to pack</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Oldest</Text>
            <Text style={styles.totalValue}>
              {report.totals.oldest_age_days != null ? `${report.totals.oldest_age_days}d` : '—'}
            </Text>
            <Text style={styles.totalSub}>earliest order</Text>
          </View>
        </View>

        {/* Buckets */}
        <Text style={styles.sectionH}>Fulfillment buckets — {report.scope_label}</Text>

        {report.buckets.length === 0 ? (
          <Text style={{ fontSize: 9, color: PALETTE.muted, marginTop: 4 }}>
            Nothing open in this scope — no picker work to do.
          </Text>
        ) : (
          report.buckets.map(b => (
            <View key={b.key} wrap>
              <View style={styles.bucketH}>
                <Text>{`${b.label} orders`}</Text>
                <Text>{`${fmt(b.total_orders)} orders · ${fmt(b.total_units)} units`}</Text>
              </View>
              {b.orders.map(o => (
                <View key={o.id} style={styles.orderRow} wrap={false}>
                  <Text style={styles.orderNo}>{o.name}</Text>
                  <View style={styles.orderMid}>
                    <Text style={styles.orderCust}>
                      {o.customer_name || o.email || '—'}
                    </Text>
                    {o.lines.map((ln, i) => (
                      <Text key={i} style={styles.orderLine}>
                        {`${ln.qty}× ${ln.product_title}`}
                        {ln.variant_title ? ` · ${ln.variant_title}` : ''}
                        {ln.sku ? ` (${ln.sku})` : ''}
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.orderAge}>
                    {o.age_days != null ? `${o.age_days}d` : '—'}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}

        {/* Common items */}
        <Text style={styles.sectionH}>Most common items in unfulfilled orders</Text>

        {report.common_items.length === 0 ? (
          <Text style={{ fontSize: 9, color: PALETTE.muted, marginTop: 4 }}>
            No items to surface in this scope.
          </Text>
        ) : (
          <View>
            <View style={styles.itemsThead} fixed>
              <Text style={[styles.itemsTh, styles.colProduct]}>Product / Variant</Text>
              <Text style={[styles.itemsTh, styles.colSku]}>SKU</Text>
              <Text style={[styles.itemsTh, styles.colOrders]}>Orders</Text>
              <Text style={[styles.itemsTh, styles.colUnits]}>Units</Text>
            </View>
            {report.common_items.map(p => (
              <View key={p.product_id} wrap={false}>
                <View style={styles.itemsRow}>
                  <Text style={[styles.itemsTd, styles.colProduct, styles.productCell]}>
                    {p.product_title}
                  </Text>
                  <Text style={[styles.itemsTd, styles.colSku]}></Text>
                  <Text style={[styles.itemsTd, styles.colOrders, styles.productCell]}>
                    {fmt(p.total_orders)}
                  </Text>
                  <Text style={[styles.itemsTd, styles.colUnits, styles.productCell]}>
                    {fmt(p.total_units)}
                  </Text>
                </View>
                {p.variants.map(v => (
                  <View
                    key={`${p.product_id}:${v.variant_id ?? 'none'}`}
                    style={[styles.itemsRow, { backgroundColor: PALETTE.rowAlt }]}
                  >
                    <Text style={[styles.itemsTd, styles.colProduct, styles.variantCell]}>
                      {`· ${v.variant_title || '—'}`}
                    </Text>
                    <Text style={[styles.itemsTd, styles.colSku, styles.skuMono]}>
                      {v.sku || ''}
                    </Text>
                    <Text style={[styles.itemsTd, styles.colOrders, styles.variantCell]}>
                      {fmt(v.orders)}
                    </Text>
                    <Text style={[styles.itemsTd, styles.colUnits, styles.variantCell]}>
                      {fmt(v.units)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            KIKA · kika-swim-wear · Lime Investments · scope: {report.scope_label}
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
