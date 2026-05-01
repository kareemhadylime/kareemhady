# Inventory Module Audit — 2026-05-02

Triggered by: "Research Inventory Module deeply and systematically to Debug any inconsistencies."

Methodology: 4 parallel research agents (React state, math/calc, stock integrity, data sync) + a parallel database-level integrity audit via Supabase MCP. All findings cross-checked against actual production data.

**Live data state (2026-05-02):** 73 items (all active, all unique SKUs), 86 issues (all drafts), 0 GRNs, 0 count sessions, 0 negative stock, 0 stock-vs-movement drift, 0 orphan headers, 0 oversold rows, 0 reservations. The DB is currently CLEAN — but most operational flows have not yet been exercised at volume. The bugs below are **latent**: dormant until those flows are used.

Symbols: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · ✅ Already fixed in this turn

---

## ✅ Fixed in this turn (commit 54ba412)

| # | Bug | File | Fix |
|---|-----|------|-----|
| F1 | Edit modal showed stale SKU after server-side AI rename (Dish sponge → CLN-DISH-SPONGE vs current CLN-KITCHEN-SPONGE-3PK) | [item-form-button.tsx:70-86](src/app/beithady/inventory/items/_components/item-form-button.tsx:70) | `openModal()` re-syncs form from current props before opening (commit 4d0287b earlier today) |
| F2 | Same pattern in rule edit modal | [rule-form-button.tsx](src/app/beithady/inventory/rules/_components/rule-form-button.tsx) | `openModal()` added |
| F3 | Same pattern in vendor edit modal | [vendor-form-button.tsx](src/app/beithady/inventory/vendors/_components/vendor-form-button.tsx) | `openModal()` added |
| F4 | Same pattern in warehouse edit modal (had `reset()` but only on close) | [warehouse-form-button.tsx](src/app/beithady/inventory/warehouses/_components/warehouse-form-button.tsx) | `openModal()` calls existing `reset()` |
| F5 | Dish sponge row (`d1fc00f1…`) carried 9 stale Amazon shadow cols from before commit 267afe6 | DB row | Direct UPDATE clearing stale cols (matches post-fix application logic) |

---

## 🔴 CRITICAL — high blast radius, fix soon

### C1. Posting RPCs accept `submitted`/`draft` — TS gate is the only thing stopping double-post
**Files:** [supabase/migrations/0049_…posting_rpcs.sql:69-71](supabase/migrations/0049_beithady_inventory_posting_rpcs.sql:69), [0050:35-37](supabase/migrations/0050_beithady_inventory_issue_posting.sql:35)
- `beithady_inv_post_grn` and `beithady_inv_post_issue` accept `('approved','submitted','draft')` and have **no `posted` exclusion**
- Calling either RPC twice on the same posted GRN re-applies `qty_received` (upsert math is `existing + qty_received`) → stock doubles and `avg_cost_egp` is re-weighted using already-receipted qty
- Service-role / future caller / network retry can double-post
- **Fix direction:** change the RPC guards to `IN ('approved')` only

### C2. `approveCountAction` never sets `status='approved'` AND `postCountAction` accepts `in_progress`
**Files:** [counts/actions.ts:188-220, 222-…](src/app/beithady/inventory/counts/actions.ts:188), [migrations/0051:227-229](supabase/migrations/0051_beithady_inventory_transfers_and_counts.sql:227)
- The "approve" action only writes `approver_user` + `approved_at`; status stays `pending_approval`
- The post RPC accepts `('approved','in_progress')`, so counts can go straight from `in_progress` → posted, **bypassing approval entirely**
- A 50% variance can hit stock without warehouse_manager review
- **Fix direction:** set `status: 'approved'` in `approveCountAction`; tighten RPC to `IN ('approved')` only; pre-flight TS check `if (session.status !== 'approved')`

### C3. `submitIssueAction` always passes `p_sub_total_egp: 0`
**File:** [issue/actions.ts:140-154](src/app/beithady/inventory/issue/actions.ts:140)
- The seeded approval rule `('issue','sub_total_egp','>','1000','warehouse_manager')` is **never triggered** at submit time
- Comment in code admits "Sub-total isn't computed on issues until posting (FIFO picks the cost), so use 0 as a heuristic"
- A 50,000 EGP `per_reservation` issue auto-approves on the cost dimension
- **Fix direction:** estimate sub-total at submit time using `items.avg_cost_egp × line.qty` (same trick `postTransferAction` already uses), or move the gate into `postIssueAction` after RPC computes the real total

