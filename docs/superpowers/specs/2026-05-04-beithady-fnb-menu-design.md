# Beithady — F&B / In-Room Dining Module — Design Spec

**Date:** 2026-05-04
**Status:** Brainstorming complete · all 18 design questions and 4
post-review open questions resolved · awaiting final user approval
to invoke writing-plans skill
**Owner:** kareem.hady@gmail.com
**Phase code:** Phase F (F&B v1)

## 0. Summary in one paragraph

Add a 10th tile (`F&B`) to the Beithady cockpit covering **in-room
dining for Egypt buildings only** (BH-26 / BH-73 / BH-435 / BH-OK /
BH-34; BH-DXB explicitly excluded). Replaces the current PDF +
"Dial 0" workflow with a mobile-first guest menu at `/dine/[token]`
authenticated via the existing **boarding-pass token** plus
in-apartment QR codes encoding the same token. Guests browse a
**4-language menu (EN / AR / RU / FR)** with photos, build a cart
with **add-on modifiers + per-line notes**, pick a delivery window,
and submit. Orders are recorded in our DB and **settled at checkout
via the existing front-desk flow** (Guesty's API does not support
arbitrary line-item folio charges, so we mirror manually — a daily
per-reservation F&B totals report surfaces in the Operations module
reservation drawer for the front-desk team to add at checkout). No
online payment, no cash on delivery in v1. Orders land in a
**kanban-style operator queue** with WhatsApp Cloud push to a
per-building configured kitchen recipient. **At `delivered`, the PDF
receipt auto-sends to the guest via WhatsApp** (Cloud preferred,
Casual fallback; Guesty conversation thread as last fallback if no
WA number). Status changes push back to the guest in their selected
language via the same channel. Photos render via direct-to-Supabase
upload + the existing gallery transform. Translations get an
Anthropic-backed **AI-translate helper** with a manual approve gate.
A new `fnb_manager` role is added; the existing 8 Beithady roles get
permissions on the new `fnb` category.

## 1. Decision log (8 clarifying questions)

| # | Question | Decision |
|---|---|---|
| 1 | Scope | **B** — Catalog + digital ordering, no online payment |
| 2 | Guest auth | **A+B** — Boarding-pass token primary, in-apartment QR codes encode the same token |
| 3 | Order routing | **C** — Dashboard kanban + WA Cloud push to per-building recipient(s) |
| 4 | Billing model | **A → adjusted** — Guesty's API does NOT support arbitrary line-item folio charges (confirmed during spec review). Settlement happens manually at checkout via the existing front-desk flow; v1 surfaces a per-reservation F&B totals report in the Operations reservation drawer. USD only · breakdown display only · no tip · no comps in v1 · digital PDF receipt auto-sent via WhatsApp at `delivered` |
| 5 | Languages | **C** — Full quad-language EN + AR + RU + FR from v1; AI-translate helper for admin |
| 6 | Per-building variation | **A** — Single global menu · F&B Egypt-only · per-building stock-out flag · global hours |
| 7 | Inventory link | **C** — Schema-ready hook only; optional `cost_usd`; no recipe UI in v1; no COGS to Odoo |
| 8 | Roles | **C** — Add `fnb` as 10th BeithadyCategory + new `fnb_manager` role; full audit-log coverage |

## 2. Out of scope (explicit v2 / Phase F&B-2 list)

These were considered and explicitly deferred:

- Stripe online payment
- Cash on delivery (in-room cash settlement)
- Per-building menu variation (different items per building)
- Per-building category structure
- Recipe building UI / inventory deduction / COGS posting to Odoo
- Comps / discounts / VIP overrides / loyalty redemptions
- Tip line item (covered by 12% service charge)
- Multi-currency (EGP, AED) — USD only in v1
- Walk-in / non-resident anonymous QR flow
- KDS (kitchen display split from runner display)
- Email receipt (PDF + WhatsApp / Guesty conversation push only)
- Guest order history beyond current stay
- Translating the operator dashboard (English-only)
- Daily F&B revenue posting to Odoo (analytic accounts)

## 3. Module shell

### 3.1 Tile

New 10th tile in the Beithady launcher (`src/app/beithady/page.tsx`),
slotted between **Inventory** and **Settings**:

```ts
fnb: {
  href: '/beithady/fnb',
  title: 'F&B',
  description: 'In-room dining menu · Order queue · 4-language guest menu (EN/AR/RU/FR). Egypt buildings only.',
  icon: UtensilsCrossed,        // lucide-react
  accent: 'rose',               // distinct from existing accents
  badge: { label: 'Phase F', tone: 'gold' },
}
```

Final tile order on the Beithady home:

```
financial → analytics → crm → communication → operations →
inventory → fnb → settings → gallery → ads
```

### 3.2 Tabs inside `/beithady/fnb`

5 tabs, mirroring the layout pattern used by Operations / Inventory:

| Tab | Route | Primary user | Purpose |
|---|---|---|---|
| **Orders** *(default)* | `/beithady/fnb` | ops, GR, fnb_manager | Live order queue with status pipeline |
| **Menu** | `/beithady/fnb/menu` | fnb_manager, manager, admin | Item CRUD, photos, translations, prices, availability |
| **Analytics** | `/beithady/fnb/analytics` | manager, ops, BA, finance | Top-sellers, revenue, attach rate, prep-time SLA |
| **Settings** | `/beithady/fnb/settings` | fnb_manager, manager, admin | Per-building enable/disable, kitchen WA recipients, hours, message templates |
| **Audit Log** | `/beithady/fnb/audit` | admin, manager | Item edits + price changes + status changes |

Pages use the existing `BeithadyShell` + `BeithadyHeader` pattern.

## 4. Guest experience — `/dine/[token]`

Mobile-first. Token comes from the boarding-pass system (existing) or
in-apartment QR codes printed at check-in (new — same token encoded
in a `qr` column on the boarding pass row).

### 4.1 Entry points

- **Boarding-pass page** gets a new prominent **"Order Food →"**
  button (only for Egypt buildings; hidden for BH-DXB and any building
  where `fnb_buildings.enabled = false`).
