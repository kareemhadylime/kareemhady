# Phase M — M.0 Pre-flight findings

Read-only investigations run before migration `0048_beithady_inventory.sql` to
confirm column choices + integration points.

## #1 — Currency reality check

`guesty_listings` (active=true) per building:

| Building | Listings | Country | Currency in raw |
|---|---|---|---|
| BH-26 | 22 | Egypt | (null) |
| BH-73 | 36 | Egypt | (null) |
| BH-435 | 14 | Egypt | (null) |
| BH-OK | 9 | Egypt | (null) |
| BH-34 | **0** | — | — |

**Implications:**
- No AED data anywhere in Guesty today; Q9 V1 scope of "EGP + USD only" is correct.
- BH-34 has zero Guesty listings (likely upcoming building per the launcher's
  "91 units across BH-26 · BH-73 · BH-435 · BH-OK · BH-34" subtitle). Per Q15
  user said yes — seed a warehouse for BH-34 anyway. Inventory module isn't
  reservation-coupled, so no FK problem.

## #2 — Phase F task table

Table: `beithady_tasks` exists.

Columns relevant to M.8 issue.ref_task_id linkage:

| Column | Type |
|---|---|
| id | **uuid** |
| reservation_id | text |
| building_code | text |
| type | text |
| status | text |
| assignee_user_id | uuid |
| metadata | jsonb |

**Implication:** M.8 `beithady_inventory_issues.ref_task_id` must be `uuid`
(not text). FK with `ON DELETE SET NULL`.

## #3 — Phase E classifier reusability

File: `src/lib/beithady/ai/classify.ts` — uses Anthropic SDK
`claude-haiku-4-5-20251001`, returns structured JSON. Pattern is reusable for
M.13 WhatsApp inbound reorder parser; same architecture, different prompt +
extraction schema (items + qty + warehouse).

## #4 — beithady_settings PIN convention

Existing keys: `ai_*`, `late_reply_digest_*`, `vip_digest_*`. No `*_BH-XX`
pattern in use yet — greenfield for M.12 mobile PIN keys
`inventory_pin_BH-26` … `inventory_pin_BH-34` + `inventory_pin_OTHER`.

## #5 — fx_rates schema

Columns: `rate_date date · base text · quote text · rate numeric · source
text · fetched_at timestamptz`. Lookups are `WHERE base='USD' AND quote='EGP'
ORDER BY rate_date DESC LIMIT 1` style.

**Implication:** the inventory module records prices in EGP natively but
stores `default_cost_usd` as a denormalised mirror (refreshed nightly by an
fx-snap helper). Avoids per-query joins.

## #6 — Reservation check-in event source

`guesty_reservations.status` values today: `confirmed (3,206) · inquiry
(3,095) · canceled (613) · closed (32) · declined (4) · reserved (1)`.
**No `checked_in` state exists.** `check_in_date` is the planned arrival date,
not an actual arrival timestamp.

**Implication for M.8 auto-issue trigger:** there is no state-transition
signal to listen on. The auto-issue rules engine fires from a daily cron
(`/api/cron/beithady-inventory-auto-issue`) at Cairo ~14:00, scanning
`status='confirmed' AND check_in_date <= today AND not_yet_issued_today`.
Idempotency via unique constraint on `(reservation_id, kind, item_id)` for
transactions of type `reservation_hold`.

## Locked decisions for M.1 migration

- **Currency columns**: `default_cost_egp numeric · default_cost_usd numeric ·
  currency text DEFAULT 'EGP'`. No AED column V1.
- **Warehouse seed**: 6 warehouses Day 1 — BH-26, BH-73, BH-435, BH-OK, BH-34,
  OTHER (each as a "main" warehouse with parent_id NULL).
- **Issues FK to tasks**: `ref_task_id uuid REFERENCES beithady_tasks(id) ON
  DELETE SET NULL`.
- **Auto-issue trigger**: daily cron, not realtime; idempotency unique
  constraint on the transactions ledger.
- **Mobile PIN keys**: `inventory_pin_BH-XX` in `beithady_settings`.
- **fx denormalisation**: `default_cost_usd` stored on items, refreshed
  nightly by helper that reads latest `fx_rates` USD↔EGP.

## Outstanding for next sub-phases (not blockers)

- M.5 vendors `default_currency` defaults to EGP for Egypt vendors (no Egypt
  vendor pays in USD without conversion).
- M.7 GRN posting needs DB advisory lock per item_id during avg_cost recompute
  (risk register #2).
- M.13 WA parser: confirm whether the green-api webhook is filtered by
  building or by sender phone number (drives "which warehouse to draft for").
