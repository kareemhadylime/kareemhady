# Kareemhady — Session Handoff (2026-04-28)

## 🟢 Most recent turn — Beithady dark-mode contrast fix (commit `c3cd679`)

User screenshot of Multi-Calendar in dark mode: page title "Multi-Calendar" was nearly invisible, listing nicknames (BH-26-001 etc.) faded into the slate background, price-cell labels were barely legible. Root cause: Beit Hady brand defines `--bh-navy: #1E2D4A` and **28 admin pages** use it as inline `style={{ color: 'var(--bh-navy)' }}`. In dark mode that produces navy-on-slate-900 — WCAG fails everywhere.

**Fix shape (CSS-only, zero TS edits to the 28 sites):** Scope a `--bh-navy` override to `.dark [data-bh-brand="true"]` so the token resolves to slate-100 (`#f1f5f9`) on every admin page in dark mode. Confirmed safe via `Grep` — no admin page uses `--bh-navy` as a `backgroundColor` (search returned 0 matches across `src/app/emails/beithady`). Public `r/beithady/*` pages (guest stay/csat token landing pages) don't carry `data-bh-brand`, so their printed/branded navy is preserved.

**Forward-looking semantic tokens added** in [globals.css](src/app/globals.css): `--bh-heading`, `--bh-rail-text`, `--bh-body-strong` — all swap in dark mode independently. Wired the H1 in `BeithadyHeader` to `--bh-heading` and the listing rail nickname to `--bh-rail-text` for explicit semantics. The token swap on `--bh-navy` is the load-bearing fix; these are namespace polish.

**Surgical bumps where the existing global `text-slate-500/600 → 400/300` lift wasn't enough:**
- `BeithadyHeader` eyebrow (`text-slate-500` → added `dark:text-slate-300`).
- `BeithadyHeader` subtitle (`dark:text-slate-300` → `dark:text-slate-200`).
- `ListingRail` secondary line — building badge + price (`text-slate-500` → added `dark:text-slate-300`).
- `CalendarGrid` price-cell overlay (`text-slate-400` → `text-slate-500 dark:text-slate-300 font-medium`).

**Earlier this turn — stale-inquiry fade (`2738139`).** User screenshot showed BH-26-001 + BH-26-003 with what looked like duplicated/overlapping reservations on May 1. Diagnosis: not a bug, real data. Multiple Airbnb inquiries from different guests + same guest (Saad) inquiring on 2 units in the same building → 2 distinct `reservation_id`s. Only Ezekiel ever became confirmed. Spec from user: fade inquiries with no inbound/outbound message in last 48 h. Implemented client-side in `calendar-data.ts` using existing `beithady_conversations.last_inbound_at` / `last_outbound_at` (no migration). Stale inquiries render at 0.35 opacity in `reservation-bar.tsx` with tooltip suffix "· Stale inquiry (>48h silent)". Confirmed bookings unaffected.

**Build hotfix (`5a078fa`).** Vercel build was already broken on main from M.3 commit `5024494`: `src/lib/beithady/inventory/warehouses.ts` had `import 'server-only'` at the top but exported types AND constants used by client components. Even with `import type`, runtime imports of constants pulled `'server-only'` into the client bundle → Turbopack rejected. Extracted types + constants into [src/lib/beithady/inventory/warehouses-shared.ts](src/lib/beithady/inventory/warehouses-shared.ts); `warehouses.ts` re-exports them for back-compat on the server side; both client components import from `-shared`. Canonical green again.

## 🟡 Earlier this session — Phase M coding: M.0 → M.8 SHIPPED (9 commits deployed), M.9 → M.14 remaining

Auto mode active. User confirmed defaults on C1/C2/C3 → green light to coding. Six sub-phases shipped this session, all auto-deployed to limeinc.vercel.app.

### Shipped this session