- **In-apartment QR sticker** encodes
  `https://limeinc.vercel.app/dine/<same-token>`.
- **WhatsApp pre-arrival message** can include the menu link as a
  CTA (configurable in F&B Settings → Notifications).

### 4.2 Token validation

Server-side checks before rendering:

1. Token exists in `boarding_passes` table.
2. Linked reservation status is `inquiry / reserved / confirmed /
   checked_in` — **not** `checked_out` or `cancelled`.
3. Reservation building is in the F&B-enabled list (`fnb_buildings.enabled = true`).
4. **Reservation status = `checked_in`** (hard requirement; no
   pre-arrival ordering window in v1; pre-arrival welcome groceries
   = v2).

If any check fails → render service-unavailable page with phone
fallback ("Dial 0 from your living room") and the building's WA
contact. Pre-arrival guests see a "Available once you check in"
message instead of an error.

### 4.3 Layout (top-to-bottom on mobile)

```
┌─────────────────────────────────┐
│  ↩ BEIT HADY · IN-ROOM DINING   │  brand strip + BH wordmark
│  🌐 EN | AR | RU | FR           │  language switcher (auto-detected)
├─────────────────────────────────┤
│  [Hero photo banner — palm     │
│   silhouette + "Welcome,        │
│   {{guest_first_name}}"]        │
├─────────────────────────────────┤
│  [Sticky category tabs]         │
│  Breakfast · Sandwiches ·       │
│  Salads & Kids                  │
├─────────────────────────────────┤
│  [Card] All-Day Breakfast       │  tap card → bottom sheet
│  [Photo] Two eggs your way…     │
│  $7  [+]                        │
├─────────────────────────────────┤
│  [Card] Smoked Salmon Toast     │
│  ...                            │
└─────────────────────────────────┘
       ┌──────────────────────┐
       │ 🛒 2 items · $26.00  │  sticky cart bar (floating bottom)
       │      View order →    │
       └──────────────────────┘
```

### 4.4 Item bottom sheet (tap a card)

