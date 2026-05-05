/**
 * PDF Page 2 — Project Details (portrait)
 * Customer info, contacts, period, zones, scope summary.
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

export function ProjectDetailsPdf({ data }: { data: ReportData }) {
  const { contract } = data.meta;
  const { customer_contacts, zones, scope_summary, services } = data.project_details;

  // Limit to 3 contacts
  const contacts = customer_contacts.slice(0, 3);

  return (
    <View>
      <Text style={pdfStyles.h2}>Project Details</Text>
      <View style={pdfStyles.mt6} />

      {/* Customer info row */}
      <View style={{ flexDirection: 'row', gap: 24, marginBottom: 10 }}>
        {contract.customer && (
          <View style={{ flex: 1 }}>
            <Text style={pdfStyles.kpiLabel}>Customer</Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 2 }}>{contract.customer}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={pdfStyles.kpiLabel}>Contract Period</Text>
          <Text style={{ fontSize: 8, marginTop: 2 }}>
            {contract.start_date} → {contract.end_date}
          </Text>
          <Text style={[pdfStyles.small, { marginTop: 1 }]}>{contract.duration_months} months</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={pdfStyles.kpiLabel}>Contract Value</Text>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 2 }}>
            {(contract.contract_value / 1_000_000).toFixed(2)} M EGP / year
          </Text>
          <Text style={[pdfStyles.small, { marginTop: 1 }]}>VAT {contract.vat_pct}%</Text>
        </View>
      </View>

      {/* Contacts */}
      {contacts.length > 0 && (
        <>
          <Text style={[pdfStyles.h3, { fontSize: 8, marginBottom: 4 }]}>Customer Contacts</Text>
          <View style={pdfStyles.table}>
            <View style={pdfStyles.rowHead}>
              <Text style={[pdfStyles.cell, { width: 90, fontFamily: 'Helvetica-Bold' }]}>Name</Text>
              <Text style={[pdfStyles.cell, { width: 90, fontFamily: 'Helvetica-Bold' }]}>Role</Text>
              <Text style={[pdfStyles.cell, { width: 110, fontFamily: 'Helvetica-Bold' }]}>Email</Text>
              <Text style={[pdfStyles.cell, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>Phone</Text>
            </View>
            {contacts.map((c, i) => (
              <View key={i} style={pdfStyles.row}>
                <Text style={[pdfStyles.cell, { width: 90 }]}>{c.name}</Text>
                <Text style={[pdfStyles.cell, { width: 90, color: PDF_THEME.colors.textSecondary }]}>{c.role}</Text>
                <Text style={[pdfStyles.cell, { width: 110, color: PDF_THEME.colors.textSecondary }]}>{c.email}</Text>
                <Text style={[pdfStyles.cell, { flex: 1, color: PDF_THEME.colors.textSecondary }]}>{c.phone}</Text>
              </View>
            ))}
          </View>
          <View style={pdfStyles.mt6} />
        </>
      )}

      {/* Zones */}
      {zones.length > 0 && (
        <>
          <Text style={[pdfStyles.kpiLabel, { marginBottom: 4 }]}>Zones / Areas</Text>
          <Text style={[pdfStyles.body, { marginBottom: 8 }]}>
            {zones.join(' · ')}
          </Text>
        </>
      )}

      {/* Services */}
      {services.length > 0 && (
        <>
          <Text style={[pdfStyles.kpiLabel, { marginBottom: 4 }]}>Service Lines in Scope</Text>
          <Text style={[pdfStyles.body, { marginBottom: 8 }]}>
            {services.map(sl => SL_LABELS[sl] ?? sl).join(' · ')}
          </Text>
        </>
      )}

      {/* Scope summary */}
      {scope_summary && (
        <>
          <Text style={[pdfStyles.kpiLabel, { marginBottom: 4 }]}>Scope Summary</Text>
          <View style={pdfStyles.card}>
            <Text style={pdfStyles.body}>{scope_summary}</Text>
          </View>
        </>
      )}
    </View>
  );
}
