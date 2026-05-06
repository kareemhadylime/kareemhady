/**
 * FM+ Project Report — Top-Level PDF Document (C42)
 *
 * Composes all PDF page components with correct orientations.
 * Each Page declares its orientation explicitly; page components
 * render a <View> (not a <Page>) so they're orientation-agnostic.
 *
 * Conditional pages use && short-circuit — components that return
 * null are NOT wrapped in a <Page> (see conditional section below).
 */
import React from 'react';
import { Document, Page } from '@react-pdf/renderer';
import { pdfStyles } from './theme';

// Shared
import { PdfHeader } from './pdf-shared/pdf-header';
import { PdfFooter } from './pdf-shared/pdf-footer';

// Always-on pages
import { CoverHero } from './pdf-pages/cover-hero';
import { ProjectDetailsPdf } from './pdf-pages/project-details';
import { ServiceLineSummaryPdf } from './pdf-pages/service-line-summary';
import { ManningTablePdf } from './pdf-pages/manning-table';

// Conditional pages (components return null when data is absent)
import { BudgetBreakdownPdf } from './pdf-pages/budget-breakdown';
import { MobilizationPdf } from './pdf-pages/mobilization';
import { PaymentTermsPdf } from './pdf-pages/payment-terms';
import { ChangeVsInitialPdf } from './pdf-pages/change-vs-initial';
import { VarianceSnapshotPdf } from './pdf-pages/variance-snapshot';
import { SignOffPdf } from './pdf-pages/sign-off';
import { ContractRollupPdf } from './pdf-pages/contract-rollup';

import type { ReportData } from './types';

interface ProjectReportDocumentProps {
  data: ReportData;
}

export function ProjectReportDocument({ data }: ProjectReportDocumentProps) {
  const { generated_by, generated_at } = data.meta;

  // Pre-evaluate conditional pages so we know whether to render the <Page>
  const showBudgetBreakdown = data.budget_breakdown.cells !== null;
  const showMobilization = data.mobilization !== null;
  // Always render payment terms — when payment_terms_days is null, the section
  // displays "Not specified" (customer-facing field).
  const showPaymentTerms = true;
  const showChangeVsInitial = data.change_vs_initial !== null;
  const showVarianceSnapshot = data.variance_snapshot !== null;
  const showSignOff = data.signoff.lines.length > 0 || data.signoff.history.length > 0;
  const showContractRollup = data.contract_rollup !== null;

  return (
    <Document
      title={`${data.meta.contract.name} — FM+ Project Report`}
      author="FM+ Lime Investments"
      subject={`${data.meta.mode} report · ${data.meta.year.status}`}
      creator="FM+ Dashboard"
      producer="@react-pdf/renderer"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Page 1: Cover Hero (portrait, always rendered)                       */}
      {/* ------------------------------------------------------------------ */}
      <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
        <PdfHeader data={data} />
        <CoverHero data={data} />
        <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
      </Page>

      {/* ------------------------------------------------------------------ */}
      {/* Page 2: Project Details (portrait, always rendered)                  */}
      {/* ------------------------------------------------------------------ */}
      <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
        <PdfHeader data={data} />
        <ProjectDetailsPdf data={data} />
        <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
      </Page>

      {/* ------------------------------------------------------------------ */}
      {/* Page 3: Service Line Summary (portrait, always rendered)             */}
      {/* ------------------------------------------------------------------ */}
      <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
        <PdfHeader data={data} />
        <ServiceLineSummaryPdf data={data} />
        <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
      </Page>

      {/* ------------------------------------------------------------------ */}
      {/* Page 4: Manning Table (landscape, always rendered)                   */}
      {/* ------------------------------------------------------------------ */}
      <Page size="A4" orientation="landscape" style={pdfStyles.pageLandscape}>
        <PdfHeader data={data} />
        <ManningTablePdf data={data} />
        <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
      </Page>

      {/* ------------------------------------------------------------------ */}
      {/* Page 5: Budget Breakdown (landscape, hidden in customer mode)        */}
      {/* ------------------------------------------------------------------ */}
      {showBudgetBreakdown && (
        <Page size="A4" orientation="landscape" style={pdfStyles.pageLandscape}>
          <PdfHeader data={data} />
          <BudgetBreakdownPdf data={data} />
          <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
        </Page>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Page 6: Mobilization (portrait, conditional)                         */}
      {/* ------------------------------------------------------------------ */}
      {showMobilization && (
        <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
          <PdfHeader data={data} />
          <MobilizationPdf data={data} />
          <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
        </Page>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Page 7: Payment Terms (portrait, conditional)                        */}
      {/* ------------------------------------------------------------------ */}
      {showPaymentTerms && (
        <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
          <PdfHeader data={data} />
          <PaymentTermsPdf data={data} />
          <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
        </Page>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Page 8: Change vs Initial (portrait, conditional)                    */}
      {/* ------------------------------------------------------------------ */}
      {showChangeVsInitial && (
        <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
          <PdfHeader data={data} />
          <ChangeVsInitialPdf data={data} />
          <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
        </Page>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Page 9: Variance Snapshot (portrait, conditional)                    */}
      {/* ------------------------------------------------------------------ */}
      {showVarianceSnapshot && (
        <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
          <PdfHeader data={data} />
          <VarianceSnapshotPdf data={data} />
          <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
        </Page>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Page 10: Sign-Off (portrait, conditional)                            */}
      {/* ------------------------------------------------------------------ */}
      {showSignOff && (
        <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
          <PdfHeader data={data} />
          <SignOffPdf data={data} />
          <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
        </Page>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Page 11: Contract Rollup (portrait, conditional)                     */}
      {/* ------------------------------------------------------------------ */}
      {showContractRollup && (
        <Page size="A4" orientation="portrait" style={pdfStyles.pagePortrait}>
          <PdfHeader data={data} />
          <ContractRollupPdf data={data} />
          <PdfFooter generatedBy={generated_by} generatedAt={generated_at} />
        </Page>
      )}
    </Document>
  );
}