- Larger photo (1080×1080)
- Full description (in selected language)
- **Modifier add-ons** as toggles (e.g., "Replace Ful w/ Sausage Ful
  +$3", "Add Grilled Chicken +$5") — each modifier stored separately
- Quantity stepper (1–10, default 1)
- Notes field (free text, max 200 chars, e.g., "no onions")
- Outside-of-hours: shows `Available 8:00 AM` + `Add to order`
  button is disabled
- Out-of-stock at this building: shows `Sold out today` + button
  disabled

### 4.5 Cart drawer

- Line items with edit / remove
- Subtotal · VAT (14% incl) display-only · Service (12% incl)
  display-only · **Total**
  - Display formula:
    `vat_incl = round(total * (14/126), 2)` (14 ÷ (100+14+12))
    `service_incl = round(total * (12/126), 2)`
    `subtotal = total - vat_incl - service_incl`
  - These are presentation-only — the totals already include both.
- **Delivery time picker** — ASAP / +30 min / +1 hour. Capped at
  +2 hours from now.
- "Charge to your room — settled at checkout" notice.
- **Submit Order** button (full-width, brand color).

### 4.6 Order confirmation page

- Big "Order received! 🍳" header
- Status badge live-updating via SWR/poll (5-sec interval): `submitted
  → preparing → ready → delivered`
- Estimated delivery time (auto-computed: SLA per building, default 30
  min — configurable in F&B Settings)
- **"Need to cancel?" link** — visible only while status =
  `submitted` and within the configured cancellation grace period
  (**default 120 sec / 2 min**, max 5 min, set in F&B Settings)
- Receipt downloadable as PDF (auto-sent via WhatsApp at `delivered`
  — see §13.4) + "Resend to my WhatsApp" button
- "Order again" button → returns to menu

### 4.7 Status push to guest

Status changes (`preparing → ready → delivered`) push a notification
to the guest in their selected language. Channel order:

1. **WhatsApp Cloud** if guest has a WA number on the reservation
   (preferred — better delivery rates, transactional templates).
2. **WA Casual (Green-API)** fallback if Cloud not configured for
   that building or template not approved.
3. **Guesty conversation thread** as last fallback (matches whatever
   channel the guest used to book — Airbnb/Booking inbox, etc.).

At `delivered`, the same WA channel additionally receives the **PDF
receipt as an attachment** (see §13.4). Templates configurable per
status in F&B Settings → Notifications.

### 4.8 i18n details

- Auto-detect from Guesty reservation `guest.language` field;
  fallback to `Accept-Language`; final fallback EN.
- RTL layout for AR (Tailwind v4 `dir="rtl"` toggle on a wrapper).
- **Numerals stay Latin** in all languages (Egypt convention; not
  Eastern Arabic numerals).
- All four language strings are required for each user-visible field;
  partial translations show `[Translation pending]` in that language
  until completed.

### 4.9 Token revocation & expiry

- Auto-revokes when reservation status becomes `checked_out` in
  Guesty (existing webhook in `src/app/api/webhooks/guesty/`).
- Manual revocation possible from F&B Settings (admin only).
- Token grace period: still valid for 4 hours after `checked_out` for
  late receipt downloads (read-only — no new orders accepted).

## 5. Operator dashboard — `/beithady/fnb` (Orders tab)

### 5.1 Layout

```
┌────────────────────────────────────────────────────────────┐
│  F&B / Orders                                              │
│  [All buildings ▾]  [Today ▾]  [Status: Live ▾]  [+ New]   │
├────────────────────────────────────────────────────────────┤
│  Submitted (3)   Preparing (2)   Ready (1)   Delivered (5) │
│  ─────────────   ─────────────   ────────    ────────────  │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐ ┌─────────┐   │
│  │BH-73    │     │BH-26    │     │BH-435   │ │...      │   │
│  │ #4231   │     │ #4229   │     │ #4225   │ │         │   │
│  │ Unit 503│     │ Unit 12 │     │ Unit 4B │ │         │   │
│  │ $48.00  │     │ $26.00  │     │ $13.00  │ │         │   │
│  │ 2 items │     │ 3 items │     │ 1 item  │ │         │   │
│  │ 14:32   │     │ 14:18   │     │ 14:05   │ │         │   │
│  └─────────┘     └─────────┘     └─────────┘ └─────────┘   │
└────────────────────────────────────────────────────────────┘
```

Kanban using existing `@dnd-kit/*` library (already in stack for the
calendar + tasks views).

### 5.2 Status pipeline

`submitted → preparing → ready → delivered → closed`

- `submitted` — guest just placed the order; cancellation window open
- `preparing` — kitchen acknowledged
- `ready` — runner can pick up
- `delivered` — runner confirmed delivery → **PDF receipt auto-sent
  to guest via WhatsApp** (see §13.4); order is logged for checkout
  settlement (no Guesty API charge — see §13.1)
- `closed` — auto-set 24h after `delivered` OR at reservation
  checkout, whichever comes first; `closed` is the marker the
  front-desk uses to confirm the F&B total has been added to the
  Guesty folio at checkout (manual mirror)

Plus terminal state `cancelled` (with reason).

### 5.3 Card click → side panel

- Full item list + modifiers + per-line notes
- Guest name, room, building, language
- Phone / WhatsApp shortcut buttons (one-tap to message the guest in
  Guesty conversation thread)
- Status timeline with timestamps + actor (who changed it)
- "Mark item out of stock at this building" quick action per item
- Cancel order button (admin / manager / fnb_manager only, with
  reason field)
- Receipt PDF preview / re-send

### 5.4 Filters

- Building (multi-select; default = all enabled buildings)
- Date range (default = today)
- Status (default = "live" = submitted | preparing | ready)
- Quick filter: "My building" if user has a default building set

### 5.5 WhatsApp push behaviour

- On `submitted`: WA Cloud message to the building's configured
  kitchen recipient(s) — comma-separated list, supports multiple.
- Default template (configurable in F&B Settings → Notifications):

```
🍽️ New F&B order #{{order_id}}
{{building_code}} · Unit {{unit}} · {{guest_name}}
─────
{{items_summary}}
─────
Total ${{total}} · Delivery {{delivery_time}}
Open: {{dashboard_link}}
```

- WA Casual fallback if Cloud is unavailable / not configured for
  that building.
- Outbound respects the existing kill switches (`outbound` admin-only
  setting).

### 5.6 Stale-order cron alert

- New cron `cron-fnb-stale-orders` registered in `vercel.json`:
  `*/5 * * * *` (every 5 min)
- Checks: any order in `submitted` > 10 min OR `preparing` > 45 min
  → push amber alert to dashboard (visible badge on the order card)
  + WA reminder to recipient.
- Skipped between Cairo 23:00 and 07:00 (no overnight nagging).

## 6. Menu admin — `/beithady/fnb/menu`

### 6.1 Two-pane layout

**Left pane — category tree:**

```
Breakfast (4 items)  ⋮
  └ All-Day Breakfast
  └ Smoked Salmon Toast
  └ Cheese & Olives Croissant
  └ Oriental Breakfast
Sandwiches (3 items)  ⋮
  └ Sausage Sandwich
  └ Baguette Sub
  └ Beit Hady Burger
Salads & Kids (3 items)  ⋮
  └ Caesar Salad
  └ Greek Salad
  └ Kids Meal
[+ Add category]
```

Drag-drop to reorder items within a category; drag-drop to reorder
categories.

**Right pane — item editor** (when selected):

5 inner tabs:

1. **Basics** — name (4 langs), description (4 langs), category, price
   USD, optional `cost_usd`, optional sort_order override, enabled
   toggle
2. **Photo** — drag-drop upload (direct-to-Supabase signed URL, max 5
   MB, MIME validated server-side, auto-resized to 1080×1080 + thumb
   400×400 via the existing gallery transform pattern in
   `src/lib/beithady/gallery/`)
3. **Modifiers** — add-on options (e.g., "Replace Ful w/ Sausage Ful
   +$3"). Each modifier has its own 4-lang name + USD price delta +
   sort order + enabled toggle.
4. **Availability** — operating-hour window (default per category;
   item can override), per-building stock-out toggles for BH-26 / 73 /
   435 / OK / 34 (BH-DXB hidden), enabled/disabled overall
5. **Recipe** — *disabled placeholder card with "Phase F&B-2"
   message*. Schema column `recipe_id` exists but no UI.

### 6.2 AI translate helper

- `[✨ Translate from English]` button next to each non-EN field.
- Calls Anthropic API (`src/lib/anthropic.ts`) with a structured
  prompt:

  ```
  Translate this Egyptian-hospitality menu {{field}} from English
  to {{target_lang}}, keeping it brief, evocative, and respectful of
  culinary terms. Preserve culinary loanwords if appropriate.
  ```

- Drafts populate the AR / RU / FR fields with an `[AI]` chip.
- Manager edits then clicks `[✓ Approve]` to remove the chip and
  mark the field manually-approved.
- `ai_translation_flags jsonb` column on `fnb_items` tracks which
  fields are AI-drafted vs manually approved.

### 6.3 Bulk actions

- "Reorder items" (drag-drop within a category)
- "Reorder categories" (drag-drop in the left pane)
- "Duplicate item" — copies all 4-lang fields + modifiers
- "Bulk price update" — e.g., +10% on all sandwiches; preview before
  apply; logs all changes to audit log

## 7. Settings — `/beithady/fnb/settings`

Sub-tabs:

### 7.1 Buildings

For each Egypt building (BH-26 / 73 / 435 / OK / 34):
- Enable F&B (boolean)
- Kitchen WA recipient(s) (comma-separated phone numbers)
- Delivery SLA minutes (default 30)
- Optional building-specific receipt VAT line (overrides global)

### 7.2 Hours

Global category default hours:
- Breakfast: 08:00 – 14:00
- Sandwiches: 08:00 – 24:00 *(stored as 23:59 + special handling)*
- Salads & Kids: 08:00 – 24:00

Per-item hour overrides set in the menu admin.

### 7.3 Notifications

- WA Cloud vs Casual preference (per building)
- Outbound message templates (per status, with placeholder preview)
- Guest notification on/off per status
- Operator notification on/off per status

### 7.4 Receipt

- Header logo (uploaded image)
- Footer text (multi-line, supports placeholders)
- VAT registration line (per building or global)
- Default language for receipts when guest language unknown

### 7.5 Cancellation

- Grace period in seconds (default **120 / 2 min**, max 300 / 5 min)

## 8. Analytics — `/beithady/fnb/analytics`

### 8.1 Top KPIs (cards)

- **Revenue today** (USD), % vs yesterday
- **Orders today** count + avg ticket
- **Attach rate** — % of in-house reservations that placed at least 1
  order today
- **Avg prep time** — minutes from `submitted → ready`
- **Top item this week** — name + count + revenue

### 8.2 Charts (`recharts`)

- Revenue daily trend (last 30 / 90 days)
- Orders by hour-of-day heatmap
- Top 10 items by revenue (stacked bar by building)
- Attach rate by building over time
- Margin (when `cost_usd` is populated): margin $ + margin %

### 8.3 Filters

Date range, building, category.

### 8.4 Exports

- CSV download (filtered)
- PDF report (header + KPIs + charts)

## 9. Audit log — `/beithady/fnb/audit`

**Reuses the existing `beithady_audit_log` table** (created in
migration `0030_beithady_v2_foundation.sql`). All F&B events get
written with `module = 'fnb'` so they appear both in the F&B audit
tab and in any global audit views. No new audit table.

Logged events:
- Item create / update (with field-level diff) / soft-delete
- Category create / update / delete
- Bulk price update (one row per item changed)
- Order status change (actor + timestamp + via)
- Order cancellation (actor + reason)
- Building enable / disable
- Settings change (notification template, hours, recipients)

## 10. Permissions

### 10.1 New BeithadyCategory `fnb`

Add `'fnb'` as the 10th value in the `BeithadyCategory` union in
`src/lib/beithady/auth.ts`.

### 10.2 New role `fnb_manager`

Two coordinated changes required:

1. **TypeScript:** Add `'fnb_manager'` as the 9th value in the
   `BEITHADY_ROLES` const in `src/lib/beithady/auth.ts`.
2. **Postgres:** Add `'fnb_manager'` to the `beithady_role` enum
   via migration `0079_beithady_role_fnb_manager.sql` —
   `ALTER TYPE beithady_role ADD VALUE IF NOT EXISTS 'fnb_manager';`
   (mirrors the existing `0048a` migration that added
   `warehouse_manager` + `housekeeper`, and `0060` that added
   `business_analyst`.)

Both must ship in the same release; the TS const update without the
enum migration would crash on role insert with
`ERROR: invalid input value for enum beithady_role`.

### 10.3 Permission matrix update

Extend the `PERMISSIONS` matrix in `src/lib/beithady/auth.ts`:

| Role | financial | analytics | crm | comm | settings | gallery | ads | ops | inv | **fnb** |
|---|---|---|---|---|---|---|---|---|---|---|
| guest_relations | none | read | full | full | read | full | none | read | none | **full** |
| finance | full | read | read | none | read | read | none | read | read | **read** |
| ops | read | full | full | full | read | full | none | full | full | **full** |
| manager | full | full | full | full | read | full | full | full | full | **full** |
| admin | full | full | full | full | full | full | full | full | full | **full** |
| warehouse_manager | none | read | read | none | read | none | none | read | full | **none** |
| housekeeper | none | none | none | none | none | none | none | none | read | **none** |
| business_analyst | none | full | read | none | read | none | read | read | read | **read** |
| **fnb_manager** *(new)* | **none** | **read** | **read** | **none** | **read** | **none** | **none** | **read** | **none** | **full** |

### 10.4 Sub-tab gating

`fnb/settings/notifications` (outbound templates) is admin-only,
mirroring the existing `outbound` ADMIN_ONLY_SETTINGS_SUBTABS pattern.

## 11. Data model

### 11.1 Tables

All in `public` schema. Convention follows existing `bh_*` /
unprefixed Beithady tables.

```sql
-- Categories (3 seeded: Breakfast, Sandwiches, Salads & Kids)
CREATE TABLE fnb_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  sort_order      int  NOT NULL DEFAULT 0,
  name_en         text NOT NULL,
  name_ar         text,
  name_ru         text,
  name_fr         text,
  hours_start     time NOT NULL DEFAULT '08:00',
  hours_end       time NOT NULL DEFAULT '23:59',
  enabled         boolean NOT NULL DEFAULT true,
  ai_translation_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Menu items (12 seeded from PDF)
CREATE TABLE fnb_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES fnb_categories(id) ON DELETE RESTRICT,
  slug            text NOT NULL UNIQUE,
  sort_order      int  NOT NULL DEFAULT 0,
  name_en         text NOT NULL,
  name_ar         text,
  name_ru         text,
  name_fr         text,
  description_en  text,
  description_ar  text,
  description_ru  text,
  description_fr  text,
  photo_path      text,            -- supabase storage path
  photo_thumb_path text,
  price_usd       numeric(10,2) NOT NULL CHECK (price_usd >= 0),
  cost_usd        numeric(10,2) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  hours_start_override time,
  hours_end_override   time,
  recipe_id       uuid,            -- nullable, future Phase F&B-2
  enabled         boolean NOT NULL DEFAULT true,
  ai_translation_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz       -- soft-delete
);
CREATE INDEX fnb_items_category_idx ON fnb_items(category_id) WHERE deleted_at IS NULL;

-- Modifiers / add-ons per item
CREATE TABLE fnb_item_modifiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES fnb_items(id) ON DELETE CASCADE,
  sort_order      int  NOT NULL DEFAULT 0,
  name_en         text NOT NULL,
  name_ar         text,
  name_ru         text,
  name_fr         text,
  price_delta_usd numeric(10,2) NOT NULL CHECK (price_delta_usd >= 0),
  enabled         boolean NOT NULL DEFAULT true,
  ai_translation_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fnb_modifiers_item_idx ON fnb_item_modifiers(item_id);

-- Per-building stock-out flags (single global menu, but per-building stockouts)
CREATE TABLE fnb_building_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_code   text NOT NULL,
  item_id         uuid NOT NULL REFERENCES fnb_items(id) ON DELETE CASCADE,
  is_out_of_stock boolean NOT NULL DEFAULT false,
  out_of_stock_until timestamptz, -- auto-clears at next Cairo midnight
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_code, item_id)
);

-- Per-building F&B settings
CREATE TABLE fnb_buildings (
  building_code   text PRIMARY KEY,
  enabled         boolean NOT NULL DEFAULT false,
  kitchen_wa_recipients text[] NOT NULL DEFAULT '{}',
  delivery_sla_minutes int NOT NULL DEFAULT 30,
  receipt_vat_line text,
  message_template_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Orders
CREATE TYPE fnb_order_status AS ENUM (
  'submitted', 'preparing', 'ready', 'delivered', 'closed', 'cancelled'
);

CREATE TABLE fnb_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    bigserial NOT NULL UNIQUE,
  reservation_id  text NOT NULL,           -- Guesty reservation id
  building_code   text NOT NULL,
  unit_code       text NOT NULL,
  guest_name      text,
  guest_language  text NOT NULL DEFAULT 'en' CHECK (guest_language IN ('en','ar','ru','fr')),
  status          fnb_order_status NOT NULL DEFAULT 'submitted',

  -- Status timestamps (one per state for SLA reporting)
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  preparing_at    timestamptz,
  ready_at        timestamptz,
  delivered_at    timestamptz,
  closed_at       timestamptz,
  cancelled_at    timestamptz,
  cancellation_reason text,

  -- Financials (USD, snapshot at submit time)
  subtotal_usd    numeric(10,2) NOT NULL,  -- pre-VAT/service breakdown
  vat_usd         numeric(10,2) NOT NULL,
  service_usd     numeric(10,2) NOT NULL,
  total_usd       numeric(10,2) NOT NULL CHECK (total_usd >= 0),

  -- Delivery
  requested_delivery_at timestamptz,        -- ASAP if NULL
  eta_at          timestamptz,
  notes           text,                     -- guest's order-level note

  -- Idempotency for retry-safe submit
  idempotency_key text NOT NULL UNIQUE,

  -- Integration trail
  guesty_charge_id text,                    -- set when delivered + folio post succeeds
  guesty_charge_attempted_at timestamptz,
  guesty_charge_failed_reason text,
  receipt_pdf_path text,                    -- supabase storage path

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fnb_orders_status_idx ON fnb_orders(status) WHERE status IN ('submitted','preparing','ready');
CREATE INDEX fnb_orders_building_idx ON fnb_orders(building_code, submitted_at DESC);
CREATE INDEX fnb_orders_reservation_idx ON fnb_orders(reservation_id);

-- Order line items (snapshot pricing — never re-priced from items table)
CREATE TABLE fnb_order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES fnb_orders(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES fnb_items(id) ON DELETE SET NULL, -- nullable if item later deleted
  item_name_snapshot text NOT NULL,         -- in guest's language
  quantity        int NOT NULL CHECK (quantity > 0 AND quantity <= 10),
  unit_price_usd_snapshot numeric(10,2) NOT NULL,
  modifier_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ name, price_delta_usd, name_en }]
  line_total_usd  numeric(10,2) NOT NULL,
  notes           text,                     -- per-line notes
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fnb_order_items_order_idx ON fnb_order_items(order_id);

-- Status change events (drives the timeline + audit)
CREATE TABLE fnb_status_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES fnb_orders(id) ON DELETE CASCADE,
  from_status     fnb_order_status,
  to_status       fnb_order_status NOT NULL,
  changed_by_user_id uuid,                  -- nullable for cron / system
  changed_via     text NOT NULL,            -- 'dashboard'|'cron'|'guest'|'webhook'
  at              timestamptz NOT NULL DEFAULT now(),
  notes           text
);
CREATE INDEX fnb_status_events_order_idx ON fnb_status_events(order_id, at);

-- Audit log: REUSE existing public.beithady_audit_log (created in
-- 0030_beithady_v2_foundation.sql). All F&B events written with
-- module = 'fnb'. NO new audit table needed. Schema for reference:
--
--   beithady_audit_log (
--     id            uuid PK,
--     actor_user_id uuid,
--     module        text,         -- write 'fnb' for this module
--     action        text,         -- e.g. 'item.create', 'order.status_change'
--     target_type   text,         -- 'item'|'category'|'order'|'building'|'settings'
--     target_id     text,
--     before        jsonb,
--     after         jsonb,
--     at            timestamptz
--   )
```

### 11.2 RLS

Pattern matches existing Beithady tables: service-role-only writes
from server actions; no anonymous access. Guest endpoints use the
boarding-pass token through a server-side function that bypasses RLS
with explicit reservation/building checks.

### 11.3 Migration files

(Next sequential numbers — current head is 0078.)

- `0079_beithady_role_fnb_manager.sql` —
  `ALTER TYPE beithady_role ADD VALUE IF NOT EXISTS 'fnb_manager'`
  (mirrors existing pattern in `0048a` and `0060`).
- `0080_fnb_categories_and_items.sql`
- `0081_fnb_modifiers_and_overrides.sql`
- `0082_fnb_buildings_settings.sql`
- `0083_fnb_orders_and_events.sql`
- `0084_fnb_seed.sql` — 3 categories, 12 items from PDF (EN only;
  AR/RU/FR populated post-deploy via the AI-translate helper).

No audit-log migration needed — the existing `beithady_audit_log`
table from `0030_beithady_v2_foundation.sql` is reused (see §9).

## 12. API routes

### 12.1 Guest (token-gated, no auth cookie)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dine/[token]/menu` | Menu items in guest's language, scoped to their building |
| POST | `/api/dine/[token]/order` | Submit order; idempotency key required |
| GET | `/api/dine/[token]/order/[orderId]` | Order detail + status |
| POST | `/api/dine/[token]/order/[orderId]/cancel` | Cancel within grace period |
| GET | `/api/dine/[token]/receipt/[orderId]` | PDF receipt download |
| POST | `/api/dine/[token]/receipt/[orderId]/whatsapp` | Send receipt to guest WA |
| POST | `/api/dine/[token]/language` | Update guest language preference |

### 12.2 Admin (Beithady-permission-gated)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/beithady/fnb/items` | fnb:read | List items |
| POST | `/api/beithady/fnb/items` | fnb:full | Create item |
| PATCH | `/api/beithady/fnb/items/[id]` | fnb:full | Update item |
| DELETE | `/api/beithady/fnb/items/[id]` | fnb:full | Soft-delete item |
| POST | `/api/beithady/fnb/items/[id]/translate` | fnb:full | AI translate one field |
| POST | `/api/beithady/fnb/items/[id]/photo-upload-url` | fnb:full | Issue signed upload URL |
| POST | `/api/beithady/fnb/items/bulk-price-update` | fnb:full | Bulk price update |
| GET | `/api/beithady/fnb/categories` | fnb:read | List categories |
| POST | `/api/beithady/fnb/categories` | fnb:full | Create category |
| PATCH | `/api/beithady/fnb/categories/[id]` | fnb:full | Update / reorder category |
| GET | `/api/beithady/fnb/orders` | fnb:read | List orders w/ filters |
| GET | `/api/beithady/fnb/orders/[id]` | fnb:read | Order detail |
| PATCH | `/api/beithady/fnb/orders/[id]` | fnb:full | Update status |
| POST | `/api/beithady/fnb/orders/[id]/cancel` | fnb:full (manager+) | Cancel order |
| POST | `/api/beithady/fnb/orders/[id]/mark-settled` | fnb:full | Manual Guesty mirror — captures optional Guesty receipt # and sets order to `closed` |
| POST | `/api/beithady/fnb/orders/[id]/resend-receipt` | fnb:full | Resend PDF |
| GET | `/api/beithady/fnb/reservations/[id]/charges` | fnb:read | F&B charges summary for one reservation (used by Operations reservation drawer) |
| GET | `/api/beithady/fnb/buildings` | fnb:read | List building settings |
| PATCH | `/api/beithady/fnb/buildings/[code]` | fnb:full | Update building |
| POST | `/api/beithady/fnb/buildings/[code]/stockout` | fnb:full | Toggle stock-out |
| GET | `/api/beithady/fnb/analytics/summary` | fnb:read | KPI cards |
| GET | `/api/beithady/fnb/analytics/timeseries` | fnb:read | Charts |
| GET | `/api/beithady/fnb/analytics/export.csv` | fnb:read | CSV export |
| GET | `/api/beithady/fnb/analytics/export.pdf` | fnb:read | PDF report |
| GET | `/api/beithady/fnb/audit` | admin/manager only | Audit log |

### 12.3 Cron jobs (in `vercel.json`)

| Cron | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/fnb-stale-orders` | `*/5 * * * *` | Alert on stale submitted (>10m) / preparing (>45m) |
| `/api/cron/fnb-clear-stockouts` | `0 22 * * *` (= Cairo midnight) | Auto-clear `is_out_of_stock` flags |
| `/api/cron/fnb-close-delivered` | `0 1 * * *` (= Cairo 03:00) | Auto-close delivered > 24h |
| `/api/cron/fnb-checkout-reminder` | `0 6,7 * * *` (= Cairo 9 AM, DST-safe) | Email F&B manager + ops a list of reservations checking out today with unsettled F&B totals (`status IN ('delivered','closed')` but `guesty_charge_id IS NULL`) |

All cron handlers require `Authorization: Bearer $CRON_SECRET`.
DST-safe: handlers gate on `Cairo local hour == X` so DST flips don't
require redeploys; double-register UTC times if needed (existing
pattern in repo).

## 13. Integrations

### 13.1 Settlement at checkout — manual Guesty folio mirror

**Guesty's API does not support adding arbitrary line-item folio
charges** (confirmed during spec review). v1 therefore takes the
manual mirror approach:

- Orders accumulate in `fnb_orders` against the `reservation_id`.
- At `delivered`, the order is locked (no further edits) and the PDF
  receipt is auto-sent to the guest via WhatsApp (see §13.4). No
  Guesty API call is made.
- A new view **F&B charges** appears in the existing Operations
  module reservation drawer at `/beithady/operations/reservations/[id]`:
  - Lists all `delivered`/`closed` F&B orders for the reservation
  - Shows running total in USD
  - Shows VAT/service breakdown (display only — total is what gets
    charged)
  - **"Mark as settled in Guesty"** button per order (or bulk):
    captures an optional Guesty receipt # / note, sets the order to
    `closed`, writes `guesty_charge_id` (free-form text in v1)
- A daily cron `/api/cron/fnb-checkout-reminder` runs each morning
  Cairo time and emails the F&B manager + ops a list of
  reservations checking out today with unsettled F&B totals (so
  nothing slips through at checkout).
- **No automatic charge at `delivered`.** No Guesty API integration
  in v1 for charges. Cancellations before `delivered` require no
  reversal (no charge ever fired). Cancellations after `delivered`
  but before checkout = admin-only, logs to audit, ops manually
  decides whether to discount the guest's folio.

**Out of scope for v1, v2 candidate:** if Guesty later exposes an
`addCharge` endpoint, the flow flips to auto-fire at `delivered`
with the same data model — no destructive migration needed (the
`guesty_charge_id` column is already there).

### 13.2 WhatsApp Cloud (operator + guest push)

- Reuses existing `src/lib/whatsapp/` (Cloud) + Green-API (Casual
  fallback).
- Operator push: new template "F&B order" registered in WA Business
  Manager (per WA Cloud rules — non-marketing, transactional).
- Guest push: uses Guesty conversation thread (existing in
  `src/lib/beithady/communication/`) which already routes to whichever
  channel the guest used (WA / SMS / Airbnb / Booking.com inbox).

### 13.3 Anthropic translate

- New helper `src/lib/beithady/fnb/translate.ts`.
- Reuses existing `src/lib/anthropic.ts` client.
- Single-call structured output: input `{ text, source_lang, target_lang, field_kind }`,
  output `{ translation, confidence }`.
- Cost: ~$0.001 per item per language, well within budget.

### 13.4 PDF receipt — auto-send via WhatsApp at `delivered`

- Reuses `@react-pdf/renderer` (already in stack).
- New component `src/lib/beithady/fnb/receipt-pdf.tsx`.
- Generated server-side **at `delivered`** (also re-generatable on-
  demand from order detail), stored in Supabase storage at
  `fnb-receipts/{order_id}.pdf`, signed URL returned to guest.
- **Auto-send pipeline at `delivered`:**
  1. Generate PDF.
  2. Try **WA Cloud** (preferred — supports media attachments, better
     deliverability) with the receipt attached + a short body text
     ("Your Beit Hady F&B order has been delivered. Receipt attached.
     Total: $X. Charged to your room.").
  3. If Cloud fails / not configured → **WA Casual (Green-API)**
     fallback with the same attachment.
  4. If both WA channels fail (e.g., guest has no WA number) →
     **Guesty conversation** as last fallback with a signed URL link
     to the receipt instead of an attachment.
  5. If all channels fail → log + amber badge in operator dashboard;
     ops can manually click "Resend receipt".
- Template includes: BH logo, order #, date, building/unit, guest
  name, line items in guest's language, VAT/service breakdown, total,
  payment method ("Charged to room — settled at checkout"), VAT
  registration line, generated-at timestamp.
- Guest can also re-trigger send at any time from the order detail
  page via the "Resend to my WhatsApp" button (rate-limited to 3
  re-sends per hour to prevent abuse).

### 13.5 Photo storage

- Reuses existing `beithady-gallery` Supabase bucket.
- New folder prefix `fnb/items/`.
- Direct-to-Supabase signed-URL upload pattern (avoids 15 MB Server
  Action cap).
- Auto-resize on upload via existing transform pipeline.

## 14. Code structure

```
src/
  app/
    beithady/
      fnb/
        page.tsx                    # Orders tab (default)
        layout.tsx                  # tab nav + permission guard
        _components/
          order-board.tsx           # kanban
          order-card.tsx
          order-side-panel.tsx
          status-badge.tsx
        menu/
          page.tsx
          _components/
            category-tree.tsx
            item-editor.tsx
            modifier-editor.tsx
            translate-button.tsx
            photo-uploader.tsx
        analytics/
          page.tsx
          _components/
            kpi-cards.tsx
            revenue-chart.tsx
            top-items-chart.tsx
        settings/
          page.tsx
          buildings/page.tsx
          hours/page.tsx
          notifications/page.tsx    # admin-only
          receipt/page.tsx
          cancellation/page.tsx
        audit/
          page.tsx
    dine/
      [token]/
        page.tsx                    # mobile menu
        order/
          page.tsx                  # cart drawer (or modal in same page)
          [id]/
            page.tsx                # order confirmation + status
        _components/
          item-card.tsx
          item-bottom-sheet.tsx
          cart-bar.tsx
          cart-drawer.tsx
          language-switcher.tsx
          status-badge.tsx
    api/
      dine/
        [token]/
          menu/route.ts
          order/route.ts
          order/[orderId]/route.ts
          order/[orderId]/cancel/route.ts
          receipt/[orderId]/route.ts
          receipt/[orderId]/whatsapp/route.ts
          language/route.ts
      beithady/
        fnb/
          items/route.ts
          items/[id]/route.ts
          items/[id]/translate/route.ts
          items/[id]/photo-upload-url/route.ts
          items/bulk-price-update/route.ts
          categories/route.ts
          categories/[id]/route.ts
          orders/route.ts
          orders/[id]/route.ts
          orders/[id]/cancel/route.ts
          orders/[id]/resend-receipt/route.ts
          buildings/route.ts
          buildings/[code]/route.ts
          buildings/[code]/stockout/route.ts
          analytics/summary/route.ts
          analytics/timeseries/route.ts
          analytics/export.csv/route.ts
          analytics/export.pdf/route.ts
          audit/route.ts
      cron/
        fnb-stale-orders/route.ts
        fnb-clear-stockouts/route.ts
        fnb-close-delivered/route.ts
        fnb-checkout-reminder/route.ts
  lib/
    beithady/
      fnb/
        types.ts                    # Zod schemas + TS types
        repo.ts                     # CRUD helpers (server-only)
        permissions.ts              # convenience wrappers
        token-validate.ts           # guest-side token check
        cart.ts                     # totals math, VAT/service breakdown
        settlement.ts               # mark-settled flow + reservation charges aggregation (no auto-Guesty-API)
        wa-notifier.ts              # operator + guest WA push (Cloud → Casual → Guesty fallback)
        translate.ts                # Anthropic helper
        receipt-pdf.tsx             # PDF component
        seed.ts                     # initial 12 items + 3 categories
        order-status.ts             # status transition rules
        checkout-reminder.ts        # cron job logic: list reservations checking out today w/ unsettled F&B
supabase/migrations/
  0079_beithady_role_fnb_manager.sql      # ALTER TYPE beithady_role ADD VALUE
  0080_fnb_categories_and_items.sql
  0081_fnb_modifiers_and_overrides.sql
  0082_fnb_buildings_settings.sql
  0083_fnb_orders_and_events.sql
  0084_fnb_seed.sql                       # 3 categories + 12 items from PDF (EN)
```

## 15. Edge cases & risks

| # | Edge case | Mitigation |
|---|---|---|
| 1 | Front-desk forgets to mirror F&B totals to Guesty at checkout | Daily Cairo-morning cron emails F&B manager + ops with reservations checking out today with unsettled F&B; reservation drawer shows red badge if F&B total > $0 and any orders not yet `closed` |
| 2 | Item deleted while in active orders | Snapshot pricing in `fnb_order_items`; nullable FK with `ON DELETE SET NULL` |
| 3 | Token expired mid-cart | Server returns 410; client shows "Session expired — scan QR again" |
| 4 | Concurrent orders same unit | No conflict — unique order_number per row |
| 5 | Network drop during submit | Idempotency key on POST /order; client retries with same key |
| 6 | Stock-out toggled mid-order | Last-mile validation in submit endpoint; returns 409 with item-list of newly-out items |
| 7 | Building disabled with active orders | Active orders complete normally; new orders rejected with 403 |
| 8 | Guesty webhook lag (checkout → revoke) | 4-hour grace period for read-only receipt access post-checkout |
| 9 | Photo upload abuse | Max 5 MB; MIME validation; signed URL is single-use 5-min expiry |
| 10 | AI translation drift | `[AI]` chip + manual approve gate; flagged in `ai_translation_flags` jsonb |
| 11 | Receipt PDF generation failure | Try/catch; log + skip; order proceeds; ops can re-generate from dashboard |
| 12 | Order cancelled after `delivered` (rare — typically a comp / dispute) | Admin/manager-only with reason; logs to audit; reservation drawer shows the cancellation as a discount line so front-desk doesn't double-charge at checkout |
| 13 | Operating-hour cliff (8AM cutoff) | Server-side check on submit; client shows greyed-out items; clock skew tolerated ±5 min |
| 14 | Multiple modifier toggles affecting price | All modifier deltas summed at submit; snapshot in `fnb_order_items.modifier_snapshot` |
| 15 | Multi-language receipt for guest who switched mid-order | Receipt locks to `guest_language` at submit time |
| 16 | Cancellation race (guest cancels while ops moves to preparing) | Optimistic concurrency check on status; first writer wins; second sees 409 |
| 17 | Cron skipped overnight | `fnb-stale-orders` skipped 23:00–07:00 Cairo |
| 18 | Bulk price update affecting in-flight orders | Snapshot pricing protects in-flight; only future orders see new prices |
| 19 | Out-of-stock auto-clear at midnight changes guest cart | Cart re-validates at submit; client refreshes menu on focus |
| 20 | WhatsApp delivery failure to kitchen | Casual fallback; if both fail, mark order `notify_failed` + dashboard amber badge |

## 16. Test plan

### 16.1 Unit (Vitest)

- Cart total math (subtotal / VAT / service / total round-tripping)
- Status transition rules (which state → which is allowed, who can)
- Token validation (expired / wrong building / non-active reservation)
- Hours-window check (operating window edge cases inc. midnight)
- Translation cache hit / miss
- Modifier price delta calculation

### 16.2 Integration

- Guesty `addCharge` happy path + retry path
- WA Cloud push happy path + Casual fallback
- PDF receipt generation in all 4 languages
- Photo upload signed-URL flow

### 16.3 E2E (manual checklist)

- Mobile guest flow on iOS Safari, Android Chrome, in-app webview
  (Guesty inbox link)
- RTL flow in Arabic
- Operator kanban drag-drop
- Bulk price update preview & apply
- Token revoke at checkout

## 17. Phase plan / timeline (rough)

Total estimate: **2.5–3 weeks** with one dev (you).

| Sub-phase | Duration | Deliverable |
|---|---|---|
| F.1 — DB migrations + permissions wiring | 2 days | Migrations applied, role visible in launcher |
| F.2 — Menu admin (item CRUD, photo upload, no AI translate yet) | 3 days | Admin can manage items in EN |
| F.3 — Guest menu read-only (single-language) | 2 days | Mobile menu renders from DB |
| F.4 — Cart + submit + order confirmation | 3 days | Guest can place orders; status visible |
| F.5 — Operator kanban + WA push | 2 days | Ops can move orders; kitchen gets WA |
| F.6 — Multi-language + AI translate helper | 2 days | All 4 langs working; admin can translate |
| F.7 — PDF receipt + WA auto-send + Operations reservation drawer F&B charges view | 2 days | Receipts generate, auto-send via WA at delivered, front-desk sees F&B totals at checkout |
| F.8 — Settings + analytics + audit + cron alerts (incl. checkout-reminder cron) | 2 days | Polish + ops controls + nothing slips through at checkout |
| F.9 — Seed + production rollout | 1 day | 12 PDF items live; QR codes printed |

## 18. Open questions — RESOLVED

All resolved in user review on 2026-05-04. Listed here for traceability:

1. **Guesty `addCharge` API** — *Resolved: NO*. Guesty does not
   support arbitrary line-item folio charges. v1 ships with manual
   settlement at checkout: F&B totals appear in the Operations
   reservation drawer, front-desk mirrors to Guesty at checkout via
   the existing process, daily cron emails any reservations checking
   out today with unsettled F&B totals as a backstop. See §13.1.
2. **Pre-arrival ordering** — *Resolved: NO*. Hard requirement that
   reservation status = `checked_in` before orders accepted. Pre-
   arrival welcome groceries deferred to v2. See §4.2.
3. *(Resolved during self-review.)* Audit log: REUSE existing
   `beithady_audit_log` table with `module = 'fnb'` (see §9 + §11).
4. **Cancellation grace** — *Resolved: 2 minutes*. Default bumped
   from 60 sec to 120 sec; max stays at 5 min. See §4.6 + §7.5.
5. **Receipt PDF auto-send** — *Resolved: auto-send via WhatsApp at
   `delivered`*. Channel order: WA Cloud → WA Casual → Guesty
   conversation as last fallback. Guest can also re-trigger send
   on-demand (rate-limited 3/hour). See §13.4.

## 19. Approval gates

This is a 2-stage review per user's process:

**Stage 1 — Plan (this doc)** — User reviews this design spec → 95%
confidence → approve. Open questions in §18 resolved.

**Stage 2 — Workflow / Implementation Plan** — Once Stage 1
approved, I invoke the `superpowers:writing-plans` skill to produce
a detailed task-by-task implementation plan in
`docs/superpowers/plans/2026-05-04-beithady-fnb-menu-plan.md`. User
reviews → 95% confidence → approve.

**Stage 3 — Coding** — Subagent-driven execution per the implementation
plan, with verification gates per phase.
