/**
 * PDF Page 10 — Sign-Off (portrait)
 * 2 signature lines per mode + history table.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import { LabelDual } from '../pdf-shared/label-dual';
import type { ReportData } from '../types';

const ROLE_LABELS: Record<string, string> = {
  project_manager: 'Project Manager',
  finance_director: 'Finance Director',
  fmplus_signatory: 'FMPlus Authorized Signatory',
  customer_signatory: 'Customer Authorized Signatory',
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function SignOffPdf({ data }: { data: ReportData }) {
  const { lang } = data.meta;
  const { lines, history } = data.signoff;

  if (lines.length === 0 && history.length === 0) return null;

  return (
    <View>
      <Text style={pdfStyles.h2}>Sign-Off</Text>
      <View style={pdfStyles.mt8} />

      {/* Signature lines — 2-column grid */}
      {lines.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginBottom: 16 }}>
          {lines.map((line, i) => (
            <View key={i} style={{ width: 200 }}>
              {/* Signature dash line */}
              <View style={{ borderBottom: '0.75px solid #555555', height: 40, marginBottom: 4 }} />
              <View style={{ padding: 2 }}>
                <LabelDual en={line.placeholder_en} ar={line.placeholder_ar} lang={lang} fontSize={7} />
              </View>
              <Text style={[pdfStyles.small, { textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }]}>
                {ROLE_LABELS[line.role] ?? line.role}
              </Text>
              <Text style={[pdfStyles.small, { marginTop: 4 }]}>
                Date: ____________________
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Sign-off history */}
      {history.length > 0 && (
        <>
          <Text style={[pdfStyles.kpiLabel, { marginBottom: 6 }]}>Sign-off History</Text>
          <View style={pdfStyles.table}>
            <View style={pdfStyles.rowHead}>
              <Text style={[pdfStyles.cell, { width: 110, fontFamily: 'Helvetica-Bold' }]}>Role</Text>
              <Text style={[pdfStyles.cell, { width: 60, fontFamily: 'Helvetica-Bold' }]}>Mode</Text>
              <Text style={[pdfStyles.cell, { width: 80, fontFamily: 'Helvetica-Bold' }]}>Signed At</Text>
              <Text style={[pdfStyles.cell, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>Notes</Text>
            </View>
            {history.map((h) => (
              <View key={h.id ?? h.signed_by} style={pdfStyles.row}>
                <Text style={[pdfStyles.cell, { width: 110 }]}>{ROLE_LABELS[h.signed_role] ?? h.signed_role}</Text>
                <Text style={[pdfStyles.cell, { width: 60, textTransform: 'capitalize', color: PDF_THEME.colors.textSecondary }]}>{h.mode}</Text>
                <Text style={[pdfStyles.cell, { width: 80, color: PDF_THEME.colors.textSecondary }]}>{fmtDate(h.signed_at)}</Text>
                <Text style={[pdfStyles.cell, { flex: 1, color: PDF_THEME.colors.textSecondary }]}>{h.notes ?? '—'}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
