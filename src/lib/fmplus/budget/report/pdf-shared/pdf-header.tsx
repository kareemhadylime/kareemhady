/**
 * PDF Header — rendered at the top of every page via a fixed element.
 * The geometric "+" logo is rendered with 4 Rect elements.
 * Customer logo is shown only when mode='customer' and a URL is available.
 */
import React from 'react';
import { View, Text, Image, Svg, Rect } from '@react-pdf/renderer';
import { PDF_THEME, pdfStyles } from '../theme';
import type { ReportData } from '../types';

const MODE_LABELS: Record<string, string> = {
  pre: 'Pre-Contract',
  signoff: 'Sign-Off',
  customer: 'Customer',
  snapshot: 'Snapshot',
};

/** Simple geometric "+" made of 4 rectangles — 3×3 grid, cross shape */
function FmplusPlusIcon() {
  const c = PDF_THEME.colors.yellow;
  const s = 5; // unit size (px)
  return (
    <Svg width={15} height={15} viewBox="0 0 15 15">
      {/* Center column (vertical bar) */}
      <Rect x={5} y={0} width={s} height={15} fill={c} />
      {/* Center row (horizontal bar) */}
      <Rect x={0} y={5} width={15} height={s} fill={c} />
    </Svg>
  );
}

interface PdfHeaderProps {
  data: ReportData;
}

export function PdfHeader({ data }: PdfHeaderProps) {
  const { contract, year, mode } = data.meta;
  const isCustomer = mode === 'customer';
  const hasCustomerLogo = isCustomer && !!contract.customer_logo_url;
  const statusLabel = year.status === 'published' ? 'PUBLISHED' : 'DRAFT';
  const modeLabel = MODE_LABELS[mode] ?? mode;
  const yearLabel = year.fiscal_year ? `FY ${year.fiscal_year}` : `Y${year.year_index}`;

  return (
    <View
      fixed
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: `1.5px solid ${PDF_THEME.colors.yellow}`,
        paddingBottom: 6,
        marginBottom: 12,
      }}
    >
      {/* Left: FM+ icon + brand name */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <FmplusPlusIcon />
        <View>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.black, letterSpacing: 0.5 }}>
            FM+
          </Text>
          <Text style={{ fontSize: 6, color: PDF_THEME.colors.greyDark }}>
            Project Report
          </Text>
        </View>
      </View>

      {/* Center: contract info */}
      <View style={{ flex: 1, marginHorizontal: 12, alignItems: 'center' }}>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.black }}>
          {contract.name}
        </Text>
        <Text style={{ fontSize: 6, color: PDF_THEME.colors.greyDark, marginTop: 1 }}>
          {modeLabel} · {yearLabel} ·{' '}
          <Text style={{ color: year.status === 'published' ? PDF_THEME.colors.green : PDF_THEME.colors.amber }}>
            {statusLabel}
          </Text>
        </Text>
      </View>

      {/* Right: customer logo (customer mode only) or spacer */}
      {hasCustomerLogo ? (
        <Image
          src={contract.customer_logo_url!}
          style={{ height: 24, maxWidth: 70, objectFit: 'contain' }}
        />
      ) : (
        <View style={{ width: 70 }} />
      )}
    </View>
  );
}
