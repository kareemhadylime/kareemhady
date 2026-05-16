# Beit Hady Ads Insights — Multi-Phase Roadmap

**Date:** 2026-05-16
**Author:** kareemhady + Claude
**Status:** Roadmap (strategy doc, not implementation spec). Each V1-V4 phase gets its own detailed spec.

## Why this roadmap exists

Kareem asked for two specific enhancements to `/beithady/ads/` (date period filter + audience report per campaign) plus open invitation to brainstorm additional insights. Brainstorming surfaced 17 distinct insight ideas across 6 thematic groups (B-F). One spec for all 17 would be unmanageable; this roadmap decomposes them into 4 sequential phases, each independently shippable.

## Goal

Transform `/beithady/ads/` from a static 30-day overview into an interactive insights surface that answers operator questions like:
- "How is this campaign performing this week vs last?"
- "Where are my clicks coming from (geo / age / device)?"
- "Which property (BH-26 / BH-73 / etc.) is each campaign actually driving leads for?"
- "Which ads within my campaign are working, and which to kill?"
- "Why did my CPL spike yesterday?"
- "Can I send this report to my partner / investor?"

Every phase adds answers to a different subset.

## Phase decomposition

### V1 — Filter + Audience (next up)

**Scope (5 features):**
- Date period filter — UI control (last 7d / 30d / 90d / custom range) threading through every KPI/table query
- B1 Geo breakdown — country + city distribution of clicks/impressions, per campaign
- B2 Demographic breakdown — age + gender split, per campaign
- B3 Device + placement breakdown — IG Feed vs Reels vs Stories, mobile vs desktop, iOS vs Android, per campaign

**Why first:** Both of kareem's explicit asks. Date filter is foundational — every later phase consumes it. Audience breakdowns need a new DB table + extended cron, which V2-V4 will reuse.

**Key data dependencies:**
- New table `ads_insights_breakdowns` (or per-dimension tables) — stores breakdown rows keyed by (campaign_id, metric_date, breakdown_type, breakdown_value, impressions, clicks, spend_micros, leads)
- Extended cron job (modify existing `beithady-ads-insights`) — calls Meta Insights API with `breakdowns=age,gender / country / device_platform,publisher_platform`, Google Ads API with `gender_view` / `geographic_view` / `device_view`, TikTok with breakdown reports
- Date filter UI — replaces hardcoded `getDashboardKpis(30)` with `getDashboardKpis({ from, to })`

**Estimated effort:** ~15 TDD-sized tasks. Single migration, one new lib file (`insights-breakdowns.ts`), 1-2 cron extensions, page changes to 3-4 existing pages, new UI components for the breakdown charts.

**Spec:** `docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md` (to be written next)

---

### V2 — Funnel + Quality

**Scope (5 features):**
- C1 Visual conversion funnel — impressions → reach → clicks → leads → bookings, single chart with conversion rates between each stage
- C2 Lead quality % — booked / total leads ratio per campaign + per source
- C3 WhatsApp first-response time — for Meta CTWA leads, time from lead-arrival to first operator reply (joins ads_leads to inbox response times)
- C4 Per-building breakdown — BH-26 / BH-73 / BH-435 / BH-OK / BH-34 split of campaign performance (uses existing `building_codes` array on campaigns + new attribution rules for leads)
- C5 Lead → booking cohort attribution — leads from week N → bookings in weeks N+1 / N+2 / N+3 (the gap between "lead today" and "booking shows up later")

**Why next:** Conversion-focused. C3 surfaces a direct operational lever (slow WhatsApp replies = lost bookings). C4 answers "is my campaign actually filling BH-26?" — directly tied to revenue. C5 fixes the "ROAS looks low because bookings lag leads by 2 weeks" attribution problem.

**Key data dependencies:**
- Join `ads_leads` ↔ `whatsapp_inbox` / `bh_inbox_messages` for FRT
- Aggregation of `bh_reservations` cross-referenced by lead's `matched_reservation_id` and `created_at` window
- New view or RPC for funnel-stage aggregation

**Estimated effort:** ~15 tasks.

---

### V3 — Time/Patterns + Optimization

