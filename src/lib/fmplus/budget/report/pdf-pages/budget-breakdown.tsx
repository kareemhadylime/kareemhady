/**
 * PDF Page 5 — Budget Breakdown Matrix (LANDSCAPE)
 * 8-category × 7-service grid showing monthly cost per cell.
 * Returns null if data.budget_breakdown.cells === null (customer mode — caller skips page).
 */
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, PDF_THEME } from '../theme';
import type { ReportData } from '../types';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';

const SL_LABELS: Record<string, string> = {
  hk: 'HK', mep: 'MEP', landscape: 'LS', security: 'SEC',
  pest_ctrl: 'PEST', waste_mgmt: 'WASTE', back_office: 'BO',
};

const CAT_LABELS: Record<string, string> = {
  manning: 'Manning', ppe: 'PPE', tools: 'Tools', consumables: 'Consumables',
  transport: 'Transport', it: 'IT', governmental: 'Governmental', other: 'Other',
};

const ALL_CATEGORIES: Category[] = ['manning', 'ppe', 'tools', 'consumables', 'transport', 'it', 'governmental', 'other'];

function fmtN(n: number) {
  if (n === 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return Math.round(n).toString();
}

export function BudgetBreakdownPdf({ data }: { data: ReportData }): React.ReactElement | null {
  if (data.budget_breakdown.cells === null) return null;

  const cells = data.budget_breakdown.cells;
  const services = [...new Set(cells.map(c => c.service_line))] as ServiceLine[];
  const usedCategories = ALL_CATEGORIES.filter(cat => cells.some(c => c.category === cat));

  function getCell(cat: Category, sl: ServiceLine) {
    return cells.find(c => c.category === cat && c.service_line === sl)?.monthly ?? 0;
  }
  function rowTotal(cat: Category) {
    return services.reduce((sum, sl) => sum + getCell(cat, sl), 0);
  }
  function colTotal(sl: ServiceLine) {
    return usedCategories.reduce((sum, cat) => sum + getCell(cat, sl), 0);
  }
  const grandTotal = services.reduce((sum, sl) => sum + colTotal(sl), 0);

  // Landscape usable ~750px — cat col 80, each svc col 70, total col 70
  const catW = 80;
  const svcW = Math.min(70, Math.floor((690 - catW) / (services.length + 1)));
  const totW = svcW;

  return (
    <View>
      <Text style={pdfStyles.h2}>Budget Breakdown Matrix</Text>
      <Text style={[pdfStyles.small, { marginBottom: 8 }]}>Monthly cost by category × service line (EGP)</Text>

      <View style={pdfStyles.table}>
        {/* Header */}
        <View style={pdfStyles.rowHead}>
          <Text style={[pdfStyles.cell, { width: catW, fontFamily: 'Helvetica-Bold' }]}>Category</Text>
          {services.map(sl => (
            <Text key={sl} style={[pdfStyles.cellRight, { width: svcW, fontFamily: 'Helvetica-Bold' }]}>
              {SL_LABELS[sl] ?? sl}
            </Text>
          ))}
          <Text style={[pdfStyles.cellRight, { width: totW, fontFamily: 'Helvetica-Bold' }]}>Total</Text>
        </View>

        {/* Category rows */}
        {usedCategories.map(cat => {
          const rTotal = rowTotal(cat);
          return (
            <View key={cat} style={pdfStyles.row}>
              <Text style={[pdfStyles.cellBold, { width: catW }]}>{CAT_LABELS[cat] ?? cat}</Text>
              {services.map(sl => {
                const val = getCell(cat, sl);
                return (
                  <Text key={sl} style={[pdfStyles.cellRight, { width: svcW, color: val === 0 ? PDF_THEME.colors.greyLight : PDF_THEME.colors.textPrimary }]}>
                    {fmtN(val)}
                  </Text>
                );
              })}
              <Text style={[pdfStyles.cellRight, { width: totW, fontFamily: 'Helvetica-Bold' }]}>{fmtN(rTotal)}</Text>
            </View>
          );
        })}

        {/* Column totals */}
        <View style={pdfStyles.rowTotal}>
          <Text style={[pdfStyles.cell, { width: catW, fontSize: 6, textTransform: 'uppercase', color: PDF_THEME.colors.textSecondary }]}>Total</Text>
          {services.map(sl => (
            <Text key={sl} style={[pdfStyles.cellRight, { width: svcW, fontFamily: 'Helvetica-Bold' }]}>
              {fmtN(colTotal(sl))}
            </Text>
          ))}
          <Text style={[pdfStyles.cellRight, { width: totW, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.gold }]}>
            {fmtN(grandTotal)}
          </Text>
        </View>
      </View>
    </View>
  );
}