### C4. Mobile PIN — no rate-limit, no anti-replay, plaintext storage
**Files:** [mobile-pin.ts:57-82](src/lib/beithady/inventory/mobile-pin.ts:57), [m/actions.ts:79-147](src/app/beithady/inventory/m/actions.ts:79)
- 6-digit PIN, no attempt counter, no IP lockout, no failure logging, no anti-replay
- Brute-forceable in hours over a fast connection
- After login, `postMobileIssueAction` skips `requireBeithadyPermission` ("PIN is the auth")
- Combined with C3 above, mobile-origin issues skip approval based on type only — leaked PIN drains the warehouse
- **Fix direction:** per-IP attempt counter + 5-min lockout after 5 failures, audit-log every login attempt, force always-approve for `welcome_tray`/`damage_writeoff` from mobile origin

### C5. Currency=USD silently treated as EGP across the entire module
**Files:** [item-form-button.tsx:181-185](src/app/beithady/inventory/items/_components/item-form-button.tsx:181), [estimator.ts:222](src/lib/beithady/inventory/estimator.ts:222), [grn-draft-form.tsx:86](src/app/beithady/inventory/grn/_components/grn-draft-form.tsx:86), [dashboard/page.tsx:147](src/app/beithady/inventory/dashboard/page.tsx:147), [excel.ts:217-242](src/lib/beithady/inventory/excel.ts:217)
- Items have `currency: 'EGP' | 'USD'` and a `default_cost_usd` column exists in DB but is **never read or written outside the catalog mapping**
- Edit modal label dynamically says `Cost (USD)` but `update('default_cost_egp', ...)` — typed value lands in EGP column
- Every read site (`estimator`, `dashboard`, `grn`, `rules`) uses `default_cost_egp` regardless of `currency`
- A USD-flagged item entered at `5.00` is multiplied by guest counts as 5 EGP — silent ~50× under-pricing
- Live data: 0 USD items currently, but the bug ships
- **Fix direction:** drop the USD enum entirely (simplest), or convert at write time using a single FX constant before persisting

### C6. AI info card not invalidated when Amazon URL changes
**Files:** [items/actions.ts:439-528](src/app/beithady/inventory/items/actions.ts:439), [ai-item-info.ts:212-223](src/lib/beithady/inventory/ai-item-info.ts:212)
- `setAmazonSourceAction` clears every `amazon_eg_*` shadow col when URL changes — but **does NOT clear `ai_info`, `ai_info_source`, `ai_info_generated_at`**
- The 24h cooldown gate then PREVENTS regen because old `ai_info` exists
- Result: an AI info card describing product A persists on a row whose URL now points at product B; "Source: Amazon EG" link opens the OLD product
- Operator decisions on allergens/ingredients/warnings reference the wrong product
- **Fix direction:** clear `ai_info`, `ai_info_source`, `ai_info_generated_at`, and set `ai_info_status='queued'` in `setAmazonSourceAction` when URL actually changes

### C7. Race condition on concurrent URL changes
**Files:** [items/actions.ts:486-528](src/app/beithady/inventory/items/actions.ts:486), [amazon-eg-sourcer.ts:372-468](src/lib/beithady/inventory/amazon-eg-sourcer.ts:372)
- `persistProbeResult` updates row `.eq('id', itemId)` — no guard like `.eq('amazon_eg_url', expectedUrl)`
- Sequence: operator sets URL=A, sourcer for A starts. Operator sets URL=B, shadow cols cleared, sourcer for B starts. If A's probe finishes LAST, A's data overwrites B
- Mismatch banner then shows wrong "Amazon EG" name; estimator computes unit cost from wrong product
- **Fix direction:** thread `expectedUrl` through `persistProbeResult` and write with `.eq('amazon_eg_url', expectedUrl)`; if 0 rows updated, log + drop the result

### C8. `acceptManySourcesAction` flips `last_status` from `unchecked` → `ok` without an actual probe
**File:** [items/actions.ts:712-738, 640-660](src/app/beithady/inventory/items/actions.ts:712)
- "Reviewed by operator" is conflated with "Amazon probe returned 200 + price"
- Source-cell pill turns emerald-green (looks like live data) on rows where `amazon_eg_price_egp` is still null
- Operator confidence misplaced; downstream estimator may make decisions assuming the listing has been validated
- **Fix direction:** distinguish "URL human-confirmed" (`reviewed_at`) from "Amazon probe successful" (`last_status`); don't flip `unchecked → ok` until a probe actually returns ok

