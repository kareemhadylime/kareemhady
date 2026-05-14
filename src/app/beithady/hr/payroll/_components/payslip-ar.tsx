// src/app/beithady/hr/payroll/_components/payslip-ar.tsx
import 'server-only';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Page, Text, View, Image, StyleSheet, Font,
} from '@react-pdf/renderer';
import type { PayslipData } from '@/lib/beithady/hr/hr-payroll-types';

// Register Arabic font — same TTF used by FMPLUS budget reports
try {
  Font.register({
    family: 'NotoSansArabic',
    src: '/fonts/NotoSansArabic-Regular.ttf',
  });
} catch { /* degrade silently in test env */ }

const C = {
  brand: '#003462',
  ink:   '#1a2c47',
  muted: '#7a8aa3',
  line:  '#e2e8f0',
  bg:    '#f8fafc',
};

let _logo: Buffer | null = null;
function getLogo(): Buffer | null {
  if (_logo) return _logo;
  try {
    _logo = readFileSync(join(process.cwd(), 'public', 'brand', 'beithady', 'logo-stacked.jpg'));
    return _logo;
  } catch { return null; }
}

const AR = StyleSheet.create({
  page:     { padding: 32, fontSize: 9, fontFamily: 'NotoSansArabic', color: C.ink, backgroundColor: '#ffffff', direction: 'rtl' },
  header:   { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: C.brand },
  logo:     { width: 70, height: 35, objectFit: 'contain' },
  titleBlk: { alignItems: 'flex-start' },
  title:    { fontSize: 16, color: C.brand },
  month:    { fontSize: 9, color: C.muted, marginTop: 2 },
  empBox:   { backgroundColor: C.bg, borderRadius: 4, padding: 10, marginBottom: 14, alignItems: 'flex-end' },
  empName:  { fontSize: 12, color: C.brand, marginBottom: 3 },
  empMeta:  { fontSize: 8, color: C.muted },
  section:  { marginBottom: 12 },
  sHead:    { fontSize: 8, color: C.brand, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.line, textAlign: 'right' },
  row:      { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 3 },
  rowAlt:   { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 3, backgroundColor: C.bg },
  label:    { fontSize: 8.5, color: C.ink, textAlign: 'right' },
  amount:   { fontSize: 8.5, color: C.ink },
  totalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: C.line, marginTop: 2 },
  totLbl:   { fontSize: 9, color: C.brand, textAlign: 'right' },
  totAmt:   { fontSize: 9, color: C.brand },
  netBox:   { backgroundColor: C.brand, borderRadius: 4, padding: 10, marginTop: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 12, color: '#ffffff' },
  netAmt:   { fontSize: 14, color: '#ffffff' },
  footer:   { marginTop: 20, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  sigBlk:   { width: '45%', alignItems: 'flex-end' },
  sigLbl:   { fontSize: 7.5, color: C.muted, marginBottom: 16 },
  sigLine:  { borderBottomWidth: 1, borderBottomColor: C.line, width: '100%' },
});

function fmt(n: number): string {
  return `${n.toLocaleString('ar-EG', { minimumFractionDigits: 0 })} جنيه`;
}

export function PayslipAr({ data }: { data: PayslipData }) {
  const logo = getLogo();
  const totalEarnings = data.salary_package + data.ot + data.transport_allowance + data.travel_allowance + data.bonus;
  const totalDeductions = data.salary_in_advance + data.deduction;
  const displayName = data.arabic_name ?? data.employee_name;

  return (
    <Document>
      <Page size="A4" style={AR.page}>
        {/* Header */}
        <View style={AR.header}>
          {logo ? <Image style={AR.logo} src={logo} /> : <View />}
          <View style={AR.titleBlk}>
            <Text style={AR.title}>كشف مرتب</Text>
            <Text style={AR.month}>{data.month_label}</Text>
          </View>
        </View>

        {/* Employee */}
        <View style={AR.empBox}>
          <Text style={AR.empName}>{displayName}</Text>
          <Text style={AR.empMeta}>
            {data.bh_id ? `${data.bh_id}  ·  ` : ''}{data.job_title}  ·  {data.building_label}
          </Text>
          <Text style={[AR.empMeta, { marginTop: 2 }]}>أيام العمل: {data.working_days}</Text>
        </View>

        {/* Earnings */}
        <View style={AR.section}>
          <Text style={AR.sHead}>المكافآت</Text>
          {([
            ['الراتب الأساسي',  data.salary_package],
            ['العمل الإضافي',   data.ot],
            ['بدل مواصلات',     data.transport_allowance],
            ['بدل سفر',         data.travel_allowance],
            ['مكافأة',          data.bonus],
          ] as [string, number][]).map(([label, amount], i) => (
            <View key={label} style={i % 2 === 0 ? AR.row : AR.rowAlt}>
              <Text style={AR.label}>{label}</Text>
              <Text style={AR.amount}>{fmt(amount)}</Text>
            </View>
          ))}
          <View style={AR.totalRow}>
            <Text style={AR.totLbl}>إجمالي المكافآت</Text>
            <Text style={AR.totAmt}>{fmt(totalEarnings)}</Text>
          </View>
        </View>

        {/* Deductions */}
        <View style={AR.section}>
          <Text style={AR.sHead}>الخصومات</Text>
          {([
            ['سلفة',          data.salary_in_advance],
            ['خصومات أخرى',   data.deduction],
          ] as [string, number][]).map(([label, amount], i) => (
            <View key={label} style={i % 2 === 0 ? AR.row : AR.rowAlt}>
              <Text style={AR.label}>{label}</Text>
              <Text style={AR.amount}>{fmt(amount)}</Text>
            </View>
          ))}
          <View style={AR.totalRow}>
            <Text style={AR.totLbl}>إجمالي الخصومات</Text>
            <Text style={AR.totAmt}>{fmt(totalDeductions)}</Text>
          </View>
        </View>

        {/* Net */}
        <View style={AR.netBox}>
          <Text style={AR.netLabel}>صافي الراتب</Text>
          <Text style={AR.netAmt}>{fmt(data.net_salary)}</Text>
        </View>

        {/* Footer */}
        <View style={AR.footer}>
          <View style={AR.sigBlk}>
            <Text style={AR.sigLbl}>توقيع قسم الموارد البشرية</Text>
            <View style={AR.sigLine} />
          </View>
          <View style={AR.sigBlk}>
            <Text style={AR.sigLbl}>توقيع الموظف</Text>
            <View style={AR.sigLine} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