**Scope (7 features):**
- D1 Day-of-week × hour-of-day heatmap — clicks + leads density grid, identifies when audience is most responsive
- D2 Spend pacing chart — daily spend trend with projection to monthly budget cap, prevents overrun mid-month
- D3 Period-over-period delta — "last 30d vs prior 30d, leads ↑22% / CPL ↓ 8%" badges on every KPI
- E1 Top-performing ads — rank ads within a campaign by CPL / CTR / leads (table view)
- E2 Top creative assets — which Gallery photos/videos drive most engagement (joins `ads_ads.creative_url` back to `beithady_gallery_assets`)
- E3 Anomaly flags — flag campaigns with sudden CPL spike (>2× rolling avg) or impression drop (<50% rolling avg)
- E4 AI narrative summary — Claude generates a 3-paragraph "what's working / what's not" summary on top of all the dashboard data (~$0.01 per generation, on-demand button)

**Why next:** Diagnostic + actionable. By V3 you have rich enough data that AI narrative actually says useful things (versus generic when V1 only).

**Key data dependencies:**
- D1 needs `ads_daily_metrics` time-of-day breakdown (Meta returns `hourly_stats_aggregated_by_advertiser_time_zone` breakdown, Google similar)
- E1 needs `ads_ads` × `ads_daily_metrics` joined queries (data already there)
- E2 needs the `ads_ads.creative_url` → `beithady_gallery_assets.public_url` matching (already partially done by ad-creative storage)
- E3 needs rolling-average computation (window functions in DB OR app-side)
- E4 needs Claude API call with structured prompt + cost tracking

**Estimated effort:** ~20 tasks.

---

### V4 — Sharing

**Scope (2 features):**
- F1 Export to PDF — full dashboard snapshot, brand-styled, for partner / investor / monthly board review. Uses existing `@react-pdf/renderer` stack.
- F2 Tokenized public share link — `app.limeinc.cc/r/ads/<token>` (or similar) — read-only view of dashboard at a frozen snapshot, shareable without login. Uses existing `/r/<token>` proxy pattern.

**Why last:** Off-platform deliverable. Only useful once the dashboard itself is rich enough to be worth sharing (V1-V3 done).

**Key data dependencies:**
- New table `ads_dashboard_snapshots` — stores generated PDFs / share-link payloads keyed by token, with expiry + scope filters
- Reuse `/r/<token>` proxy public access from existing report tokenization

**Estimated effort:** ~6 tasks.

---

## Sequencing rules

1. **V1 must ship before V2-V4.** Date filter is consumed by every later page; audience breakdowns establish the new DB table V2-V3 also write to.
2. **V2 and V3 can swap.** They share no hard dependencies. If kareem wants narrative + optimization first, swap.
3. **V4 last.** Builds on rich V1-V3 data; no reverse dependency.

## Cost estimates (rough)

| Phase | Tasks | DB additions | API surface | Claude API spend | Net new pages |
|---|---|---|---|---|---|
| V1 | ~15 | 1 migration | extend existing cron | $0 | 0 (existing pages enhanced) |
| V2 | ~15 | 1-2 migrations | new joins | $0 | 0-1 |
| V3 | ~20 | 1 migration | hourly breakdown fetch | ~$0.01 per narrative request | 0 |
| V4 | ~6 | 1 migration | none | $0 | 1 (`/r/ads/<token>`) |
| **Total** | **~56** | **4-5 migrations** | | | **1-2** |

## Out-of-scope (rejected during brainstorm)

- Saved comparisons / dashboards (would need a "save view" concept — too abstract for current need)
- Competitor benchmarks (no data source for "industry CPL" — would be vapor)
- Multi-tenant ad accounts (BH is single-tenant; YAGNI)
- Real-time pixel firing breakdown (Meta Pixel events visualization — separate domain)
- Cross-platform deduplication (lead from Meta CTWA AND Google Search same person — niche; not many cases)

## What ships first

Next step: V1 spec at `docs/superpowers/specs/2026-05-16-bh-ads-v1-filter-audience-design.md`. After kareem approves V1 → writing-plans skill creates the TDD task list → subagent-driven implementation. Same pattern as YouTube V1.1 / V1.2.

V2-V4 specs are written separately when their phase comes up — each gets its own brainstorm if requirements shift, OR a thin spec if the roadmap captures them cleanly enough.
