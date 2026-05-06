# Beithady Performance Dashboard — Design Spec

| | |
|---|---|
| **Date** | 2026-05-06 |
| **Author** | Claude (with kareemhady) |
| **Status** | Approved · awaiting implementation plan |
| **Route** | `/beithady/analytics/performance` |
| **Scope** | V1 — single-tenant, snapshot-only, all panels visible by default with per-user on/off toggles |
| **Worktree** | `.claude/worktrees/flamboyant-agnesi-f34a8d` |

---

## 1. Goal

Replace the static **Daily Performance Report PDF** (sent via email at 09:00 Cairo) with an interactive, drill-down web dashboard inside the Beithady module. Same data, plus structured visualizations, AI-generated insights, and one-click navigation to every source-of-truth view.

The PDF stays in place — it remains the daily distribution channel. The dashboard becomes the **operational cockpit** anyone can pull up at any time during the day to inspect, drill in, and act.

### Success criteria

1. Every metric in the existing PDF is reachable on one page (no tabs).
2. Every visible number/box is clickable and lands on a filterable view of the underlying data.
3. The page renders in <1 second on broadband (snapshot-only — no API calls in the request path).
4. A user can hide/show any panel via a toggle, and the layout reflows without jank.
5. The user can navigate to historical dates by changing one date input (anchor-date model).
6. The dashboard fits the existing Beithady dark-navy Analytics aesthetic — no new colors invented.

---

## 2. Decisions made during brainstorming

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Placement in nav | **C — Under Analytics** (`/beithady/analytics/performance`) | Sixth tile in the Analytics hub. Operational + financial data fits the existing taxonomy. |
| 2 | Period filter behavior | **A — Anchor-date model** | One date picker re-anchors all derived ranges (yesterday, MTD, week, reviews-month). Matches the PDF's mental model 1:1. Default = today. |
| 3 | Data freshness | **A — Snapshot-only at 09:00 Cairo** | V1 reads existing `daily_report_snapshots`. No live recompute, no cron change. Header shows "Data as of HH:mm Cairo" so staleness is honest. |
| 4 | Layout | **Hybrid (A+B)** | Cockpit body (PDF-faithful, single scroll) + slim left filter rail + top-right alert chip strip. |
| 5 | Improvements scope | **All panels visible by default with on/off toggles** | Every candidate (26 panels) ships in V1; user personalizes via a `⚙ Customize` drawer. Visibility persisted to `localStorage`. |
| 6 | Left rail behavior | **Auto-collapse on hover-away with 3s grace period** | Rail collapses from 200px → 44px icon strip after mouse leaves for 3 seconds. CSS grid transition. Optional 📌 pin override. |

---

## 3. URL contract

```
/beithady/analytics/performance
  ?date=YYYY-MM-DD           # default: today (Cairo timezone)
  &building=BH-26|BH-73|BH-435|BH-OK|OTHER|all   # default: all
  &compare=yesterday|last-week|last-month|last-year|none   # default: yesterday
```

All three are bookmarkable and shareable. Server component reads them and queries the matching snapshot.

---

## 4. Visual + brand

### Locked palette (from `brand-theme.ts` + existing Analytics page)
- **Background:** `#0a1628` (deep navy)
- **Card surface:** linear-gradient `rgba(255,255,255,0.025)` → `rgba(255,255,255,0.01)`
- **Border:** `rgba(255,255,255,0.07)`
- **Primary text:** `#ffffff`
- **Secondary text:** `rgba(180,200,235,0.55)`
- **Accent (gold):** `#D4A93A` (Beithady gold)
- **Soft blue:** `#5f7397` (Beithady wordmark)
- **Cream:** `#F5F1E8` (used in PDF; sparingly here for callouts)
- **Status colors:** green `#4ade80` / amber `#fbbf24` / red `#f87171` / blue `#60a5fa` / purple `#c084fc`