| Sub | Commit | Deploy | Scope |
|---|---|---|---|
| M.0 | `05ff5b4` | ✅ | Pre-flight findings doc ([docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md)) — 6 read-only investigations |
| M.1 | `85e1e2a` | ✅ | Migration 0048a (role enum extension: `warehouse_manager` + `housekeeper`) + 0048b (14 tables + 4 line-item children + seeds) + auth.ts updated with `inventory` BeithadyCategory + 7-role × 9-category permission matrix |
| M.2 | `117f668` | ✅ | 9th Beithady launcher tile (Package icon, emerald) + sub-landing with KPI snapshot + 9 tab cards + 3 quick-link cards + 12 stub pages routing to a shared `<InventoryComingSoon />` component + `beithady-inventory` storage bucket created (private, 10MB cap, image+pdf MIME) |
| M.3 | `5024494` | ✅ | Warehouses CRUD + tree view + PIN rotation. Lib at `src/lib/beithady/inventory/warehouses.ts` (listAll, buildTree, fetchStats, getWarehousePin). 4 server actions (create/update/toggleActive/rotatePin). Tree panel renders by-building, recursive sub-warehouses. Cycle detection on parent edits. Block deactivation if non-zero stock. PIN reveal-once banner |
| M.4 | `8f24af0` | ✅ | Items Catalog + Excel template + bulk import. Added `exceljs ^4.4.0` dep. Lib `catalog.ts` (listItems with category+vendor+stock joins) + `excel.ts` (template generator with 4 sheets, parser with per-row validation). 5 server actions. Items table with low-stock chip, batch/expiry/owner/asset flag pills. Two-step import modal (upload → preview with willCreate/willUpdate/errors → commit). Template route at `/api/beithady/inventory/items/template` |
| M.5 | `dba972f` | ✅ | Vendors / Registration tab with KYC workflow. Lib `vendors.ts` (listVendors with item-count + GRN aggregates, getVendorPriceHistory). 6 server actions: create/update + 4 status transitions (submitForKyc/approve/suspend/reactivate). Auto-approval if creator is admin (Risk #9). Admin-only approve action requires manager+ role. Status filter chips with per-status counts. 5-section vendor form (Identity / Legal & tax / Commercial / Contact / Banking + Categories multi-select). Per-row 3-dot actions menu with status-aware transitions |
| M.6 | `5046e0a` | ✅ | Stock view + transaction ledger drill-in. Lib `stock.ts` drives off items so zero-stock items still surface; cross-warehouse aggregation for low/stockout; getItemLedger for drill-in. Right-slideover ledger drawer with type pills + signed Δ qty + doc/ref column. |
| M.7 | `eeb1597` | ✅ | **Receiving (GRN) + atomic posting engine**. Migration 0049 with 3 RPCs: `beithady_inv_recompute_item_avg_cost` (weighted avg), `beithady_inv_post_grn` (THE LOAD-BEARING RPC — pg_advisory_xact_lock per item, upsert stock, write immutable transactions, recompute avg_cost), `beithady_inv_required_approvers` (reads approval_rules, returns distinct roles). 5 server actions: createDraft/submit/approve/reject/post. State-machine: draft→submitted→pending_approval→approved→posted (immutable). Auto-approve when no rule matches. List page with status chips, detail page with line table + workflow buttons, /new with editable line table that filters items by selected vendor. |
| M.8 | `ad50380` | ✅ | **Issue dispensing + 6 types + FIFO posting + auto-issue cron engine**. Migration 0050 with 2 RPCs: `beithady_inv_post_issue` (FIFO batch picking — oldest expiry first, NULLS LAST, then earliest movement; advisory locks per item; raises EXCEPTION on insufficient stock), `beithady_inv_pending_auto_issues(window_days)` (returns reservations checking in today + yesterday catch-up with no existing reservation_hold transaction). Lib `issue.ts` with full rules engine `computeAutoIssueLines`: scope precedence (listing > building > global), formula kinds (per_guest_per_night × G × N · per_night × N · per_2_guests_per_night · per_checkin · fixed_per_stay), 12% loss factor cushion, ceil to 0.01. 5 server actions same shape as GRN. Cron handler at `/api/cron/beithady-inventory-auto-issue` (Cairo-hour gate 13-16, ?force=1 bypass) creates auto-issues with status=approved, posts via RPC, audits run with full counters. vercel.json: 2 entries at 11:00 + 12:00 UTC for DST safety. **20 reservations would fire today** (10 today + 10 yesterday catch-up) once consumption_rules are seeded (rules editor UI deferred to M.11). |

### M.0 pre-flight findings that shaped M.1+ (full doc at [docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md))

1. **Currency**: All 4 active Beithady buildings (BH-26/73/435/OK) are Egypt-only. Q9 V1 scope (EGP+USD) confirmed. No AED columns in V1.
2. **BH-34**: 0 listings in Guesty (upcoming building). Per Q15 = yes, seed warehouse Day 1 anyway.
3. **Phase F task table**: `beithady_tasks.id` is **uuid** → `beithady_inventory_issues.ref_task_id` is uuid with `ON DELETE SET NULL`.
4. **Phase E classifier reusability**: `src/lib/beithady/ai/classify.ts` Anthropic SDK haiku-4-5 pattern — reusable for M.13 WA inbound parser.
5. **Settings PIN convention**: greenfield. Introduced `inventory_pin_WH-XX` keys in `beithady_settings` (random 6-digit at seed; rotatable from M.3 UI).
6. **fx_rates schema**: `rate_date · base · quote · rate · source · fetched_at`. Nightly fx-snap helper (TODO M.11) will denormalise `default_cost_usd` onto items.

### 🔴 Architecture finding from M.0 that changed M.8 plan

`guesty_reservations.status` has NO `checked_in` state — only `confirmed/inquiry/canceled/closed/declined/reserved`. There's no state-transition signal to listen on. **Auto-issue trigger MUST be daily cron** (Cairo ~14:00) scanning `status='confirmed' AND check_in_date <= today AND not_yet_issued_today`, NOT realtime event subscription. Idempotency baked in via UNIQUE index `uniq_bit_reservation_hold ON beithady_inventory_transactions(ref_reservation_id, item_id, warehouse_id) WHERE type='reservation_hold'`.

### Database state after M.1

19 inventory tables created via migration 0048b (applied via Supabase MCP):
- 14 main: warehouses, categories, uoms, vendors, items, stock, transactions, grns, issues, purchase_orders, kits, approval_rules, count_sessions, consumption_rules
- 5 line-item children: grn_lines, issue_lines, po_lines, kit_components, count_lines

Seeds populated:
- 7 categories (consumables/linen/fnb/chemicals/maintenance/welcome_tray/assets) with bilingual EN+AR labels + default UoM/batch/expiry per category
- 8 UoMs (pcs/roll/pack/box/kg/g/L/mL) with measure_kind taxonomy
- 6 main warehouses (BH-26/73/435/OK/34/OTHER) with random 6-digit PINs in `beithady_settings`
- 1 dummy approved vendor (VEN-AMAZON-EG) so first GRN test isn't KYC-blocked
- 10 approval rules (Q4 thresholds: GRN >5K warehouse_mgr, GRN >25K finance, Issue >1K warehouse_mgr, PO >10K finance, all damage_writeoff → manager+finance, all owner_request → manager, all adjustments → warehouse_manager, count variance >10% → warehouse_manager, transfer >5K → warehouse_manager)

Storage bucket `beithady-inventory` (private, 10MB, image/png|jpeg|webp + pdf).

### Locked answers (recap from workflow phase)

Q0=design integration · Q1=hybrid · Q2=weighted-avg · Q3=per-item batch+expiry flags · Q4=5K/25K/1K/10K EGP defaults · Q5=new roles warehouse_manager+housekeeper · Q6=building-PIN V1 · Q7=Item Master Excel only V1 · Q8=new bucket · Q9=EGP+USD V1 · Q10=owner-billable V2 · Q11=auto-issue V1 (daily cron not realtime per #6) · Q12=mobile Arabic V1 · Q13=WA inbound V1 · Q14=consumables only V1 · Q15=all 5 buildings + OTHER

C1=as-listed (M.5 vendors before M.7 GRN) · C2=PIN+name session · C3=7 categories + 8 UoMs

### Sibling worktree activity this session

- `2738139` Operations Calendar: auto-fade stale inquiries >48h silent — touched `calendar-data.ts`, no overlap with inventory work
- `5a078fa` **Build hotfix**: split `warehouses.ts` types/constants out into `warehouses-shared.ts` because client components were transitively pulling `'server-only'` into the bundle via const re-exports. Critical fix — without it the canonical Vercel build was red on the M.3 commit. Pattern locked in: anything imported by client components MUST live in a non-`server-only` module. Applied to my warehouses lib retroactively.
- `73d08e2` SESSION_HANDOFF doc-only

### Remaining sub-phases (~5 commits, M.9 → M.14)

| Sub | Scope | Est commits | Notes for picker-up |
|---|---|---|---|
| M.9 | Transfers (Out → In pair, in-transit visibility) | 0.5 | Reuses Issue type=transfer_out + companion GRN at destination warehouse. Pair via `ref_transfer_id` (already on issues). Likely thin: a /transfers page that creates the pair atomically and shows in-transit |
| M.10 | Counts & Adjustments (cycle + physical, variance → adjustment) | 0.5 | beithady_inventory_count_sessions has generated `variance_qty` column already. Need: schedule session UI (random subset for cycle, full warehouse for physical), counted_qty entry, variance approval, adjustment posting via new RPC `beithady_inv_post_count` (writes type=count_adjust transactions) |
| M.11 | Dashboard (Tab 1) + consumption rules editor + nightly fx-snap + rollup cron | 1.5 | Real KPI population (replace M.2's snapshot calc with denormalised rollup). Rules editor at `/inventory/rules` is the missing piece for M.8 auto-issue to actually fire. Cron fx-snap = `usd_to_egp` from fx_rates → items.default_cost_usd. Rollup cron every 30 min refreshes a `beithady_inventory_dashboard_v` view |
| M.12 | Mobile cleaner app `/inventory/m` | 1 | Arabic RTL + Cairo font + building-PIN form (key `inventory_pin_WH-BHXX-MAIN`) + named session text field + big-button issue/count flows + photo capture (uploads to `beithady-inventory` bucket). Posts back as Issue with `created_via='mobile_pin'` + `cleaner_session_name` populated |
| M.13 | WhatsApp inbound reorder | 1 | Green-API webhook handler (extend existing `beithady-wa-casual` webhook). AI parser reuses `src/lib/beithady/ai/classify.ts` pattern with new categories `inventory_reorder_request` extracting items[]+qty[]. Creates draft Issue/PO with status=`pending_approval` + `created_via='wa_inbound'` |
| M.14 | Morning Brief integration + WA approval push + final polish | 0.5 | Add stockout-risk section to ops-brief.ts. Approvers get a WhatsApp ping when their queue grows (re-uses Phase C wa-casual sender). Final SESSION_HANDOFF + Phase M wrap commit |

Currently 9/15 commits done (~60%). Branch: `claude/romantic-meninsky-05e511`. Head: `ad50380`.

### IMPORTANT lessons learned

- **`server-only` rule**: anything that client components import (types AND const values) MUST live in a non-`server-only` module. Use `<lib>-shared.ts` convention. The sibling commit `5a078fa` had to apply this fix retroactively to my M.3 work — locked in for all future inventory libs.
- **Rebase discipline**: sibling worktrees ship to main mid-session. Always `git fetch + rebase` before push, not after. `.claude/settings.local.json` conflicts are noise — resolve with `--theirs`.

### File map (where things live)

- Migrations: `supabase/migrations/0048a_beithady_inventory_role_enum.sql` · `0048b_beithady_inventory_tables.sql` (14 tables + seeds) · `0049_beithady_inventory_posting_rpcs.sql` (GRN posting + approval matrix RPCs) · `0050_beithady_inventory_issue_posting.sql` (Issue FIFO posting + auto-issue scanner)
- Lib: `src/lib/beithady/inventory/{warehouses,warehouses-shared,catalog,excel,vendors,stock,grn,issue}.ts`
- Pages: `src/app/emails/beithady/inventory/{page,warehouses,items,vendors,stock,grn,issue,...}/page.tsx` + `[id]/page.tsx` + `new/page.tsx` + `_components/*`
- Server actions: `src/app/emails/beithady/inventory/{warehouses,items,vendors,grn,issue}/actions.ts`
- API: `src/app/api/beithady/inventory/items/template/route.ts` (Excel template) · `src/app/api/cron/beithady-inventory-auto-issue/route.ts` (Cairo 14:00 daily)
- Audit: `src/lib/beithady/audit.ts` extended `AuditModule` with 'inventory' (+'operations')
- Auth: `src/lib/beithady/auth.ts` extended with new roles + `inventory` BeithadyCategory
- vercel.json: 2 new cron entries (UTC 11:00 + 12:00 = Cairo 14:00 DST-safe)

### What works end-to-end RIGHT NOW (smoke test the picker-up can run)

1. Visit `/emails/beithady/inventory` → 9 tab cards, all clickable
2. Visit `/inventory/warehouses` → 6 main warehouses listed by building
3. Visit `/inventory/items` → empty initially; click "Add item" or "Excel template" → fill → import
4. Visit `/inventory/vendors` → 1 seeded VEN-AMAZON-EG; click "Register vendor" for new
5. Visit `/inventory/grn/new` → pick vendor + warehouse + add lines → "Save as draft"
6. On detail page → "Submit" → routes through approval matrix → "Approve" (if needed) → "Post to ledger"
7. Stock page now shows the received qty + avg_cost recomputed
8. Click any SKU → ledger drawer shows the receipt transaction
9. `/inventory/issue/new` → pick type + warehouse + lines → submit → approve → post (FIFO picks the cost from received batches)
10. Stock decrements; ledger shows the issue transaction
11. Cron `/api/cron/beithady-inventory-auto-issue?force=1` (with Bearer secret) — fires NOW even outside Cairo window. With 0 consumption_rules seeded today it returns `skipped_no_rules: 20`

### Open questions for the next session (none blocking, just FYI)

- Should M.10 counts UI surface a "ABC analysis" hint to suggest which items to cycle-count this week? (Improvement #14 from the plan)
- M.11 nightly fx-snap: pull from existing `fx_rates` cron or write a new `beithady-inventory-fx-snap` cron at ~03:00 UTC? Latter is cleaner.
- M.13 WA parser confidence threshold: auto-create as draft (current plan) or auto-post if confidence > 0.95? Recommend always-draft for V1 safety.

## 🟢 Earlier this session (sibling worktree) — Operations Calendar: auto-fade stale inquiries (`2738139` + `5a078fa`)

User flagged BH-26-001 + BH-26-003 showing what looked like duplicated/overlapping reservations on May 1. Diagnosis: not a bug, just real data — 4 different Airbnb guests (Saad, Talal, Nadya, Noha) sent inquiries for overlapping May 1-9 dates on those two units.

**User direction:** "Inquiry should expire within 48 Hrs of no Communication — Auto Fade Inquiries". Verified against the 7 visible inquiries: 6 stale (>48 h since last message; range 64h–156h), 1 fresh (Lojain, 17h).

**Implementation (`2738139`):** client-side, no migration. Query `beithady_conversations` for inquiry IDs (single `.in()` lookup), pick `GREATEST(last_inbound_at, last_outbound_at)`, mark `is_stale_inquiry = true` when older than 48 h. New fields on `CalendarReservation`. `reservation-bar.tsx` drops opacity to **0.35** for stale inquiries (active=1.0; cancelled=0.4). Tooltip suffix " · Stale inquiry (>48h silent)". Threshold `stalenessHours = 48` hardcoded — surface to `beithady_settings.inquiry_stale_hours` if needs to be configurable.

**Build hotfix (`5a078fa`):** Vercel build was red on M.3 commit `5024494`. `warehouses.ts` had `import 'server-only'` but exported types AND constants consumed by client components — Turbopack rejected. Fix: extracted into `warehouses-shared.ts` (no `server-only`), `warehouses.ts` re-exports for back-compat, client components updated. Confirmed green on canonical `limeinc.vercel.app`. (Pattern recorded as a lesson learned above.)

## 🟢 Earlier — Phase M.0 pre-flight findings + signed-off workflow → coding begun

User said "Confirmed Default" on C1/C2/C3 → green light to coding. M.0 read-only investigations executed via Supabase MCP + grep:

**6 findings (full doc at [docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md)):**
1. **Currency**: All 4 active Beithady buildings (BH-26/73/435/OK) are Egypt-only. No AED data anywhere. Q9 V1 scope (EGP+USD) confirmed correct.
2. **BH-34**: 0 listings in Guesty (likely upcoming). Per Q15 = yes, seed warehouse Day 1 anyway (inventory not coupled to reservations).
3. **Phase F task table**: `beithady_tasks` exists. `id` is **uuid** (not text). M.8 issue.ref_task_id must be uuid with `ON DELETE SET NULL`.
4. **Phase E classifier reusability**: `src/lib/beithady/ai/classify.ts` uses Anthropic SDK haiku-4-5 with structured JSON return. Pattern reusable for M.13 WA inbound reorder parser.
5. **Settings PIN convention**: greenfield — no `*_BH-XX` keys exist. Will introduce `inventory_pin_BH-XX`.
6. **fx_rates schema**: `rate_date · base · quote · rate · source · fetched_at`. Nightly fx-snap helper will denormalise `default_cost_usd` onto items to avoid per-query joins.

**🔴 IMPORTANT M.8 architecture change uncovered:** `guesty_reservations.status` has NO `checked_in` state — only `confirmed/inquiry/canceled/closed/declined/reserved`. There's no state-transition signal to listen on. **Auto-issue trigger must be daily cron (Cairo ~14:00) scanning `status='confirmed' AND check_in_date <= today AND not_yet_issued_today`**, NOT realtime event subscription. Idempotency via unique constraint on `(reservation_id, kind, item_id)` for type=`reservation_hold` transactions.

**Locked column choices for M.1 migration:**
- Currency: `default_cost_egp · default_cost_usd · currency text DEFAULT 'EGP'`. No AED V1.
- Warehouse seed: 6 (BH-26/73/435/OK/34 + OTHER)
- Issue→Task FK: uuid + ON DELETE SET NULL
- Auto-issue: daily cron + DB unique constraint
- Mobile PIN: `inventory_pin_BH-XX` in `beithady_settings`

**M.0 deliverable:** [docs/PHASE_M_PREFLIGHT.md](docs/PHASE_M_PREFLIGHT.md) doc-only commit. Next turn ships M.1 migration `0048_beithady_inventory.sql` (14 tables + role enum extension + 6 seed warehouses + 7 categories + 8 UoMs + 1 dummy approved vendor + approval matrix).

## 🟢 Earlier this session — Phase M Inventory Module workflow phase drafted (no code, awaiting C1/C2/C3)

User answered Q0–Q15 plus added a new requirement: **Vendor Registration as a dedicated tab**. Per standing process: Plan ✅ → Workflow (this turn) → Code (next turn after sign-off). No code this turn.

**Locked V1 scope from user answers:**
- Q0: Design Integration (NOT subsume) — Phase L stays as conceptual lens; M owns ALL stock tables; L's UI reads M's tables (zero duplicate stock)
- Q1: Hybrid sub-warehouse model (locational tree + categorical tag column)
- Q2: Weighted Average costing
- Q3: Per-item batch+expiry flag, auto-on for F&B + Chemicals
- Q4: Default approval thresholds 5K/25K/1K/10K EGP
- Q5: New roles `warehouse_manager` + `housekeeper` added to BeithadyRole enum
- Q6: Building-shared 6-digit PIN V1 (per-cleaner login V2)
- Q7: Excel V1 = Item Master only (GRN/Counts V2)
- Q8: New `beithady-inventory` storage bucket (clean separation)
- Q9: EGP + USD V1, AED V2
- Q10: Owner-billable register V2
- Q11: Auto-issue on check-in V1 (rules engine via cron poller, not realtime)
- Q12: Mobile cleaner app + Arabic checklist V1
- Q13: WhatsApp inbound reorder V1 (changed from rec V2 — green-api webhook + Phase E AI parser + draft Issue/PO)
- Q14: Consumables only V1 (asset-tracking columns exist but no depreciation logic)
- Q15: All 5 buildings (BH-26/73/435/OK/34) get warehouses Day 1, plus OTHER bucket

**Q0 architecture sent (Phase L↔M coexistence):** Phase L disappears as a build phase. Its features ship as widgets/views layered on M tables:
- Consumables Catalog → M Tab 3 filtered to category=Consumables
- Consumption Rules matrix → M `_consumption_rules` table at `/inventory/rules`
- Per-Checkin Cost Calculator + 30-day Forecast → widgets on M Tab 1 Dashboard
- Auto Purchase List → M Tab 1 "Reorder Alerts" panel
- Stock on Hand → M Tab 5 filtered to Consumables
- Welcome-Tray Templates → M `_kits` table (already in plan)
- Arabic Housekeeping Checklist → M.12 mobile app `/inventory/m`

**Final 9 tabs (Vendor Registration is new Tab 4):**
1. Dashboard (KPIs + per-checkin cost + forecast + reorder + stockout risk + approvals badge)
2. Warehouses (tree view + CRUD)
3. Items / Catalog (master + Excel + AI Amazon-URL paste)
4. **Vendors / Registration** — NEW dedicated tab (KYC workflow + payment terms + banking + price-history graph)
5. Stock (balance per item × warehouse × batch + ledger drill-in)
6. Receiving / GRN
7. Dispensing / Issue (6 types + Kits + auto-rules)
8. Transfers (Out → In pair)
9. Counts & Adjustments

Plus sub-routes: `/inventory/rules`, `/inventory/approvals`, `/inventory/m`.

**Final data model — 14 tables + 4 line-item children** (migration `0048_beithady_inventory.sql`):
`_warehouses` (parent_id self-ref + category_tag) · `_categories` (hierarchical) · `_items` (sku, name_en/ar, batch+expiry flags, owner_billable, is_asset, costing) · `_vendors` (was _suppliers; KYC status, tax_id, banking, payment_terms, amazon_eg URL) · `_stock` (item × warehouse × batch composite PK) · `_transactions` (immutable ledger) · `_grns` + `_grn_lines` · `_issues` + `_issue_lines` · `_purchase_orders` + `_po_lines` · `_kits` + `_kit_components` · `_approval_rules` (configurable matrix) · `_count_sessions` + `_count_lines` · `_consumption_rules` (Phase L rules engine: per_guest_per_night, per_night, per_2_guests_per_night, fixed_per_stay, with loss_factor_pct).

**Permission matrix update sent:** add 2 roles. warehouse_manager = full inventory + read on operations/crm. housekeeper = read inventory only (mobile app is PIN-gated, not role-gated; PIN stored in `beithady_settings` keyed `inventory_pin_BH-XX`).

**Sub-phase plan (15 commits, M.0 → M.14):**
M.0 pre-flight (1c) → M.1 migration 0048 + role enum + 5 seed warehouses (1c) → M.2 launcher tile + sub-landing + bucket creation (1c) → M.3 warehouses CRUD + tree (1c) → M.4 items catalog + Excel template gen + import (2c) → **M.5 vendors registration + Amazon EG URL parser + price history (1c)** → M.6 stock view + ledger (1c) → M.7 GRN + PO match + QC photos + approval + posting engine (1c) → M.8 issue + 6 types + Kits + auto-rules engine on check-in cron poller (2c) → M.9 transfers (0.5c) → M.10 counts (0.5c) → M.11 dashboard + per-checkin cost widget + forecast + reorder alerts + stockout risk + cron `beithady-inventory-rollup` 30min (1c) → M.12 mobile cleaner app `/inventory/m` Arabic RTL + PIN gate (1c) → M.13 WhatsApp inbound reorder webhook + Phase E parser reuse (1c) → M.14 Operations Morning Brief stockout-risk integration + WA approval push (0.5c).

**M.0 pre-flight scope (6 read-only checks):** BH-OK/BH-34 currency · Phase F task→item linkage point · Phase E classifier reusable interface · existing `beithady_settings` PIN convention · `fx_rates` schema for EGP↔USD · reservation check-in event source (Phase J state-transition signal vs cron-polling `guesty_reservations`).

**10-item risk register sent:** auto-issue idempotency (unique constraint on `reservation_id, kind, item_id` for type=reservation_hold), weighted-avg race condition (DB advisory lock per item), WhatsApp parser misclassification (always create as draft, never auto-post), mobile PIN brute-force (5/15min/IP rate-limit), Excel partial commit (transaction wrap), photo storage cost (10MB cap + quarterly cleanup of count session photos >12mo), Phase L user expectations (deep-link chips), new role enum impact (additive), vendor KYC blocking first GRN (seed 1 dummy approved vendor + admin auto-approve), reservation FK on issues (ON DELETE SET NULL).

**3 confirmation questions blocking coding (C1/C2/C3):**
- C1 — Sub-phase ordering: M.5 Vendors before M.7 GRN OK? [rec yes; alt = stub vendor selector in M.7]
- C2 — Mobile cleaner identity V1: PIN-only or PIN + free-text name field per session for audit trail? [rec PIN + name]
- C3 — Seed 7 root categories (Consumables/Linen/F&B/Chemicals/Maintenance Parts/Welcome Tray Items/Assets) + 8 UoMs (pcs/roll/pack/kg/g/L/mL/box)? [confirm or amend]

**Confidence: 93%** on structure / DB shape / workflow algebra / Phase L integration / sub-phase sequencing. Last 2% recovers after C1/C2/C3 + M.0 pre-flight findings.

User can answer C1/C2/C3 individually or say "default + proceed" — next turn ships M.0 pre-flight + M.1 migration as first real code.

## 🟢 Earlier — Phase M Inventory Module plan drafted (no code, supersedes/subsumes Phase L)

User asked to start a complete Inventory Module — multi-warehouse (main + sub per building), item master with manual entry + Excel import, Receiving (GRN), Dispensing (Issue), and Approval workflows. Per user's standing process: **Plan → 95% confidence → Workflow → 95% → Code**. This turn is **plan-only**, awaiting answers.

**Critical alignment flagged up front:** the Phase L draft (last turn) overlaps heavily — proposed its own `beithady_consumables_stock` + `beithady_consumables_purchase_orders`. Building Phase M separately would create two parallel stock systems. Strong recommendation: **Phase M subsumes Phase L** (Phase L's catalog → Item Master, stock → Stock Ledger, purchase list → Reorder, consumption rules → Auto-Issue Rules, welcome tray templates → Issue Kits, Arabic checklist → Mobile cleaner app). Net = same combined scope, single backbone, 13 tables instead of 8+11=19. **Q0 below confirms this.**

**Plan I sent the user:**

**Module placement:** new top-level Beithady tile "Inventory" (9th card next to Operations) at `/emails/beithady/inventory`. New permission category `'inventory'` in `auth.ts` (admin/manager/ops=full, finance=read, GR=none, new housekeeping role TBD).

**8 tabs:**
1. Dashboard — KPI cards (stock value, items below reorder, pending GRNs/Issues, stockouts, expiring), top movers, anomaly strip
2. Warehouses — tree view per building → main + sub-warehouses, manager assignment, geo
3. Items (Catalog) — Item Master with manual add OR Excel import (downloadable .xlsx template)
4. Stock — per-item × per-warehouse on-hand + value + ledger drill-in
5. Receiving (GRN) — supplier match → PO match (or direct) → lines with batch/expiry/QC photos → approval routing → posting
6. Dispensing (Issue) — types: per_reservation (auto-rules), maintenance_task (Phase F), welcome_tray (kit), owner_request, damage_writeoff, transfer_out
7. Transfers — warehouse-to-warehouse 2-step (Out → In) with in-transit visibility
8. Counts & Adjustments — cycle counts (weekly subset) + full physical (quarterly), variance → adjustment with reason

**Cross-cutting:** Approvals inbox (badge), Reorder alerts panel, Audit log integration with `beithady_audit_log`.

**Workflows detailed:** GRN state machine (Draft → Submitted → [opt] Pending Approval → Approved → Posted, immutable after), Issue state machine (same shape, types differ in approval routing), Approval matrix configurable in Settings (DB-backed), WhatsApp ping to approvers via Phase C.

**Data model — 13 tables:** `beithady_inventory_warehouses` (parent_id self-ref) · `_items` · `_categories` · `_suppliers` · `_stock` (item × warehouse × batch) · `_transactions` (immutable ledger) · `_grns` (+ lines) · `_issues` (+ lines) · `_purchase_orders` (+ lines) · `_kits` (Welcome Tray templates) · `_approval_rules` · `_count_sessions` (+ lines) · `_consumption_rules` (Phase L rules engine).

**20 suggested improvements over vanilla:**
1. Mobile-first cleaner app `/emails/beithady/inventory/m` (Arabic, building-PIN, photo capture)
2. WhatsApp inbound reorder ("BH-26 ran out: tissues, soap" → AI parses → draft Issue)
3. Auto-issue on check-in via consumption rules
4. Welcome Tray auto-fire for Gold+ tiers with photo evidence
5. Dynamic reorder point (consumption velocity × upcoming reservation density × supplier lead-time)
6. Stockout-risk dashboard tied to calendar + surfaces in Morning Brief
7. Per-building P&L allocation honoring intercompany model (BH-435 25% mgmt fee, others turnkey)
8. Vendor price-history graph (every GRN line writes price history)
9. Bulk-pack discount logic surfaced in PO line entry
10. Owner-billable register feeding monthly owner statements (Financial hook)
11. Photo evidence everywhere (GRN, damage, welcome tray placement, monthly counts)
12. Barcode/QR per warehouse bin with mobile scan
13. Seasonal kits (Ramadan tray, Christmas tray) auto-active in date window
14. Cycle-count gamification (random 5-item daily count, photo, leaderboard)
15. Forecast accuracy report (rules predicted vs actual issued, monthly)
16. Multi-currency native (EGP/USD/AED) via `fx_rates`
17. Realtime stock badge (Supabase Realtime)
18. AI-assisted item creation (paste Amazon EG URL → auto-fill SKU/cost/photo)
19. "Order from Amazon" deep links from low-stock alerts
20. Dispense-on-departure scrub (mandatory checklist confirms per-reservation issued items consumed/replaced; variance = damage candidate)

**16 open questions blocking workflow phase (Q0 + Q1–Q15):**
- Q0 (CRITICAL) — Subsume Phase L? [recommended Yes]
- Q1 — Sub-warehouse model: locational / categorical / hybrid? [rec hybrid]
- Q2 — Costing method: FIFO / weighted-average / last-cost? [rec weighted-avg]
- Q3 — Batch + expiry tracking? [rec per-item flag, auto-on for F&B + Chemicals]
- Q4 — 4 approval thresholds in EGP? [defaults 5K/25K/1K/10K]
- Q5 — Approver identity: new roles (warehouse_manager + housekeeper) / reuse ops / single inventory_manager? [rec new roles]
- Q6 — Cleaner identity: per-cleaner login / building-PIN / phone+OTP / no login? [rec building-PIN V1, per-cleaner V2]
- Q7 — Excel import scope V1: Item Master only / + GRN / + Counts? [rec Item Master only]
- Q8 — Photo storage: new bucket / reuse gallery / reuse wa-media? [rec new bucket]
- Q9 — Currency scope: EGP only / EGP+USD / +AED? [rec EGP+USD V1]
- Q10 — Owner-billable items V1? [rec V2]
- Q11 — Auto-issue on check-in V1? [rec V1 — biggest operational win]
- Q12 — Mobile cleaner app + Arabic checklist V1? [rec V1 — was Phase L flagship]
- Q13 — WhatsApp inbound reorder V1? [rec V2]
- Q14 — Asset tracking depth (TVs/microwaves)? [rec consumables only V1, assets V2]
- Q15 — Building list confirmation: BH-26/73/435/OK/34 + OTHER, all get warehouses Day 1?

**Sub-phase shape (~10 commits, won't lock until Q0–Q15 answered):**
M.0 pre-flight · M.1 migration `0048_beithady_inventory.sql` 13 tables · M.2 launcher + sub-landing · M.3 warehouses CRUD · M.4 items + Excel import (2c) · M.5 stock view + ledger · M.6 GRN + approval · M.7 issue + kits + auto-issue rules (2c) · M.8 transfers · M.9 counts · M.10 dashboard + reorder alerts + approvals inbox + cron · M.11 mobile Arabic app (if Q12=V1).

**Confidence: 78%** on structure / DB shape / workflow algebra. Lower because Q0 (Phase L subsumption), Q5 (new roles), Q6 (cleaner identity), and Q14 (asset scope) materially change shape. Will hit 95% after answers.

User can answer per-question or say "default the questions and proceed" for sensible V1 defaults. No code this turn. Workflow phase blocks on these answers.

## 🟢 Earlier — Phase L Budget + Consumables plan drafted (no code, now subsumed by Phase M)

User asked to start budgeting + operational control around consumables, amenities, and welcome tray, sourced from Amazon Egypt, with a per-check-in cost engine + Arabic housekeeping checklist. **Plan-only turn**, awaiting answers before coding.

**Plan I sent for review:**

**Industry research (deep):** consumables should run 6-9% of cleaning fee charged to guest. Egypt-specific brands + ballpark Amazon EG prices listed for 12+ SKUs (Fine 12-roll mega ~280 EGP, Lipton 100-pack ~80 EGP, Nestle Pure Life 12-pack ~85 EGP, etc.). Bake in 12-15% loss factor on amenities. Sample 7-night 4-guest 2BR/2BA stay → ~445 EGP (~$9 USD) consumables vs $25 cleaning fee = 36% margin.

**9 functional surfaces:** Catalog · Consumption Rules matrix · Unit Profiles · Per-Checkin Cost calculator · 30-day Forecast · Auto Purchase List · Stock on Hand · Welcome-Tray Templates (tier-based) · **Arabic Housekeeping Checklist** (mobile-first, photo proof, posts back to consumption).

**8 DB tables proposed:**
- `beithady_consumables_catalog`, `beithady_unit_profiles`, `beithady_consumption_rules`, `beithady_consumables_stock`, `beithady_welcome_tray_templates`, `beithady_consumables_purchase_orders`, `beithady_housekeeping_checklists`, `beithady_consumables_price_history`

**Sub-phases (~7-8 commits):** L.1 migration + 50-80 baseline SKUs · L.2 Catalog page + Amazon URL paste · L.3 Rules matrix · L.4 Cost + Forecast · L.5 Purchase List · L.6 Stock · L.7 Welcome Tray Templates · L.8 Arabic mobile checklist.

**12 improvement suggestions** beyond the brief (tier-based welcome trays, photo evidence, bulk-pack discount logic, seasonal Ramadan tray, per-channel profitability, multi-location stock, consumption variance report, etc.).

**11 open questions** blocking workflow phase:
1. Cleaner accounts — login or passwordless phone flow?
2. Photo bucket — reuse Phase D `beithady-gallery` or new `beithady-housekeeping`?
3. Stock locations — single warehouse or per-building cabinets?
4. Procurement — manual after approval or Amazon affiliate API integration?
5. Loss factor — hardcode 12% or per-item editable?
6. Currency — EGP only or also USD via fx_rates?
7. Photo upload size cap?
8. Checklist trigger — auto on checkout event or manual from drawer?
9. VIP welcome-tray photo — all stays or Gold+ only?
10. Price refresh cadence — admin manual monthly or scraper?
11. Seed scope — 50-60 SKUs (broad) or ~25 SKUs (tight)?

User can answer per-question or say "default the questions and proceed" for sensible V1 defaults.

Confidence: 85% on structure / DB shape / rule algebra / Arabic UX direction; 70% on photo storage + multi-location + cleaner identity + procurement integration depth (Q1-Q4 + Q11).

> Note: while I was drafting Phase L, a sibling worktree shipped a series of audit fixes to the Morning Brief (Finance row-explosion fix via `LEFT JOIN LATERAL` in migration 0047, Cairo-TZ accrual revenue, Ops brief owner-stay/manual-block exclusions, manual-block segregation by reason, an admin audit-resend WhatsApp endpoint at `/api/cron/beithady-send-test-briefs`). Those landed in commits `41475ad`, `49af301`, `d8f78f4`, `bcc5b69`, `dab6499`, `047ea78`. They're documented in detail in the sections below — not my work this session.

## 🟢 Earlier — Finance Morning Brief: critical bug fix (sibling worktree)

User flagged WhatsApp Finance brief on 2026-04-28 showed wildly inflated numbers — 412 bookings yesterday, 1000 MTD, 607 check-ins next 2 days, identical $154 BH-435-101 rows repeating 3×. Asked for deep diagnosis and fix.

**Root cause: `beithady_reservation_grid_v` row explosion**
- The view's LEFT JOIN on `beithady_guests` matched on `email OR phone`. There are **202 guest profiles** carrying placeholder email `booking@beithady.com` (Booking.com's masked-contact convention) and **204 reservations** using the same placeholder. Every placeholder reservation cross-joined to all 202 guest rows.
- Whole-view damage: **48,005 view rows for 6,951 distinct reservations (~6.9× inflation)**. Three reservations alone exploded to 202 rows each.
- Side joins (`beithady_pre_arrival_messages`, `beithady_boarding_passes`) were currently 1:1 but had no structural guarantee — they'd start exploding the day a reservation gets two pre-arrival queue rows.

**Fix #1 — Migration `0047_beithady_grid_view_dedupe.sql`** (applied via MCP):
- Replaced 3 of the 4 LEFT JOINs with `LEFT JOIN LATERAL … LIMIT 1`, ordered deterministically (most-engaged guest profile / most-recent boarding pass / most-recent pre-arrival message).
- For `beithady_guests`, added an exclusion list for known placeholder emails (`booking@beithady.com`, `noreply@guesty.com`, `guest@airbnb.com`) so placeholder reservations don't get a stranger's loyalty profile attached. Easy to extend.
- Appended `created_at_odoo` (timestamptz) at the end of the column list — needed for accrual-basis revenue queries. (Postgres rejected mid-list insertion under CREATE OR REPLACE; appending preserves all 46 existing column positions.)
- Post-fix verification: view rows = 6,951 = distinct reservations = base table rows (perfect 1:1).

**Fix #2 — `src/lib/beithady/morning-brief/finance-brief.ts`** rewrite:
- "Yesterday's revenue" + "Month-to-date" now filter by **`created_at_odoo`** (booking creation timestamp, accrual basis), not `check_in_date` (which counted arrivals, not sales).
- Cairo-timezone correctness via existing `cairoWallToUtc` helper from `cairo-dates.ts` (DST-safe).
- Yesterday query now also has `.neq('status','canceled')` (was missing → cancellations were inflating the count further).
- **Per-currency aggregation** — USD and AED are kept in separate buckets and rendered as "$X + Y AED" rather than summed as if interchangeable. The summary's `*_revenue_usd` fields report only the USD portion.
- Direct-booking filter remains `channel='manual'` (matches `channel-meta.ts` "Direct" label and the calendar grid's Direct chip — captures walk-ins, phone bookings, admin-imported direct deals).
- "Through month-end" forecast now uses `endOfMonth(dateIso)` from `cairo-dates.ts`.

**Before / after numbers (2026-04-28 brief):**
| Metric | Before (buggy) | After (fixed) |
|---|---|---|
| Yesterday's revenue | 412 bookings · $83,384 | 22 bookings · $12,937 USD |
| MTD | 1000 bookings · $622,894 | 393 bookings · $295,457 (USD + AED mix) |
| Direct yesterday | (inflated) | 4 bookings · $5,731 |
| Payouts next 2 days | 607 check-ins · $595,179 | 13 check-ins · $4,842 |
| Payouts EOM | 607 · $595,179 | 13 · $4,842 (today is 2 days before EOM) |

**Side benefits** (view fix is system-wide):
- Calendar grid (`calendar-data.ts`), reservation drawer (`reservation-detail.ts`), GR/Ops morning briefs, and cancel-risk all consume the same view → all benefit from the dedup automatically.
- Three reservations were rendering as 202 duplicate calendar bars; now each appears once.

**Recommendation flagged for the user (not changed):** "Direct booking" currently includes any `channel='manual'` reservation — this conflates walk-ins (legit revenue) with admin imports and any future owner stays. If you want to split owner stays out, the cleanest filter would be `source_label != 'owner'`. Currently 0 reservations have `source='owner'` so it doesn't matter today.

### Follow-up — owner-stay exclusion (commit `f9e671d`, **NOT YET DEPLOYED**)

User confirmed: "No Owner stays are considered calendar blocks with no charge."

Added `.neq('source_label', 'owner')` to all 6 finance-brief queries:
- Yesterday's revenue · Month-to-date · Direct booking yesterday · Unpaid+arriving · Payouts 2d · Payouts EOM

Data check: only 3 rows in the entire system have `source='owner'` (all manual channel, $0 host_payout, 1 confirmed + 2 canceled, none in any current forecast window). So today's numbers don't change visibly — the filter is preventive for the future as more owner stays get entered.

**Status:** committed locally on `claude/brave-babbage-a566c2`. The push to main was blocked by a permission rule on this run (the two earlier pushes today went through). Awaiting user approval on whether to push + redeploy or hold the change locally — purely preventive value, no urgency.

### Follow-up — Guest Relations brief audit + fixes (commit `41475ad`, **NOT YET DEPLOYED**)

User flagged the 8 AM GR WhatsApp brief: same VIP "Ayman ELmadany" reservation appearing 5×, "+ 600 more" overflow line. Root cause = same view explosion fix already shipped (migration 0047). That GR run happened before the migration landed; the brief code itself also needed audit.

User said "all" + "A to D" → applied every change in one commit ([gr-brief.ts](src/lib/beithady/morning-brief/gr-brief.ts)):

**High-confidence (A-D):**
- A. Excluded `source_label='owner'` + `is_manual_block=true` from 5 reservation-grid queries (calendar blocks aren't guest events).
- B. CSAT `created_at` filter switched to Cairo-TZ instants via inlined `cairoStartOfDayUtc` (was UTC → clipped 2-3 h off each end of the wall day).
- C. CSAT average ignores null ratings (comment-only responses no longer pulled avg toward 0).
- D. NULL `nights` renders as "—" instead of "0 nights".

**Clarifications 1-6:**
1. Pre-arrival expanded to today + tomorrow (catches late-afternoon same-day arrivals where AM message was missed).
2. VIP window expanded to today → today+3 (today's VIPs now visible in the dedicated section, not just generic Arrivals).
3. Late SLA capped at 48 h freshness — see "discoveries" below.
4. Departures secondary line now shows channel + nights (parity with Arrivals).
5. Section order: Arrivals → **VIP** → Departures → Pre-arrival → At-risk → Late SLA → CSAT.
6. All section titles now include counts (e.g., "Arrivals today (14)"), matching Finance.

**Tomorrow's brief expected counts (post-fix, post-deploy):**
14 arrivals · 0 VIP next 3d · 7 departures · 19 pre-arrival pending (today+tomorrow) · ? at-risk · 10 late-SLA (48h) · 0 CSAT yesterday.

**🔴 Two upstream data issues discovered while auditing — flagged for separate decision:**

1. **`beithady_pre_arrival_messages` table is empty (0 rows total).** That's why all 309 of this month's check-ins show `prearrival_sent_at IS NULL`. The Phase F pre-arrival sender either wasn't deployed, or it sends without writing to this table. Until that's fixed, the "Pre-arrival not sent" section will show ~all upcoming check-ins as needing a message — noisy but accurate signal that the auto-sender is non-functional.

2. **2,110 of 2,139 `sla_breach=true` conversations are >1 week old.** The breach flag isn't being flipped back to false when conversations resolve. The 48 h cap I added stops the brief from being useless, but the underlying flag-lifecycle bug needs cleanup (either a worker that re-evaluates, or flipping the flag on the next message in the thread).

**Status:** committed locally. Two prior commits also still local (`f9e671d` finance owner-stays, `41475ad` GR audit). All three need a single push to main + `vercel --prod`. Awaiting user approval — earlier push attempt was blocked by the harness today.

### Follow-up — Pre-arrival sender investigation (no code change)

User asked me to investigate why `beithady_pre_arrival_messages` has 0 rows. **Diagnosis: not broken — the cron's first valid scheduled run hasn't happened yet.**

Timeline:
- Phase F deployed (added the cron to vercel.json) at 2026-04-27 **17:23 UTC**.
- Pre-arrival cron schedule: `0 8 * * *` UTC = 11:00 Cairo (DST). [vercel.json:30](vercel.json:30).
- Yesterday's 08:00 UTC trigger: deploy was 9 h later, so missed it.
- Today's 08:00 UTC trigger: scheduled for ~80 min after this turn (current time 2026-04-28 06:42 UTC).

Audit-log evidence: `pre_arrival_dispatch_run` = 0 rows ever, while sibling Phase F crons that run at earlier UTC times (`comm_sync_run`, `late_reply_digest_generated`, `vip_digest_generated`, `loyalty_tick_run`) all fired today.

Verified the dispatch wouldn't be a no-op when it does fire:
- 5 templates exist + enabled (incl. 1 fallback)
- Tomorrow's 2 arrivals match `beithady_guests` rows with `phone_e164` set
- Templates / matcher / endpoint all wired correctly

Cosmetic: comment in [pre-arrival.ts:17](src/lib/beithady/engagement/pre-arrival.ts:17) says "10:00 Cairo cron" but DST makes it 11:00 Cairo. No functional impact.

User picked option 1 (wait for natural fire) + said "deploy all amendments". The 5 commits (`f9e671d` finance owner-stays, `41475ad` GR audit, three handoff docs) were pushed to main and `vercel --prod` deployed cleanly. `pre_arrival_dispatch_run` audit row should appear after 08:00 UTC = ~Cairo 11:00.

### Follow-up — Ops / Housekeeping brief audit (no code changes yet, awaiting clarifications)

User flagged the Arabic Housekeeping brief from this morning's cron: "المغادرات اليوم (205)" / "الوصول اليوم (608)" with same Kevin Da Veiga reservation appearing 5×. Same root cause = view explosion (already fixed). Today's real numbers: 7 departures · 14 arrivals · 5 same-day flips · 0 open tasks · 0 new manual blocks · 30 long stays.

User asked for a section-by-section audit ([ops-brief.ts](src/lib/beithady/morning-brief/ops-brief.ts)). Findings:

**High-confidence fixes presented (A–E):**
- A. Exclude `source_label='owner'` + `is_manual_block=true` from arrivals / departures / long-stays / same-day-flip-source.
- B. Open tasks: align `limit(N)` and `slice(N)` (currently 20 vs 10 — wastes 10 fetched rows).
- C. NULL nights → "—" instead of "0 ليالٍ".
- D. Add nights to Departures secondary (parity with Arrivals).
- E. Add "N ليالٍ متبقية" (nights remaining) to long-stay secondary.

**Open clarifications (1–6):**
1. Same-day flip — exclude pure block↔block flips, or count anyway?
2. Open tasks: add freshness filter (due ≤7d OR overdue ≤14d) or keep all pending?
3. Manual blocks section: only `start_date=today` (current) or expand to "active today"?
4. Long stays: add "N nights remaining" suffix? (recommended)
5. Section order: promote Same-day flips to #1 (most time-critical), then Departures → Arrivals → Long stays → Tasks → Blocks?
6. Add a "Tomorrow's check-ins" prep section? (recommended)

**Status:** waiting on user replies before any commit. The previous turn's deploy already shipped (5 commits), so the Ops brief audit work begins from a clean main.

### Follow-up — Ops brief audit shipped (commits `49af301` + `d8f78f4`, deployed)

User answered: "1- Don't Understand · 2- 7 Days · 3- Keep Narrow · 4- Yes · 5- Yes · 6- Yes". Then: "Segregate between Manual Block Maintenance or Other & Owner Block."

#1 dissolved once A applied — same-day flip detection runs over arrival/departure sets that already exclude owner+blocks, so a "block-to-block flip" can't enter the intersection.

**Shipped (commit `49af301`):**
- A. `source_label != 'owner'` + `is_manual_block != true` on arrivals / departures / long-stays / tomorrow-prep.
- B. Open tasks freshness filter — overdue ≤7 d OR due in next 7 d. `limit` and `slice` aligned at 10.
- C. NULL nights → "— ليالٍ".
- D. Departures secondary now shows nights stayed (parity with Arrivals).
- E. Long-stay items show "X ليالٍ متبقية" (nights remaining) before the date.
- 5. Section order: Same-day flips → Departures → Arrivals → Long stays → Tasks → Blocks → **Tomorrow's prep**.
- 6. NEW section: تحضير الغد (tomorrow's prep — heads-up for staging).

**Shipped (commit `d8f78f4`, segregation request):**
- Manual-blocks section split into two:
  - **حجوزات صيانة / أخرى** (`reason IN ('maintenance','other')`) — operational priority, amber tag.
  - **إقامات المالك / حجوزات إدارية** (`reason IN ('owner_stay','hold')`) — informational, slate tag.
- `beithady_calendar_manual_blocks` is currently empty (0 rows) so this is preventive.

**Predicted next-morning Ops brief:** 5 flips · 7 dep · 14 arr · 30 long stays · 0 tasks · 0 blocks (either bucket) · 5 prep.

**Deploy:** both commits pushed to main and `vercel --prod` shipped. Production URL: https://brave-babbage-a566c2-4skw3ktys-lime-investments.vercel.app.

### Follow-up — Audit-resend admin endpoint (commit `dab6499`, deployed)

User asked: "One Time - Resend To me All Briefs Again by Whatsapp Now to Audit". Built and deployed a one-shot admin endpoint that bypasses the test-panel's three-click flow:

`GET /api/admin/beithady/send-test-briefs?to=<digits>&secret=<CRON_SECRET>`

Builds GR + Ops + Finance briefs for today (Cairo TZ), renders WhatsApp markdown, sends each to the supplied number tagged `[AUDIT TEST · <role>]`. Doesn't write to the delivery log so the regular daily cron is unaffected. Auth via CRON_SECRET (Bearer header or `secret` query param).

User's WhatsApp on file (from `app_users.whatsapp` for `kareemhady`): `201222109899`.

**Could not auto-fire** because pulling `CRON_SECRET` from Vercel env was blocked (correctly — secret exfiltration guardrail). User needs to run the curl themselves OR use the test-panel UI buttons. Provided both options.

**Status awaiting:** user to fire the curl with their secret. Once fired, they'll get 3 WhatsApp messages with the post-fix brief content for audit. No further code changes pending until they review.

## 🟢 Earlier — SOP/KB A4 PDF export (commit `61c9063`)

Two endpoints:
- `GET /api/beithady/sop/article/[slug]/pdf` — single article download
- `GET /api/beithady/sop/role/[role]/pdf?lang=en|ar` — full role bundle with cover page + table of contents + one A4 page per article

**PDF renderer** [src/lib/beithady/sop/pdf.tsx](src/lib/beithady/sop/pdf.tsx) uses `@react-pdf/renderer` (already a project dep from the daily-report). Reuses the Beit Hady brand palette + logo from `public/brand/beithady/logo-stacked.jpg`. Markdown blocks (H1-3, paragraphs, ordered + unordered lists) are parsed into react-pdf primitives. Inline syntax (`**bold**`, `*italic*`, `` `code` ``) is stripped for PDF compatibility. Running footer with `page X/Y` numbering on every page.

**Arabic support:** registers Cairo from Google Fonts CDN at first render. RTL articles render right-aligned with reversed list markers + Arabic-aware fontFamily. Falls back to Helvetica if registration fails — Arabic glyphs would render as missing boxes in that case. To guarantee offline-correct Arabic, drop a TTF into `public/fonts/` and switch `Font.register` to a local file path.

**UI:**
- Article detail page header gets a "PDF" download button next to the EN/AR counterpart link.
- SOP landing page header shows a "Download {Role} bundle" primary button when a role tab is selected. Honors the current `lang` filter, so AR-only or EN-only bundles can be exported.

**File names:**
- Single: `beithady-sop-{slug}.pdf`
- Bundle: `beithady-sop-{role}[-{lang}].pdf` (e.g. `beithady-sop-housekeeping-ar.pdf`)

## 🟢 Earlier — SOP/KB Arabic versions for GR + Maintenance (commit `68b32f0`)

User asked for Arabic versions of Guest Relations + Maintenance articles. Inserted 6 counterpart articles (slug suffix `-ar`):

- **GR (3 AR):** مصفوفة تصعيد الشكاوى · طلبات تعديل الحجز · بروتوكول حاجز اللغة
- **Maintenance (3 AR):** خريطة استكشاف أخطاء التكييف · بروتوكول طوارئ السباكة · استكشاف أخطاء القفل الذكي

Per-language inventory (22 articles total): GR 3 EN + 3 AR · Housekeeping 3 AR · Maintenance 3 EN + 3 AR · Reception 3 EN · Upselling 4 EN · All 1 EN.

**Library:** `listArticles` gains optional `language` filter; new `findCounterpart(slug)` resolves EN↔AR pair via the `-ar` suffix convention.

**UI:**
- Landing page gets a Lang chip row (All / EN / AR · العربية) above the Type chips. URL param `lang=en|ar`.
- Article detail page header now shows a counterpart link button ("🇪🇬 العربية" / "🇬🇧 English") when a translation exists.

**Convention:** English articles have a bare slug; Arabic counterparts append `-ar`. Future translations follow the same pattern.

## 🟢 Earlier this session — Phase K.3 SOP & Knowledge Base shipped (commit `19123ce`)

User confirmed → shipped end-to-end with 16 seed articles.

**Migration `0046_beithady_sop_kb.sql`** (applied via MCP):
- `beithady_sop_articles` — single table covering SOP / Checklist / KB. Fields: slug, title, summary, body_md (markdown), language (en/ar), kind, role (reception|guest_relations|housekeeping|maintenance|upselling|all), subcategory (transportation|excursions|f_b|affiliations|null), tags[], checklist_items jsonb, status (draft|published|archived), version, author/updated_by + timestamps.
- `beithady_sop_acknowledgments` — read-receipts per (article, user, version) with unique constraint.
- **16 seed articles** loaded:
  - **Reception (3)**: shift handover · late check-in · lockout recovery
  - **Guest Relations (3)**: complaint escalation matrix · modification requests · language barrier protocol
  - **Housekeeping (3, Arabic)**: قائمة فحص تنظيف ما بين النزلاء · بروتوكول التنظيف العميق الشهري · إجراءات الإبلاغ عن الأضرار
  - **Maintenance (3)**: A/C troubleshooting · plumbing emergency · smart-lock troubleshooting
  - **Upselling (4)**: airport transfers + pricing · Pyramids excursion · grocery stocking F&B · hospital affiliations
  - **All roles (1)**: VIP protocol with tier-specific perks

**Library** [src/lib/beithady/sop](src/lib/beithady/sop/):
- `md.ts` — minimal server-side markdown renderer (H1-3, bold, italic, code, lists, links). Trusts admin-authored input.
- `queries.ts` — `listArticles({role, subcategory, kind, search})`, `getArticle(slug, currentUserId)` returns ack status + count, `listAllRoleCounts`, `ROLE_LABEL_EN/AR`, `SUBCATEGORY_LABEL`.

**Pages:**
- [/operations/sop](src/app/emails/beithady/operations/sop/page.tsx) — role tabs (with counts), upselling sub-category chips when filtered to upselling, kind chips (SOP/Checklist/KB), search. Article cards are dir-aware (RTL for Arabic content with AR badge).
- [/operations/sop/[slug]](src/app/emails/beithady/operations/sop/[slug]/page.tsx) — article detail with markdown body (RTL + Cairo/Amiri font for Arabic), meta strip (version + tags + ack count + Mark-as-read button), interactive checklist panel for `kind=checklist`.

**Server actions** in [actions.ts](src/app/emails/beithady/operations/sop/actions.ts): `acknowledgeArticleAction` (operations.read), `updateArticleBodyAction`, `createArticleAction` (both operations.full). Inline edit UI deferred to V2.

**Operations sub-landing:** 6th card "SOP & Knowledge Base" (BookOpen icon, cyan accent, Phase K badge).

**Phase K progress:** K.1 ✅ K.2 ✅ K.3 ✅ — done.

## 🟢 Earlier this session — Phase K.2 Cancellation risk + re-confirmation (commit `f889b2c`)

User picked Cancellation Risk next. Shipped end-to-end in one commit.

**Migration `0045_beithady_cancel_risk.sql`** (applied via MCP):
- `beithady_reservation_overrides` gains `cancel_risk_score (0-100)`, `cancel_risk_breakdown jsonb`, `last_reconfirmation_sent_at`, `reconfirmation_response`
- New RPC `beithady_calendar_recompute_cancel_risk` — rule-based scorer joining reservations + overrides + guests + conversations
- `beithady_calendar_recompute_all_active` extended to call cancel risk too (every-30-min cron picks it up)
- Initial backfill on 73 active future reservations: **40 critical (70+) · 6 high (50-69) · 5 medium · 22 below 30**

**Scoring signals (additive, clamped 0..100):**
- Inquiry status +30 · long lead time +5..+20 · unpaid+imminent +25 · channel (Booking +15, Direct +5) · first-time +15 / returning -20 · silence +5..+15 · recent re-confirm -25 · cancelled/past = 0

**Page** `/operations/cancel-risk`:
- Min-score filter (30/50/70) + window (7/14/21/30d) URL chips
- Stats cards: Critical / High / Avg score / Re-confirmed last 7d
- Table: score pill · check-in date · listing link · guest (+VIP) · channel · signal chips (rose for adds, emerald for subtracts) · re-confirm button per row

**Re-confirm button (one-click):** server action validates phone → sends templated WhatsApp ("Hi {name}! Just confirming your stay at {listing}…") → persists `last_reconfirmation_sent_at` → writes audit → immediately re-runs cancel-risk RPC so the score drops by 25.

**GR Morning Brief integration:** new "At-risk re-confirms (cancel-risk ≥70, ≤14d)" section between Pre-arrival and Late-SLA. Top 8 by score, drops any re-confirmed in last 24h. Tag = red "Re-confirm" linking to the page.

**Operations sub-landing:** 5th card "At-risk Reservations" (AlertTriangle icon, violet accent, Phase K badge).

**Phase K progress:** K.1 ✅ K.2 ✅ — **K.3 next: Knowledge Base / SOP / Checklists for Hospitality Roles** (Reception · Guest Relation/Reservation · Housekeeping · Maintenance · Upselling Teams: Transportation, Excursions, F&B, Affiliations).

## 🟢 Earlier this session — Morning Brief test panel (commit `3adaf81`)

User asked for a test button with processing indication + result display.

Added [_test-panel.tsx](src/app/emails/beithady/operations/morning-brief/_test-panel.tsx) above the rendered brief on `/emails/beithady/operations/morning-brief`. Three actions:

1. **Preview only** — builds the brief without sending; result panel shows the rendered HTML in an inline iframe + summary stats. No DB writes.
2. **Send test to me** — sends the brief to the calling admin's WhatsApp only (using `app_users.whatsapp`). Doesn't touch the delivery log; the daily real send still happens. Errors if the admin has no WhatsApp on file.
3. **Send NOW to all recipients** — confirms via dialog, then deletes any existing log row for (role, date) and re-runs `runMorningBrief` for the full auto-broadcast + extras list. Refreshes the page so the delivery-status header updates.

UI states:
- **Processing pill** — cyan banner with spinner + per-action label ("Building brief…" / "Sending test to your WhatsApp…" / "Sending to all recipients…")
- **Success** — emerald banner with duration_ms, recipients/email/WA counts, expandable summary stats + preview iframe
- **Failure** — rose banner with error string + per-recipient error list

Three new server actions: `previewBriefAction`, `sendBriefNowAction`, `sendTestToMeAction` — all behind `operations.full` permission. Returns a `TestResult` shape with optional `preview_html`, `summary`, `errors[]`, `delivered_email/whatsapp` counters.

Removed the old `?preview=1` URL hack (replaced by the test panel).

## 🟢 Earlier this session — Morning Brief: Arabic Ops + Finance payout forecasts

User asked for two changes:

**1. Ops brief in Arabic.** Translated all strings in `ops-brief.ts` (إقامة المالك, صيانة, حجز إداري, تنظيف بين النزلاء, أولوية, etc.). Date label uses ar-EG locale. `Brief.language = 'ar'`.

**Renderers now RTL-aware** ([renderers.ts](src/lib/beithady/morning-brief/renderers.ts)):
- WhatsApp markdown emits localized headline (*بيت هادي — موجز الصباح*) + role title + view link
- HTML email sets `<html lang="ar" dir="rtl">` + Arabic font stack (Cairo/Amiri/Tahoma)
- I18N table keeps en/ar copy side by side

**2. Finance brief — two new sections:**
- **Expected payouts — next 2 days** — confirmed reservations checking in in `[today, today+2]`. Sums `host_payout`. Per-channel breakdown + per-reservation list (top 8). Tag = "Forecast" (cyan).
- **Expected payouts — through month end** — confirmed reservations checking in through last-day-of-month. Single summary card with total + count + clarifying note that channel pre-collection windows apply.
- Summary stats add `payouts_2d_count/usd` + `payouts_month_count/usd`.

GR + Finance briefs both flagged `language: 'en'`. The new `language` field on `Brief` is required so any future role can opt into another language.

## 🟢 Earlier this session — Phase K.1 shipped (commit `730f1f2`)

User confirmed recipients policy: auto-broadcast + admin extras. Built all 6 planned sub-phases in one commit.

**Migration `0044_beithady_morning_brief.sql`** (applied via MCP):
- `beithady_morning_brief_extras` — admin-curated recipients (label, email, whatsapp, enabled, role)
- `beithady_morning_brief_log` — per-day per-role delivery log + rendered markdown/HTML for the web archive

**Library `src/lib/beithady/morning-brief/`** (7 files):
- `types.ts` — Brief / BriefSection / BriefItem / BriefRecipient / BriefRole
- `gr-brief.ts` — Guest Relations: arrivals/departures today, pre-arrival pending, late-SLA breaches, VIP next 3d, yesterday's CSAT
- `ops-brief.ts` — Housekeeping & Ops: today's checkouts/check-ins, same-day cleaning flips ⚠, open Phase F tasks, manual blocks starting today, long-stay extensions
- `finance-brief.ts` — Finance: yesterday revenue (+ by channel), MTD with currency mix, unpaid arriving ≤7d (count + balance), direct-booking revenue
- `renderers.ts` — `renderMarkdown` (WhatsApp) + `renderHtml` (email/web)
- `recipients.ts` — `getBriefRecipients(role)`: union of users with matching `beithady_user_role` (auto-broadcast incl. manager/admin) + admin extras
- `run.ts` — orchestrates build + render + send WhatsApp via existing `sendWhatsApp` + persist log; idempotent per (run_date, role)

**Cron** `/api/cron/beithady-morning-brief`:
- Scheduled at `0 5 * * *` + `0 6 * * *` UTC (DST-aware Cairo 8am gate via `Intl.DateTimeFormat('Africa/Cairo')`)
- Bearer-CRON_SECRET auth; `?force=1` bypass

**Web pages:**
- [/emails/beithady/operations/morning-brief](src/app/emails/beithady/operations/morning-brief/page.tsx) — archive view with role tabs (GR/Ops/Finance), prev/next day nav, delivery stats, rendered HTML. Live-rebuilds if no log row exists.
- [/emails/beithady/operations/morning-brief/recipients](src/app/emails/beithady/operations/morning-brief/recipients/page.tsx) — admin page: auto-broadcast users (read-only, with email/WA validity flags) + add/toggle/delete extras per role.

**Operations sub-landing** now surfaces a 4th card: Morning Brief (Sunrise icon, amber accent, "Phase K" badge).

**Open notes:**
- Email delivery is logged but the SMTP provider hookup is a TODO inside `run.ts` (the web archive is canonical regardless)
- WhatsApp delivery uses the existing Phase C green-api `sendWhatsApp({to, message})` helper

**Phase progress:** Phase J ✅ — Phase K.1 ✅ — K.2-K.5 (cancellation prediction / pricing recommender / direct-booking funnel / KB+SOP / owner portal etc.) ⏳

## 🟢 Earlier this session — Phase K.1 plan drafted

User chose **Daily Morning Brief** from the strategic recommendations list and specified three role-specific versions: Guest Relations, Housekeeping & Operations, Finance & Accounting.

**Plan I sent the user, awaiting one confirmation:**

Three briefs delivered at 8am Cairo via WhatsApp + email + web archive:

1. **Guest Relations** — arrivals/departures today, late-SLA breaches, pre-arrival pending, AI suggestions awaiting approval, 1–2★ reviews yesterday, VIP arrivals next 3 days, yesterday's CSAT
2. **Housekeeping & Operations** — today's checkouts/check-ins, cleaning gaps (<3h red, <6h yellow), open maintenance tasks (Phase F), manual blocks starting today, long-stay extensions, smart-lock issues (V2)
3. **Finance & Accounting** — yesterday's revenue (total + by channel + by building), MTD vs budget, unpaid + arriving ≤7d (count + balance), payouts received (Guesty + Stripe), refunds, new direct bookings, channel commission, currency-mix exposure, owner payouts due

**Delivery:**
- WhatsApp via Phase C wa-casual sender (markdown)
- Email via existing email lib (HTML)
- Web archive at `/emails/beithady/operations/morning-brief?role=X&date=YYYY-MM-DD`

**Cron:** `0 5 * * *` + `0 6 * * *` UTC for Cairo 08:00 DST handling (mirrors Phase C late-reply-digest pattern).

**Implementation scope (~5-6 commits) sub-phases K.1.1 → K.1.6:**
- Migration `0044_beithady_morning_brief.sql` — recipients table + delivery log
- Three brief content libs + shared types
- Three renderers (markdown / html / jsx)
- Cron route + `vercel.json` entries
- Web archive page
- Settings page for recipients management

**Open question blocking K.1.1:** which recipients-default policy?
1. Auto-broadcast to all users with matching beithady_user_role
2. Opt-in only (admin adds manually)
3. Whitelist (hardcoded names + later editable)

Awaiting answer + any role-specific item additions before coding.

## 🟢 Earlier this session — Chip filters + Country filter + Hide cancelled (commit `3fbc5c3`)

User asked for three things:

**1. Filter UI redesign — chips instead of selects**
Replaced the single row of select dropdowns with labeled chip rows. Each row has a category label (View / Buildings / Channels / Country / Status / Risk) and pill-style chips that toggle filter values via URL params. Active chips get category-specific colours:
- Channels chips use the brand colour when active (Airbnb red, Booking blue, Direct teal, Hopper purple)
- Status: Confirmed=emerald, Inquiry=amber, Canceled=slate
- Risk: Unpaid=rose, Pre-arrival=amber, VIP=violet
- Buildings + Country = navy/emerald with flag emojis (🇪🇬 🇦🇪)

**2. Country filter added**
Pulled from `guesty_listings.address_country` — 87 Egypt + 3 UAE listings active. URL param `?country=<value>`. Filters listings via SQL `.in('address_country', [...])` before the calendar even queries reservations.

**3. Cancelled reservations now hidden by default**
Was: shown faded with crosshatch.
Now: hidden when status filter is "Active" (default). Click the Canceled status chip to opt-in.

## 🟢 Earlier this session — MTL-aware pricing fallback for BH-73 children (commit `8048ea1`)

User flagged two grid issues:
1. BH-73 children (BH73-1BR-C-8-106, …-2BR-SB-5-107, etc.) showed empty price cells while their MTL parents had prices.
2. Wondered if a Radwa Negm reservation was duplicated across two units.

**Q1 root cause:** Pricelabs only tracks data on MTL **parents**, not their children. In BH-73:
- `BH73-1BR-C-8` (parent): `base=$75`, `bedrooms=1`
- `BH73-1BR-C-8-106` / `…-306` (children): no own pricelabs row

The gallery hides parents (per the polarity matrix), so users only see children — which had no prices. Fixed by fetching `pricelabs_listing_snapshots` + `pricelabs_listings` for the union of `{bookable atom ids, master_listing_ids}` and resolving via `priceFor` / `bedroomsFor` helpers that prefer the child's own value but fall back to the parent.

Same fallback applied in `findAvailabilityAction` and to the comp-set median lookup so children inherit the parent's bedroom bucket for the ▲▼ triangle.

**Q2 verdict:** Not a display duplicate. The two Radwa Negm bars are **two separate cancelled reservation IDs** (`69e4e364…` on `BH73-1BR-C-8-106` and `69e4f263…` on `BH73-1BR-C-8-306`), same guest/email/phone, same dates 2026-05-01 → 2026-05-13. Both are correctly rendered faded + crosshatch (cancelled state). Click either bar → drawer shows the distinct reservation_id.

## 🟢 Earlier this session — "Other" bucket for out-of-scope units (commit `1a3ef97`)

8 active listings with NULL `building_code` (BH-MANG-M15B13, BH-MB34-105, BH-MG-20-1, BH-NEWCAI-4021, BH-WS-E245, LIME-MA-1402, REEHAN-204, YANSOON-105) were previously filtered out of the calendar. Now bucketed into a synthetic 'OTHER' building so they appear alongside BH-26/73/435/OK.

Changes:
- [calendar-data.ts](src/lib/beithady/operations/calendar-data.ts) — removed the `building_code` filter; remaps null → 'OTHER' at row construction. Listing query supports 'OTHER' filter via `building_code.eq.X,...,building_code.is.null` OR expression.
- [header-bar.tsx](src/app/emails/beithady/operations/calendar/_components/header-bar.tsx) — 'OTHER' added to the buildings dropdown ("Other (uncategorised)").
- [page.tsx](src/app/emails/beithady/operations/calendar/page.tsx) — `VALID_BUILDINGS` extended.
- [listing-rail.tsx](src/app/emails/beithady/operations/calendar/_components/listing-rail.tsx) + [find-availability-modal.tsx](src/app/emails/beithady/operations/calendar/_components/find-availability-modal.tsx) — display 'OTHER' as "Other".
- `findAvailabilityAction` + `bulkSendPreArrivalAction` + `listManualBlocksForWindow` — all updated with the same OR-filter pattern.

Comp-set triangles won't show on Other listings (no comp data keyed by 'OTHER') — that's correct behavior since pricelabs comp data is per BH-* building only.

## 🟢 Earlier this session — Phase J COMPLETE (J.8, J.9, J.10 shipped)

Phase J — Beithady Operations Calendar — fully landed across 10 sub-phases this session.

**J.8 — Realtime + overbooking guard** (`badc893`):
- [src/lib/supabase-browser.ts](src/lib/supabase-browser.ts) — anon-key client for Realtime.
- [realtime-bridge.tsx](src/app/emails/beithady/operations/calendar/_components/realtime-bridge.tsx) — subscribes to 4 tables in one Supabase channel (reservations, overrides, manual blocks, messages-INSERT). Debounced router.refresh (1.5s burst window). Live/connecting/offline pill in header. Click → recent-activity dropdown with 20-event log.
- Overbooking pre-write guard added to `createManualBlockAction`: re-reads grid view for overlapping reservations before write. On conflict returns `{ok:false, conflict:{...}}`. UI shows the conflicting reservation's guest/channel/dates and offers a `forceOverride:true` re-attempt with a destructive-warning modal.

**J.9 — Heatmap overlay + comp-set triangles + WhatsApp share** (`926eb15`):
- `calendar-data.ts` joins pricelabs_listing_snapshots (occupancy_next_30, adr_past_30, revenue_past_30) + pricelabs_market_snapshots (comp_median_usd by building+bedroom_bucket) + pricelabs_listings.bedrooms.
- `listing-rail.tsx` — small ▲/▼ next to base price when ours differs from comp-set median by ≥10% (improvement #3). Tooltip shows exact delta.
- `header-bar.tsx` — density select (Price/Occupancy/ADR/Revenue, improvement #2). Cell tinting in occupancy mode: red→amber→green based on 0–100%.
- `boarding-pass-share.tsx` — Copy link + Send via WhatsApp buttons (improvement #11). Builds absolute URL via getBoardingPassUrl action + window.location.origin. `wa.me/{phone}` deep link with prefilled message.

**J.10 — Find availability modal** (`0d495a3`):
- `findAvailabilityAction({startDate, endDate, bedrooms?, buildingCodes?})` — bookable atoms intersected with non-cancelled reservations + manual blocks for the window. Joins bedrooms + price + cover thumb.
- `find-availability-modal.tsx` — form (check-in + check-out + min-bedrooms + building chips + computed nights) + result grid (1/2/3-col responsive). Each free unit deep-links to `https://app.guesty.com/listings/{id}` for the actual booking creation.
- "Find availability" primary button placed prominently in page header.

**Phase J final scorecard (improvements 1-13):** ✅ AI risk score · ✅ Heatmap overlay · ✅ Comp-set triangles · ✅ Bulk actions · ⚠ Drag-to-create (form-based instead, drag deferred to V2) · ✅ Realtime · 🔜 Mobile (V2) · ✅ Saved views · ✅ Anomaly callouts · ✅ Channel-mix sparkline · ✅ WhatsApp share boarding pass · ✅ Past-stay quick-look + previous reviews · ✅ Loyalty banner with tier perks.

**V2 backlog:** mobile layout, true drag-to-create blocks, direct-booking creation flow (currently deep-links to Guesty), ID upload + smart-lock data fields (need new migration), free channel logos.

## 🟢 Earlier this session — Phase J.7 shipped (commits `0131741` + `955126c`)

**J.7a — Payment writes + Stripe resolver + audit** (`0131741`):
- [src/lib/beithady/operations/payment-resolver.ts](src/lib/beithady/operations/payment-resolver.ts) — `resolvePaymentForReservation(id)`. Cancel→n_a, inquiry→unpaid, confirmed+OTA→paid (channel pre-collects), confirmed+direct→Stripe lookup by `metadata.guesty_reservation_id` (preferred) or amount+window match (fallback).
- Server actions: `markPaidAction` (manual override with amount + note + audit), `markUnpaidAction` (revert), `recomputePaymentAction` (re-runs resolver). All write to `beithady_audit_log` via shared `writeAudit` helper.
- [confirm-write-modal.tsx](src/app/emails/beithady/operations/calendar/_components/confirm-write-modal.tsx) — reusable confirm dialog with three warning types: `guesty_write` (amber), `destructive` (rose), `local_only` (cyan). Esc to cancel. Slot for form fields.
- [payment-actions.tsx](src/app/emails/beithady/operations/calendar/_components/payment-actions.tsx) — Mark paid / Revert / Recompute buttons in drawer Tab 4.

**J.7b — Manual blocks (Guesty-synced) + bulk pre-arrival** (`955126c`):
- [src/lib/beithady/operations/guesty-writes.ts](src/lib/beithady/operations/guesty-writes.ts) — `blockGuestyAvailability` / `unblockGuestyAvailability` via `PUT /v1/calendar/listings/{id}` with per-day status patches. Best-effort: errors don't block local DB writes.
- Server actions: `createManualBlockAction` (local insert → Guesty push → record sync status → audit), `removeManualBlockAction`, `listManualBlocksForWindow`, `bulkSendPreArrivalAction` (queues placeholder pre_arrival_messages rows for the existing 5-min cron).
- [manual-block-button.tsx](src/app/emails/beithady/operations/calendar/_components/manual-block-button.tsx) — small "Block" link in each row's left rail; opens form with `guesty_write` warning. Falls back gracefully if Guesty sync fails.
- [bulk-actions.tsx](src/app/emails/beithady/operations/calendar/_components/bulk-actions.tsx) — Bulk button in page header. Days-ahead picker + dry-run preview + submit. Honors active building filter.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ✅ J.4 ✅ J.5 ✅ J.6 ✅ J.7 ✅ — **J.8–J.10 ⏳**

**Remaining sub-phases:**
- J.8 — Supabase Realtime subscription + overbooking pre-write guard.
- J.9 — Heatmap overlay toggle + comp-set price triangles + WhatsApp share-boarding-pass + free channel logos. (Drag-to-create manual blocks also deferred here as polish — form-based flow ships in J.7b.)
- J.10 — Find-availability modal + direct-booking flow.

## 🟢 Earlier this session — Phase J.5 + J.6 shipped (commits `497b2e3`, `6f490eb`)

**J.5 — Operations recompute cron** (`497b2e3`):
- `/api/cron/beithady-operations-recompute` route, scheduled `*/30 * * * *` in `vercel.json`.
- Calls `beithady_calendar_recompute_all_active()` RPC (defined in J.1's migration 0043).
- Bearer-token gated via `CRON_SECRET`. Status flag dots refresh within 30 min of any upstream change.

**J.6 — Saved views + channel-mix sparkline** (`6f490eb`):
- Server actions: `saveViewAction`, `deleteViewAction`, `listViews` — backed by `beithady_calendar_saved_views`. Private vs shared scope; owner-only delete.
- `saved-views-menu.tsx` — bookmark dropdown. Click view → applies filters via URL params. Save form with private/shared picker.
- `channel-mix.tsx` — server-rendered inline horizontal bar showing channel split for the visible window (improvement #10). Drops cancelled reservations.
- Filter state was already URL-driven from J.3, so this completes J.6 scope.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ✅ J.4 ✅ J.5 ✅ J.6 ✅ — J.7–J.10 ⏳

**Remaining sub-phases:**
- J.7 — Read-write actions to Guesty (mark paid, status changes, manual blocks, bulk actions, Stripe payment resolver). Heaviest remaining piece.
- J.8 — Supabase Realtime + overbooking pre-write guard.
- J.9 — Heatmap overlay toggle + comp-set price triangles + WhatsApp share-boarding-pass + free channel logos.
- J.10 — Find-availability modal + direct-booking flow.

## 🟢 Earlier this session — Phase J.1 → J.4 shipped (commits `0346db5`, `90ae39e`, `1e6bde0`, `40958cc`)

J.4 — 10-tab reservation drawer (`40958cc`):
- [src/lib/beithady/operations/reservation-detail.ts](src/lib/beithady/operations/reservation-detail.ts) — `getReservationDetail(id)` parallel-fetches base + conversation + last 10 messages + tasks + upsells + audit + ads attribution + lead pipeline + past stays + reviews
- [drawer.tsx](src/app/emails/beithady/operations/calendar/_components/drawer.tsx) — slideover with backdrop, header (confirmation code, guest, listing, status pill, risk pill), tier-specific loyalty banner (VIP/Platinum/Gold/Silver perks), 10 tabs in a left rail
- All 10 tabs implemented in V1 (read-only): Overview / Guest / Channel / Payment / Communication / Check-in / Tasks / Upsells / Attribution / Audit
- Past-stay quick-look (improvement #12) shows last 3 stays with star ratings + previous review excerpts
- Loyalty banner (improvement #13) drives feature gating per tier
- Page parallel-fetches grid data + reservation detail; drawer mounts when `?reservation=<id>` is set
- Read-only V1; write actions (mark paid, status changes, manual blocks) land in J.7

J.3 — Read-only Calendar Grid (`1e6bde0`):
- [src/lib/beithady/operations/calendar-data.ts](src/lib/beithady/operations/calendar-data.ts) + [channel-meta.ts](src/lib/beithady/operations/channel-meta.ts) + [types.ts](src/lib/beithady/operations/types.ts)
- 5 UI components: anomaly-banner, header-bar (filters + URL params), listing-rail, reservation-bar, calendar-grid (220px sticky rail × N date cols, today indicator, weekend tinting)
- Click reservation → `?reservation=<id>` (drawer wired in J.4)

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ✅ J.4 ⏳ (build verification pending) — J.5–J.10 ⏳

## 🟢 Earlier this session — Phase J.1 + J.2 + J.3 shipped

J.3 grid coding done — Vercel build verification scheduled. Note on J.1's individual deploy: it errored because adding `operations` to `BeithadyCategory` broke `Record<BeithadyCategory, LauncherTile>` in the launcher map; J.2 fixed it within the same logical change. Canonical `limeinc.vercel.app` is on J.2's READY build (which contains J.1 code).

**J.3 — Read-only Calendar Grid (`1e6bde0`):**

Page at `/emails/beithady/operations/calendar` — server component reading URL params (`from`, `days`, `buildings`, `channels`, `status`, `risk`, `q`).

Library:
- [src/lib/beithady/operations/types.ts](src/lib/beithady/operations/types.ts) — `CalendarRow`, `CalendarReservation`, `AnomalySnapshot`, `CalendarFilters`, `CalendarGridData`
- [src/lib/beithady/operations/channel-meta.ts](src/lib/beithady/operations/channel-meta.ts) — channel display map (Airbnb red, Booking blue, Direct teal, …) + 3-char short codes
- [src/lib/beithady/operations/calendar-data.ts](src/lib/beithady/operations/calendar-data.ts) — `getCalendarGridData`:
  - Bookable atoms via `fetchMtlParentIds + isBookableAtom` + drops listings without `building_code`
  - Latest `pricelabs_listing_snapshots.recommended_base_price` per listing as cell price
  - Cover thumbnails from `beithady_gallery_assets` (best-effort)
  - Reservations from `beithady_reservation_grid_v` with all filters SQL-side, search post-fetch
  - Status dot per row from next reservation in <14d (red unpaid+≤7d, yellow prearrival missing+≤2d, purple VIP/Gold/Platinum, gray no upcoming, green healthy)

UI components under `_components/`:
- `anomaly-banner.tsx` — top-of-page strip listing flag counts
- `header-bar.tsx` — date nav + view-span (7/14/28) + filters + search
- `listing-rail.tsx` — left rail per row: status dot + cover + nickname + building badge + per-night price
- `reservation-bar.tsx` — colored absolute-positioned bar overlay; click → `?reservation=<id>`. Inquiry → diagonal stripes; cancelled → faded crosshatch; out-of-window → marker stripe
- `calendar-grid.tsx` — 220px sticky-left rail + N date columns (64px). Sticky-top header with day/dow + weekend tinting + amber today column. Pink today vertical line.

Click on a bar sets `?reservation=<id>` URL param; the **drawer slot is empty in J.3** — the 10-tab drawer ships in J.4.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3 ⏳ (build verification pending) — J.4-J.10 ⏳

## 🟢 Earlier this session — Phase J.1 + J.2 shipped

User signed off on the workflow phase. Pre-flight read-only investigations + J.1 (foundation) + J.2 (launcher) all deployed to limeinc.vercel.app via auto-deploy.

**Pre-flight findings (shaped J.1):**
1. `pricelabs_listing_snapshots` has `recommended_base_price` per-listing per-snapshot — no per-night calendar exists. Cells in J.3 use this as a flat per-listing price.
2. `beithady_boarding_passes` has only `viewed_at`/`view_count`/`token` — no ID upload + no smart-lock. V1 risk score drops those components; J.4 Tab 6 ships boarding pass + pre-arrival only.
3. `guesty_reservations.raw.money` carries `hostPayout` / `fareAccommodation` / `commission` / `currency` — used as money source-of-truth.
4. `comp_median_usd` is in `pricelabs_market_snapshots` per (building, bedroom_bucket) — joined in code, not in the view.
5. `beithady_role_permissions` table doesn't exist — permission matrix is in code at `src/lib/beithady/auth.ts`.
6. Status set in `guesty_reservations`: `confirmed` / `inquiry` / `canceled`. Channels: `airbnb2` / `bookingCom` / `hopper` / `manual`.
7. Stripe lib at `src/lib/stripe.ts`, env var `STRIPE_SECRET_KEY` confirmed (Phase 5.8).

**J.1 — Foundation (`0346db5`):**
- Migration `0043_beithady_operations.sql` applied via MCP. Tables: `beithady_reservation_overrides` (risk + payment cache + manual fields), `beithady_calendar_saved_views`, `beithady_calendar_manual_blocks`. Views: `beithady_reservation_grid_v` (joins reservations + listings + guests + overrides + boarding pass + pre-arrival), `beithady_calendar_anomalies_v` (banner counts).
- RPCs: `beithady_calendar_recompute_payment(id)`, `beithady_calendar_recompute_risk(id)`, `beithady_calendar_recompute_all_active()` (cron entry point).
- Initial backfill on **277 reservations**: 25 unpaid flag, 23 prearrival missing.
- Permission matrix updated: `operations` BeithadyCategory added to `src/lib/beithady/auth.ts`. Grants: admin/manager/ops = full, GR/finance = read.

**J.2 — Launcher (`90ae39e`):**
- 8th tile "Operations" added to Beithady main launcher (CalendarRange icon, cyan accent).
- Sub-landing at `/emails/beithady/operations`: anomaly snapshot strip + 3 cards (Multi-Calendar, Tasks → Phase F, Boarding Passes).
- `/operations/calendar` placeholder (J.3 lands the grid).
- `/operations/boarding-passes` table of 50 most recent passes from `beithady_boarding_passes`.

**Phase J progress:** J.1 ✅ J.2 ✅ J.3-J.10 ⏳

Next sub-phase J.3 (read-only calendar grid with virtualized rows × dates, ~2 commits) is a natural checkpoint — pausing for user to verify J.1 + J.2 deploys before continuing.

## 🟢 Earlier this session — Phase J workflow drafted (commit `f0a34b9`)

User answered all 10 open questions and confirmed all 12 suggested improvements + added a 13th (loyalty pill on Overview tab driving feature gating per tier). Workflow phase sent for review:

**Scope locked:**
- Route: `/emails/beithady/operations/calendar` (new "Operations" launcher card on Beithady main)
- Pricelabs as price source (existing data)
- Payment data: Guesty API first → Stripe fallback (Stripe only for non-Airbnb channels)
- Read-write to Guesty with confirm modal warning agents on every destructive action
- Manual blocks sync back to Guesty
- Free channel logo set
- Realtime updates via Supabase Realtime (overbooking guard)
- Desktop V1, mobile V2
- AI risk score in V1, bulk actions in V1

**10 sub-phases (J.1 → J.10), each independently shippable to limeinc.vercel.app:**

| Sub-phase | Scope |
|---|---|
| J.1 | Migration `0043_beithady_operations.sql` — `beithady_reservation_overrides`, `beithady_calendar_saved_views`, view `beithady_reservation_grid_v`, RPCs for risk + payment recompute, permission row `operations.calendar` |
| J.2 | Operations launcher card + sub-landing (Calendar/Tasks/Boarding cards) |
| J.3 | Read-only calendar grid with virtualized rows × dates |
| J.4 | 10-tab reservation drawer (Overview/Guest/Channel/Payment/Comms/Check-in/Tasks/Upsells/Attribution/Audit) |
| J.5 | AI risk score (1-10) + status flag dots + every-30min cron |
| J.6 | Filters → URL params + saved views + anomaly banner + channel-mix sparkline |
| J.7 | Read-write actions to Guesty + Stripe payment resolver + bulk actions + drag-to-create blocks |
| J.8 | Supabase Realtime subscription + overbooking pre-write guard |
| J.9 | Heatmap overlay toggle + comp-set price triangles + WhatsApp share-boarding-pass + free channel logos |
| J.10 | Find-availability modal + direct-booking flow |

**Pre-flight read-only investigations** (first commit in coding phase, before J.1 migration):
1. Verify pricelabs table schema for prices/min-stay/comp-set
2. Inspect `guesty_reservations.raw` for payment fields
3. Confirm Phase F check-in + ID upload + boarding pass table names
4. Confirm Stripe env var (Phase 5.8 used `STRIPE_SECRET_KEY`)
5. Inspect `guesty_reviews` shape for past-stay quick-look

**Confidence:** ~88% overall (will hit 95% after pre-flight). Highest uncertainty: Guesty write-API surface (J.7), Stripe-Guesty matching heuristic, Phase H/I schema for Attribution tab.

**5 confirmation questions sent to user, blocking coding phase:**
1. OK to ship J.1→J.10 sequentially (each its own Vercel deploy)?
2. OK to run pre-flight read-only investigations as the very first commit?
3. Anything missing in risk register?
4. Reorder anything? (e.g., move realtime/J.8 before J.7?)
5. "Operations" sub-landing with 3 cards — keep, or just put Calendar directly under `/emails/beithady/calendar`?

Estimated ~13 commits across the phase. No code written this turn. Awaiting user answers before queuing pre-flight + J.1.

## 🟢 Earlier this session — Phase J plan accepted (turn before this)

User confirmed all 13 improvements + answered all 10 open questions from the plan-phase. Notable additions:
- **#13 NEW**: Show guest loyalty level on reservation header → drives feature gating (VIP gets X, Gold gets Y, etc.)
- **#12 expanded**: Past-stay quick-look should also surface previous reviews if any
- **Manual blocks (Q5)**: yes, sync back to Guesty
- **Realtime (Q7)**: confirmed — to prevent overbooking
- **Bulk actions (Q10)**: V1 scope

## 🟢 Earlier this session — Phase J initial plan drafted

User asked to plan a Guesty-style multi-calendar reservation module for Beithady. This turn was **plan-only**, per the user's process: "Plan → 95% confidence → Workflow → 95% → Code". No files written.

Reference UX (from screenshots the user shared this turn):
- Multi-row calendar grid: properties × dates with nightly price + min-stay in each cell, reservation bars overlaying date spans, channel-color coding, today indicator.
- Right-slideover reservation drawer: status, channel, guests, listing, check-in/out, nights, rate plan + tabs for guest, payment, communication, etc.

Plan I sent the user (waiting on answers to 10 questions before workflow phase):

**Module:** new "Operations" category card on the Beithady launcher; route `/emails/beithady/operations/calendar`.

**Grid rows = bookable atoms** (children + standalones — uses `fetchMtlParentIds + isBookableAtom` from `src/lib/beithady/mtl.ts`). 74 rows total: BH-73 28, BH-26 22, BH-435 14, BH-OK 10. Cells show price (pricelabs) + min-stay; reservation bars span check-in→check-out, color-coded by channel, click → drawer.

**Drawer = 10 tabs:** Overview / Guest (Phase B link) / Channel & Source / Payment & Finance / Communication (Phase C link + AI Phase E) / Check-in & Boarding (Phase F) / Tasks (Phase F) / Upsells (Phase F) / Attribution (Phases H + I) / Audit log (Phase A).

**Status-flag dot column** in left rail computed from each row's *next* upcoming reservation: red (unpaid + check-in ≤7d), orange (ID missing + ≤3d), yellow (pre-arrival not sent + ≤2d), green (healthy), purple (VIP arriving), gray (no booking in window).

**12 suggested improvements over Guesty** — flagged: AI risk score, heatmap overlay toggle, comp-set price triangles, bulk actions, drag-to-create manual blocks, Supabase Realtime live updates, saved views, anomaly callouts, channel-mix sparkline, WhatsApp share-boarding-pass, past-stay quick-look, mobile-optimized mode.

**Tech architecture sketch:** server component initial fetch + virtualized client grid + drawer via `?reservation=<id>` URL param + server actions for mutations. New tables: 1 (`beithady_reservation_overrides` for manual blocks/cache).

**10 open questions** asked the user, blocking workflow phase: routing placement, pricelabs DB schema, payment data source (Guesty vs Stripe), read-only vs read-write to Guesty, manual block sync semantics, channel logo assets, Realtime vs polling, mobile scope, AI risk score in v1 vs v2, bulk actions in v1 vs v2.

Confidence: ~85% on structure + grid + drawer 1–7; ~70% on payment/attribution/write-back depth pending user's answers.

## 🟢 Earlier this session — MTL polarity unified across Beithady (commit `5256135`)

User confirmed Option B (data-side fix). Three pieces:

**1. Migration `0042_beithady_mtl_backfill.sql`** — Adds `beithady_backfill_mtl_master_id()` RPC that infers `master_listing_id` from the nickname-prefix convention used in BH-73 (`BH73-3BR-SB-1-201` → child of `BH73-3BR-SB-1`). Idempotent — only writes when the value is NULL, so a real Guesty `masterListingId` always wins. One-shot run populated 23 BH-73 children. BH-26, BH-435, BH-OK unchanged (no MTLs).

Result per building:

| | standalones | parents | children |
|---|---|---|---|
| BH-26 | 22 | 0 | 0 |
| BH-73 | 5 | 8 | 23 |
| BH-435 | 14 | 0 | 0 |
| BH-OK | 10 | 0 | 0 |

**2. Sync re-runs the RPC** ([src/lib/run-guesty-sync.ts:233](src/lib/run-guesty-sync.ts:233)) — after every listings upsert. Keeps inference current as Guesty data evolves.

**3. Domain consumers simplified** to one-line SQL filters per the polarity matrix:

| Use | Filter | Polarity |
|---|---|---|
| Gallery / Documents / Ads creative / Pre-arrival | `WHERE master_listing_id IS NULL` | parents + standalones |
| CRM / Communication / Calendar / Daily report / Pipeline | drop parents (use `fetchMtlParentIds`) | children + standalones |

Centralized helpers live in new file [src/lib/beithady/mtl.ts](src/lib/beithady/mtl.ts): `MTL_AGGREGATES_FILTER` constant, `fetchMtlParentIds()`, and `isBookableAtom()`. Polarity matrix documented inline.

Updated this turn:
- [gallery-list.ts](src/lib/beithady/gallery/gallery-list.ts) — removed the `dropMtlChildren` JS helper; gallery uses pure SQL filter. BH-73 → 13 folders.
- [market/calendar.ts](src/lib/beithady/market/calendar.ts) — switched to `fetchMtlParentIds + isBookableAtom`. Drops the `.or('listing_type.is.null,...')` workaround.
- [beithady-daily-report/units.ts](src/lib/beithady-daily-report/units.ts) — `isPhysicalUnit` now consults `master_listing_id` first, fixes a latent bug where BH-73 MTL parents were counted as physical units.

End-to-end sanity check: gallery → BH-26: 22, BH-73: **13**, BH-435: 14, BH-OK: 10. Atoms → BH-26: 22, BH-73: **28**, BH-435: 14, BH-OK: 10.

## 🟢 Earlier this session — Gallery MTL polarity v3 (commit `5abec90`)

User correction: I had the polarity backwards. For the gallery, when an MTL exists, show the **parent** and hide the children. Sub-units share pictures + features with the parent, so a single upload to the MTL covers every child; showing each child as its own folder would force redundant uploads.

Inverted `dropMtlParents` → `dropMtlChildren` in [src/lib/beithady/gallery/gallery-list.ts:127](src/lib/beithady/gallery/gallery-list.ts:127). Same detection mechanism (master_listing_id reverse-ref OR nickname-prefix), opposite kept side.

Counts: BH-26→22 (no MTLs), **BH-73→13** (8 parents + 5 standalones, was 36), BH-435→14, BH-OK→10.

**Open question deferred for next turn:** user asked "use the same rule across all Beithady domain and features whenever fetching from Guesty strictly and writing to database". Gallery is now done. Other Guesty consumers (calendar/CRM/ads/pipeline/communication/daily-report) need per-domain decisions — calendar's occupancy math, for example, wants children (bookable atoms), not parents. Will ask for clarification before scoping a unified policy.

## 🟢 Earlier this turn — Gallery dropped MTL parents (commit `bf53ca1`, superseded)

User pushback after the last commit: BH-73 was still showing 36 folders, not 28. Inspection of the data showed Guesty sync hasn't populated `master_listing_id` yet — the previous turn's filter was effectively a no-op. The MTL hierarchy in BH-73 is encoded entirely in nicknames:

- Parent: `BH73-3BR-SB-1` (an aggregate, not bookable)
- Sub-units: `BH73-3BR-SB-1-001`, `BH73-3BR-SB-1-101`, `BH73-3BR-SB-1-201`, … (`<parent>-NNN`)

Replaced the SQL `master_listing_id IS NULL` filter with a JS post-fetch helper `dropMtlParents()` that drops any row with at least one child, where "child" is detected via either:

- (a) another row's `master_listing_id` points to it (Guesty-structured MTLs — future-proofs)
- (b) another row's nickname starts with `<this.nickname>-` (naming-convention MTLs — today's data)

Both gallery functions in [src/lib/beithady/gallery/gallery-list.ts](src/lib/beithady/gallery/gallery-list.ts) now fetch all matching listings and apply the helper. Counts after fix:

| Building | Before | After | MTL parents dropped |
|---|---|---|---|
| BH-26 | 22 | 22 | 0 |
| BH-73 | 36 | **28** ✓ | 8 |
| BH-435 | 14 | 14 | 0 |
| BH-OK | 10 | 10 | 0 |

The 8 MTL parents dropped from BH-73: `BH73-1BR-C-8`, `BH73-2BR-SB-5`, `BH73-2BR-SB-6`, `BH73-3BR-C-4`, `BH73-3BR-SB-1`, `BH73-3BR-SB-2`, `BH73-3BR-SB-3`, `BH73-ST-C-7`. Page footer text updated to describe the new rule.

## 🟢 Earlier this turn — `master_listing_id IS NULL` filter (commit `f87502f`)

First attempt at the MTL parent/child semantic — switched the SQL filter from `listing_type != 'MTL'` to `master_listing_id IS NULL`. This was the right approach for Guesty-structured MTLs, but turned out to be a no-op against the actual data (sync hasn't populated master_listing_id). Superseded by `bf53ca1` above. Calendar heatmap ([market/calendar.ts:42](src/lib/beithady/market/calendar.ts:42)) was left untouched — it intentionally keeps the opposite semantic for occupancy math.

## 🟢 Earlier this turn — Gallery unit folders fix (commit `4cd4d12`)

User screenshot showed BH-26 building gallery rendering "0 IMPORTED FROM GUESTY" / 0 unit folders even though Guesty has 22 BH-26 listings (BH-26-001…BH-26-501). Investigation: the listings were in `guesty_listings` correctly tagged `building_code = 'BH-26'`, `active = true`, `listing_type = NULL`.

**Root cause:** PostgREST null-comparison gotcha. The Supabase JS query used `.neq('listing_type', 'MTL')`, which translates to SQL `listing_type <> 'MTL'`. In Postgres, `NULL <> 'MTL'` evaluates to **NULL** (not true), so PostgREST drops every row with a null listing_type. Across the 4 active Beithady buildings, 100% of listings have `listing_type = NULL` (BH-26: 22, BH-73: 36, BH-435: 14, BH-OK: 10) → all silently filtered out.

**Fix:** replaced `.neq('listing_type', 'MTL')` with `.or('listing_type.is.null,listing_type.neq.MTL')` in calendar.ts; the gallery-list.ts call sites were superseded by the `master_listing_id` filter above.

Verified post-fix: BH-26 → 22 folders, BH-73 → 36, BH-435 → 14, BH-OK → 10.

## 🟢 Earlier this session — Vercel build hotfix (commit `f478f23`, green on `limeinc.vercel.app`)

The Gallery per-unit-folders commit (`8bd7ca5`) broke production with `Command "npm run build" exited with 1`. Vercel's build logs showed compile ✅ at 30s, then a TypeScript type error during the `tsc` pass:

```
./src/lib/beithady/gallery/gallery-list.ts:215
Type error: Expected 2 arguments, but got 3.
```

Two new call sites in [src/lib/beithady/gallery/gallery-list.ts](src/lib/beithady/gallery/gallery-list.ts) (lines 215 + 257, the per-unit-folder cover and General-Building-Area cover) passed `3600` as a TTL override to `signedUrlFor()`, but the helper's signature only took 2 args.

**Fix:** promoted the TTL to an optional third parameter on `signedUrlFor()` in [src/lib/beithady/gallery/storage.ts:19](src/lib/beithady/gallery/storage.ts:19), default = existing `SIGNED_URL_TTL_SEC = 3600`. Backward-compatible — the 5 other callers (asset-grid, asset-detail-modal, documents/page, ai-label, getSignedUrlForAsset) continue to work unchanged with two args.

Pushed to main. GitHub-triggered build for `f478f23` went green: `dpl_5v3PftwFBByY7pKvtSQFdC9k4XhC` = READY. `limeinc.vercel.app` is unblocked.

---

## 🟢 Beithady v2 — Phases A → I + Gallery follow-up ALL DEPLOYED to canonical production

Order of phases shipped (oldest → newest):
1. **A** (`b4724c9`) — Foundation: 5-card landing, role matrix, brand theme
2. **B** (`667a238` + `d5a526a`) — CRM read-only, 5,753 guests ingested
3. **C.1** (`5532cac`) — Communication v1 read side, 6,694 convs + 1,011 messages mirrored
4. **C.2** (`0cd6982`) — Communication send side: Guesty composer + late-reply digest
5. **C.3** (`2874261`) — WhatsApp Casual two-way: Green-API webhook + voice + file
6. **D** (`ca08b11`) — Gallery + Documents module
7. **E** (`3dbaf64`) — AI auto-reply system
8. **F** (`eda96f2`) — Engagement: loyalty + upsell + pre-arrival + CSAT + boarding pass + tasks
9. **G** (`ba93412`) — Market Intelligence + Calendar Heatmap (closes Phase B residence_country gap)
10. **H** (`1c7edd0`) — Ads module port (VoltAuto + Beithady extensions)
11. **I** (`94a38d4` + `72325b2`) — Lead pipeline + AI review reply + `/api/leads/*` proxy allowance
12. **Gallery follow-up** (`8bd7ca5`) — Per-unit folders imported from Guesty + General Building Area
13. **Hotfix #1** (`f478f23`) — `signedUrlFor` accepts optional ttl (unblocks Vercel build)
14. **Hotfix #2** (`4cd4d12`) — `.neq('listing_type','MTL')` → `.or('listing_type.is.null,listing_type.neq.MTL')` (unit folders now actually render in calendar.ts; gallery-list.ts later superseded)
15. **MTL semantics v1** (`f87502f`) — gallery-list.ts switched to `master_listing_id IS NULL` (turned out to be no-op against current data)
16. **MTL semantics v2** (`bf53ca1`) — `dropMtlParents()` via nickname prefix; BH-73 → 28 (kept children — wrong polarity, superseded)
17. **MTL semantics v3** (`5abec90`) — inverted to `dropMtlChildren()`; BH-73 → 13 folders (gallery only)
18. **MTL backfill + cross-domain unification** (`5256135`) — migration 0042 + sync re-runs RPC + central `mtl.ts` helpers + applied to gallery/calendar/daily-report
19. **Phase J plan drafted** (no commit) — Operations Calendar module spec sent; user confirmed 13 improvements + answered 10 questions
20. **Phase J workflow drafted** (no commit) — 10 sub-phase build plan + pre-flight investigations sent for review
21. **Phase J.1 — Operations Calendar foundation** (`0346db5`) — migration 0043, 277 reservations cached with risk + payment status, permission matrix gains `operations` category
22. **Phase J.2 — Operations launcher card + sub-landing** (`90ae39e`) — 8th tile on Beithady main, sub-landing with anomaly snapshot + 3 op cards, calendar placeholder, boarding-passes table
23. **Phase J.3 — Read-only calendar grid** (`1e6bde0`) — server page + `getCalendarGridData` lib + 5 UI components. Click reservation → `?reservation=<id>` (drawer in J.4)
24. **Phase J.4 — 10-tab reservation drawer** (`40958cc`) — `getReservationDetail` lib + drawer.tsx with all 10 tabs + tier loyalty banner (improvement #13) + past-stay quick-look (improvement #12)
25. **Phase J.5 — Operations recompute cron** (`497b2e3`) — `/api/cron/beithady-operations-recompute` every 30 min, calls RPC defined in J.1
26. **Phase J.6 — Saved views + channel-mix sparkline** (`6f490eb`) — saved-views CRUD with private/shared scope + inline channel mix bar (improvement #10)
27. **Phase J.7a — Payment writes + Stripe resolver** (`0131741`) — markPaid/markUnpaid/recompute actions + payment-resolver.ts + confirm-write-modal + payment-actions buttons in drawer
28. **Phase J.7b — Manual blocks + bulk pre-arrival** (`955126c`) — Guesty calendar writes + manual-block-button on each row + bulk pre-arrival action
29. **Phase J.8 — Realtime + overbooking guard** (`badc893`) — Supabase Realtime subscription to 4 tables + live/connecting/offline pill + pre-write conflict check on manual blocks
30. **Phase J.9 — Heatmap + comp-set + WhatsApp share** (`926eb15`) — density toggle (price/occupancy/ADR/revenue) + ▲▼ comp-set triangles + Copy/WhatsApp boarding-pass share
31. **Phase J.10 — Find availability modal** (`0d495a3`) — server action + form + result grid with Guesty deep-link for booking creation. Phase J COMPLETE
32. **Operations Calendar — "Other" bucket** (`1a3ef97`) — 8 out-of-scope listings (Madinaty, Mall of Mansoura, etc.) now bucketed under synthetic 'OTHER' building
33. **Calendar — MTL-aware price + bedrooms fallback** (`8048ea1`) — BH-73 children now show their parent's pricelabs price/bedrooms/comp-set since pricelabs only tracks the MTL parent
34. **Calendar — Chip filters + Country + hide cancelled** (`3fbc5c3`) — select dropdowns → categorised chip rows with brand colours; new Country chip row (Egypt/UAE); cancelled reservations now hidden by default
35. **Phase K.1 Daily Morning Brief plan drafted** (no commit) — 3 role-specific briefs spec
36. **Phase K.1 — Daily Morning Brief shipped** (`730f1f2`) — migration 0044 + 7 lib files + cron + web archive + recipients-management page + Operations card
37. **Morning Brief — Arabic Ops + Finance payout forecasts** (`906f156`) — Ops brief now in Arabic with RTL HTML; Finance gains 2-day + month-end expected payout forecasts
38. **Morning Brief — Test panel** (`3adaf81`) — Preview / Send test to me / Send NOW to all recipients buttons with spinner + result banners
39. **Phase K.2 — Cancellation risk + re-confirm workflow** (`f889b2c`) — migration 0045 + 0-100 scorer + /operations/cancel-risk page + WhatsApp re-confirm
40. **Phase K.3 — SOP & Knowledge Base** (`19123ce`) — migration 0046 + 16 seed articles across 5 hospitality roles + library page + acknowledgement tracking
41. **SOP/KB — Arabic GR + Maintenance + lang filter** (`68b32f0`) — 6 new Arabic counterpart articles + lang filter + EN↔AR counterpart link
42. **SOP/KB — A4 PDF export** (`61c9063`) — react-pdf renderer + 2 API routes + download buttons
43. **Phase L plan drafted** (no commit) — Budget + Consumables + Welcome Tray + Arabic Housekeeping Checklist; 9 surfaces, 8 DB tables, 7-8 commit scope, 11 open questions awaiting user (this turn)

User has standing authorization for direct pushes to main ("Always Direct Push") — all phases land on `limeinc.vercel.app` automatically via Vercel's GitHub integration.

---

## Branch + commit state

Active worktree this turn: `claude/jovial-wilbur-a3fd6a`. `main` is at `f478f23` (Vercel-green).

Branch is clean except SESSION_HANDOFF.md being updated each turn.

---

## Live URLs

| URL | Phase | Notes |
|---|---|---|
| https://limeinc.vercel.app | Canonical | Auto-deploys from main |
| https://quizzical-satoshi-83e453.vercel.app | Worktree preview | Manual `vercel --prod` deploys |

All Beithady routes auth-gated → 307 redirect to `/login`.

---

## Phase A — Foundation (deployed)

**Migration `0030_beithady_v2_foundation.sql`**:
- `beithady_role` enum (5 roles), `beithady_user_roles`, `beithady_audit_log`, `beithady_settings` tables
- Seeded `ai_confidence_threshold=0.85`, `ai_auto_reply_enabled=true`, `vip_digest_enabled=true`
- App-admins auto-granted Beithady admin role on install

**Library `src/lib/beithady/`**: full permission matrix (5 roles × 7 categories), `requireBeithadyPermission()`, audit log writer/reader, settings KV with typed getters.

**Brand**: navy `#1E2D4A`, blue `#5F7397`, cream `#F5F1E8`, gold `#D4A93A`. Logos at `public/brand/beithady/{wordmark,monogram}.jpg`.

**Pages**: 5-card launcher at `/emails/beithady` + 7 category routes (financial, analytics, crm, communication, settings, gallery, ads). Settings has 9 sub-tabs (3 functional, 4 stubs, 2 redirects).

---

## Phase B — CRM read-only (deployed)

**Migrations 0031 + 0032** — beithady_guests + notes + segments + timeline_cache + sync_runs + SQL initial-ingest proc.

**Initial ingest result**: 5,753 guests · 924 returning · 225 platinum auto-VIP · 66 gold · 113 silver · 520 bronze · 253 future arrivals · $10,439,027 lifetime spend.

**CRM library**: loyalty.ts, guests-sync.ts (with fixed fx_rates schema), guest-list.ts, guest-loader.ts, ai-summary.ts, segments.ts.

**Routes**: list page with filters/widgets/CSV export, 360° profile with 7 sub-components, segments CRUD, loyalty (read-only), market-intel/tasks stubs.

**Cron**: `30 5 * * *` UTC daily JS sync.

**Known gap**: `residence_country` is empty for all guests — Phase G enrichment needed.

---

## Phase C.1 — Communication v1 read side (deployed)

**Migrations 0033 + 0034** — beithady_conversations + beithady_messages + comm_sync_runs + ingest/SLA SQL procs.

**Initial ingest**: 6,694 conversations + 1,011 messages mirrored from guesty_*. SLA computed: 2,133 RED breaches, 4 ORANGE.

**Routes under `/emails/beithady/communication`**: landing → /guesty redirect, guesty/wa-cloud/wa-casual/unified tabs, channel-tabs + sla-pill + sidebar-list + thread-pane components.

**Crons**: `*/5 * * * *` comm-sync + sla-recalc.

---

## Phase C.2 — Communication send side (deployed)

**Library**:
- `src/lib/guesty.ts`: `sendGuestyConversationPost()` wraps `POST /v1/communication/conversations/{id}/posts`. Tier-gated; on failure returns `{ ok:false, status, error }` for fallback.
- `src/lib/beithady/communication/send-guesty.ts`: server-side wrapper. Persists outbound, clears SLA, audits.

**Server actions**: `sendGuestyMessageAction` + `toggleKillSwitchAction`.

**UI**: Real reply composer (textarea + char counter + channel chips + send button + inline error/success/AI-off banners + Reply-in-Guesty fallback). "Create booking" deep-link button in thread header.

**Cron**: `0 6,12 * * *` UTC = 09:00 + 15:00 Cairo `late-reply-digest` — generates digest in `beithady_settings`. Phase F adds delivery.

---

## Phase C.3 — WhatsApp Casual two-way (deployed THIS TURN)

**Migration `0035_beithady_wa_casual.sql`** (applied via Supabase MCP):
- Storage bucket `beithady-wa-media` (public, 20MB cap, audio/image/video/pdf MIME allowlist)
- `beithady_green_webhook_events` table — raw event log keyed on `green_event_id` (idempotency unique index)
- `beithady_ensure_wa_casual_conversation(phone_digits, name)` RPC — lazy conv creation on first inbound, links to existing `beithady_guests` by phone_e164

**Green-API client extensions** (`src/lib/whatsapp/green-api.ts`):
- `sendWhatsAppFile` (sendFileByUrl wrapper for voice + media + files)
- `getGreenInstanceState` (online/offline ping)
- `configureGreenInboundWebhook` (one-shot `setSettings` to register webhook URL on Green-API side)

**Inbound webhook** (`/api/webhooks/green/[slug]/route.ts`):
- Obscure-slug protection (matches credentials `webhook_path_slug`)
- Optional `GREEN_API_ALLOWED_IPS` env-var IP allowlist
- GET = health check; POST = ingest event
- Always 200 to Green-API even on internal failure (no retry storms)

**Ingest helper** (`src/lib/beithady/communication/wa-casual-ingest.ts`):
- Handles incomingMessageReceived (text + extendedText + image + doc + video + audio + voice + location + contact)
- Handles outgoingMessageStatus → updates delivery_status on existing message
- Skips group chats (@g.us) for Phase C.3
- Recomputes SLA so the inbox sidebar lights up immediately

**Send wrapper** (`src/lib/beithady/communication/send-wa-casual.ts`):
- `sendWaCasualMessage` (text + optional fileUrl) → Green-API → persists outbound, clears SLA, audits
- `uploadWaMedia` (ArrayBuffer → Supabase Storage → public URL) for voice + attachments

**Server actions** (added to `actions.ts`):
- `sendWaCasualMessageAction` (text-only form action)
- `sendWaCasualVoiceAction` (multipart upload — voice OR file blob; Storage upload then send via Green-API)

**UI**:
- `voice-recorder.tsx` — in-browser MediaRecorder (ogg/opus → webm/opus → mp4 fallback) with start/stop/preview/discard/send + duration display
- `wa-casual-composer.tsx` — text input + voice recorder + file attach + inline error/sent/AI-off banners
- `wa-casual/page.tsx` — replaces stub with functional split-pane inbox. Shows step-by-step setup card when Green-API not yet configured (with the exact webhook URL to register).
- `thread-pane.tsx` — channel-aware composer routing (Guesty → GuestyComposer, wa_casual → WaCasualComposer, wa_cloud → ComposerStub) + Attachments component renders audio/image/file inline with HTML5 audio + thumbnails.

**Live switch** — to activate inbound + outbound (code is ready):
1. Add Green-API credentials in `/admin/integrations` (already used by boat-rental — same provider)
2. Set `webhook_path_slug` to a random string
3. Set webhook URL in Green-API console to `https://limeinc.vercel.app/api/webhooks/green/<slug>`
4. Toggle provider to enabled

---

## What's deferred

| Slice | Phase | Notes |
|---|---|---|
| WhatsApp Cloud Beit Hady WABA provisioning + Cloud API send | C.4 | Manual setup task; user provisions then adds creds in `/admin/integrations` for `meta_waba` provider |
| AI auto-reply integration | E | Reads `beithady_settings` keys + per-conv ai_kill_switch from Phase A/C.1 |
| Gallery + Documents | D | Depends on Supabase Storage tier |
| Loyalty editable + Upsell + Pre-arrival + CSAT + Boarding pass + late-reply digest delivery | F | Depends on Phase E |
| Market Intelligence + Calendar Heatmap | G | Depends on `residence_country` enrichment |
| Ads module port | H | Depends on Beithady WABA + Meta Marketing approval |
| Lead pipeline kanban + AI multi-language review reply | I | Cleanup phase |

---

## Crons currently active (vercel.json)

```
*/5 * * * *  /api/cron/beithady-comm-sync           # Phase C.1
*/5 * * * *  /api/cron/beithady-sla-recalc          # Phase C.1
0 6,12 * * * /api/cron/beithady-late-reply-digest   # Phase C.2 — 09:00 + 15:00 Cairo
30 5 * * *   /api/cron/beithady-crm-sync            # Phase B — 07:30/08:30 Cairo
```

Plus existing crons untouched: beithady-daily-report, kika-daily-report, daily, odoo, odoo-financials phases, pricelabs, guesty, shopify, boat-rental holds.

---

## Migrations applied (Supabase project `bpjproljatbrbmszwbov`)

```
0030_beithady_v2_foundation.sql        — Phase A
0031_beithady_crm.sql                  — Phase B
0032_beithady_crm_initial_ingest.sql   — Phase B (SQL ingest proc)
0033_beithady_communication.sql        — Phase C.1
0034_beithady_communication_ingest.sql — Phase C.1 (SQL ingest + SLA recompute)
0035_beithady_wa_casual.sql            — Phase C.3 (storage bucket + webhook events + ensure_wa_casual_conversation RPC)
```

All applied + verified with row counts. No pending migrations.

---

## Webhooks live

```
POST /api/webhooks/green/[slug]   — Green-API inbound (Phase C.3)
                                    Slug = credentials.green.webhook_path_slug
                                    Idempotent on green_event_id
                                    Always 200 to avoid retry storms
GET  /api/webhooks/green/[slug]   — Health check (Green-API uses this when configuring)
```

---

## Storage buckets (Supabase)

```
beithady-wa-media   — Phase C.3
                     Public-read, 20MB cap per object
                     MIME allowlist: audio/{webm,ogg,mpeg,mp4,wav}
                                    image/{jpeg,png,webp,gif}
                                    video/{mp4,webm}
                                    application/{pdf,zip}
                     Used for voice notes + WA Casual file attachments
```

---

## Next user prompt options

- **C.4** — Configure Beit Hady WABA in Meta Business Manager, then ship Cloud API send
- **D** — Gallery + Documents module
- **E** — AI auto-reply system (consumes kill-switch + threshold from Phase A settings)
- **F** — Loyalty/Upsell/Pre-arrival/CSAT/Boarding pass + activate the late-reply digest delivery
- **G** — Market Intelligence + Calendar Heatmap (also fixes residence_country gap from Phase B)
- **H** — Ads module port (Voltauto Auto Ads Module)
- **I** — Lead pipeline + AI review reply (cleanup phase)
- Or any slice in any order; pieces stack cleanly.

Each completed phase has been pushed to main + auto-deployed to `limeinc.vercel.app`. To pick up in a new session, continue from any phase letter; the migrations + ingest data are already in production Supabase.