### C9. Cost-source preference is inconsistent across 4 surfaces
**Files:** [items-section-list.tsx:485-494](src/app/beithady/inventory/items/_components/items-section-list.tsx:485), [estimator.ts:222-230](src/lib/beithady/inventory/estimator.ts:222), [rules.ts:109](src/lib/beithady/inventory/rules.ts:109), [dashboard/page.tsx:147](src/app/beithady/inventory/dashboard/page.tsx:147)
- 5 cost fields exist (`amazon_eg_price/pack_size`, `avg_cost_egp`, `last_cost_egp`, `default_cost_egp`, manual price)
- Each surface picks a different priority order:
  - Items list: `livePrice ?? default_cost_egp`
  - Estimator: `amazon → default`
  - Rules cost: `avg_cost_egp || default_cost_egp`
  - Dashboard reorder: `default_cost_egp` ALWAYS (ignores live and avg)
- `last_cost_egp` is never read by any surface
- Same item can show 3+ different unit costs across pages
- **Fix direction:** centralize a `resolveUnitCostEgp(item)` helper with one documented preference order, use from every read site

---

## 🟠 HIGH — works in normal case, breaks under concurrency / failure / unusual data

### H1. Counts panel `drafts` state never re-syncs to refreshed `session.lines`
[count-entry-panel.tsx:34-40](src/app/beithady/inventory/counts/_components/count-entry-panel.tsx:34) — same `useState(propValue)` anti-pattern; after `saveCountedQtyAction` → `router.refresh()`, server-persisted `counted_qty` may not match the local `drafts` for already-saved rows. **Fix:** `useEffect(() => setDrafts(...), [session.id, session.updated_at])`.

### H2. AmazonMismatchBanner `dismissed=true` survives data change
[amazon-mismatch-banner.tsx:45,54](src/app/beithady/inventory/items/_components/amazon-mismatch-banner.tsx:45) — once user clicks Ignore, banner stays hidden even if Amazon name later mutates to a different mismatch. **Fix:** `useEffect(() => setDismissed(false), [amazonName, amazonBrand])`.

### H3. `applyAmazonDetailsAction` overwrites operator-edited values
[items/actions.ts:921-1035](src/app/beithady/inventory/items/actions.ts:921) — patches `name_en`, `name_ar`, `brand`, `pack_volume_value/uom`, `default_cost_egp` whenever Amazon shadow cols are non-null, with no "operator manually edited this since last apply" check (only `description` has a guard). Cron sync + Apply blows away operator-curated names. **Fix:** track `name_en_edited_at` columns; or show side-by-side diff before overwrite.

### H4. `default_cost_egp` silently rebased to live Amazon price on Apply
[items/actions.ts:986-997](src/app/beithady/inventory/items/actions.ts:986) — `default_cost_egp` is described as "the seeded placeholder" but Apply writes `price / packCount` whenever Amazon has a price. Operator manually sets cost=50, Amazon shows 30, Apply silently drops to 30. Reorder valuation in dashboard then under-counts. **Fix:** separate "Apply name & brand" from "Apply cost"; or preserve operator-edited cost when meaningfully different.

### H5. Issue valuation uses `unit_cost_egp` from the issue line, but draft form never sets it
[issue.ts:80](src/lib/beithady/inventory/issue.ts:80), [issue-draft-form.tsx:38-40](src/app/beithady/inventory/issue/_components/issue-draft-form.tsx:38) — drafts compute totals as 0 until the post RPC seeds the cost. Damage-writeoff approval thresholds keyed off `computed_total` compute as 0 → may bypass approval matrices until post.

### H6. Low-stock comparator is `<` not `<=`
[dashboard/page.tsx:39](src/app/beithady/inventory/dashboard/page.tsx:39), [catalog.ts:235](src/lib/beithady/inventory/catalog.ts:235), [items-section-list.tsx:389](src/app/beithady/inventory/items/_components/items-section-list.tsx:389), [stock/page.tsx:147](src/app/beithady/inventory/stock/page.tsx:147) — items exactly at `min_qty` (the most common operational state) never trigger reorder UI. Stockout risk increased. **Fix:** consistent `<=` everywhere.

### H7. `qty_reserved` never subtracted from "available"
[catalog.ts:170-175](src/lib/beithady/inventory/catalog.ts:170), [stock/page.tsx:46-51](src/app/beithady/inventory/stock/page.tsx:46) — `total_on_hand` sums `qty_on_hand` only. Items reserved by holds inflate availability. Reorder rules use the inflated number. (Currently 0 reservation rows in DB so latent.)

