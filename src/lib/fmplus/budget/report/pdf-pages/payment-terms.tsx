/**
 * PDF Page 7 — Payment Terms (portrait)
 * Plain text card. Returns null if payment_terms is null.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../theme';
import type { ReportData } from '../types';

export function PaymentTermsPdf({ data }: { data: ReportData }): React.ReactElement | null {
  if (!data.payment_terms) return null;

  return (
    <View>
      <Text style={pdfStyles.h2}>Payment Terms</Text>
      <View style={pdfStyles.mt6} />
      <View style={pdfStyles.card}>
        <Text style={[pdfStyles.body, { lineHeight: 1.5 }]}>{data.payment_terms}</Text>
      </View>
    </View>
  );
}
