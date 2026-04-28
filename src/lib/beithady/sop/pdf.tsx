import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer,
} from '@react-pdf/renderer';
import type { SopArticleDetail } from './queries';
import { ROLE_LABEL_EN, ROLE_LABEL_AR, SUBCATEGORY_LABEL } from './queries';

// Phase K.3 PDF export — A4 with Beit Hady brand header. Used by the
// /api/beithady/sop/article/[slug]/pdf route + the /api/beithady/sop
// /role/[role]/pdf bundle route. Server-side, no Chromium needed.
//
// Arabic support: registers Cairo via Google Fonts CDN. Falls back to
// Helvetica if the registration call throws (Latin only — Arabic glyphs
// will render as boxes). Bundle a local TTF in public/fonts/ for fully
// offline-safe Arabic rendering.

let _fontReady = false;
function ensureFontRegistered(): void {
  if (_fontReady) return;
  try {
    Font.register({
      family: 'Cairo',
      fonts: [
        { src: 'https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIvTp2mxdt0.ttf', fontWeight: 'normal' },
        { src: 'https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIvTp0msdt0.ttf', fontWeight: 'bold' },
      ],
    });
    _fontReady = true;
  } catch {
    // ignore — Helvetica fallback (Arabic glyphs will be missing)
  }
}

const PALETTE = {
  brand: '#1e2d4a',
  gold: '#d4a93a',
  cream: '#f5f1e8',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
};

let _logoBytes: Buffer | null = null;
function getLogoBytes(): Buffer | null {
  if (_logoBytes) return _logoBytes;
  try {
    _logoBytes = readFileSync(
      join(process.cwd(), 'public', 'brand', 'beithady', 'logo-stacked.jpg')
    );
    return _logoBytes;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  page:    { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: PALETTE.ink },
  pageRtl: { padding: 36, fontSize: 10, fontFamily: 'Cairo',     color: PALETTE.ink },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: PALETTE.brand,
    marginBottom: 12,
  },
  title:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: PALETTE.brand },
  titleRtl: { fontSize: 16, fontFamily: 'Cairo',          color: PALETTE.brand },
  subtitle: { fontSize: 9,  color: PALETTE.muted, marginTop: 3 },
  pillRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pillRowRtl: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: PALETTE.cream,
    borderRadius: 2,
    fontSize: 8,
    color: PALETTE.brand,
  },
  metaText: { fontSize: 8, color: PALETTE.muted },
  h1:   { fontSize: 14, fontFamily: 'Helvetica-Bold', color: PALETTE.brand, marginTop: 12, marginBottom: 6 },
  h2:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: PALETTE.brand, marginTop: 10, marginBottom: 5 },
  h3:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PALETTE.brand, marginTop: 8,  marginBottom: 4 },
  para: { fontSize: 10, marginBottom: 4, lineHeight: 1.45 },
  li:   { fontSize: 10, marginLeft: 12, marginBottom: 2, lineHeight: 1.4 },
  liRtl: { fontSize: 10, marginRight: 12, marginLeft: 0, marginBottom: 2, lineHeight: 1.4, textAlign: 'right' },
  rtl:  { textAlign: 'right' },
  divider: { borderTopWidth: 1, borderTopColor: PALETTE.line, marginVertical: 12 },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 8,
    color: PALETTE.muted,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cover: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    paddingTop: 80,
  },
  coverTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: PALETTE.brand },
  coverSub:   { fontSize: 14, color: PALETTE.muted, marginTop: 8 },
});

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split(/\r?\n/);
  let buffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushPara = () => {
    if (buffer.length > 0) {
      blocks.push({ type: 'p', text: buffer.join(' ') });
      buffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushPara();
      listType = null;
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) { flushPara(); listType = null; blocks.push({ type: 'h3', text: h3[1] }); continue; }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) { flushPara(); listType = null; blocks.push({ type: 'h2', text: h2[1] }); continue; }
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) { flushPara(); listType = null; blocks.push({ type: 'h1', text: h1[1] }); continue; }

    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        blocks.push({ type: 'ol', items: [] });
        listType = 'ol';
      }
      (blocks[blocks.length - 1] as { items: string[] }).items.push(ol[1]);
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        blocks.push({ type: 'ul', items: [] });
        listType = 'ul';
      }
      (blocks[blocks.length - 1] as { items: string[] }).items.push(ul[1]);
      continue;
    }

    listType = null;
    buffer.push(line);
  }
  flushPara();
  return blocks;
}

// Strip markdown inline syntax for PDF rendering (react-pdf doesn't
// auto-style runs).
function stripInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function renderBlocks(blocks: Block[], isRtl: boolean): React.ReactElement[] {
  const fontBoldEn = isRtl ? undefined : 'Helvetica-Bold';
  return blocks.map((b, i) => {
    if (b.type === 'h1') return <Text key={i} style={[styles.h1, isRtl ? styles.rtl : {}, fontBoldEn ? {} : { fontFamily: 'Cairo' }]}>{stripInline(b.text)}</Text>;
    if (b.type === 'h2') return <Text key={i} style={[styles.h2, isRtl ? styles.rtl : {}, fontBoldEn ? {} : { fontFamily: 'Cairo' }]}>{stripInline(b.text)}</Text>;
    if (b.type === 'h3') return <Text key={i} style={[styles.h3, isRtl ? styles.rtl : {}, fontBoldEn ? {} : { fontFamily: 'Cairo' }]}>{stripInline(b.text)}</Text>;
    if (b.type === 'p')  return <Text key={i} style={[styles.para, isRtl ? styles.rtl : {}]}>{stripInline(b.text)}</Text>;
    if (b.type === 'ul') return (
      <View key={i}>
        {b.items.map((it, j) => (
          <Text key={j} style={isRtl ? styles.liRtl : styles.li}>{`•  ${stripInline(it)}`}</Text>
        ))}
      </View>
    );
    if (b.type === 'ol') return (
      <View key={i}>
        {b.items.map((it, j) => (
          <Text key={j} style={isRtl ? styles.liRtl : styles.li}>{`${j + 1}.  ${stripInline(it)}`}</Text>
        ))}
      </View>
    );
    return <Text key={i} />;
  });
}

