/**
 * PDF Page 3 — Service Line Summary (portrait)
 * Table per service line. Mode-aware columns.
 * customer: HC Required + Monthly Fee + Annual Ex/Incl VAT
 * internal: adds Monthly Cost + GP%
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import type { ReportData } from '../types';

const SL_LABELS: Record<string, string> = {
  hk: 'Housekeeping', mep: 'MEP', landscape: 'Landscape',
  security: 'Security', pest_ctrl: 'Pest Control', waste_mgmt: 'Waste Mgmt',
  back_office: 'Back Office',
};

function fmtN(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Math.round(n).toLocaleString();
}

function fmtPct(n: number | null) {
  return n == null ? '—' : n.toFixed(1) + '%';
}

function gpColor(pct: number | null) {
  if (pct == null) return PDF_THEME.colors.textMuted;
  if (pct >= 20) return PDF_THEME.colors.green;
  if (pct >= 10) return PDF_THEME.colors.amber;
  return PDF_THEME.colors.red;
}

export function ServiceLineSummaryPdf({ data }: { data: ReportData }) {
  const { mode } = data.meta;
  const isCustomer = mode === 'customer';

  const totals = data.service_lines.reduce(
    (acc, s) => ({
      hc_required: acc.hc_required + s.hc_required,
      hc_budgeted: acc.hc_budgeted != null && s.hc_budgeted != null ? acc.hc_budgeted + s.hc_budgeted : null,
      monthly_cost: acc.monthly_cost != null && s.monthly_cost != null ? acc.monthly_cost + s.monthly_cost : null,
      monthly_fee: acc.monthly_fee + s.monthly_fee,
      annual_ex_vat: acc.annual_ex_vat + s.annual_ex_vat,
      annual_incl_vat: acc.annual_incl_vat + s.annual_incl_vat,
    }),
    { hc_required: 0, hc_budgeted: 0 as number | null, monthly_cost: 0 as number | null, monthly_fee: 0, annual_ex_vat: 0, annual_incl_vat: 0 },
  );

  // Column widths
  const W = { sl: 80, hcReq: 38, hcBud: 38, cost: 50, fee: 50, exVat: 55, inclVat: 55, gp: 35 };

  return (
    <View>
      <Text style={pdfStyles.h2}>Service Line Summary</Text>
      <View style={pdfStyles.mt6} />

      <View style={pdfStyles.table}>
        {/* Header */}
        <View style={pdfStyles.rowHead}>
          <Text style={[pdfStyles.cell, { width: W.sl, fontFamily: 'Helvetica-Bold' }]}>Service Line</Text>
          <Text style={[pdfStyles.cellRight, { width: W.hcReq, fontFamily: 'Helvetica-Bold' }]}>HC Req.</Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.hcBud, fontFamily: 'Helvetica-Bold' }]}>HC Bud.</Text>}
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost, fontFamily: 'Helvetica-Bold' }]}>Mthly Cost</Text>}
          <Text style={[pdfStyles.cellRight, { width: W.fee, fontFamily: 'Helvetica-Bold' }]}>Mthly Fee</Text>
          <Text style={[pdfStyles.cellRight, { width: W.exVat, fontFamily: 'Helvetica-Bold' }]}>Annual Ex-VAT</Text>
          <Text style={[pdfStyles.cellRight, { width: W.inclVat, fontFamily: 'Helvetica-Bold' }]}>Annual Incl-VAT</Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.gp, fontFamily: 'Helvetica-Bold' }]}>GP %</Text>}
        </View>

        {/* Rows */}
        {data.service_lines.map((s) => (
          <View key={s.service_line} style={pdfStyles.row}>
            <Text style={[pdfStyles.cellBold, { width: W.sl }]}>{SL_LABELS[s.service_line] ?? s.service_line}</Text>
            <Text style={[pdfStyles.cellRight, { width: W.hcReq }]}>{s.hc_required}</Text>
            {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.hcBud }]}>{s.hc_budgeted ?? '—'}</Text>}
            {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost }]}>{s.monthly_cost != null ? fmtN(s.monthly_cost) : '—'}</Text>}
            <Text style={[pdfStyles.cellRight, { width: W.fee }]}>{fmtN(s.monthly_fee)}</Text>
            <Text style={[pdfStyles.cellRight, { width: W.exVat }]}>{fmtN(s.annual_ex_vat)}</Text>
            <Text style={[pdfStyles.cellRight, { width: W.inclVat }]}>{fmtN(s.annual_incl_vat)}</Text>
            {!isCustomer && (
              <Text style={[pdfStyles.cellRight, { width: W.gp, color: gpColor(s.gp_pct), fontFamily: 'Helvetica-Bold' }]}>
                {fmtPct(s.gp_pct)}
              </Text>
            )}
          </View>
        ))}

        {/* Totals */}
        <View style={pdfStyles.rowTotal}>
          <Text style={[pdfStyles.cellBold, { width: W.sl }]}>TOTAL</Text>
          <Text style={[pdfStyles.cellRight, { width: W.hcReq, fontFamily: 'Helvetica-Bold' }]}>{totals.hc_required}</Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.hcBud, fontFamily: 'Helvetica-Bold' }]}>{totals.hc_budgeted ?? '—'}</Text>}
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.cost, fontFamily: 'Helvetica-Bold' }]}>{totals.monthly_cost != null ? fmtN(totals.monthly_cost) : '—'}</Text>}
          <Text style={[pdfStyles.cellRight, { width: W.fee, fontFamily: 'Helvetica-Bold' }]}>{fmtN(totals.monthly_fee)}</Text>
          <Text style={[pdfStyles.cellRight, { width: W.exVat, fontFamily: 'Helvetica-Bold' }]}>{fmtN(totals.annual_ex_vat)}</Text>
          <Text style={[pdfStyles.cellRight, { width: W.inclVat, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.gold }]}>{fmtN(totals.annual_incl_vat)}</Text>
          {!isCustomer && <Text style={[pdfStyles.cellRight, { width: W.gp }]} />}
        </View>
      </View>
    </View>
  );
}
