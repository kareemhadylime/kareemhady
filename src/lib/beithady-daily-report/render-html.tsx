import {
  BUILDING_CODES,
  BUILDING_LABEL,
  type BuildingBucket,
  type BuildingCode,
  type DailyReportPayload,
} from './types';

// A4-styled HTML report. Designed to render on the /reports/[token] page
// AND inside the email body. Uses inline styles so Gmail/Outlook don't
// strip the layout. Print CSS via @page so "Save as PDF" produces a
// proper A4 with no browser chrome.
//
// Color thresholds (S12):
//   Occupancy / forward occupancy / pickup pct
//     ≥ 85% green   70-85% amber   < 70% red
//   ADR / pricing — red if delta_pct < -10%
//
// Pure presentation — never queries data. Takes a fully-built payload.

const C = {
  ink: '#0f172a',
  ink2: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  bg: '#ffffff',
  card: '#f8fafc',
  brand: '#0e7490',     // cyan-700
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
  emerald: '#10b981',
  gold: '#d97706',
};

const fmtUsd = (n: number): string => {
  if (n == null || !Number.isFinite(n)) return '$0';
  if (Math.abs(n) >= 10000) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  return '$' + n.toFixed(0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
const fmtUsd1 = (n: number): string => {
  if (Math.abs(n) >= 100000) return '$' + (n / 1000).toFixed(0) + 'k';
  if (Math.abs(n) >= 10000) return '$' + (n / 1000).toFixed(1) + 'k';
  return fmtUsd(n);
};
const fmtNum = (n: number, dp = 0): string => {
  if (n == null || !Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
};
const fmtPct = (n: number, dp = 1): string => {
  return n.toFixed(dp) + '%';
};

function pctColor(p: number): string {
  if (p >= 85) return C.green;
  if (p >= 70) return C.amber;
  return C.red;
}

function pickupColor(p: number): string {
  if (p > 0) return C.green;
  if (p < 0) return C.red;
  return C.muted;
}

function pickupArrow(p: number): string {
  if (p > 0) return '▲';
  if (p < 0) return '▼';
  return '·';
}

const td = (
  children: React.ReactNode,
  extra?: React.CSSProperties
): React.ReactElement => (
  <td
    style={{
      padding: '6px 8px',
      borderBottom: `1px solid ${C.line}`,
      fontSize: 10,
      color: C.ink,
      ...extra,
    }}
  >
    {children}
  </td>
);

const th = (
  children: React.ReactNode,
  extra?: React.CSSProperties
): React.ReactElement => (
  <th
    style={{
      padding: '6px 8px',
      borderBottom: `2px solid ${C.ink}`,
      fontSize: 10,
      color: C.ink,
      textAlign: 'left',
      fontWeight: 600,
      ...extra,
    }}
  >
    {children}
  </th>
);

function BuildingsTable({ payload }: { payload: DailyReportPayload }) {
  const cols: Array<{
    key: 'all' | BuildingCode;
    label: string;
    bucket: BuildingBucket;
  }> = [
    { key: 'all', label: 'All', bucket: payload.all },
    ...BUILDING_CODES.map(c => ({
      key: c,
      label: BUILDING_LABEL[c],
      bucket: payload.per_building[c],
    })),
  ];

  const rows: Array<{
    label: string;
    val: (b: BuildingBucket) => React.ReactNode;
    section?: 'today' | 'mtd' | 'pace';
    sectionLabel?: string;
  }> = [
    { label: 'Total units', val: b => fmtNum(b.total_units), section: 'today', sectionLabel: 'TODAY' },
    { label: 'Occupied today', val: b => fmtNum(b.occupied_today) },
    {
      label: 'Occupancy %',
      val: b => (
        <span style={{ color: pctColor(b.occupancy_today_pct), fontWeight: 600 }}>
          {fmtPct(b.occupancy_today_pct)}
        </span>
      ),
    },
    { label: 'Check-ins', val: b => fmtNum(b.check_ins_today) },
    { label: 'Check-outs', val: b => fmtNum(b.check_outs_today) },
    { label: 'Turnovers', val: b => fmtNum(b.turnovers_today) },

    {
      label: 'Revenue MTD',
      val: b => <strong>{fmtUsd1(b.revenue_mtd_usd)}</strong>,
      section: 'mtd',
      sectionLabel: 'MONTH-TO-DATE',
    },
    {
      label: 'Forward occupancy',
      val: b => (
        <span style={{ color: pctColor(b.forward_occupancy_pct) }}>
          {fmtPct(b.forward_occupancy_pct)}
        </span>
      ),
    },
    {
      label: 'Backward occupancy',
      val: b => (
        <span style={{ color: pctColor(b.backward_occupancy_pct) }}>
          {fmtPct(b.backward_occupancy_pct)}
        </span>
      ),
    },
    {
      label: 'Avg units occupied / day',
      val: b => fmtNum(b.backward_avg_units_per_day, 1),
    },
    { label: 'ADR (USD)', val: b => fmtUsd(b.adr_mtd_usd) },
    { label: 'Opportunity nights', val: b => fmtNum(b.opportunity_nights) },
    { label: 'Opportunity value', val: b => fmtUsd1(b.opportunity_value_usd) },

    {
      label: 'Bookings / day',
      val: b => fmtNum(b.bookings_per_day_mtd, 1),
      section: 'pace',
      sectionLabel: 'PACE & STAY',
    },
    { label: 'Lead time (days)', val: b => fmtNum(b.avg_lead_time_days, 1) },
    {
      label: 'Pickup vs prior month',
      val: b => (
        <span style={{ color: pickupColor(b.pickup_vs_prior_month_pct) }}>
          {pickupArrow(b.pickup_vs_prior_month_pct)} {fmtPct(b.pickup_vs_prior_month_pct)}
        </span>
      ),
    },
    { label: 'Avg length of stay', val: b => fmtNum(b.avg_los_nights, 1) + ' nights' },
  ];

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'system-ui, sans-serif',
        marginTop: 8,
      }}
    >
      <thead>
        <tr>
          {th('')}
          {cols.map(c => (
            <th
              key={c.key}
              style={{
                padding: '6px 8px',
                borderBottom: `2px solid ${C.ink}`,
                fontSize: 10,
                textAlign: 'right',
                fontWeight: 700,
                color: c.key === 'all' ? C.brand : C.ink,
                background: c.key === 'all' ? '#ecfeff' : 'transparent',
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.flatMap((r, i) => {
          const out: React.ReactElement[] = [];
          if (r.sectionLabel) {
            out.push(
              <tr key={`section-${i}`}>
                <td
                  colSpan={cols.length + 1}
                  style={{
                    padding: '8px 0 2px 0',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: C.brand,
                    borderBottom: `1px solid ${C.line}`,
                  }}
                >
                  {r.sectionLabel}
                </td>
              </tr>
            );
          }
          out.push(
            <tr key={`row-${i}`}>
              {td(<span style={{ color: C.ink2 }}>{r.label}</span>)}
              {cols.map(c => (
                <td
                  key={c.key}
                  style={{
                    padding: '5px 8px',
                    borderBottom: `1px solid ${C.line}`,
                    fontSize: 10,
                    color: C.ink,
                    textAlign: 'right',
                    background: c.key === 'all' ? '#ecfeff' : 'transparent',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {r.val(c.bucket)}
                </td>
              ))}
            </tr>
          );
          return out;
        })}
      </tbody>
    </table>
  );
}

function PayoutsBlock({ payload }: { payload: DailyReportPayload }) {
  const p = payload.payouts;
  return (
    <div
      style={{
        marginTop: 14,
        padding: 10,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: C.brand,
          marginBottom: 6,
        }}
      >
        PAYOUTS
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...colHead, textAlign: 'left' }}></th>
            <th style={colHead}>Airbnb</th>
            <th style={colHead}>Stripe</th>
            <th style={{ ...colHead, color: C.brand }}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={lblCell}>MTD received</td>
            <td style={numCell}>{fmtUsd(p.mtd_received_airbnb_usd)}</td>
            <td style={numCell}>{fmtUsd(p.mtd_received_stripe_usd)}</td>
            <td style={{ ...numCell, fontWeight: 700, color: C.brand }}>
              {fmtUsd(p.mtd_received_total_usd)}
            </td>
          </tr>
          <tr>
            <td style={lblCell}>Settling today / tomorrow</td>
            <td style={numCell}>{fmtUsd(p.expected_today_airbnb_usd)}</td>
            <td style={numCell}>{fmtUsd(p.expected_today_stripe_usd)}</td>
            <td style={{ ...numCell, fontWeight: 700, color: C.brand }}>
              {fmtUsd(p.expected_today_total_usd)}
            </td>
          </tr>
          <tr>
            <td style={lblCell}>Next 7 days projected</td>
            <td style={numCell}>{fmtUsd(p.next_7d_projected_airbnb_usd)}</td>
            <td style={numCell}>{fmtUsd(p.next_7d_projected_stripe_usd)}</td>
            <td style={{ ...numCell, fontWeight: 700, color: C.brand }}>
              {fmtUsd(p.next_7d_projected_total_usd)}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 8, color: C.muted, marginTop: 6 }}>
        Airbnb expected = host_payout for reservations checked in yesterday. Stripe expected = arrival_date tomorrow.
      </div>
    </div>
  );
}

const colHead: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: `1px solid ${C.ink}`,
  fontSize: 9,
  fontWeight: 600,
  textAlign: 'right',
  color: C.ink2,
};
const lblCell: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 10,
  color: C.ink2,
};
const numCell: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 10,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

