import { XLABEL_REPORT_THEME } from '../brand-theme';
import { chipArrow, chipLabel } from './comparisons';
import type {
  ComparisonSet,
  ComparisonChip,
  KikaDailyPayload,
  TopProductRow,
  InventoryRow,
} from './types';

// A4-styled HTML report for the KIKA Daily Performance Report. Designed
// to render at /r/kika/[token] and (a stripped subset) inside the email
// body. X-Label outer chrome (slate hero band with white wordmark), KIKA
// editorial accents inside (cream sections, gold flourish, pink as a
// sparing brand mark for KIKA-specific callouts).
//
// Pure presentation — never queries data. Takes a built payload.

const C = XLABEL_REPORT_THEME;

const fmtEgp = (n: number): string => {
  if (n == null || !Number.isFinite(n)) return 'EGP 0';
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `EGP ${Math.round(n).toLocaleString('en-US')}`;
  return 'EGP ' + Math.round(n).toLocaleString('en-US');
};
const fmtEgp1 = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `EGP ${Math.round(n / 1000)}k`;
  return fmtEgp(n);
};
const fmtNum = (n: number, dp = 0): string => {
  if (n == null || !Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
};
const fmtPct = (n: number | null, dp = 1): string =>
  n === null ? '—' : n.toFixed(dp) + '%';

function chipStyle(chip: ComparisonChip | null): React.CSSProperties {
  if (!chip) return { color: C.flat };
  if (chip.direction === 'up') return { color: C.upGreen };
  if (chip.direction === 'down') return { color: C.downRed };
  return { color: C.flat };
}

function ChipsRow({ comp }: { comp: ComparisonSet }) {
  const chips: Array<{ label: string; chip: ComparisonChip | null }> = [
    { label: 'vs day', chip: comp.vs_prior_day },
    { label: 'vs wk', chip: comp.vs_prior_weekday },
    { label: 'vs month', chip: comp.vs_mtd_prior_month },
  ];
  if (comp.vs_prior_year) chips.push({ label: 'YoY', chip: comp.vs_prior_year });
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
      {chips.map((c, i) => (
        <span
          key={i}
          style={{
            ...chipStyle(c.chip),
            fontSize: 9,
            background: c.chip ? '#f5f5f5' : 'transparent',
            padding: '2px 6px',
            borderRadius: 3,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {chipLabel(c.chip)}{' '}
          <span style={{ color: C.muted, marginLeft: 2 }}>{c.label}</span>
        </span>
      ))}
    </div>
  );
}

function HeroBand({ payload }: { payload: KikaDailyPayload }) {
  return (
    <div
      style={{
        background: C.primary,
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <img
          src={C.logos.xlabelWhite}
          alt="X-Label"
          style={{ height: 36, width: 'auto', objectFit: 'contain' }}
        />
        <div
          style={{
            width: 1,
            height: 32,
            background: 'rgba(255,255,255,0.3)',
          }}
        />
        <div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Daily Performance · KIKA
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'white',
              marginTop: 2,
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            {payload.generated_at_cairo}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.6)',
            letterSpacing: 0.5,
          }}
        >
          {payload.month_label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.85)',
            marginTop: 2,
          }}
        >
          {payload.weekday_label}
        </div>
      </div>
    </div>
  );
}

