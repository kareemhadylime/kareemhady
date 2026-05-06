/**
 * StatusPill — small inline status badge for PDF.
 * draft     → amber background
 * published → green background
 */
import React from 'react';
import { Text } from '@react-pdf/renderer';
import { pdfStyles } from '../theme';

interface StatusPillProps {
  status: 'draft' | 'published';
}

export function StatusPill({ status }: StatusPillProps) {
  const style = status === 'published' ? pdfStyles.pillPublished : pdfStyles.pillDraft;
  const label = status === 'published' ? 'PUBLISHED' : 'DRAFT';
  return <Text style={style}>{label}</Text>;
}