### Brand assets
- Beithady wordmark in BeithadyShell breadcrumb (existing component, no change)
- Logo files at `public/brand/beithady/{wordmark,mark,monogram,logo-stacked}.jpg` — referenced by existing components, dashboard inherits.

### Typography
- Headings inherit the Beithady serif fallback (`--bh-heading` CSS var → Cormorant Garamond / Playfair Display).
- Body inherits global `--font-sans`.

### Color thresholds (used in occupancy and pace cells)
- Green ≥ 70%
- Amber 40–70%
- Red < 40%

(Same thresholds as the PDF — kept consistent so PDF readers and dashboard readers see the same color signals.)

---

## 5. Layout — Hybrid composition

### Top bar
```
[ Beithady wordmark · breadcrumb ]                            [⤓ Export PDF] [⚙ Customize (N hidden)]
Performance Dashboard
[date string · "Data as of HH:mm Cairo"]   [📅 today ▾] [🏢 all ▾] [⇄ vs yesterday ▾]   [⚠1★] [📥23] [⚠Occ<50%]
```

### Body (CSS grid, `grid-template-columns: <rail> 1fr`)

#### Left rail (collapsible)
- Default width: **200px** (expanded)
- Collapsed width: **44px** (icon strip)
- Auto-collapse: 3s after `onMouseLeave` if not pinned
- Auto-expand: instant on `onMouseEnter`
- Transition: `grid-template-columns 250ms ease`
- Pin: 📌 icon toggles `railPinned`, persisted to `localStorage["bh:perf-dashboard:rail-pinned:v1"]`
- Reduced-motion: respect `prefers-reduced-motion` — instant collapse
- Mobile (`<768px`): rail becomes a bottom sheet, opens via header button, auto-collapse logic disabled

#### Rail sections (top to bottom, expanded mode)
1. **Period** — radio pills: Today / Yesterday / This week / 📅 custom (opens date picker)
2. **Building** — radio pills: All / BH-26 / BH-73 / BH-435 / BH-OK / Other
3. **Compare** — radio pills: vs Yesterday / vs Last Week / vs Last Month / vs Last Year / None
4. **Active Alerts** — list of alert items with red/amber dots, click any → drill to filtered view
5. **📌 Pin rail** — toggle (off by default)

#### Rail collapsed icons (vertical strip)
1. 📅 Period
2. 🏢 Building
3. ⇄ Compare
4. ⚠ Alerts (with red dot if any active)
5. 📌 Pin
6. » Expand now (manual override)

Each icon has a tooltip (native `title=` for V1; can upgrade to a custom tooltip component later).

#### Main content (12-col CSS grid)

Panels are placed in this order. Each is a self-contained client component that reads from the snapshot prop.

| # | Panel | Span | Tier | Drill-to |
|---|---|---|---|---|
| 1 | AI Insights tray | 12 | T2 | (no drill — narrative only) |
| 2 | Top movers ribbon | 12 | T1 | Each mover → relevant filtered view |
| 3 | Hero: Occupancy | 2 | Baseline | `/beithady/analytics/performance?date=...` (already there — informational) |
| 4 | Hero: MTD Revenue | 2 | Baseline | `/beithady/financials?period=mtd` |
| 5 | Hero: RevPAR | 2 | T2 | `/beithady/financials?metric=revpar` |
| 6 | Hero: Pace | 2 | Baseline | `/beithady/analytics/performance?date=...&compare=last-month` |
| 7 | Hero: Reviews avg | 2 | Baseline | `/beithady/analytics/reviews?period=mtd` |
| 8 | Hero: Response time | 2 | Baseline | `/beithady/communication/unified?metric=response-time` |

