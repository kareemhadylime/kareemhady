/**
 * PDF Page 7 — Payment Terms (portrait)
 * Renders "Net {N} days" from the structured payment_terms_days column,
 * or "Not specified" when the value is null.
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../theme';
import type { ReportData } from '../types';

export function PaymentTermsPdf({ data }: { data: ReportData }): React.ReactElement {
  const days = data.payment_terms_days;
  const label = days != null ? `Net ${days} days` : 'Not specified';

  return (
    <View>
      <Text style={pdfStyles.h2}>Payment Terms</Text>
      <View style={pdfStyles.mt6} />
      <View style={pdfStyles.card}>
        <Text style={[pdfStyles.body, { lineHeight: 1.5 }]}>{label}</Text>
      </View>
    </View>
  );
}
