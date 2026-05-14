// src/app/beithady/hr/payroll/_components/payslip-en.tsx
import 'server-only';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Page, Text, View, Image, StyleSheet,
} from '@react-pdf/renderer';
import type { PayslipData } from '@/lib/beithady/hr/hr-payroll-types';

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

const s = StyleSheet.create({
  page:     { padding: 32, fontSize: 9, fontFamily: 'Helvetica', color: C.ink, backgroundColor: '#ffffff' },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: C.brand },
  logo:     { width: 70, height: 35, objectFit: 'contain' },
  titleBlk: { alignItems: 'flex-end' },
  title:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.brand },
  month:    { fontSize: 9, color: C.muted, marginTop: 2 },
  empBox:   { backgroundColor: C.bg, borderRadius: 4, padding: 10, marginBottom: 14 },
  empName:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.brand, marginBottom: 3 },
  empMeta:  { fontSize: 8, color: C.muted },
  section:  { marginBottom: 12 },
  sHead:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.brand, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: C.line },
  row:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowAlt:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, backgroundColor: C.bg },
  label:    { fontSize: 8.5, color: C.ink },
  amount:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: C.line, marginTop: 2 },
  totLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.brand },
  totAmt:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.brand },
  netBox:   { backgroundColor: C.brand, borderRadius: 4, padding: 10, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  netAmt:   { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  footer:   { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' },
  sigBlk:   { width: '45%' },
  sigLbl:   { fontSize: 7.5, color: C.muted, marginBottom: 16 },
  sigLine:  { borderBottomWidth: 1, borderBottomColor: C.line },
});

function fmt(n: number): string {
  return `EGP ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function PayslipEn({ data }: { data: PayslipData }) {
  const logo = getLogo();
  const totalEarnings = data.salary_package + data.ot + data.transport_allowance + data.travel_allowance + data.bonus;
  const totalDeductions = data.salary_in_advance + data.deduction;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          {logo ? <Image style={s.logo} src={logo} /> : <View />}
          <View style={s.titleBlk}>
            <Text style={s.title}>Salary Slip</Text>
            <Text style={s.month}>{data.month_label}</Text>
          </View>
        </View>

        {/* Employee */}
        <View style={s.empBox}>
          <Text style={s.empName}>{data.employee_name}</Text>
          <Text style={s.empMeta}>
            {data.bh_id ? `${data.bh_id}  ·  ` : ''}{data.job_title}  ·  {data.building_label}
          </Text>
          <Text style={[s.empMeta, { marginTop: 2 }]}>Working Days: {data.working_days}</Text>
        </View>

        {/* Earnings */}
        <View style={s.section}>
          <Text style={s.sHead}>Earnings</Text>
          {([
            ['Basic Salary', data.salary_package],
            ['Overtime', data.ot],
            ['Transport Allowance', data.transport_allowance],
            ['Travel Allowance', data.travel_allowance],
            ['Bonus', data.bonus],
          ] as [string, number][]).map(([label, amount], i) => (
            <View key={label} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.amount}>{fmt(amount)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totLabel}>Total Earnings</Text>
            <Text style={s.totAmt}>{fmt(totalEarnings)}</Text>
          </View>
        </View>

        {/* Deductions */}
        <View style={s.section}>
          <Text style={s.sHead}>Deductions</Text>
          {([
            ['Salary in Advance', data.salary_in_advance],
            ['Other Deductions', data.deduction],
          ] as [string, number][]).map(([label, amount], i) => (
            <View key={label} style={i % 2 === 0 ? s.row : s.rowAlt}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.amount}>{fmt(amount)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totLabel}>Total Deductions</Text>
            <Text style={s.totAmt}>{fmt(totalDeductions)}</Text>
          </View>
        </View>

        {/* Net */}
        <View style={s.netBox}>
          <Text style={s.netLabel}>NET SALARY</Text>
          <Text style={s.netAmt}>{fmt(data.net_salary)}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.sigBlk}>
            <Text style={s.sigLbl}>HR Signature</Text>
            <View style={s.sigLine} />
          </View>
          <View style={s.sigBlk}>
            <Text style={s.sigLbl}>Employee Signature</Text>
            <View style={s.sigLine} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
