# Phase M.15 — Pre-flight findings (2026-04-28)

## Scope reminder
Phase M.15 = Housekeeping Estimator + Amazon EG Auto-Sourcing. Adds per-unit-configuration estimator that scales with bedrooms/bathrooms/guests, and an AI-driven Amazon EG sourcing flow for items.

## Read-only audits (this commit is doc-only)

### Finding 1 — Bedrooms coverage (72%)

`pricelabs_listings.bedrooms` is the canonical source. Across 81 active BH-26/73/435/OK listings:

| Building | Total active | Bedrooms known | Distribution |
|---|---|---|---|
| BH-26  | 22 | 22 (100%) | 4 studio · 3×1BR · 7×2BR · 8×3BR |
| BH-73  | 36 | 13 (36%) | 1 studio · 2×1BR · 3×2BR · 6×3BR · 1×4BR · **23 unknown** |
| BH-435 | 14 | 14 (100%) | 10×2BR · 3×3BR · 1×4BR |
| BH-OK  | 9  | 9 (100%) | 3×2BR · 6×3BR |
| **Total** | **81** | **58 (72%)** | **23 missing — all in BH-73 (likely MTL parents w/o pricelabs row)** |

**Action:** the 23 BH-73 unknowns are the MTL parents whose children are the actual bookable atoms. Phase J's `mtl.ts` already handles this — child listings get bedrooms via parent fallback (see `bedroomsFor()` in `calendar-data.ts:174`). M.15.1 listing-config-sync cron must use the same fallback resolver.

### Finding 2 — Bathrooms coverage (0%) 🔴

**Critical:** neither `pricelabs_listings` nor `guesty_listings.raw` exposes bathroom counts.
- `pricelabs_listings` columns: id, name, pms, bedrooms, push_enabled, is_hidden, group_name, subgroup, tags, building_code, city_name, country, latitude, longitude, cleaning_fees, last_synced_at, created_at — **no bathrooms column**
- `guesty_listings.raw` — checked keys `bathroom` / `numberOfBathrooms` / scanned for the word "bathroom" anywhere in jsonb. **None present** in BH-26 sample.

**Action:** bathrooms must come from manual entry. M.15.1 plan:
- `beithady_inventory_listing_unit_config` table seeds with `detected_bathrooms = NULL`
- Sync cron uses bedroom-only matching (default `bathrooms = bedrooms` heuristic — admin refines via UI)
- UI flag: any listing where `bathrooms IS NULL OR source != 'manual'` shows a "needs configuration" badge until admin confirms

### Finding 3 — `_consumption_rules` is empty (0 rows) ✅

```
SELECT scope, COUNT(*) FROM beithady_inventory_consumption_rules GROUP BY scope;
→ []
```

No collision risk. Migration 0052b can extend `scope` enum + add new `formula_kind` values without touching existing data.

### Finding 4 — `amazon_eg_url` already exists on `_items` ✅

`beithady_inventory_items.amazon_eg_url text` was added in M.4 (items catalog migration). M.15 needs 7 more amazon_eg_* columns:
- `amazon_eg_price_egp`, `amazon_eg_rating`, `amazon_eg_review_count`, `amazon_eg_is_bulk_pack`, `amazon_eg_pack_size`, `amazon_eg_image_url`, `amazon_eg_in_stock`, `amazon_eg_last_checked_at`, `amazon_eg_last_status`, `amazon_eg_alternatives`

Migration 0052c uses `ADD COLUMN IF NOT EXISTS` to avoid colliding with the existing `amazon_eg_url`.

5 existing call sites use `amazon_eg_url` already (M.4 items create/import flows) — no behaviour change needed; new columns are additive.

### Finding 5 — Vercel cron count: 33 → 36 ✅

Current `vercel.json` has 33 paths defined. M.15.5 adds 3 new:
- `/api/cron/beithady-amazon-refresh` — `0 4 * * 1` UTC weekly
- `/api/cron/beithady-listing-config-sync` — `0 3 * * *` UTC daily
- `/api/cron/beithady-reorder-alerts` — `30 5 * * *` UTC daily

Vercel Pro plan (current) allows up to 40 cron jobs. Post-M.15 = 36 → 4 headroom remaining.

### Finding 6 — MTL polarity reminder

The unit_config auto-assignment must run on **bookable atoms only** (children + standalones, not MTL parents). Phase J `fetchMtlParentIds()` + `isBookableAtom()` already provide this filter. Listing-config-sync cron must reuse those helpers (existing in `src/lib/beithady/mtl.ts`).

## Architecture confirmations from findings

1. **Migration 0052a** — unit_configurations + listing_unit_config tables ✅ no collisions
2. **Migration 0052b** — consumption_rules scope/formula extension ✅ table empty, no risk
3. **Migration 0052c** — items.amazon_eg_* columns ✅ idempotent ADD IF NOT EXISTS
4. **Migration 0052d** — seed unit_configs + 30 consumables + default rules ✅ greenfield seed

## Risk register update

| # | Risk (from workflow) | Pre-flight resolution |
|---|---|---|
| 1 | Amazon EG anti-bot blocks AI scraper | Probe deferred to M.15.4 commit (need actual web_search call to test) |
| 2 | Anthropic web_search Egypt coverage | Probe deferred to M.15.4 commit |
| 6 | **Bathroom count missing** | **Confirmed: 0% coverage, all manual entry. Bedrooms-only auto-assign + manual bathroom refinement** |
| n/a | MTL parent listings polluting unit_config sync | Use existing `isBookableAtom()` from `mtl.ts` |

## Sub-phase commit sequence (final)

| Sub | Commit | Status |
|---|---|---|
| M.15.0 | doc-only — this file | **THIS COMMIT** |
| M.15.1 | 4 migrations + estimator-shared.ts | next |
| M.15.2 | Settings card + Inventory tab + estimator landing page | after |
| M.15.3 | Config detail editor + line CRUD + listing override panel | after |
| M.15.4 | AI Amazon EG sourcer (web_search probe lives here) | after |
| M.15.5 | Forecast view + 3 cron handlers + checklist hook | after |

## Confidence
**95%** — pre-flight findings turned 2 plan-phase question marks into firm answers (bedrooms via pricelabs + MTL fallback; bathrooms manual). Anthropic web_search reliability still unverified — that's the only remaining unknown, scoped to M.15.4 commit where it's testable.

Ready to ship M.15.1 migration.
