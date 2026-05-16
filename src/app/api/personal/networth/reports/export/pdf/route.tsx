import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getMonthlyReport } from '@/lib/personal/networth/queries';
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';

// `@react-pdf/renderer` shells out to a Node-only PDF engine, so this route
// MUST run on the Node runtime (the default edge runtime would crash on
// fontkit / Buffer usage).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

const styles = StyleSheet.create({
  page: { padding: 40 },
  h1: { fontSize: 18, marginBottom: 12 },
  meta: { fontSize: 10, color: '#666', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingVertical: 6,
    fontFamily: 'Helvetica-Bold',
  },
  cell: { flex: 1, fontSize: 10 },
  cellRight: { flex: 1, fontSize: 10, textAlign: 'right' },
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('unauthorized', { status: 401 });
  if (!user.is_admin) return new Response('forbidden', { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return new Response('invalid body', { status: 400 });

  const report = await getMonthlyReport(user.id, parsed.data.year, parsed.data.month);
  const fmt = (n: number) => n.toLocaleString();

  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Payment Report — {report.monthLabel}</Text>
        <Text style={styles.meta}>
          Total: EGP {fmt(report.totalEgp)} · Δ vs prev: EGP {fmt(report.deltaEgp)}
          {report.deltaPct !== null ? ` (${report.deltaPct}%)` : ''}
        </Text>
        <View style={styles.rowHeader}>
          <Text style={styles.cell}>Category</Text>
          <Text style={styles.cellRight}>Amount EGP</Text>
          <Text style={styles.cellRight}># Payments</Text>
          <Text style={styles.cellRight}>Δ vs prev</Text>
        </View>
        {report.byCategory.map(r => (
          <View key={r.category} style={styles.row}>
            <Text style={styles.cell}>{r.category}</Text>
            <Text style={styles.cellRight}>{fmt(r.amountEgp)}</Text>
            <Text style={styles.cellRight}>{String(r.count)}</Text>
            <Text style={styles.cellRight}>{fmt(r.deltaVsPrevEgp)}</Text>
          </View>
        ))}
      </Page>
    </Document>,
  );

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="payment-report-${report.monthLabel}.pdf"`,
    },
  });
}