function AnomalyBanner({ payload }: { payload: KikaDailyPayload }) {
  if (payload.anomalies.length === 0) return null;
  // Sort: critical → warn → info
  const order = { critical: 0, warn: 1, info: 2 };
  const sorted = [...payload.anomalies].sort(
    (a, b) => order[a.severity] - order[b.severity]
  );
  const top = sorted[0];
  const colorBg =
    top.severity === 'critical'
      ? '#fef2f2'
      : top.severity === 'warn'
        ? '#fffbeb'
        : C.cream;
  const colorBar =
    top.severity === 'critical'
      ? C.downRed
      : top.severity === 'warn'
        ? C.amber
        : C.gold;
  return (
    <div
      style={{
        margin: '12px 24px 0 24px',
        padding: 12,
        background: colorBg,
        borderLeft: `4px solid ${colorBar}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: colorBar,
          marginBottom: 4,
          textTransform: 'uppercase',
        }}
      >
        🚨 {sorted.length} signal{sorted.length === 1 ? '' : 's'} detected
      </div>
      {sorted.map((a, i) => (
        <div
          key={i}
          style={{ fontSize: 11, color: C.ink, lineHeight: 1.5, marginTop: 2 }}
        >
          {a.message}
        </div>
      ))}
    </div>
  );
}

function KpiTile({
  label,
  value,
  comp,
}: {
  label: string;
  value: React.ReactNode;
  comp: ComparisonSet;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 130,
        padding: 12,
        background: 'white',
        border: `1px solid ${C.rule}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: C.muted,
          letterSpacing: 1,
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: C.ink,
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        {value}
      </div>
      <ChipsRow comp={comp} />
    </div>
  );
}

function KpiStrip({ payload }: { payload: KikaDailyPayload }) {
  const t = payload.topline;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        margin: '12px 24px 0 24px',
      }}
    >
      <KpiTile
        label="Net revenue"
        value={fmtEgp(t.net_revenue_egp)}
        comp={t.comparisons.net_revenue}
      />
      <KpiTile
        label="Orders"
        value={fmtNum(t.orders)}
        comp={t.comparisons.orders}
      />
      <KpiTile
        label="AOV"
        value={t.aov_egp !== null ? fmtEgp(t.aov_egp) : '—'}
        comp={t.comparisons.aov}
      />
      <KpiTile
        label="Units"
        value={fmtNum(t.units)}
        comp={t.comparisons.units}
      />
    </div>
  );
}

function CustomerStrip({ payload }: { payload: KikaDailyPayload }) {
  const t = payload.topline;
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        margin: '8px 24px 0 24px',
        fontSize: 11,
        color: C.ink2,
      }}
    >
      <div>
        <strong style={{ color: C.ink }}>{t.unique_customers}</strong> customers
      </div>
      <div>
        <strong style={{ color: C.ink }}>{t.new_customers}</strong> new ·{' '}
        <strong style={{ color: C.ink }}>{t.returning_customers}</strong> returning
      </div>
      {t.repeat_rate_pct !== null && (
        <div>
          repeat rate{' '}
          <strong style={{ color: C.kikaPink }}>{fmtPct(t.repeat_rate_pct)}</strong>
        </div>
      )}
      <div style={{ marginLeft: 'auto', color: C.muted }}>
        Discounts {fmtEgp1(t.discounts_egp)} · Refunds {fmtEgp1(t.refunds_egp)}
      </div>
    </div>
  );
}