**Hero strip composition note:** the original PDF had 6 KPIs including "Inquiries Open". In the dashboard, Inquiries Open is surfaced more usefully as the SLA bucket bar (panel #17, with `<30m / 30–60m / 1–4h / 4–24h / >24h` breakdown), so RevPAR takes its slot in the hero strip. Inquiries are still always visible — just as an actionable bar instead of a number.

| 9 | Buildings table | 8 | Baseline | Each cell → `/beithady/analytics/performance?building=BH-XX` (deep-dive page) |
| 10 | Forward occupancy bars | 4 | T1 | `/beithady/analytics` → Calendar Heatmap |
| 11 | Channel mix donut | 4 | Baseline | `/beithady/financials?breakdown=channel` |
| 12 | Payouts | 4 | Baseline | `/beithady/financials` |
| 13 | Monthly goal | 4 | T2 | (admin → goal config — out of scope for V1; if no goal set, show "Set a goal" CTA) |
| 14 | Reviews block (5★ + last-24h + AI topics) | 6 | Baseline + T2 | `/beithady/analytics/reviews?period=mtd` |
| 15 | Cleaning turnovers today | 3 | Baseline | `/beithady/operations` |
| 16 | Cancel risk panel | 3 | T1 | `/beithady/operations/cancel-risk?min=50&days=21` |
| 17 | Inquiry SLA buckets | 6 | T1 | `/beithady/communication/unified` |
| 18 | Check-ins with payment | 3 | Baseline | `/beithady/operations` |
| 19 | Cancellations | 3 | Baseline | `/beithady/operations/cancel-risk` |
| 20 | Revenue concentration Pareto | 6 | T3 | `/beithady/financials?breakdown=building` |
| 21 | Occupancy gap finder | 6 | T3 | `/beithady/pricing` |
| 22 | Revenue waterfall | 6 | T2 | `/beithady/financials` |
| 23 | STLY YoY comparison | 6 | T2 | `/beithady/analytics/performance?date=...&compare=last-year` |
| 24 | Snapshot history scrubber | 12 | T3 | (drag → updates `?date=` URL param) |
| 25 | Per-building deep-dive cards | (links inside panels 9–14) | T2 | `/beithady/analytics/performance/[building]` |

**Total toggleable items: 26.** That breaks down as 24 main panels (rows above) + 1 "drill into building" link behavior on cells in panels 9–14 (counts as one toggle in the drawer because it's on/off as a group) + 1 Mini-map.

**Mini-map:** on the toggle list but **off by default** in V1 (only 4 building locations don't justify a map; toggle is there if you want to test it).

---

## 6. The Customize drawer

Triggered by `⚙ Customize (N hidden)` button in the top bar.

### Drawer behavior
- Slides in from the right (CSS transform translate, 200ms)
- Overlays main content with a backdrop
- Esc closes; click backdrop closes
- Save button persists `localStorage["bh:perf-dashboard:visibility:v1"]` and closes the drawer; Cancel discards
- Reset button restores all toggles to the default V1 set

### Drawer structure
Each toggle row: `[panel name]  [toggle switch]`. Grouped by section heading:
1. **Hero KPIs** — 6 toggles (Occupancy / MTD Revenue / RevPAR / Pace / Reviews avg / Response Time)
2. **Decisions & alerts** — AI Insights · Top movers · Active alerts · Cancel risk · Occupancy gap finder
3. **Revenue & financials** — Buildings table · Forward occupancy · Channel mix · Payouts · Monthly goal · Revenue concentration · Revenue waterfall · STLY YoY
4. **Operations & guests** — Reviews block · Cleaning turnovers · Inquiry SLA · Check-ins w/ payment · Cancellations
5. **Power tools** — Snapshot scrubber · Export PDF button · Mini-map · Per-building deep-dive links

### Default V1 visibility
- ALL panels except `revenue-waterfall`, `stly`, `snapshot-scrubber`, and `mini-map` are ON by default.
- These four are OFF by default because they each require either AI computation, year-old data lookups, or are power features that not every user needs immediately. Users can opt them on via the drawer.

### Storage shape
```ts
type DashboardVisibility = {
  panels: Record<PanelId, boolean>;
  railPinned: boolean;
  compareDefault: 'yesterday' | 'last-week' | 'last-month' | 'last-year' | 'none';
};
```

**URL vs. localStorage precedence:** the URL is always the source of truth for the active view. localStorage `compareDefault` only fills in the URL param if the user navigates to `/beithady/analytics/performance` without a `?compare=` query — first load of the day, in other words. Once the user changes the compare picker, the URL updates and the localStorage default is updated to match.

---

## 7. Architecture

### Routes & files

```
src/app/beithady/analytics/
├── page.tsx                                # existing — add new tile
├── performance/
│   ├── page.tsx                            # NEW — server component, reads snapshot
│   ├── _components/
│   │   ├── dashboard-shell.tsx             # NEW — client wrapper, holds state
│   │   ├── top-bar.tsx                     # NEW — title + filters + alert chips + customize/export buttons
│   │   ├── left-rail.tsx                   # NEW — auto-collapse rail
│   │   ├── customize-drawer.tsx            # NEW — toggle drawer
│   │   ├── panels/                         # NEW — one file per panel (~26 files)
│   │   │   ├── hero-kpi.tsx                # generic hero KPI w/ sparkline + delta
│   │   │   ├── ai-insights-tray.tsx
│   │   │   ├── top-movers-ribbon.tsx
│   │   │   ├── buildings-table.tsx
│   │   │   ├── forward-occupancy-bars.tsx
│   │   │   ├── channel-mix-donut.tsx
│   │   │   ├── payouts.tsx
│   │   │   ├── monthly-goal.tsx
│   │   │   ├── reviews-block.tsx
│   │   │   ├── cleaning-turnovers.tsx
│   │   │   ├── cancel-risk.tsx
│   │   │   ├── inquiry-sla-buckets.tsx
│   │   │   ├── check-ins-payment.tsx
│   │   │   ├── cancellations.tsx
│   │   │   ├── revenue-concentration.tsx
│   │   │   ├── occupancy-gap-finder.tsx
│   │   │   ├── revenue-waterfall.tsx
│   │   │   ├── stly-yoy.tsx
│   │   │   └── snapshot-scrubber.tsx
│   │   ├── hooks/
│   │   │   ├── use-visibility.ts           # localStorage read/write
│   │   │   ├── use-rail-collapse.ts        # mouse-enter/leave + setTimeout(3000)
│   │   │   └── use-url-state.ts            # ?date=, ?building=, ?compare= sync
│   │   └── lib/
│   │       ├── panel-registry.ts           # PanelId enum + display names + groupings
│   │       └── compute-deltas.ts           # client-side delta from current+compare snapshots
│   └── [building]/                         # OPTIONAL V1.1 — per-building deep dive
│       └── page.tsx
```

### Data flow

```
Snapshot date (URL param)
  → server fetches daily_report_snapshots row
  → passes DailyReportPayload (extended) as prop to <DashboardShell />
  → client component reads visibility from localStorage
  → renders only ON panels
  → each panel renders its slice of the payload
  → drilldown links use Next <Link> with current URL params preserved
```

### `DailyReportPayload` extension

The existing payload already covers most baseline metrics (occupancy, MTD revenue, channel mix, payouts, reviews, cleaning, inquiry triage). We add the following fields, all computed at snapshot-build time inside `src/lib/beithady-daily-report/`:

```ts
type DailyReportPayload = {
  // ... existing fields ...

  // NEW — V1 additions
  insights: AIInsight[];                // 3–5 narrative bullets, generated by Anthropic SDK
  reviewTopics: { praised: TopicCount[]; complained: TopicCount[] };  // AI-parsed topics from review text
  topMovers: TopMover[];                // 3–5 auto-flagged anomalies
  forwardOccupancy: Record<BuildingId, { d7: number; d30: number; d60: number }>;
  cancelRisk: { count: number; valueUSD: number; reservations: ReservationRiskRef[] };
  occupancyGaps: GapNight[];            // next 14d, occupancy <50%
  revenueWaterfall: { gross: number; fees: number; tax: number; net: number };
  stly: {
    revenueMTD: { current: number; previous: number; deltaPct: number };
    occupancyMTD: { current: number; previous: number; deltaPp: number };
  } | null;                              // null if no year-old snapshot exists
  goal: { revenueUSD: number; daysLeft: number; projected: number } | null;
  revenueConcentration: { byBuilding: Concentration[]; byChannel: Concentration[] };
  revpar: { all: number; byBuilding: Record<BuildingId, number> };
  sparklines: Record<HeroKpiId, number[]>;   // 7-day trends pulled from prior snapshots
};
```

### New builders

```
src/lib/beithady-daily-report/
├── build.ts                            # existing orchestrator — add 7 new calls
├── build-insights.ts                   # NEW — Anthropic SDK call, ~$0.005/snapshot
├── build-review-topics.ts              # NEW — Anthropic SDK call, ~$0.005/snapshot
├── build-top-movers.ts                 # NEW — pure function, diff vs prior snapshot
├── build-forward-occupancy.ts          # NEW — Guesty calendar query
├── build-cancel-risk.ts                # NEW — reads existing cancel_risk_v view
├── build-occupancy-gaps.ts             # NEW — derived from build-forward-occupancy
├── build-revenue-waterfall.ts          # NEW — joins snapshot + Odoo fees
├── build-stly.ts                       # NEW — looks up snapshot from 365 days ago, returns null if missing
├── build-revenue-concentration.ts      # NEW — Pareto computation
├── build-revpar.ts                     # NEW — derived from existing revenue + nights
├── build-sparklines.ts                 # NEW — pulls 7 prior snapshots and extracts hero KPI trends
└── ... existing builders unchanged ...
```

**AI cost:** ~$0.01/day (one Anthropic call for insights + one for review topics, both at snapshot-build time). 30 days × $0.01 = $0.30/month — negligible.

### Charting

- **Bar / Donut / Line / Area:** `recharts` v2.15.4 (already in deps, used in F&B + Analytics)
- **Sparklines:** inline SVG (lighter weight; recharts has overhead for 8-pixel sparklines)
- **Waterfall:** custom `<svg>` (recharts doesn't have a built-in waterfall)
- **Pareto bar:** flexbox with computed widths (no library needed)

### State management

- **URL params** (date, building, compare) → `useSearchParams` + `useRouter().push` for updates
- **Visibility + rail state** → `useState` + `localStorage` via `use-visibility.ts` and `use-rail-collapse.ts` hooks
- **No global store needed** for V1

### Drilldowns

Every panel exports a `drillTo: string` URL. The wrapper component renders a Next `<Link href={drillTo}>` around the panel content. Anchor date and building filter are preserved across navigation via URL params.

---

## 8. Engineering work breakdown (V1)

1. **Snapshot type extension** — extend `DailyReportPayload` and write 7 new builders. No DB migration; the snapshot is JSONB.
2. **Snapshot orchestrator update** — `build.ts` calls the 7 new builders.
3. **Backfill consideration** — `stly` will return `null` until we have year-old snapshots. Acceptable.
4. **New tile in Analytics hub** — add `Performance Dashboard` tile to `/beithady/analytics/page.tsx`, gold-bordered with `LIVE` badge.
5. **New route** — `/beithady/analytics/performance/page.tsx` server component.
6. **`<DashboardShell />`** — top-level client component, holds state, renders top bar + rail + grid + customize drawer.
7. **`<TopBar />`** — title row, filter chips, alert chip strip, Customize/Export buttons.
8. **`<LeftRail />`** — collapse logic, expanded view, icon-strip view, pin toggle.
9. **`<CustomizeDrawer />`** — slide-in drawer, toggle rows grouped by section, Save/Cancel/Reset.
10. **26 panel components** — one file each, all tiny (each reads its slice of the payload and renders).
11. **3 hooks** — `use-visibility.ts`, `use-rail-collapse.ts`, `use-url-state.ts`.
12. **Panel registry** — `panel-registry.ts` with `PanelId` enum, display names, default visibility, drilldown URLs.
13. **Export to PDF** — server action that re-uses the existing `@react-pdf/renderer` setup, parameterized by current filters.
14. **Mobile responsive** — rail becomes a bottom sheet, KPI strip becomes 2-up, panels stack.
15. **Tests** — vitest unit tests for each new builder; component-level smoke tests for visibility + collapse hooks.

---

## 9. Out of scope (V1.5+)

- Live recompute on page load (V1 = 09:00 Cairo snapshot only)
- Frequent-snapshot cron (every 30 min) — keep daily for V1
- `user_preferences` DB table (V1 uses localStorage; single-tenant fits)
- Multi-user visibility config (single-operator setup per CLAUDE.md)
- Mini-map of building locations (toggle present, off, low value with 4 buildings)
- Per-building deep-dive page `/[building]` — links exist on building cells, page itself is V1.1 nice-to-have
- Goal-setting admin UI (if no goal set, panel shows "Set a goal" CTA but admin path is V1.5)
- WhatsApp delivery for export — PDF export only in V1; Green-API send is V1.5
- Snapshot scrubber animations — basic slider works, smooth easing/morphing is V1.5

---

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `daily_report_snapshots` doesn't have a row for the requested date | Med | High (page breaks) | Server component falls back to "No snapshot for this date — generate one?" empty state with a manual run-now button |
| Year-old STLY data missing (we started snapshotting <12 months ago) | High | Low | `build-stly.ts` returns null; STLY panel shows "Insufficient history yet" placeholder |
| Anthropic API down at snapshot-build time | Low | Med | `build-insights.ts` and `build-review-topics.ts` catch errors and return empty arrays; dashboard shows "AI insights unavailable today" |
| localStorage gets corrupted | Low | Low | `use-visibility.ts` validates the schema on read and falls back to defaults |
| Mobile layout breaks at edge breakpoints | Med | Med | Test at 320px / 375px / 414px / 768px / 1024px during dev; rail bottom-sheet behavior is the main risk |
| Forward occupancy needs a Guesty live call | Med | High (slow page) | Move that builder's data into the snapshot at build-time so dashboard remains snapshot-only |
| Customize drawer toggles cause layout jank | Low | Low | CSS grid `display: none` is jank-free; visibility transitions handled by CSS, not React DOM thrash |

---

## 11. Open questions

(None blocking. Listed here so they're not forgotten.)

1. **Goal source** — where do monthly revenue/occupancy goals come from? V1 reads from a hard-coded constant or env var; admin UI is V1.5. Acceptable for now.
2. **Mobile rail bottom-sheet** — needs a small UX pass during implementation. Default behavior: closed at load, header button toggles.
3. **Snapshot scrubber granularity** — daily snapshots only (one per day at 09:00 Cairo). The slider snaps to days. If we later move to 30-min snapshots, the slider needs upgrading.

---

## 12. References

- Source PDF report code: `src/lib/beithady-daily-report/build.ts`
- Snapshot table: `daily_report_snapshots` (JSONB)
- Existing report HTML preview: `/r/beithady/[token]`
- Brand tokens: `src/app/_components/brand-theme.ts`
- Existing Stat primitive: `src/app/_components/stat.tsx`
- Existing PeriodControls: `src/app/beithady/financials/_components/PeriodControls.tsx`
- Charting reference: `src/app/beithady/fnb/analytics/_components/revenue-chart.tsx`
- Cancel risk view: `/beithady/operations/cancel-risk?min=50&days=21`
- Reviews view: `/beithady/analytics/reviews`
- Communication inbox: `/beithady/communication/unified`
- Pricing intel: `/beithady/pricing`
- Financials: `/beithady/financials`

---

**End of design spec.** Implementation plan to be authored next via `superpowers:writing-plans`.
