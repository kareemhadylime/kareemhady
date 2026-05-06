/**
 * LabelDual — bilingual label for PDF.
 * lang='en'  → English only
 * lang='ar'  → Arabic only (NotoSansArabic, rtl)
 * lang='both' → English above, Arabic below (smaller, muted)
 */
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { PDF_THEME } from '../theme';
import type { ReportLang } from '../types';

interface LabelDualProps {
  en: string;
  ar?: string | null;
  lang: ReportLang;
  /** Optional override for font size (defaults to 8) */
  fontSize?: number;
}

export function LabelDual({ en, ar, lang, fontSize = 8 }: LabelDualProps) {
  if (lang === 'ar') {
    return (
      <Text
        style={{
          fontFamily: PDF_THEME.fonts.ar,
          fontSize,
          textAlign: 'right',
        }}
      >
        {ar ?? en}
      </Text>
    );
  }

  if (lang === 'both' && ar) {
    return (
      <View>
        <Text style={{ fontFamily: PDF_THEME.fonts.en, fontSize }}>{en}</Text>
        <Text
          style={{
            fontFamily: PDF_THEME.fonts.ar,
            fontSize: Math.max(fontSize - 1, 6),
            color: PDF_THEME.colors.textMuted,
            marginTop: 1,
            textAlign: 'right',
          }}
        >
          {ar}
        </Text>
      </View>
    );
  }

  // Default: English only
  return (
    <Text style={{ fontFamily: PDF_THEME.fonts.en, fontSize }}>{en}</Text>
  );
}