function Sparklines({ payload }: { payload: KikaDailyPayload }) {
  const W = 540;
  const H = 50;
  const PAD = 4;

  function svg(values: number[], color: string): React.ReactElement {
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const range = max - min || 1;
    const w = (W - 2 * PAD) / Math.max(1, values.length - 1);
    const points = values
      .map((v, i) => {
        const x = PAD + i * w;
        const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return (
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={points}
        />
        <circle
          cx={PAD + (values.length - 1) * w}
          cy={
            H -
            PAD -
            ((values[values.length - 1] - min) / range) * (H - 2 * PAD)
          }
          r="2.5"
          fill={color}
        />
      </svg>
    );
  }

  return (
    <div
      style={{
        margin: '12px 24px 0 24px',
        padding: 12,
        background: C.cream,
        border: `1px solid ${C.rule}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: C.primary,
          marginBottom: 6,
        }}
      >
        14-DAY TREND
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>
            Net revenue (EGP)
          </div>
          {svg(payload.sparklines.net_revenue_egp, C.primary)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>
            Orders
          </div>
          {svg(payload.sparklines.orders, C.kikaPink)}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        color: C.primary,
        marginBottom: 6,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function SectionCard({
  children,
  flush = false,
}: {
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div
      style={{
        margin: flush ? '12px 24px 0 24px' : '12px 24px 0 24px',
        padding: 12,
        background: 'white',
        border: `1px solid ${C.rule}`,
        borderRadius: 4,
      }}
    >
      {children}
    </div>
  );
}

function TopProducts({ products }: { products: TopProductRow[] }) {
  if (products.length === 0) return null;
  return (
    <SectionCard>
      <SectionTitle>Top products · yesterday</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: `1.5px solid ${C.ink}` }}>
            <th style={{ ...thStyle, textAlign: 'left' }}>Product</th>
            <th style={thStyle}>Units</th>
            <th style={thStyle}>Revenue</th>
            <th style={thStyle}>Share</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.rule}` }}>
              <td style={{ padding: '6px 4px', color: C.ink }}>
                <strong>{p.title}</strong>
                {p.variant_label ? (
                  <span style={{ color: C.muted, marginLeft: 6 }}>
                    {p.variant_label}
                  </span>
                ) : null}
              </td>
              <td style={tdStyleRight}>{p.units}</td>
              <td style={tdStyleRight}>{fmtEgp1(p.revenue_egp)}</td>
              <td
                style={{
                  ...tdStyleRight,
                  color: p.share_of_day_pct >= 30 ? C.kikaPink : C.muted,
                  fontWeight: p.share_of_day_pct >= 30 ? 600 : 400,
                }}
              >
                {p.share_of_day_pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

const thStyle: React.CSSProperties = {
  padding: '6px 4px',
  fontSize: 9,
  color: C.ink2,
  fontWeight: 600,
  textAlign: 'right',
  letterSpacing: 0.5,
};
const tdStyleRight: React.CSSProperties = {
  padding: '6px 4px',
  textAlign: 'right',
  color: C.ink,
  fontVariantNumeric: 'tabular-nums',
};

function InventoryHealth({ payload }: { payload: KikaDailyPayload }) {
  const inv = payload.inventory;
  if (
    inv.stockouts.length === 0 &&
    inv.low.length === 0 &&
    inv.overstock.length === 0
  ) {
    return null;
  }
  const Bucket = ({
    title,
    rows,
    colorBar,
  }: {
    title: string;
    rows: InventoryRow[];
    colorBar: string;
  }) => {
    if (rows.length === 0) return null;
    return (
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: colorBar,
            marginBottom: 4,
          }}
        >
          {title} ({rows.length})
        </div>
        <div style={{ fontSize: 10, columnCount: 2, columnGap: 14 }}>
          {rows.slice(0, 12).map((r, i) => (
            <div
              key={i}
              style={{
                color: C.ink,
                marginBottom: 2,
                breakInside: 'avoid' as const,
              }}
            >
              <strong>{r.title}</strong>
              {r.variant_label ? ` · ${r.variant_label}` : ''}
              <span style={{ color: C.muted, marginLeft: 4 }}>
                {r.status === 'stockout'
                  ? `(0 left, was ${r.daily_velocity}/d)`
                  : r.days_of_cover !== null
                    ? `(${r.on_hand} left · ~${r.days_of_cover}d cover)`
                    : `(${r.on_hand} left)`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <SectionCard>
      <SectionTitle>Inventory health · {inv.total_skus_tracked} SKUs tracked</SectionTitle>
      <Bucket title="Sold out" rows={inv.stockouts} colorBar={C.downRed} />
      <Bucket title="Low stock (<14d cover)" rows={inv.low} colorBar={C.amber} />
      <Bucket title="Overstock (>120d cover)" rows={inv.overstock} colorBar={C.muted} />
    </SectionCard>
  );
}

function AbandonedCheckouts({ payload }: { payload: KikaDailyPayload }) {
  const a = payload.abandoned;
  if (a.count === 0) return null;
  return (
    <SectionCard>
      <SectionTitle>Abandoned checkouts</SectionTitle>
      <div style={{ display: 'flex', gap: 16, fontSize: 10, marginBottom: 6 }}>
        <div>
          <strong style={{ fontSize: 14, color: C.ink }}>{a.count}</strong>{' '}
          carts
        </div>
        <div>
          <strong style={{ color: C.ink }}>{fmtEgp1(a.recoverable_egp)}</strong>{' '}
          recoverable
        </div>
        {a.avg_cart_egp !== null && (
          <div style={{ color: C.muted }}>avg {fmtEgp1(a.avg_cart_egp)}</div>
        )}
        {a.recovery_rate_pct !== null && (
          <div style={{ color: C.muted }}>
            recovery {fmtPct(a.recovery_rate_pct)}
          </div>
        )}
        <div style={{ color: C.muted }}>
          {a.with_email_count} emailable ({fmtPct(a.with_email_pct, 0)})
        </div>
      </div>
      {a.top_5.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: `1px solid ${C.rule}`,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.muted,
              marginBottom: 3,
            }}
          >
            TOP 5 BY VALUE
          </div>
          {a.top_5.map((row, i) => (
            <div
              key={i}
              style={{ fontSize: 10, color: C.ink, marginBottom: 2 }}
            >
              <strong>{fmtEgp1(row.total_egp)}</strong>
              {' · '}
              {row.customer_name || row.email || 'guest'}
              {row.line_items > 0 ? ` · ${row.line_items} items` : ''}
              {row.age_hours !== null ? ` · ${row.age_hours}h ago` : ''}
              {row.resume_url ? (
                <a
                  href={row.resume_url}
                  style={{ color: C.kikaPink, marginLeft: 6 }}
                >
                  resume →
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function Fulfillment({ payload }: { payload: KikaDailyPayload }) {
  const f = payload.fulfillment;
  return (
    <SectionCard>
      <SectionTitle>Fulfillment</SectionTitle>
      <div style={{ display: 'flex', gap: 16, fontSize: 10, marginBottom: 6 }}>
        <div>
          <strong
            style={{
              fontSize: 14,
              color:
                f.shipped_within_24h_pct === null
                  ? C.muted
                  : f.shipped_within_24h_pct >= 80
                    ? C.upGreen
                    : f.shipped_within_24h_pct >= 60
                      ? C.amber
                      : C.downRed,
            }}
          >
            {fmtPct(f.shipped_within_24h_pct)}
          </strong>{' '}
          shipped &lt;24h
        </div>
        <div style={{ color: C.muted }}>
          {f.fulfilled_count} fulfilled · {f.unfulfilled_count} unfulfilled (yest)
        </div>
        <div
          style={{
            color: f.delayed_over_48h_count > 0 ? C.downRed : C.muted,
          }}
        >
          {f.delayed_over_48h_count} delayed &gt;48h
        </div>
        {f.avg_hours_to_fulfill !== null && (
          <div style={{ color: C.muted }}>
            avg {f.avg_hours_to_fulfill}h · median {f.median_hours_to_fulfill}h
          </div>
        )}
      </div>
      {f.oldest_unfulfilled.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: `1px solid ${C.rule}`,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.muted,
              marginBottom: 3,
            }}
          >
            OLDEST UNFULFILLED
          </div>
          {f.oldest_unfulfilled.map((o, i) => (
            <div
              key={i}
              style={{ fontSize: 10, color: C.ink, marginBottom: 2 }}
            >
              <strong>{o.name}</strong> · {o.customer_name || '—'}
              {o.age_hours !== null ? ` · ${o.age_hours}h old` : ''}
              {o.total_egp !== null
                ? ` · ${fmtEgp1(o.total_egp)}`
                : ''}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function Discounts({ payload }: { payload: KikaDailyPayload }) {
  const d = payload.discounts;
  if (d.total_orders_with_discount === 0 && d.total_discount_egp === 0) {
    return null;
  }
  return (
    <SectionCard>
      <SectionTitle>Discounts &amp; promotions</SectionTitle>
      <div style={{ display: 'flex', gap: 16, fontSize: 10, marginBottom: 6 }}>
        <div>
          <strong style={{ fontSize: 14, color: C.ink }}>
            {d.total_orders_with_discount}
          </strong>{' '}
          orders
        </div>
        <div>
          <strong style={{ color: C.ink }}>
            -{fmtEgp1(d.total_discount_egp)}
          </strong>{' '}
          total
        </div>
        {d.pct_of_gross_revenue !== null && (
          <div
            style={{
              color:
                d.pct_of_gross_revenue >= 20
                  ? C.amber
                  : d.pct_of_gross_revenue >= 10
                    ? C.muted
                    : C.upGreen,
            }}
          >
            {fmtPct(d.pct_of_gross_revenue, 1)} of gross
          </div>
        )}
      </div>
      {d.by_code.length > 0 && (
        <div style={{ fontSize: 10 }}>
          {d.by_code.slice(0, 6).map(c => (
            <span
              key={c.code}
              style={{
                display: 'inline-block',
                marginRight: 12,
                marginBottom: 2,
                color: C.ink,
              }}
            >
              <strong style={{ color: C.kikaPink, fontFamily: 'monospace' }}>
                {c.code}
              </strong>
              {' ×'}
              {c.uses} · -{fmtEgp1(c.discount_egp)}
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function Geography({ payload }: { payload: KikaDailyPayload }) {
  const g = payload.geo;
  if (g.by_country.length === 0) return null;
  return (
    <SectionCard>
      <SectionTitle>Geography · yesterday</SectionTitle>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.muted,
              marginBottom: 4,
              letterSpacing: 0.5,
            }}
          >
            COUNTRIES
          </div>
          {g.by_country.map((c, i) => (
            <div
              key={i}
              style={{ fontSize: 10, color: C.ink, marginBottom: 2 }}
            >
              <strong>{c.label}</strong> · {c.orders} orders ·{' '}
              {fmtEgp1(c.revenue_egp)}{' '}
              <span style={{ color: C.muted }}>
                ({c.pct_of_revenue.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
        {g.by_governorate.length > 0 && (
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: C.muted,
                marginBottom: 4,
                letterSpacing: 0.5,
              }}
            >
              EGYPT · GOVERNORATES
            </div>
            {g.by_governorate.map((c, i) => (
              <div
                key={i}
                style={{ fontSize: 10, color: C.ink, marginBottom: 2 }}
              >
                <strong>{c.label}</strong> · {c.orders} orders ·{' '}
                {fmtEgp1(c.revenue_egp)}{' '}
                <span style={{ color: C.muted }}>
                  ({c.pct_of_revenue.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function WeeklySnapshot({ payload }: { payload: KikaDailyPayload }) {
  const w = payload.weekly_digest;
  if (!w) return null;
  return (
    <div
      style={{
        margin: '12px 24px 0 24px',
        padding: 14,
        background: C.primary,
        color: 'white',
        borderRadius: 4,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: 'rgba(255,255,255,0.7)',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        📅 Weekly snapshot
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'white',
          lineHeight: 1.55,
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        {w.oneliner}
      </div>
    </div>
  );
}

function OnelinerCard({ payload }: { payload: KikaDailyPayload }) {
  return (
    <div
      style={{
        margin: '14px 24px 0 24px',
        padding: 14,
        background: C.cream,
        borderLeft: `4px solid ${C.gold}`,
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          color: C.gold,
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        At a glance
      </div>
      <div
        style={{
          fontSize: 12,
          color: C.ink,
          lineHeight: 1.6,
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        {payload.digest_oneliner}
      </div>
      {payload.why.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {payload.why.map((w, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: C.ink2,
                marginTop: 4,
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              💡 {w.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Footer({ payload }: { payload: KikaDailyPayload }) {
  return (
    <div
      style={{
        margin: '16px 24px 0 24px',
        paddingTop: 10,
        paddingBottom: 8,
        borderTop: `1px solid ${C.rule}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 9,
        color: C.muted,
      }}
    >
      <div>
        <img
          src={C.logos.kikaBlack}
          alt="KIKA"
          style={{
            height: 14,
            verticalAlign: 'middle',
            marginRight: 8,
            objectFit: 'contain',
          }}
        />
        <span>
          KIKA · X-Label · all amounts EGP · auto-deletes 48h after generation
        </span>
      </div>
      <div>Generated {payload.generated_at_iso}</div>
    </div>
  );
}

// Single export — the document body. Embedded inside /r/kika/[token]
// (with the page-level toolbar) and the email body (subset).
export function ReportDocument({ payload }: { payload: KikaDailyPayload }) {
  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: C.ink,
        background: C.paper,
        width: '210mm',
        minHeight: '297mm',
        boxSizing: 'border-box',
        paddingBottom: 20,
      }}
    >
      <HeroBand payload={payload} />
      <AnomalyBanner payload={payload} />
      <KpiStrip payload={payload} />
      <CustomerStrip payload={payload} />
      <Sparklines payload={payload} />
      <OnelinerCard payload={payload} />
      <TopProducts products={payload.top_products} />
      <InventoryHealth payload={payload} />
      <AbandonedCheckouts payload={payload} />
      <Fulfillment payload={payload} />
      <Discounts payload={payload} />
      <Geography payload={payload} />
      <WeeklySnapshot payload={payload} />
      <Footer payload={payload} />
    </div>
  );
}