function ReviewsBlock({ payload }: { payload: DailyReportPayload }) {
  const r = payload.reviews;
  const total = r.count_mtd;
  return (
    <div
      style={{
        marginTop: 14,
        padding: 10,
        border: `1px solid ${C.line}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            color: C.brand,
          }}
        >
          REVIEWS · {payload.month_label.toUpperCase()}
        </div>
        <div style={{ fontSize: 10, color: C.ink2 }}>
          {total} reviews · avg <strong>{r.avg_rating_mtd.toFixed(1)}★</strong>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {r.star_distribution.map(d => (
          <div
            key={d.stars}
            style={{
              flex: 1,
              padding: '4px 6px',
              background: C.card,
              borderRadius: 4,
              fontSize: 9,
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 700, color: C.gold }}>{d.stars}★</div>
            <div style={{ color: C.ink, fontSize: 12, fontWeight: 600 }}>{d.count}</div>
          </div>
        ))}
      </div>
      {r.last_24h.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: C.ink2,
              marginBottom: 4,
            }}
          >
            LAST 24H ({r.last_24h.length})
          </div>
          {r.last_24h.map((rv, i) => (
            <div
              key={i}
              style={{
                padding: '6px 8px',
                marginBottom: 4,
                background: rv.flagged ? '#fef2f2' : C.card,
                borderLeft: `3px solid ${rv.flagged ? C.red : C.line}`,
                fontSize: 9.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: C.ink }}>
                  {rv.unit} · {rv.channel}
                </strong>
                <span
                  style={{
                    color: rv.flagged ? C.red : C.gold,
                    fontWeight: 700,
                  }}
                >
                  {rv.rating ? `${rv.rating}★` : '—'}
                  {rv.flagged ? ' 🚩' : ''}
                </span>
              </div>
              <div style={{ color: C.ink2, marginTop: 2 }}>{rv.ai_summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelMix({ payload }: { payload: DailyReportPayload }) {
  if (payload.channel_mix.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: 10,
        border: `1px solid ${C.line}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: C.brand,
          marginBottom: 6,
        }}
      >
        CHANNEL MIX (MTD by revenue)
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {payload.channel_mix.map(m => (
          <div key={m.channel} style={{ fontSize: 10, color: C.ink2 }}>
            <strong style={{ color: C.ink }}>{m.channel}</strong>: {m.pct.toFixed(1)}% · {fmtUsd1(m.revenue_usd)}
          </div>
        ))}
      </div>
    </div>
  );
}

