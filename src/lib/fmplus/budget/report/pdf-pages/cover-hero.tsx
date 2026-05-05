/**
 * PDF Page 1 — Cover Hero (portrait)
 * Title + 4 KPI tiles + status pill.
 * Rendered inside a <Page> at the top-level document.
 */
import React from 'react';
import { View, Text, Svg, Rect } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import { StatusPill } from '../pdf-shared/status-pill';
import type { ReportData } from '../types';

const MODE_LABELS: Record<string, string> = {
  pre: 'Pre-Contract',
  signoff: 'Sign-Off',
  customer: 'Customer',
  snapshot: 'Snapshot',
};

function fmtM(n: number) {
  return (n / 1_000_000).toFixed(2) + ' M';
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}

function KpiTile({ label, value, sub, valueColor }: KpiProps) {
  return (
    <View style={pdfStyles.kpiTile}>
      <Text style={pdfStyles.kpiLabel}>{label}</Text>
      <Text style={[pdfStyles.kpiValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      {sub && <Text style={pdfStyles.kpiSub}>{sub}</Text>}
    </View>
  );
}

export function CoverHero({ data }: { data: ReportData }) {
  const { contract, year, mode } = data.meta;
  const modeLabel = MODE_LABELS[mode] ?? mode;
  const yearLabel = year.fiscal_year ? `FY ${year.fiscal_year}` : `Y${year.year_index}`;

  const totalHC = data.service_lines.reduce((a, s) => a + s.hc_required, 0);
  const annualCost = data.service_lines.reduce((a, s) => a + (s.monthly_cost ?? 0) * 12, 0);
  const totalGpPct = data.service_lines.length > 0
    ? data.service_lines.reduce((a, s) => a + (s.gp_pct ?? 0), 0) / data.service_lines.length
    : 0;
  const showGp = data.service_lines.some(s => s.gp_pct != null);

  const gpColor = totalGpPct >= 20 ? PDF_THEME.colors.green
    : totalGpPct >= 10 ? PDF_THEME.colors.amber
    : PDF_THEME.colors.red;

  return (
    <View>
      {/* Yellow accent bar */}
      <View style={pdfStyles.yellowBar} />

      {/* Report type badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Text style={{ fontSize: 7, color: PDF_THEME.colors.greyDark, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {modeLabel} Report · {yearLabel} ·{' '}
          <Text style={{ textTransform: 'capitalize', color: PDF_THEME.colors.greyDark }}>{year.scenario}</Text>
        </Text>
        <StatusPill status={year.status} />
      </View>

      {/* Contract title */}
      <Text style={[pdfStyles.h1, { fontSize: 22, marginBottom: 2 }]}>{contract.name}</Text>
      {contract.customer && (
        <Text style={[pdfStyles.body, { marginBottom: 14, color: PDF_THEME.colors.greyDark }]}>
          {contract.customer}
        </Text>
      )}

      {/* KPI tiles */}
      <View style={pdfStyles.kpiRow}>
        {annualCost > 0 && (
          <KpiTile label="Annual Cost" value={fmtM(annualCost)} sub="EGP" />
        )}
        <KpiTile
          label="Contract Value"
          value={fmtM(contract.contract_value)}
          sub="EGP / year"
        />
        {showGp && (
          <KpiTile
            label="Blended GP %"
            value={fmtPct(totalGpPct)}
            valueColor={gpColor}
          />
        )}
        <KpiTile label="Total HC" value={String(totalHC)} sub="headcount required" />
      </View>

      {/* Divider */}
      <View style={[pdfStyles.divider, { marginTop: 16 }]} />

      {/* Contract period */}
      <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
        <View>
          <Text style={pdfStyles.kpiLabel}>Period</Text>
          <Text style={{ fontSize: 8, marginTop: 1, fontFamily: 'Helvetica-Bold' }}>
            {contract.start_date} → {contract.end_date}
          </Text>
        </View>
        <View>
          <Text style={pdfStyles.kpiLabel}>Duration</Text>
          <Text style={{ fontSize: 8, marginTop: 1, fontFamily: 'Helvetica-Bold' }}>
            {contract.duration_months} months
          </Text>
        </View>
        <View>
          <Text style={pdfStyles.kpiLabel}>VAT</Text>
          <Text style={{ fontSize: 8, marginTop: 1, fontFamily: 'Helvetica-Bold' }}>
            {contract.vat_pct}%
          </Text>
        </View>
      </View>
    </View>
  );
}
