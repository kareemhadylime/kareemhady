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

// Beithady brand palette (extracted from /BeitHady Logos/* — deep navy
// monogram on cream background, with gold accents from the FM+ lockup).
const C = {
  ink: '#1a2c47',       // deep navy (headings)
  ink2: '#374b6b',      // softer navy (body)
  muted: '#7a8aa3',
  line: '#e6dfce',      // warm cream border
  bg: '#ffffff',
  card: '#faf8f3',      // light cream card bg
  brand: '#1e3a5f',     // primary navy
  brandBg: '#f0e9d9',   // warm cream digest box
  green: '#15803d',
  amber: '#b45309',
  red: '#b91c1c',
  emerald: '#10b981',
  gold: '#c9a96e',      // BeitHady warm gold
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
          alignItems: 'center',
          paddingBottom: 12,
          borderBottom: `2px solid ${C.brand}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/brand/beithady/logo-stacked.jpg"
            alt="Beit Hady"
            style={{ height: 56, width: 'auto', objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.brand, letterSpacing: 1 }}>
              Daily Performance Report
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              {payload.generated_at_cairo} · all amounts USD
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.muted, textAlign: 'right' }}>
          Day {payload.month_days_elapsed} of {payload.month_days_total} ·{' '}
          {payload.month_label}
        </div>
      </div>

      {/* v2 Weekly digest banner (S8) */}
      {payload.weekly_digest && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: '#1e3a5f',
            color: 'white',
            fontSize: 10.5,
            borderRadius: 4,
          }}
        >
          📅 <strong>{payload.weekly_digest.oneliner}</strong>
        </div>
      )}

      {/* Digest */}
      <div
        style={{
          marginTop: 10,
          padding: 12,
          background: C.brandBg,
          borderLeft: `4px solid ${C.gold}`,
          borderRadius: 4,
          fontSize: 11,
          lineHeight: 1.5,
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
      <V2_PairedChannelMix payload={payload} />
      <V2_CancellationsAndTriage payload={payload} />
      <CleaningOps payload={payload} />
      <V2_NoShow payload={payload} />
      <V2_BlocksAndAvailable payload={payload} />
      <V2_CheckinPayment payload={payload} />
      <V2_Conversations payload={payload} />

      {/* Page break before reviews */}
      <div style={{ pageBreakBefore: 'always', marginTop: 14 }}>
        <ReviewsBlock payload={payload} />
        <V3_PricingIntelligence payload={payload} />
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

// ─────────────────────────────────────────────────────────────────────────
// v2 sections — Yesterday + MTD pairs, popouts via <details> / <dialog>
// ─────────────────────────────────────────────────────────────────────────

function V2_PairedChannelMix({ payload }: { payload: DailyReportPayload }) {
  if (!payload.paired_channel_mix || payload.paired_channel_mix.length === 0) {
    return <ChannelMix payload={payload} />;
  }
  return (
    <div style={{ marginTop: 14, padding: 10, border: `1px solid ${C.line}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.brand, marginBottom: 6 }}>
        CHANNEL MIX — Yesterday vs MTD
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ ...colHead, textAlign: 'left' }}>Channel</th>
            <th style={colHead}>Yest $</th>
            <th style={colHead}>Yest %</th>
            <th style={colHead}>MTD $</th>
            <th style={colHead}>MTD %</th>
          </tr>
        </thead>
        <tbody>
          {payload.paired_channel_mix.map((m, i) => (
            <tr key={i}>
              <td style={lblCell}><strong>{m.channel}</strong></td>
              <td style={numCell}>{fmtUsd1(m.yesterday_revenue_usd)}</td>
              <td style={numCell}>{m.yesterday_pct.toFixed(1)}%</td>
              <td style={numCell}>{fmtUsd1(m.mtd_revenue_usd)}</td>
              <td style={numCell}>{m.mtd_pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function V2_CancellationsAndTriage({ payload }: { payload: DailyReportPayload }) {
  const c = payload.cancellations;
  const details = payload.cancellation_details || [];
  return (
    <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
      <div style={{ flex: 1, padding: 10, border: `1px solid ${C.line}`, borderRadius: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.brand, marginBottom: 6 }}>
          CANCELLATIONS
        </div>
        <div style={{ fontSize: 10, color: C.ink }}>
          Yesterday: <strong>{c.count_today}</strong>
          {c.value_today_usd > 0 && ` · ${fmtUsd1(c.value_today_usd)}`}
        </div>
        <div style={{ fontSize: 10, color: C.ink2, marginTop: 2 }}>
          MTD: {c.count_mtd} · {fmtUsd1(c.value_mtd_usd)}
        </div>
        {details.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: 9, color: C.brand, fontWeight: 600 }}>
              Show {details.length} cancellation detail{details.length === 1 ? '' : 's'} ▾
            </summary>
            <div style={{ marginTop: 4, fontSize: 9 }}>
              {details.map((d, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: `1px solid ${C.line}` }}>
                  <strong>{d.code || d.id.slice(0, 8)}</strong> · {d.unit} · {d.channel}<br />
                  <span style={{ color: C.muted }}>
                    Guest: {d.guest || '—'} · Was check-in: {d.check_in || '—'} · {fmtUsd1(d.value_usd)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <div style={{ flex: 1, padding: 10, border: `1px solid ${C.line}`, borderRadius: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.brand, marginBottom: 6 }}>
          INQUIRY TRIAGE
        </div>
        <div style={{ fontSize: 10, color: C.ink }}>
          Inquiries unanswered:{' '}
          <strong style={{ color: payload.inquiry_triage.inquiries_unanswered_count > 0 ? C.amber : C.ink }}>
            {payload.inquiry_triage.inquiries_unanswered_count}
          </strong>
        </div>
        <div style={{ fontSize: 10, color: C.ink2, marginTop: 2 }}>
          In-stay urgent: {payload.inquiry_triage.in_stay_immediate_count} · high:{' '}
          {payload.inquiry_triage.in_stay_high_count}
        </div>
      </div>
    </div>
  );
}

function V2_NoShow({ payload }: { payload: DailyReportPayload }) {
  const ns = payload.no_show;
  if (!ns || ns.no_shows.length === 0) return null;
  return (
    <div style={{ marginTop: 14, padding: 10, background: '#fef2f2', border: `1px solid ${C.red}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.red, marginBottom: 6 }}>
        🚫 NO-SHOW ALERT — {ns.no_shows.length} of {ns.expected} expected check-ins
      </div>
      <div style={{ fontSize: 10 }}>
        {ns.no_shows.map((n, i) => (
          <div key={i} style={{ color: C.ink, marginBottom: 2 }}>
            <strong>{n.unit}</strong> · {n.channel} · {n.guest || 'Guest'} {n.code ? `(${n.code})` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function V2_BlocksAndAvailable({ payload }: { payload: DailyReportPayload }) {
  const b = payload.blocks;
  if (!b) return null;
  return (
    <div style={{ marginTop: 14, padding: 10, border: `1px solid ${C.line}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.brand, marginBottom: 6 }}>
        BLOCKS & AVAILABILITY
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <tbody>
          <tr>
            <td style={lblCell}>Yesterday — manual / confirmed / total blocked units</td>
            <td style={{ ...numCell, fontWeight: 600 }}>
              {b.yesterday.manual_block_units} / {b.yesterday.confirmed_block_units} / {b.yesterday.total_blocked_units}
            </td>
          </tr>
          <tr>
            <td style={lblCell}>Forward (today → EOM, {b.forward.days_remaining} days)</td>
            <td style={numCell}>
              {b.forward.available_nights.toLocaleString()} avail of {b.forward.total_unit_nights.toLocaleString()} ({b.forward.available_pct}%)
            </td>
          </tr>
          <tr>
            <td style={lblCell}>Manual blocked nights / Confirmed blocked nights</td>
            <td style={numCell}>
              {b.forward.manual_block_nights.toLocaleString()} / {b.forward.confirmed_block_nights.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
      {b.manual_blocks_open.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 9, color: C.brand, fontWeight: 600 }}>
            Show {b.manual_blocks_open.length} manual block{b.manual_blocks_open.length === 1 ? '' : 's'} ▾
          </summary>
          <div style={{ marginTop: 4, fontSize: 9, columnCount: 2, columnGap: 16 }}>
            {b.manual_blocks_open.map((mb, i) => (
              <div key={i}>
                <strong>{mb.unit}</strong> · {mb.from} → {mb.to}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function V2_CheckinPayment({ payload }: { payload: DailyReportPayload }) {
  const cp = payload.checkin_payment;
  if (!cp) return null;
  return (
    <div style={{ marginTop: 14, padding: 10, border: `1px solid ${C.line}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.brand, marginBottom: 6 }}>
        CHECK-INS WITH RECORDED PAYMENT
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ ...colHead, textAlign: 'left' }}> </th>
            <th style={colHead}>Total</th>
            <th style={colHead}>With pmt</th>
            <th style={colHead}>Without</th>
            <th style={colHead}>%</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={lblCell}><strong>Yesterday</strong></td>
            <td style={numCell}>{cp.yesterday.checkins}</td>
            <td style={numCell}>{cp.yesterday.with_payment}</td>
            <td style={{ ...numCell, color: cp.yesterday.without_payment > 0 ? C.red : C.ink }}>
              {cp.yesterday.without_payment}
            </td>
            <td style={numCell}>{cp.yesterday.pct}%</td>
          </tr>
          <tr>
            <td style={lblCell}>MTD</td>
            <td style={numCell}>{cp.mtd.checkins}</td>
            <td style={numCell}>{cp.mtd.with_payment}</td>
            <td style={numCell}>{cp.mtd.without_payment}</td>
            <td style={numCell}>{cp.mtd.pct}%</td>
          </tr>
        </tbody>
      </table>
      {cp.flagged.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 9, color: C.red, fontWeight: 600 }}>
            🚩 {cp.flagged.length} check-in{cp.flagged.length === 1 ? '' : 's'} without payment ▾
          </summary>
          <div style={{ marginTop: 4, fontSize: 9 }}>
            {cp.flagged.map((f, i) => (
              <div key={i} style={{ padding: '2px 0' }}>
                <strong>{f.code || '—'}</strong> · {f.unit} · {f.guest || '—'} · {f.check_in_date}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function V2_Conversations({ payload }: { payload: DailyReportPayload }) {
  const conv = payload.conversations;
  if (!conv) return null;
  const fmtMin = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`);
  const dialogId = 'beithady-worst-agents';
  return (
    <div style={{ marginTop: 14, padding: 10, border: `1px solid ${C.line}`, borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.brand, marginBottom: 6 }}>
        CONVERSATIONS — Response time + Messages
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ ...colHead, textAlign: 'left' }}> </th>
            <th style={colHead}>Avg response</th>
            <th style={colHead}>First response</th>
            <th style={colHead}>Guest msgs</th>
            <th style={colHead}>Sample</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={lblCell}><strong>Yesterday</strong></td>
            <td style={numCell}>{fmtMin(conv.yesterday.avg_response_minutes)}</td>
            <td style={numCell}>{fmtMin(conv.yesterday.first_response_avg_minutes)}</td>
            <td style={numCell}>{conv.yesterday.guest_message_count}</td>
            <td style={numCell}>{conv.yesterday.sample_size}</td>
          </tr>
          <tr>
            <td style={lblCell}>MTD</td>
            <td style={numCell}>{fmtMin(conv.mtd.avg_response_minutes)}</td>
            <td style={numCell}>{fmtMin(conv.mtd.first_response_avg_minutes)}</td>
            <td style={numCell}>{conv.mtd.guest_message_count}</td>
            <td style={numCell}>{conv.mtd.sample_size}</td>
          </tr>
        </tbody>
      </table>

      {/* SLA buckets */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {conv.sla_buckets_yesterday.map(b => (
          <div key={b.bucket} style={{ flex: 1, padding: 4, background: C.card, borderRadius: 4, textAlign: 'center', fontSize: 9 }}>
            <div style={{ color: C.muted }}>{b.bucket}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{b.count}</div>
          </div>
        ))}
      </div>

      {/* Worst-2 agents trigger */}
      {conv.worst_2_agents.length > 0 && (
        <>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              data-dialog-trigger={dialogId}
              style={{
                fontSize: 9,
                background: C.brand,
                color: 'white',
                border: 'none',
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              View worst-2 agents ({conv.worst_2_agents.length}) →
            </button>
            <span style={{ fontSize: 9, color: C.muted, marginLeft: 8 }}>
              {conv.worst_2_agents
                .map(a => `${a.agent_name}: ${fmtMin(a.avg_response_minutes)}`)
                .join(' · ')}
            </span>
          </div>
          {/* The dialog (hidden by default) */}
          <dialog
            id={dialogId}
            style={{
              padding: 16,
              border: `1px solid ${C.brand}`,
              borderRadius: 6,
              maxWidth: '90vw',
              minWidth: 480,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ color: C.brand, fontSize: 13 }}>Worst-2 Agents — Response Time (MTD)</strong>
              <button
                type="button"
                data-dialog-close={dialogId}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}
              >
                ×
              </button>
            </div>
            {conv.worst_2_agents.map((a, i) => (
              <div key={i} style={{ marginBottom: 12, fontSize: 10 }}>
                <div style={{ fontWeight: 700, color: C.ink }}>
                  {a.agent_name} — avg {fmtMin(a.avg_response_minutes)} ({a.sample_size} responses)
                </div>
                {a.slow_threads.map((t, j) => (
                  <div key={j} style={{ marginTop: 3, paddingLeft: 8, borderLeft: `2px solid ${C.amber}`, color: C.ink2 }}>
                    {t.subject || '(no subject)'} — <strong>{fmtMin(t.minutes)}</strong> · {t.created_at.slice(0, 16).replace('T', ' ')}
                  </div>
                ))}
              </div>
            ))}
          </dialog>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// v3 — Pricing Intelligence section (PriceLabs comp-set comparison)
// ─────────────────────────────────────────────────────────────────────────

function alertColor(level: string): string {
  if (level.startsWith('critical')) return C.red;
  if (level.startsWith('warn')) return C.amber;
  if (level === 'in_band') return C.green;
  return C.muted;
}
function alertLabel(level: string, deltaPct: number | null): string {
  if (level === 'critical_under') return '🚩 Underpriced';
  if (level === 'warn_under') return '⚠ Underpriced';
  if (level === 'critical_over') return '🚩 Overpriced';
  if (level === 'warn_over') return '⚠ Overpriced';
  if (level === 'in_band') return '✓ In band';
  if (level === 'insufficient') return 'Low data';
  if (level === 'suppressed_occ_high') return 'Occ ≥90%';
  if (level === 'suppressed_market_slow') return 'Market slow';
  return '—';
}

function V3_PricingIntelligence({ payload }: { payload: DailyReportPayload }) {
  const pi = payload.pricing_intelligence;
  if (!pi || !pi.available || pi.rows.length === 0) return null;
  const fmtPct = (n: number | null) =>
    n == null ? '—' : `${n > 0 ? '▲ +' : '▼ '}${n.toFixed(1)}%`;
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
          PRICING INTELLIGENCE — Beit Hady vs Area Comps
        </div>
        <div style={{ fontSize: 9, color: C.muted }}>
          Source: PriceLabs neighborhood_data
        </div>
      </div>

      {/* SP1 ribbon */}
      {(pi.summary.underpriced_groups > 0 ||
        pi.summary.overpriced_groups > 0) && (
        <div
          style={{
            padding: 8,
            background: C.brandBg,
            borderLeft: `4px solid ${C.gold}`,
            fontSize: 10,
            color: C.ink,
            marginBottom: 8,
          }}
        >
          {pi.summary.underpriced_groups > 0 && (
            <span>
              <strong style={{ color: C.amber }}>{pi.summary.underpriced_groups}</strong> underpriced groups · revenue gap ~{' '}
              <strong>{fmtUsd1(pi.summary.daily_revenue_gap_usd)}</strong>/night.{' '}
            </span>
          )}
          {pi.summary.overpriced_groups > 0 && (
            <span>
              <strong style={{ color: C.red }}>{pi.summary.overpriced_groups}</strong> overpriced groups (occupancy risk).
            </span>
          )}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
        <thead>
          <tr>
            <th style={{ ...colHead, textAlign: 'left' }}>Building</th>
            <th style={{ ...colHead, textAlign: 'left' }}>Size</th>
            <th style={colHead}>Units</th>
            <th style={colHead}>Our base</th>
            <th style={colHead}>Mkt med</th>
            <th style={colHead}>Δ%</th>
            <th style={colHead}>Wkdy / Wknd</th>
            <th style={colHead}>Comp size</th>
            <th style={{ ...colHead, textAlign: 'left' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {pi.rows.map((r, i) => (
            <tr
              key={i}
              style={{ borderBottom: `1px solid ${C.line}` }}
            >
              <td style={lblCell}>{r.building}</td>
              <td style={lblCell}>{r.bedroom_bucket}</td>
              <td style={numCell}>{r.unit_count}</td>
              <td style={numCell}>{r.our_avg_base_usd != null ? fmtUsd(r.our_avg_base_usd) : '—'}</td>
              <td style={numCell}>{r.comp_median_usd != null ? fmtUsd(r.comp_median_usd) : '—'}</td>
              <td style={{ ...numCell, color: alertColor(r.alert_level), fontWeight: 600 }}>
                {fmtPct(r.delta_pct)}
              </td>
              <td style={numCell}>
                {r.comp_median_weekday_usd != null
                  ? `${fmtUsd(r.comp_median_weekday_usd)} / ${r.comp_median_weekend_usd != null ? fmtUsd(r.comp_median_weekend_usd) : '—'}`
                  : '—'}
              </td>
              <td style={numCell}>{r.comp_set_size}</td>
              <td style={{ ...lblCell, color: alertColor(r.alert_level), fontWeight: 600 }}>
                {alertLabel(r.alert_level, r.delta_pct)}
                {r.recommended_price_usd != null &&
                  (r.alert_level.includes('under') || r.alert_level.includes('over')) && (
                    <span style={{ color: C.muted, fontWeight: 400, marginLeft: 4 }}>
                      → {fmtUsd(r.recommended_price_usd)}
                    </span>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
