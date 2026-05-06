/**
 * FM+ Project Report — PDF Theme
 *
 * v1 KNOWN LIMITATION:
 * Lalezar, DM Serif Display, and Lato are NOT registered here because their TTF
 * files do not exist in public/fonts/. English text falls back to the built-in
 * Helvetica (body/tables) and Helvetica-Bold (headings). NotoSansArabic is
 * registered for Arabic glyph support. To upgrade in v1.5: drop TTF files into
 * public/fonts/ and register them below.
 */

import { StyleSheet, Font } from '@react-pdf/renderer';
import { FMPLUS_BRAND } from '@/lib/fmplus/brand';

// ---------------------------------------------------------------------------
// Font registration — only NotoSansArabic for v1
// ---------------------------------------------------------------------------
try {
  Font.register({
    family: 'NotoSansArabic',
    src: '/fonts/NotoSansArabic-Regular.ttf',
  });
} catch {
  /* font may not be available in test environment; degrade silently */
}

// ---------------------------------------------------------------------------
// Theme constants
// ---------------------------------------------------------------------------
export const PDF_THEME = {
  colors: {
    yellow:    FMPLUS_BRAND.colors.yellow,   // #FDCF00
    gold:      FMPLUS_BRAND.colors.gold,     // #EEB91D
    black:     FMPLUS_BRAND.colors.black,    // #000000
    greyDark:  FMPLUS_BRAND.colors.greyDark, // #8A867F
    greyLight: FMPLUS_BRAND.colors.greyLight,// #D4D4D4

    // Semantic additions for PDF
    white:     '#FFFFFF',
    rowAlt:    '#FAFAFA',
    rowHead:   '#F5F5F5',
    border:    '#E0E0E0',
    borderDark:'#BDBDBD',
    textPrimary:   '#111111',
    textSecondary: '#555555',
    textMuted:     '#888888',
    green:     '#2E7D32',
    amber:     '#ED6C02',
    red:       '#C62828',
  },
  fonts: {
    en:     'Helvetica',          // built-in PDF standard font
    enBold: 'Helvetica-Bold',     // built-in bold variant
    ar:     'NotoSansArabic',     // registered above
  },
  pagePadding: {
    portrait:  { paddingTop: 40, paddingRight: 32, paddingBottom: 40, paddingLeft: 32 },
    landscape: { paddingTop: 32, paddingRight: 40, paddingBottom: 32, paddingLeft: 40 },
  },
} as const;

// ---------------------------------------------------------------------------
// Shared StyleSheet
// ---------------------------------------------------------------------------
export const pdfStyles = StyleSheet.create({
  // --- Page ---
  pagePortrait: {
    paddingTop: 40, paddingRight: 32, paddingBottom: 48, paddingLeft: 32,
    fontSize: 8, fontFamily: 'Helvetica', color: PDF_THEME.colors.textPrimary,
    backgroundColor: PDF_THEME.colors.white,
  },
  pageLandscape: {
    paddingTop: 32, paddingRight: 40, paddingBottom: 44, paddingLeft: 40,
    fontSize: 8, fontFamily: 'Helvetica', color: PDF_THEME.colors.textPrimary,
    backgroundColor: PDF_THEME.colors.white,
  },

  // --- Section headings ---
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4, paddingBottom: 2, borderBottom: '0.5px solid #D4D4D4' },
  h3: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: PDF_THEME.colors.gold, marginBottom: 3, marginTop: 6 },

  // --- Text styles ---
  label: { fontSize: 7, color: PDF_THEME.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  body:  { fontSize: 8, color: PDF_THEME.colors.textSecondary, lineHeight: 1.4 },
  small: { fontSize: 7, color: PDF_THEME.colors.textMuted },
  mono:  { fontSize: 7, fontFamily: 'Courier', color: PDF_THEME.colors.textSecondary },

  // --- Arabic text ---
  arabic: { fontFamily: 'NotoSansArabic', fontSize: 8 },
  arabicSmall: { fontFamily: 'NotoSansArabic', fontSize: 7, color: PDF_THEME.colors.textMuted },

  // --- Table primitives ---
  table:   { display: 'flex', flexDirection: 'column', width: '100%' },
  row:     { flexDirection: 'row', borderBottom: '0.5px solid #EEEEEE', alignItems: 'center' },
  rowHead: { flexDirection: 'row', backgroundColor: PDF_THEME.colors.rowHead, borderBottom: '0.5px solid #BDBDBD', alignItems: 'center' },
  rowTotal:{ flexDirection: 'row', backgroundColor: PDF_THEME.colors.rowAlt, borderTop: '0.75px solid #BDBDBD', alignItems: 'center' },
  cell:    { padding: 3, fontSize: 7 },
  cellRight:{ padding: 3, fontSize: 7, textAlign: 'right' },
  cellBold: { padding: 3, fontSize: 7, fontFamily: 'Helvetica-Bold' },

  // --- KPI tile ---
  kpiRow:  { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 8, marginBottom: 10 },
  kpiTile: { flex: 1, border: '0.5px solid #D4D4D4', borderRadius: 4, padding: 8, backgroundColor: PDF_THEME.colors.white },
  kpiLabel:{ fontSize: 7, color: PDF_THEME.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue:{ fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 2, color: PDF_THEME.colors.black },
  kpiSub:  { fontSize: 6, color: PDF_THEME.colors.textMuted, marginTop: 1 },

  // --- Status pill ---
  pillDraft:     { backgroundColor: '#FFF8E1', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#E65100' },
  pillPublished: { backgroundColor: '#E8F5E9', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#1B5E20' },

  // --- Misc ---
  divider:   { borderBottom: '0.5px solid #D4D4D4', marginVertical: 6 },
  yellowBar: { backgroundColor: PDF_THEME.colors.yellow, height: 3, borderRadius: 1, marginBottom: 10 },
  accentBar: { backgroundColor: PDF_THEME.colors.gold, width: 3, borderRadius: 1, marginRight: 6 },
  card:      { border: '0.5px solid #E0E0E0', borderRadius: 4, padding: 8, marginBottom: 6 },
  warningBox:{ border: '0.5px solid #ED6C02', borderRadius: 4, padding: 6, backgroundColor: '#FFF8E1', marginBottom: 6 },

  // --- Flex helpers ---
  row_: { flexDirection: 'row' },
  flex1: { flex: 1 },
  spaceBetween: { justifyContent: 'space-between' },
  alignCenter: { alignItems: 'center' },
  mt2:  { marginTop: 2 },
  mt4:  { marginTop: 4 },
  mt6:  { marginTop: 6 },
  mt8:  { marginTop: 8 },
  mb4:  { marginBottom: 4 },
  mb6:  { marginBottom: 6 },
  mb8:  { marginBottom: 8 },
  mr4:  { marginRight: 4 },
  mr8:  { marginRight: 8 },
  pr4:  { paddingRight: 4 },
  pr8:  { paddingRight: 8 },
});