function CancellationsAndTriage({ payload }: { payload: DailyReportPayload }) {
  return (
    <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
      <div
        style={{
          flex: 1,
          padding: 10,
          border: `1px solid ${C.line}`,
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            color: C.brand,
            marginBottom: 6,
          }}
        >
          CANCELLATIONS
        </div>
        <div style={{ fontSize: 10, color: C.ink }}>
          Today: <strong>{payload.cancellations.count_today}</strong>{' '}
          {payload.cancellations.value_today_usd > 0 &&
            `· ${fmtUsd1(payload.cancellations.value_today_usd)}`}
        </div>
        <div style={{ fontSize: 10, color: C.ink2, marginTop: 2 }}>
          MTD: {payload.cancellations.count_mtd} · {fmtUsd1(payload.cancellations.value_mtd_usd)}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: 10,
          border: `1px solid ${C.line}`,
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            color: C.brand,
            marginBottom: 6,
          }}
        >
          INQUIRY TRIAGE
        </div>
        <div style={{ fontSize: 10, color: C.ink }}>
          Inquiries unanswered:{' '}
          <strong style={{ color: payload.inquiry_triage.inquiries_unanswered_count > 0 ? C.amber : C.ink }}>
            {payload.inquiry_triage.inquiries_unanswered_count}
          </strong>
        </div>
        <div style={{ fontSize: 10, color: C.ink2, marginTop: 2 }}>
          In-stay urgent: {payload.inquiry_triage.in_stay_immediate_count} ·
          high: {payload.inquiry_triage.in_stay_high_count}
        </div>
      </div>
    </div>
  );
}