function ArticleHeader({ article, isRtl }: { article: SopArticleDetail; isRtl: boolean }) {
  const roleLabel = isRtl ? ROLE_LABEL_AR[article.role] : ROLE_LABEL_EN[article.role];
  const subcatLabel = article.subcategory
    ? (isRtl ? SUBCATEGORY_LABEL[article.subcategory].ar : SUBCATEGORY_LABEL[article.subcategory].en)
    : null;
  const logoBytes = getLogoBytes();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={isRtl ? styles.titleRtl : styles.title}>{article.title}</Text>
        {article.summary && (
          <Text style={[styles.subtitle, isRtl ? styles.rtl : {}]}>{article.summary}</Text>
        )}
        <View style={isRtl ? styles.pillRowRtl : styles.pillRow}>
          <Text style={styles.pill}>{article.kind.toUpperCase()}</Text>
          <Text style={styles.pill}>{roleLabel}</Text>
          {subcatLabel && <Text style={styles.pill}>{subcatLabel}</Text>}
          <Text style={styles.metaText}>
            v{article.version} · {new Date(article.updated_at).toLocaleDateString(isRtl ? 'ar-EG' : 'en')}
          </Text>
        </View>
      </View>
      {logoBytes && (
        <Image src={logoBytes as unknown as string} style={{ width: 50, height: 50, objectFit: 'contain' }} />
      )}
    </View>
  );
}

export async function renderArticleToPdf(article: SopArticleDetail): Promise<Buffer> {
  ensureFontRegistered();
  const isRtl = article.language === 'ar';
  const blocks = parseMarkdown(article.body_md);

  const doc = (
    <Document
      title={article.title}
      author="Beit Hady"
      subject={article.summary || article.title}
    >
      <Page size="A4" style={isRtl ? styles.pageRtl : styles.page}>
        <ArticleHeader article={article} isRtl={isRtl} />
        <View>{renderBlocks(blocks, isRtl)}</View>
        <View style={styles.footer} fixed>
          <Text>Beit Hady — Operations · SOP &amp; KB</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return await renderToBuffer(doc);
}

export async function renderRoleBundleToPdf(opts: {
  roleSlug: string;
  roleLabel: string;
  language?: 'en' | 'ar';
  articles: SopArticleDetail[];
}): Promise<Buffer> {
  ensureFontRegistered();
  const logoBytes = getLogoBytes();
  const coverIsRtl = opts.language === 'ar';

  const doc = (
    <Document
      title={`Beit Hady SOP — ${opts.roleLabel}`}
      author="Beit Hady"
      subject={`SOP & Knowledge Base — ${opts.roleLabel}`}
    >
      {/* Cover page */}
      <Page size="A4" style={coverIsRtl ? styles.pageRtl : styles.page}>
        <View style={[styles.header, { paddingBottom: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={coverIsRtl ? styles.titleRtl : styles.coverTitle}>Beit Hady</Text>
            <Text style={[styles.coverSub, coverIsRtl ? styles.rtl : {}]}>
              {coverIsRtl ? 'دليل العمليات والمعرفة' : 'SOP & Knowledge Base'}
            </Text>
            <Text style={[styles.subtitle, { marginTop: 4 }, coverIsRtl ? styles.rtl : {}]}>
              {opts.roleLabel}
            </Text>
            <Text style={[styles.metaText, { marginTop: 8 }, coverIsRtl ? styles.rtl : {}]}>
              {opts.articles.length} {coverIsRtl ? 'مقال' : `article${opts.articles.length === 1 ? '' : 's'}`} · {new Date().toLocaleDateString(coverIsRtl ? 'ar-EG' : 'en')}
            </Text>
          </View>
          {logoBytes && (
            <Image src={logoBytes as unknown as string} style={{ width: 80, height: 80, objectFit: 'contain' }} />
          )}
        </View>
        <View style={{ marginTop: 28 }}>
          <Text style={styles.h2}>{coverIsRtl ? 'الفهرس' : 'Contents'}</Text>
          {opts.articles.map((a, i) => (
            <Text key={a.id} style={[styles.li, coverIsRtl ? styles.liRtl : {}]}>
              {`${i + 1}.  ${a.title}`}
              {a.language === 'ar' && a.role !== 'housekeeping' ? '  (AR)' : ''}
            </Text>
          ))}
        </View>
        <View style={styles.footer} fixed>
          <Text>Beit Hady — Operations · SOP &amp; KB · {opts.roleLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* One page per article (each can use its own RTL setting) */}
      {opts.articles.map(article => {
        const isRtl = article.language === 'ar';
        const blocks = parseMarkdown(article.body_md);
        return (
          <Page key={article.id} size="A4" style={isRtl ? styles.pageRtl : styles.page}>
            <ArticleHeader article={article} isRtl={isRtl} />
            <View>{renderBlocks(blocks, isRtl)}</View>
            <View style={styles.footer} fixed>
              <Text>Beit Hady — Operations · SOP &amp; KB · {opts.roleLabel}</Text>
              <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </Document>
  );
  return await renderToBuffer(doc);
}