### H8. Draft-creation is NOT atomic across header+lines
[grn/actions.ts:50-91](src/app/beithady/inventory/grn/actions.ts:50), [issue/actions.ts:46-85](src/app/beithady/inventory/issue/actions.ts:46), [m/actions.ts:97-128](src/app/beithady/inventory/m/actions.ts:97), [wa-reorder-parser.ts:207-239](src/lib/beithady/inventory/wa-reorder-parser.ts:207), [counts/actions.ts:53-79](src/app/beithady/inventory/counts/actions.ts:53) — header insert + lines insert is two separate awaits. Best-effort delete on lines failure can itself fail. Process crash mid-flight leaves orphan header. **Fix:** wrap in PG function; or daily sweep of `created_at < now() - 1h AND no lines`.

### H9. `saveCountedQtyAction` per-line update has no transaction
[counts/actions.ts:111-129](src/app/beithady/inventory/counts/actions.ts:111) — for-loop updates per line; partial failures silently swallowed; missing lines treated as "not counted" → variances under-recorded. **Fix:** bulk upsert; surface per-line failures.

### H10. Transfer approval gate uses `items.avg_cost_egp` (estimate) but RPC uses source-row cost (actual)
[transfers/actions.ts:46-63](src/app/beithady/inventory/transfers/actions.ts:46) vs [migrations/0051:91-95](supabase/migrations/0051_beithady_inventory_transfers_and_counts.sql:91) — gate decision differs from execution cost. Transfer estimated at 4900 EGP (under threshold) may execute at 6000 EGP (over). **Fix:** move gate INTO RPC after costs are known, or fail RPC if `actual > 1.2 × estimated`.

### H11. `forkSkuFromAmazonAction` clears Amazon shadow cols on source but NOT `ai_info`
[items/actions.ts:1276-1295](src/app/beithady/inventory/items/actions.ts:1276) — same root cause as C6, scoped to fork operation.

### H12. `setManualAmazonPriceAction` doesn't clear name shadow cols
[items/actions.ts:842-909](src/app/beithady/inventory/items/actions.ts:842) — operator overrides via manual entry; stale `amazon_eg_product_name_en/ar`, `amazon_eg_brand`, `amazon_eg_pack_volume_*`, `amazon_eg_image_url`, `amazon_eg_rating/review_count` from prior fetch persist. Mismatch banner reads them and falsely surfaces "differs" against the manually-typed name.

### H13. `unchecked → ok` status flip on Accept (see C8) — also affects single-row `acceptAmazonSourceAction`
[items/actions.ts:640-660](src/app/beithady/inventory/items/actions.ts:640) — same pattern as C8.

### H14. WhatsApp parser fuzzy match always reports `'exact'`
[wa-reorder-parser.ts:130-140](src/lib/beithady/inventory/wa-reorder-parser.ts:130) — ternary can never produce `'fuzzy'` (logic bug: `matched.sku === r.matched_sku` is always true since `matched` was looked up by `r.matched_sku`). Manager loses signal that fuzzy matches need extra review.

### H15. `__bulk__` batch sentinel allows batch-tracked items to lose batch traceability
[grn/actions.ts:79](src/app/beithady/inventory/grn/actions.ts:79) — `batch_no || '__bulk__'` defaults regardless of `items.batch_tracked`. Batch-tracked F&B receipt with no batch_no entered silently merges into bulk pool, losing FIFO expiry. **Fix:** look up `items.batch_tracked` per line; reject if tracked + no batch_no.

### H16. `avg_cost_egp` recompute returns NULL when total qty ≤ 0
[migrations/0049:22-39](supabase/migrations/0049_beithady_inventory_posting_rpcs.sql:22) — after a full warehouse drain via Issue, `items.avg_cost_egp` stays at the OLD value while stock is zero. Items page shows wrong cost for stocked-out items. **Fix:** when total qty ≤ 0, set to `last_cost_egp` rather than leave stale.

---

## 🟡 MEDIUM — robustness / clarity / future-proofing

### M1. SyncPricesButton `setTimeout` can fire after unmount
[sync-prices-button.tsx:30](src/app/beithady/inventory/items/_components/sync-prices-button.tsx:30) — no cleanup. **Fix:** track in ref, clear in effect cleanup.

### M2. ItemsSectionList poller dep array rebuilds interval every refresh
[items-section-list.tsx:47-65](src/app/beithady/inventory/items/_components/items-section-list.tsx:47) — `sections` is a new reference every render. Not visible at 4s cadence but worth memoizing.

### M3. AmazonMismatchBanner double-startTransition race
[amazon-mismatch-banner.tsx:73-86](src/app/beithady/inventory/items/_components/amazon-mismatch-banner.tsx:73) — Apply button only checks `skuModal.pending`, not the global `useTransition` `pending`. Could fire twice on rapid double-click.