function CleaningOps({ payload }: { payload: DailyReportPayload }) {
  if (payload.cleaning_ops_today.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: 10,
        background: '#fffbeb',
        border: `1px solid ${C.gold}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: C.gold,
          marginBottom: 6,
        }}
      >
        🧹 CLEANING TURNOVERS TODAY ({payload.cleaning_ops_today.length})
      </div>
      <div style={{ fontSize: 10 }}>
        {payload.cleaning_ops_today.map((c, i) => (
          <div key={i} style={{ color: C.ink, marginBottom: 2 }}>
            <strong>{c.unit}</strong> ({c.building}) · out: {c.checkout_guest} → in: {c.checkin_guest}
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingAlerts({ payload }: { payload: DailyReportPayload }) {
  if (payload.pricing_alerts.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: 10,
        border: `1px solid ${C.line}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: C.brand,
          marginBottom: 6,
        }}
      >
        PRICING ALERTS ({payload.pricing_alerts.length})
      </div>
      <div style={{ fontSize: 10 }}>
        {payload.pricing_alerts.slice(0, 8).map((a, i) => (
          <div key={i} style={{ color: C.ink, marginBottom: 2 }}>
            <strong>{a.unit}</strong> · current {fmtUsd(a.current_price_usd)} vs rec {fmtUsd(a.recommended_price_usd)} ·{' '}
            <span style={{ color: a.delta_pct < 0 ? C.red : C.green }}>
              {a.delta_pct > 0 ? '+' : ''}
              {a.delta_pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeadInventory({ payload }: { payload: DailyReportPayload }) {
  if (payload.dead_inventory.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: 10,
        border: `1px solid ${C.line}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: C.brand,
          marginBottom: 6,
        }}
      >
        DEAD INVENTORY (0 nights booked next 14 days) — {payload.dead_inventory.length} units
      </div>
      <div style={{ fontSize: 9.5, color: C.ink, columnCount: 2, columnGap: 16 }}>
        {payload.dead_inventory.slice(0, 30).map((d, i) => (
          <div key={i}>
            • {d.unit} <span style={{ color: C.muted }}>({d.building})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function renderReportHtml(payload: DailyReportPayload): string {
  // Server-render JSX to a static HTML string. Avoids ReactDOMServer dep
  // by using a small bespoke renderer would be reinventing — instead, use
  // the React 19 server renderer indirectly: this file exports a function
  // that returns a JSX tree, the route can return the JSX directly. For
  // email + token-page reuse we ALSO export the bare components so they
  // can be embedded into a Next.js server component.
  // (See `ReportDocument` below for the JSX-tree export.)
  return ''; // placeholder; renderToStaticMarkup happens in the email pipeline
}

export function ReportDocument({ payload }: { payload: DailyReportPayload }) {
  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: C.ink,
        background: C.bg,
        padding: '14mm',
        boxSizing: 'border-box',
        width: '210mm',
        minHeight: '297mm',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 8,
          borderBottom: `2px solid ${C.brand}`,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.brand }}>
            BEITHADY · Daily Performance Report
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            {payload.generated_at_cairo} · all amounts USD
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.muted, textAlign: 'right' }}>
          Day {payload.month_days_elapsed} of {payload.month_days_total} ·{' '}
          {payload.month_label}
        </div>
      </div>

      {/* Digest */}
      <div
        style={{
          marginTop: 10,
          padding: 10,
          background: '#ecfeff',
          border: `1px solid #67e8f9`,
          borderRadius: 6,
          fontSize: 11,
          lineHeight: 1.4,
          color: C.ink,
        }}
      >
        {payload.digest_oneliner}
      </div>

      {/* Drift warning */}
      {payload.all.drift_warning && (
        <div
          style={{
            marginTop: 8,
            padding: 6,
            background: '#fef2f2',
            color: C.red,
            fontSize: 9,
          }}
        >
          ⚠ {payload.all.drift_warning}
        </div>
      )}

      <BuildingsTable payload={payload} />
      <PayoutsBlock payload={payload} />
      <ChannelMix payload={payload} />
      <CancellationsAndTriage payload={payload} />
      <CleaningOps payload={payload} />

      {/* Page break before reviews */}
      <div style={{ pageBreakBefore: 'always', marginTop: 14 }}>
        <ReviewsBlock payload={payload} />
        <PricingAlerts payload={payload} />
        <DeadInventory payload={payload} />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 6,
          borderTop: `1px solid ${C.line}`,
          fontSize: 8,
          color: C.muted,
          textAlign: 'center',
        }}
      >
        Generated {payload.generated_at_iso} · Beithady InboxOps · Auto-deletes 48h after generation
      </div>
    </div>
  );
}

// Print-styled wrapper for the standalone /reports/[token] route. Wraps
// the document inside an HTML page with @page A4 + zero margins so
// "browser → save as PDF" matches the email PDF layout.
export function ReportPrintPage({ payload }: { payload: DailyReportPayload }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Beithady Daily Report — {payload.report_date}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @page { size: A4; margin: 0; }
              html, body { margin: 0; padding: 0; background: #f1f5f9; }
              body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
              .page { background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin: 16px auto; }
              @media print {
                body { background: white; }
                .page { box-shadow: none; margin: 0; }
                .no-print { display: none; }
              }
            `,
          }}
        />
      </head>
      <body>
        <div className="no-print" style={{ padding: 16, textAlign: 'center', background: '#0f172a', color: 'white' }}>
          <button
            id="print-btn"
            type="button"
            style={{
              padding: '8px 16px',
              background: '#0e7490',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Save as PDF / Print
          </button>
        </div>
        <div className="page">
          <ReportDocument payload={payload} />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.getElementById('print-btn')?.addEventListener('click', function(){ window.print(); });
            `,
          }}
        />
      </body>
    </html>
  );
}