### M4. `pack_size` fallback differs slightly between items list and estimator
Items list defaults `null/0` → 1; estimator uses raw price for null. Currently equivalent but divergent code paths invite drift.

### M5. `default_cost_egp` represents two different concepts after Apply
Originally "cost per UoM unit"; Apply writes `price/packCount`. Ambiguous when UoM is `pack` vs items.

### M6. `parseFloat || 0` swallows invalid input across all forms
Cost / qty / loss-factor inputs across item, GRN, dashboard widgets.

### M7. Tooltip claims `price/pack_size` math but actually shows raw price when pack_size is null
[rules/estimator/[configId]/page.tsx:312](src/app/beithady/inventory/rules/estimator/[configId]/page.tsx:312)

### M8. `reorder_qty` only used in one widget; estimator and rules ignore it
Setting it has no operational effect outside the dashboard reorder table.

### M9. WhatsApp parser writes `status='submitted'` directly with no sender allowlist
[wa-reorder-parser.ts:209-220](src/lib/beithady/inventory/wa-reorder-parser.ts:209) — combined with C3, one approval click away from posting.

### M10. `computeAutoIssueLines` and estimator both apply `loss_factor_pct` — current paths each apply once, but a future cross-call would double-apply
[issue.ts:182-189](src/lib/beithady/inventory/issue.ts:182), [estimator.ts:218](src/lib/beithady/inventory/estimator.ts:218) — encapsulate in shared helper.

### M11. `transactions` table immutable by convention only — no DB trigger
[migrations/0048b:274-277](supabase/migrations/0048b_…) — service role can rewrite history. **Fix:** `BEFORE UPDATE OR DELETE` trigger gated by setting.

### M12. `createCountSessionAction` snapshot of `expected_qty` races concurrent posts
[counts/actions.ts:30-66](src/app/beithady/inventory/counts/actions.ts:30) — read-then-insert without single-statement; in-flight movement between reads desyncs `expected_qty`.

### M13. Reviewer attribution breaks if `app_users` row is hard-deleted
[catalog.ts:143](src/lib/beithady/inventory/catalog.ts:143)

### M14. `parse_error` writes `last_status='unchecked'` masking real errors
[amazon-eg-sourcer.ts:382-389](src/lib/beithady/inventory/amazon-eg-sourcer.ts:382) — operator can't distinguish "never probed" from "Claude failed to parse the page".

### M15. `price_changed` status sticky / oscillation risk
Manual fix sets `'ok'`, next cron compares against manual price, can flag `price_changed` and oscillate.

### M16. `photo_url` items column unused
[catalog.ts:52](src/lib/beithady/inventory/catalog.ts:52) — initialized in form but no input field, no rendering. Dead schema. **Fix:** wire upload, or remove and use `amazon_eg_image_url`.

### M17. No CHECK constraint on `currency` enum
DB allows any string; code assumes 'EGP'/'USD'.

### M18. No CHECK constraint on `min_qty >= 0`
Application allows negative through HTML `min` only (bypassable).

### M19. `created_by_user` is `text` not FK to `app_users`
Could be any string. Audit attribution fragile.

---

## Summary table

| Severity | Count | Owner action |
|---------:|:-----:|--------------|
| ✅ Fixed | 5 | (shipped) |
| 🔴 CRITICAL | 9 | Triage + schedule |
| 🟠 HIGH | 16 | Triage second wave |
| 🟡 MEDIUM | 19 | Backlog |
| **Total findings** | **49** | |

## Recommended next-fix order (smallest blast radius first)

1. **C2** — `approveCountAction status='approved'` (one-line fix + RPC tighten)
2. **C9** — `resolveUnitCostEgp` helper + replace 4 call sites (mechanical, low risk)
3. **C8/H13** — distinguish "reviewed by human" from "probe ok" (one column rename + 4 call-site updates)
4. **H6** — `<` → `<=` for low-stock (4 sites, mechanical)
5. **C6** — clear `ai_info` on URL change (3 lines added to existing reset block)
6. **C7** — race-condition guard on `persistProbeResult` (thread expectedUrl through one function)
7. **C3** — estimate `sub_total_egp` at submit (mirror existing transfer pattern)
8. **C1** — RPC `IN ('approved')` only (3 SQL lines in a new migration)
9. **C5** — drop USD currency option entirely (recommended over FX conversion since 0 USD items in DB today)
10. **C4** — mobile PIN rate-limit (most involved; needs new schema + auth refactor)

Items H/M can be fixed opportunistically as the related code is touched.
