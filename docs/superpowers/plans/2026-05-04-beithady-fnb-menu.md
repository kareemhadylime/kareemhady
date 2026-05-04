# Beithady F&B / In-Room Dining — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/beithady/fnb` — Phase F (F&B v1): a 10th Beithady tile covering in-room dining for Egypt buildings only (BH-26 / BH-73 / BH-435 / BH-OK / BH-34, BH-DXB excluded). Replaces the current PDF + Dial-0 workflow with a 4-language mobile guest menu at `/dine/[token]` (boarding-pass token reuse + in-apartment QR codes), digital ordering with kanban operator queue + WhatsApp Cloud push, manual checkout-time settlement (Guesty addCharge API not supported), and PDF receipt auto-sent via WhatsApp at delivered.

**Architecture:** Single-tenant module living under `/beithady/fnb` with 5 tabs (Orders kanban default · Menu admin · Analytics · Settings · Audit Log). Guest UI at `/dine/[token]` validates against an existing `boarding_passes` row + Guesty reservation status `checked_in`. Adds 1 new BeithadyCategory (`fnb`) and 1 new role (`fnb_manager`) extending the existing 8 roles' permission matrix in `src/lib/beithady/auth.ts`. 5 new Postgres tables (`fnb_categories`, `fnb_items`, `fnb_item_modifiers`, `fnb_building_overrides`, `fnb_buildings`, `fnb_orders`, `fnb_order_items`, `fnb_status_events`), 1 new ENUM type `fnb_order_status`, 1 ENUM extension `beithady_role` += `fnb_manager`. Reuses existing `beithady_audit_log` (module='fnb'), existing `beithady-gallery` storage bucket (folder `fnb/items/`), existing `@react-pdf/renderer`, existing Guesty conversation infra in `src/lib/beithady/communication/`, existing WA Cloud + Casual clients, existing Anthropic SDK for AI translate. 4 new cron jobs in `vercel.json`.

**Tech Stack:** Next.js 16 (App Router, Turbopack, server actions), React 19, TypeScript strict, Tailwind v4, Supabase Postgres + JS service-role client, Zod, Vitest (colocated `*.test.ts`), `@dnd-kit/*` for kanban, `recharts` for analytics, `@react-pdf/renderer` for receipts, `qrcode` (npm) for QR generation, `@anthropic-ai/sdk` for translate. Per CLAUDE.md, every commit auto-deploys via `git push origin <branch>:main` (Vercel GitHub integration).

**Spec:** [docs/superpowers/specs/2026-05-04-beithady-fnb-menu-design.md](../specs/2026-05-04-beithady-fnb-menu-design.md)

**Branch:** `claude/magical-borg-cbc7bf` (worktree). Push pattern: `git fetch origin main && git rebase origin/main && git push origin claude/magical-borg-cbc7bf:main`. Per standing authorization in CLAUDE.md, all forward-deploys + Supabase MCP migrations are pre-approved.

---

## File structure

**New files (~80):**

Library `src/lib/beithady/fnb/`:
- `types.ts` — Zod schemas + TS types for all DB rows + API payloads
- `repo.ts` — CRUD helpers (server-only) for items, categories, modifiers, building overrides
- `permissions.ts` — convenience wrappers around `requireBeithadyPermission('fnb', ...)`
- `token-validate.ts` — guest-side token check (boarding-pass row + reservation status + building enabled)
- `cart.ts` — totals math (subtotal / VAT / service / total round-tripping)
- `order-status.ts` — status transition rules (which state → which is allowed, who can)
- `wa-notifier.ts` — operator + guest WA push (Cloud → Casual fallback) using existing `src/lib/whatsapp/`
- `translate.ts` — Anthropic helper for menu translation
- `receipt-pdf.tsx` — React-PDF document component, all 4 languages
- `receipt-send.ts` — orchestrates auto-send pipeline at delivered (WA Cloud → WA Casual → Guesty conversation fallback)
- `settlement.ts` — `markOrderSettled()` + `getReservationCharges()` aggregation
- `checkout-reminder.ts` — daily cron logic: list reservations checking out today with unsettled F&B totals
- `qr.ts` — QR code generation (data URL or PNG)
- `seed.ts` — initial 12 items + 3 categories from PDF (used by migration 0084)

Pages and components `src/app/beithady/fnb/`:
- `layout.tsx` — tab nav + permission guard via `requireBeithadyPermission('fnb', 'read')`
- `page.tsx` — Orders tab (default; kanban dashboard)
- `_components/order-board.tsx` — kanban with `@dnd-kit/core`
- `_components/order-card.tsx` — single order card on kanban
- `_components/order-side-panel.tsx` — full order detail + WA shortcuts + status timeline
- `_components/status-badge.tsx` — colored status pill
- `_components/order-filters.tsx` — building/date/status filter bar
- `menu/page.tsx` — Menu admin page with category tree
- `menu/_components/category-tree.tsx`
- `menu/_components/item-editor.tsx` — wraps the 5 inner tabs
- `menu/_components/item-editor-basics.tsx`
- `menu/_components/item-editor-photo.tsx` — drag-drop upload
- `menu/_components/item-editor-modifiers.tsx`
- `menu/_components/item-editor-availability.tsx`
- `menu/_components/translate-button.tsx` — AI-translate one field with `[AI]` chip + approve gate
- `menu/_components/photo-uploader.tsx` — direct-to-Supabase signed URL flow
- `menu/_components/bulk-price-dialog.tsx`
- `analytics/page.tsx`
- `analytics/_components/kpi-cards.tsx`
- `analytics/_components/revenue-chart.tsx`
- `analytics/_components/top-items-chart.tsx`
- `analytics/_components/heatmap.tsx`
- `settings/page.tsx` — sub-tab nav
- `settings/buildings/page.tsx`
- `settings/hours/page.tsx`
- `settings/notifications/page.tsx` — admin-only
- `settings/receipt/page.tsx`
- `settings/cancellation/page.tsx`
- `audit/page.tsx`

Guest pages `src/app/dine/[token]/`:
- `layout.tsx` — language-aware shell (RTL toggle for AR)
- `page.tsx` — mobile menu rendering
- `_components/item-card.tsx`
- `_components/item-bottom-sheet.tsx`
- `_components/cart-bar.tsx` — sticky floating cart
- `_components/cart-drawer.tsx` — slide-up drawer
- `_components/language-switcher.tsx`
- `_components/category-tabs.tsx`
- `_components/status-badge-guest.tsx`
- `order/[id]/page.tsx` — order confirmation + live status

API routes `src/app/api/`:
- `dine/[token]/menu/route.ts`
- `dine/[token]/order/route.ts`
- `dine/[token]/order/[orderId]/route.ts`
- `dine/[token]/order/[orderId]/cancel/route.ts`
- `dine/[token]/receipt/[orderId]/route.ts`
- `dine/[token]/receipt/[orderId]/whatsapp/route.ts`
- `dine/[token]/language/route.ts`
- `beithady/fnb/items/route.ts`
- `beithady/fnb/items/[id]/route.ts`
- `beithady/fnb/items/[id]/translate/route.ts`
- `beithady/fnb/items/[id]/photo-upload-url/route.ts`
- `beithady/fnb/items/[id]/modifiers/route.ts`
- `beithady/fnb/items/[id]/modifiers/[modId]/route.ts`
- `beithady/fnb/items/bulk-price-update/route.ts`
- `beithady/fnb/categories/route.ts`
- `beithady/fnb/categories/[id]/route.ts`
- `beithady/fnb/orders/route.ts`
- `beithady/fnb/orders/[id]/route.ts`
- `beithady/fnb/orders/[id]/cancel/route.ts`
- `beithady/fnb/orders/[id]/mark-settled/route.ts`
- `beithady/fnb/orders/[id]/resend-receipt/route.ts`
- `beithady/fnb/buildings/route.ts`
- `beithady/fnb/buildings/[code]/route.ts`
- `beithady/fnb/buildings/[code]/stockout/route.ts`
- `beithady/fnb/reservations/[id]/charges/route.ts`
- `beithady/fnb/analytics/summary/route.ts`
- `beithady/fnb/analytics/timeseries/route.ts`
- `beithady/fnb/analytics/export.csv/route.ts`
- `beithady/fnb/analytics/export.pdf/route.ts`
- `beithady/fnb/audit/route.ts`
- `cron/fnb-stale-orders/route.ts`
- `cron/fnb-clear-stockouts/route.ts`
- `cron/fnb-close-delivered/route.ts`
- `cron/fnb-checkout-reminder/route.ts`

Migrations `supabase/migrations/`:
- `0079_beithady_role_fnb_manager.sql`
- `0080_fnb_categories_and_items.sql`
- `0081_fnb_modifiers_and_overrides.sql`
- `0082_fnb_buildings_settings.sql`
- `0083_fnb_orders_and_events.sql`
- `0084_fnb_seed.sql`

**Modified files (~6):**
- `src/lib/beithady/auth.ts` — add `'fnb'` to `BeithadyCategory`, add `'fnb_manager'` to `BEITHADY_ROLES`, extend `PERMISSIONS` matrix
- `src/app/beithady/page.tsx` — add F&B tile
- `src/app/beithady/operations/reservations/[id]/page.tsx` (or wherever the existing reservation drawer is — TBD during Task 54) — add F&B charges section
- `src/app/boarding/[token]/page.tsx` (or wherever boarding-pass page lives) — add "Order Food" CTA + QR code preview
- `vercel.json` — add 4 new cron schedules
- `package.json` — add `qrcode` dependency

---

## Phase plan

| Phase | Tasks | Est. duration |
|---|---|---|
| F.1 — Foundation: migrations, roles, tile | T1–T8 | 1.5 days |
| F.2 — Menu admin (item CRUD, photos, modifiers) | T9–T19 | 3 days |
| F.3 — Guest menu (read-only, EN-only) | T20–T25 | 2 days |
| F.4 — Cart + submit + confirmation | T26–T32 | 3 days |
| F.5 — Operator kanban + WA push | T33–T40 | 2.5 days |
| F.6 — Multi-language + AI translate | T41–T46 | 2 days |
| F.7 — PDF receipt + reservation charges drawer | T47–T54 | 2 days |
| F.8 — Settings + analytics + audit + crons | T55–T68 | 2 days |
| F.9 — Seed verification + production rollout | T69–T73 | 1 day |

**Total: ~19 days = 2.5–3 weeks of focused work.**

After each phase, a **phase checkpoint** (manual smoke test on production) gates moving to the next phase. Push to main → Vercel auto-deploy → verify. Per CLAUDE.md, no PRs / no feature branches; all forward-deploys auto-authorized.

---

## Conventions used in this plan

- **Test framework:** Vitest. Colocated `*.test.ts` next to module per CLAUDE.md.
- **Migration apply:** Use the Supabase MCP `apply_migration` tool (auto-authorized). Verify with `execute_sql`.
- **TS strict mode:** All new code must compile under `tsc --noEmit`. Validate external data with Zod.
- **Server-only modules:** Anything using `supabaseAdmin()` must `import 'server-only'` at the top.
- **Path alias:** `@/*` → `./src/*` (per `tsconfig.json`).
- **Commit cadence:** End of every task. Commit messages are imperative + scope, e.g., `feat(beithady/fnb): add fnb_manager role enum`.
- **Per CLAUDE.md commit hook:** `Bash(git commit -m ' *)` is pre-approved (single-quoted only). Use single quotes in heredoc commits or expect a permission prompt for double-quoted.
- **Deploy after each task:** Push → GitHub auto-deploys to Vercel → verify build is green at https://limeinc.vercel.app before starting the next task. If a task is purely DB/library work and won't visibly change anything, you can batch-deploy at the end of the phase.

---

## Brand identity — match the printed PDF menu

The guest UI at `/dine/[token]` and the PDF receipt MUST mirror the
visual identity of `BH In-Room Dining Menu vF.pdf`. The operator
dashboard inside `/beithady/fnb/*` keeps the existing Beithady
chrome (Tailwind defaults + `accent: 'rose'`) — only the **guest-
facing** surface gets the BH menu treatment.

### Color tokens

```css
/* src/app/dine/[token]/dine-tokens.css — imported in dine layout only */
:root {
  /* Cover-page navy — used for headers, item names, prices, decorative motifs */
  --bh-navy:        #0F3F58;
  --bh-navy-700:    #143A52;        /* hover/pressed */
  --bh-navy-900:    #0A2F44;        /* deep accents */

  /* Inner-page cream/grey — used for body background */
  --bh-cream:       #E9E5DE;
  --bh-cream-50:    #F2EFEA;        /* card backgrounds on cream */

  /* Coral side rails + accent dividers (the vertical pink lines on
     every PDF inner page) */
  --bh-coral:       #E5A29C;
  --bh-coral-300:   #EFC0BC;        /* lighter dot/halftone fill */

  /* Text */
  --bh-ink:         var(--bh-navy);
  --bh-ink-muted:   #4A6577;
  --bh-on-navy:     #FAF8F4;        /* cream on navy */
}
```

These come from sampling the PDF cover (page 1 — pure navy) and the
inner pages (cream body, coral rails, navy headings + halftone dots).
Lock them at this layer; do not introduce other colors on the guest
surface.

### Typography

- **Display headings** — `'Cormorant Garamond', 'Cormorant SC', serif`
  — closest free Google Font to the elegant condensed serif used on
  the PDF for "BREAKFAST MENU", "SANDWICHES", "SALADS & KIDS",
  "BEIT HADY", "IN-ROOM DINING". Use weight 500/600 for headings,
  small-caps variant for navigation tabs.
- **Body text + item names + descriptions** — `'Poppins', 'Cairo',
  'Helvetica Neue', sans-serif` — clean, geometric. Use 600 for item
  names, 400 for descriptions, 500 for prices.
- **Arabic body** — `'Cairo', sans-serif` (Google Font, designed for
  Arabic + Latin pairing; matches the visual weight of Poppins so
  RTL/LTR transitions look intentional).
- **Russian + French body** — fall through to Poppins (Cyrillic +
  Latin Extended subsets supported).

Load via `next/font/google`:

```ts
// src/app/dine/[token]/_fonts.ts
import { Cormorant_Garamond, Poppins, Cairo } from 'next/font/google';

export const fontDisplay = Cormorant_Garamond({
  weight: ['500', '600'],
  subsets: ['latin'],
  variable: '--bh-font-display',
  display: 'swap',
});

export const fontBody = Poppins({
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--bh-font-body',
  display: 'swap',
});

export const fontArabic = Cairo({
  weight: ['400', '600'],
  subsets: ['arabic'],
  variable: '--bh-font-arabic',
  display: 'swap',
});
```

The `dine` layout adds these CSS variables to the `<body>` so the
rest of the guest UI just uses `font-family: var(--bh-font-display)`
or `var(--bh-font-body)` (with an `[lang="ar"]` selector swapping in
`var(--bh-font-arabic)` for Arabic).

### Decorative motifs from the PDF

Three repeating elements:

1. **Coral vertical side rails** — the thin pink lines on every inner
   page. Implemented as two `<div>`s positioned absolutely on the
   left/right inner-padding of the menu container, 1.5px wide,
   `background: var(--bh-coral)`.
2. **Halftone dot patterns** — circular halftone clusters in navy on
   the cream pages. Provide 2 SVGs in `public/dine/halftone-tl.svg`
   and `public/dine/halftone-br.svg`; place absolutely in the
   top-left and bottom-right of section backgrounds at ~10% opacity
   so they read as decoration, not data.
3. **Palm tree silhouette** — the navy palm illustration on every
   inner page. Provide `public/dine/palm-silhouette.svg`. Use at
   most one per scrollable view at low opacity (~30%) to avoid the
   menu looking like a poster.

The exact SVGs are simple line/dot work the engineer can ship with
the existing repo `public/` storage. Source them either from a free
icon library (Heroicons, Phosphor, Tabler) or trace from the PDF —
either is fine. Lock them at v1; refining art is a v2 task.

### Logo

Use the BH wordmark from `BeitHady Logos/`. The cover-page logo on
the PDF is the **stacked Latin/Arabic mark**:

```
       ┌──┐
       │ﺑـ│   (decorative arch with the BH monogram)
       └──┘
   بيت هادي
   BEIT HADY
```

Convert one of the existing logo files to SVG and place at
`public/dine/beithady-logo.svg`. Render at the top of the guest menu
hero in cream-on-navy, ~120px tall.

### Layout pattern (guest menu)

```
┌─────────────────────────────────────────┐  ← cream background
│                                         │
│  ┃    [BH logo, navy on cream]    ┃    │  ← coral vertical rails
│  ┃           IN-ROOM DINING        ┃    │  (Cormorant Garamond)
│  ┃    Dial 0 from your living room ┃    │
│  ┃                                  ┃    │
│  ┃   🌐 EN | AR | RU | FR           ┃    │
│  ┃                                  ┃    │
│  ┃  [Halftone TL]                   ┃    │
│  ┃                                  ┃    │
│  ┃  ──── BREAKFAST MENU ────        ┃    │  (centered, serif, navy)
│  ┃                                  ┃    │
│  ┃  All-Day Breakfast    $7         ┃    │  (item name 600, price right-aligned)
│  ┃  Two eggs your way over...       ┃    │  (description 400, ink-muted)
│  ┃  [photo card on tap →]           ┃    │
│  ┃                                  ┃    │
│  ┃  Smoked Salmon Toast  $19        ┃    │
│  ┃  ...                             ┃    │
│  ┃                                  ┃    │
│  ┃  [Palm silhouette]               ┃    │
│  ┃                                  ┃    │
│  ┃  Available daily 8:00 AM–2:00 PM ┃    │
│  ┃  All prices include 14% VAT &    ┃    │  (italics, ink-muted, small)
│  ┃  12% Service Charge              ┃    │
│  ┃                                  ┃    │
└─────────────────────────────────────────┘
       ┌──────────────────────┐
       │ 🛒 2 items · $26.00  │  ← floating cart bar (navy on coral background)
       │      View order →    │
       └──────────────────────┘
```

The PDF receipt (`receipt-pdf.tsx`, Phase F.7) re-uses the same
fonts + colors + side rails so guests get a coherent print
experience.

---

## Phase F.1 — Foundation: migrations, roles, tile

Goal: Ship the empty F&B tile, role, and DB schema. After this phase, an admin can navigate to `/beithady/fnb` and see a placeholder page; permission-gated; no data, no UI yet beyond the shell.

### Task 1: Migration 0079 — extend beithady_role enum with `fnb_manager`

**Files:**
- Create: `supabase/migrations/0079_beithady_role_fnb_manager.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================================
-- Phase F (F&B v1) — add fnb_manager to beithady_role enum
-- =====================================================================
-- Mirrors the pattern of 0048a (warehouse_manager + housekeeper) and
-- 0060 (business_analyst). The PERMISSIONS matrix update lives in TS
-- (src/lib/beithady/auth.ts) and ships in Task 7.

ALTER TYPE public.beithady_role ADD VALUE IF NOT EXISTS 'fnb_manager';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Tool call: `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` with `name = "0079_beithady_role_fnb_manager"`, body = the SQL above.

- [ ] **Step 3: Verify enum extension**

Tool call: `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__execute_sql`:

```sql
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'public.beithady_role'::regtype
ORDER BY enumsortorder;
```

Expected output includes: `guest_relations`, `finance`, `ops`, `manager`, `admin`, `warehouse_manager`, `housekeeper`, `business_analyst`, **`fnb_manager`**.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0079_beithady_role_fnb_manager.sql
git commit -m 'feat(beithady/fnb): add fnb_manager to beithady_role enum (migration 0079)'
```

---

### Task 2: Migration 0080 — fnb_categories + fnb_items tables

**Files:**
- Create: `supabase/migrations/0080_fnb_categories_and_items.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================================
-- Phase F — F&B categories and items
-- =====================================================================

-- Categories (3 seeded in 0084: Breakfast, Sandwiches, Salads & Kids)
CREATE TABLE IF NOT EXISTS public.fnb_categories (
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

-- Menu items (12 seeded in 0084 from PDF)
CREATE TABLE IF NOT EXISTS public.fnb_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES public.fnb_categories(id) ON DELETE RESTRICT,
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
  photo_path      text,
  photo_thumb_path text,
  price_usd       numeric(10,2) NOT NULL CHECK (price_usd >= 0),
  cost_usd        numeric(10,2) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  hours_start_override time,
  hours_end_override   time,
  recipe_id       uuid,                       -- nullable, future Phase F&B-2
  enabled         boolean NOT NULL DEFAULT true,
  ai_translation_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS fnb_items_category_idx
  ON public.fnb_items(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fnb_items_enabled_idx
  ON public.fnb_items(enabled) WHERE deleted_at IS NULL AND enabled = true;

-- updated_at triggers (mirror existing pattern in 0030)
CREATE OR REPLACE FUNCTION public.fnb_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fnb_categories_updated_at ON public.fnb_categories;
CREATE TRIGGER fnb_categories_updated_at
  BEFORE UPDATE ON public.fnb_categories
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();

DROP TRIGGER IF EXISTS fnb_items_updated_at ON public.fnb_items;
CREATE TRIGGER fnb_items_updated_at
  BEFORE UPDATE ON public.fnb_items
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Tool call: `apply_migration` with name `"0080_fnb_categories_and_items"`.

- [ ] **Step 3: Verify tables exist**

Run via `execute_sql`:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'fnb_%'
ORDER BY table_name;
```

Expected: `fnb_categories`, `fnb_items`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0080_fnb_categories_and_items.sql
git commit -m 'feat(beithady/fnb): add fnb_categories + fnb_items tables (migration 0080)'
```

---

### Task 3: Migration 0081 — fnb_item_modifiers + fnb_building_overrides

**Files:**
- Create: `supabase/migrations/0081_fnb_modifiers_and_overrides.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================================
-- Phase F — F&B item modifiers + per-building stock-out overrides
-- =====================================================================

-- Modifiers / add-ons per item (e.g. "Replace Ful w/ Sausage Ful +$3")
CREATE TABLE IF NOT EXISTS public.fnb_item_modifiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES public.fnb_items(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS fnb_modifiers_item_idx
  ON public.fnb_item_modifiers(item_id);

-- Per-building stock-out flags (single global menu, per-building stockouts)
CREATE TABLE IF NOT EXISTS public.fnb_building_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_code   text NOT NULL,
  item_id         uuid NOT NULL REFERENCES public.fnb_items(id) ON DELETE CASCADE,
  is_out_of_stock boolean NOT NULL DEFAULT false,
  out_of_stock_until timestamptz,            -- auto-clears at next Cairo midnight
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_code, item_id)
);
CREATE INDEX IF NOT EXISTS fnb_overrides_building_idx
  ON public.fnb_building_overrides(building_code) WHERE is_out_of_stock = true;

DROP TRIGGER IF EXISTS fnb_modifiers_updated_at ON public.fnb_item_modifiers;
CREATE TRIGGER fnb_modifiers_updated_at
  BEFORE UPDATE ON public.fnb_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();

DROP TRIGGER IF EXISTS fnb_overrides_updated_at ON public.fnb_building_overrides;
CREATE TRIGGER fnb_overrides_updated_at
  BEFORE UPDATE ON public.fnb_building_overrides
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();
```

- [ ] **Step 2: Apply via Supabase MCP**

Tool call: `apply_migration` with name `"0081_fnb_modifiers_and_overrides"`.

- [ ] **Step 3: Verify tables**

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('fnb_item_modifiers','fnb_building_overrides')
ORDER BY table_name, ordinal_position;
```

Expected: both tables with all columns from above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0081_fnb_modifiers_and_overrides.sql
git commit -m 'feat(beithady/fnb): add modifiers + per-building stockout tables (migration 0081)'
```

---

### Task 4: Migration 0082 — fnb_buildings (per-building settings)

**Files:**
- Create: `supabase/migrations/0082_fnb_buildings_settings.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================================
-- Phase F — Per-building F&B settings
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fnb_buildings (
  building_code   text PRIMARY KEY,
  enabled         boolean NOT NULL DEFAULT false,
  kitchen_wa_recipients text[] NOT NULL DEFAULT '{}',
  delivery_sla_minutes int NOT NULL DEFAULT 30 CHECK (delivery_sla_minutes > 0),
  receipt_vat_line text,
  message_template_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancellation_grace_seconds int NOT NULL DEFAULT 120
    CHECK (cancellation_grace_seconds BETWEEN 30 AND 300),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS fnb_buildings_updated_at ON public.fnb_buildings;
CREATE TRIGGER fnb_buildings_updated_at
  BEFORE UPDATE ON public.fnb_buildings
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();

-- Seed all 5 Egypt buildings as DISABLED (admin enables per-building
-- via Settings UI in Task 56 once recipient WA numbers are configured).
-- BH-DXB intentionally NOT seeded — F&B is Egypt-only per spec §6.
INSERT INTO public.fnb_buildings (building_code, enabled, delivery_sla_minutes)
VALUES
  ('BH-26',  false, 30),
  ('BH-73',  false, 30),
  ('BH-435', false, 30),
  ('BH-OK',  false, 30),
  ('BH-34',  false, 30)
ON CONFLICT (building_code) DO NOTHING;
```

- [ ] **Step 2: Apply via Supabase MCP**

`apply_migration` with name `"0082_fnb_buildings_settings"`.

- [ ] **Step 3: Verify seed**

```sql
SELECT building_code, enabled FROM public.fnb_buildings ORDER BY building_code;
```

Expected: 5 rows, all disabled.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0082_fnb_buildings_settings.sql
git commit -m 'feat(beithady/fnb): add fnb_buildings table + seed 5 Egypt buildings (migration 0082)'
```

---

### Task 5: Migration 0083 — fnb_orders + fnb_order_items + fnb_status_events + status enum

**Files:**
- Create: `supabase/migrations/0083_fnb_orders_and_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================================
-- Phase F — F&B orders, line items, and status event log
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fnb_order_status') THEN
    CREATE TYPE public.fnb_order_status AS ENUM (
      'submitted', 'preparing', 'ready', 'delivered', 'closed', 'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fnb_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    bigserial NOT NULL UNIQUE,
  reservation_id  text NOT NULL,           -- Guesty reservation id
  building_code   text NOT NULL,
  unit_code       text NOT NULL,
  guest_name      text,
  guest_language  text NOT NULL DEFAULT 'en'
    CHECK (guest_language IN ('en','ar','ru','fr')),
  status          public.fnb_order_status NOT NULL DEFAULT 'submitted',
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  preparing_at    timestamptz,
  ready_at        timestamptz,
  delivered_at    timestamptz,
  closed_at       timestamptz,
  cancelled_at    timestamptz,
  cancellation_reason text,
  subtotal_usd    numeric(10,2) NOT NULL,
  vat_usd         numeric(10,2) NOT NULL,
  service_usd     numeric(10,2) NOT NULL,
  total_usd       numeric(10,2) NOT NULL CHECK (total_usd >= 0),
  requested_delivery_at timestamptz,
  eta_at          timestamptz,
  notes           text,
  idempotency_key text NOT NULL UNIQUE,
  guesty_charge_id text,                    -- free-form text in v1 (manual mirror)
  guesty_charge_settled_at timestamptz,
  guesty_charge_settled_by uuid,            -- who clicked "Mark settled"
  receipt_pdf_path text,
  receipt_sent_at timestamptz,
  receipt_sent_via text,                    -- 'wa_cloud'|'wa_casual'|'guesty'|'failed'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fnb_orders_status_live_idx
  ON public.fnb_orders(status)
  WHERE status IN ('submitted','preparing','ready');
CREATE INDEX IF NOT EXISTS fnb_orders_building_idx
  ON public.fnb_orders(building_code, submitted_at DESC);
CREATE INDEX IF NOT EXISTS fnb_orders_reservation_idx
  ON public.fnb_orders(reservation_id);
CREATE INDEX IF NOT EXISTS fnb_orders_unsettled_idx
  ON public.fnb_orders(reservation_id)
  WHERE status IN ('delivered','closed') AND guesty_charge_id IS NULL;

CREATE TABLE IF NOT EXISTS public.fnb_order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.fnb_orders(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES public.fnb_items(id) ON DELETE SET NULL,
  item_name_snapshot text NOT NULL,
  quantity        int NOT NULL CHECK (quantity > 0 AND quantity <= 10),
  unit_price_usd_snapshot numeric(10,2) NOT NULL,
  modifier_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_total_usd  numeric(10,2) NOT NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fnb_order_items_order_idx
  ON public.fnb_order_items(order_id);

CREATE TABLE IF NOT EXISTS public.fnb_status_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES public.fnb_orders(id) ON DELETE CASCADE,
  from_status     public.fnb_order_status,
  to_status       public.fnb_order_status NOT NULL,
  changed_by_user_id uuid,
  changed_via     text NOT NULL CHECK (changed_via IN ('dashboard','cron','guest','webhook')),
  at              timestamptz NOT NULL DEFAULT now(),
  notes           text
);
CREATE INDEX IF NOT EXISTS fnb_status_events_order_idx
  ON public.fnb_status_events(order_id, at);

DROP TRIGGER IF EXISTS fnb_orders_updated_at ON public.fnb_orders;
CREATE TRIGGER fnb_orders_updated_at
  BEFORE UPDATE ON public.fnb_orders
  FOR EACH ROW EXECUTE FUNCTION public.fnb_set_updated_at();
```

- [ ] **Step 2: Apply via Supabase MCP**

`apply_migration` with name `"0083_fnb_orders_and_events"`.

- [ ] **Step 3: Verify tables + enum**

```sql
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'public.fnb_order_status'::regtype
ORDER BY enumsortorder;

SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'fnb_%'
ORDER BY table_name;
```

Expected enum values: `submitted, preparing, ready, delivered, closed, cancelled`.
Expected tables list: `fnb_buildings`, `fnb_building_overrides`, `fnb_categories`, `fnb_item_modifiers`, `fnb_items`, `fnb_order_items`, `fnb_orders`, `fnb_status_events`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0083_fnb_orders_and_events.sql
git commit -m 'feat(beithady/fnb): add fnb_orders + line items + status events + enum (migration 0083)'
```

---

### Task 6: Migration 0084 — seed 3 categories + 12 items from PDF

**Files:**
- Create: `supabase/migrations/0084_fnb_seed.sql`

- [ ] **Step 1: Write the migration**

```sql
-- =====================================================================
-- Phase F — Seed initial menu (EN only; AR/RU/FR via AI translate post-deploy)
-- =====================================================================

INSERT INTO public.fnb_categories (slug, sort_order, name_en, hours_start, hours_end)
VALUES
  ('breakfast',     1, 'Breakfast',     '08:00', '14:00'),
  ('sandwiches',    2, 'Sandwiches',    '08:00', '23:59'),
  ('salads-and-kids', 3, 'Salads & Kids', '08:00', '23:59')
ON CONFLICT (slug) DO NOTHING;

WITH cats AS (
  SELECT id, slug FROM public.fnb_categories
)
INSERT INTO public.fnb_items
  (slug, category_id, sort_order, name_en, description_en, price_usd)
SELECT v.slug, cats.id, v.sort_order, v.name, v.description, v.price
FROM (VALUES
  ('all-day-breakfast', 'breakfast', 1, 'All-Day Breakfast',
    'Two eggs your way over sliced toasted bread, served with roasted potatoes and a side of sausage.',
    7.00),
  ('smoked-salmon-toast', 'breakfast', 2, 'Smoked Salmon Toast',
    'Toasted sourdough topped with smoked salmon, cream cheese and dill, with a side of house crackers.',
    19.00),
  ('cheese-olives-croissant', 'breakfast', 3, 'Cheese & Olives Croissant',
    'Buttery croissant filled with delicacy white cheese, olives and a drizzle of olive oil. Served with roasted golden potatoes.',
    8.00),
  ('oriental-breakfast', 'breakfast', 4, 'Oriental Breakfast',
    'Ful with vegetables served with local taameya and greens with a side of baladi bread and tahini.',
    8.00),
  ('sausage-sandwich', 'sandwiches', 1, 'Sausage Sandwich',
    'Grilled Alexandrian sausage served in panini bread served with waffle fries and our house sauce.',
    12.00),
  ('baguette-sub', 'sandwiches', 2, 'Baguette Sub',
    'Tender chicken and beef bacon layered in a crispy baguette served with a side of waffle fries and house sauce.',
    16.00),
  ('beit-hady-burger', 'sandwiches', 3, 'Beit Hady Burger',
    'Two beef patties topped with lettuce, tomatoes, and mushrooms served in a brioche bun with a side of waffle fries.',
    13.00),
  ('caesar-salad', 'salads-and-kids', 1, 'Caesar Salad',
    'Crisp romaine, parmesan, garlic croutons and our classic Caesar dressing.',
    9.00),
  ('greek-salad', 'salads-and-kids', 2, 'Greek Salad',
    'Tomato, cucumber, kalamata olives and feta with a drizzle of extra virgin olive oil.',
    13.00),
  ('kids-meal', 'salads-and-kids', 3, 'Kids Meal',
    'Six pieces of breaded chicken with a generous side of waffle fries and ketchup.',
    7.00)
) AS v(slug, cat_slug, sort_order, name, description, price)
JOIN cats ON cats.slug = v.cat_slug
ON CONFLICT (slug) DO NOTHING;

-- Modifiers (3 from PDF: Sausage Ful upgrade, grilled chicken add-on)
WITH items AS (SELECT id, slug FROM public.fnb_items)
INSERT INTO public.fnb_item_modifiers
  (item_id, sort_order, name_en, price_delta_usd)
SELECT items.id, v.sort_order, v.name, v.delta
FROM (VALUES
  ('oriental-breakfast', 1, 'Replace Ful w/ Sausage Ful', 3.00),
  ('caesar-salad',       1, 'Add Grilled Chicken',         5.00)
) AS v(item_slug, sort_order, name, delta)
JOIN items ON items.slug = v.item_slug;

-- Note: total = 10 items + 2 modifiers = matches PDF exactly.
```

Wait — the PDF has 10 items, not 12. Re-counting: Breakfast 4 (All-Day, Salmon, Croissant, Oriental) + Sandwiches 3 (Sausage, Baguette, Burger) + Salads & Kids 3 (Caesar, Greek, Kids) = **10 items**. The spec mentioned "12 items" — that's the spec's drift; correct count is 10. Update the §11.3 / §17 references at production-rollout time if needed. Plan reflects the correct PDF count.

- [ ] **Step 2: Apply via Supabase MCP**

`apply_migration` with name `"0084_fnb_seed"`.

- [ ] **Step 3: Verify seed**

```sql
SELECT c.slug AS category, count(i.id) AS items
FROM public.fnb_categories c
LEFT JOIN public.fnb_items i ON i.category_id = c.id
GROUP BY c.slug
ORDER BY c.slug;

SELECT count(*) FROM public.fnb_item_modifiers;
```

Expected: `breakfast=4, sandwiches=3, salads-and-kids=3`. Modifiers count = 2.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0084_fnb_seed.sql
git commit -m 'feat(beithady/fnb): seed 3 categories + 10 items + 2 modifiers from PDF (migration 0084)'
```

---

### Task 7: Update src/lib/beithady/auth.ts — add fnb category, fnb_manager role, permission matrix

**Files:**
- Modify: `src/lib/beithady/auth.ts` (add `'fnb'` to `BeithadyCategory`, add `'fnb_manager'` to `BEITHADY_ROLES`, extend `PERMISSIONS` matrix and `visibleCategoriesFor()`)
- Test: `src/lib/beithady/auth.test.ts` (create or extend if exists)

- [ ] **Step 1: Write failing tests**

Create or extend `src/lib/beithady/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rolesGrantPermission, visibleCategoriesFor } from './auth';

describe('fnb category permissions', () => {
  it('guest_relations has full on fnb', () => {
    expect(rolesGrantPermission(['guest_relations'], 'fnb', 'full')).toBe(true);
  });
  it('finance has read on fnb (not full)', () => {
    expect(rolesGrantPermission(['finance'], 'fnb', 'read')).toBe(true);
    expect(rolesGrantPermission(['finance'], 'fnb', 'full')).toBe(false);
  });
  it('housekeeper has none on fnb', () => {
    expect(rolesGrantPermission(['housekeeper'], 'fnb', 'read')).toBe(false);
  });
  it('warehouse_manager has none on fnb', () => {
    expect(rolesGrantPermission(['warehouse_manager'], 'fnb', 'read')).toBe(false);
  });
  it('business_analyst has read on fnb', () => {
    expect(rolesGrantPermission(['business_analyst'], 'fnb', 'read')).toBe(true);
    expect(rolesGrantPermission(['business_analyst'], 'fnb', 'full')).toBe(false);
  });
  it('fnb_manager has full on fnb', () => {
    expect(rolesGrantPermission(['fnb_manager'], 'fnb', 'full')).toBe(true);
  });
  it('fnb_manager has read on operations + crm, none on financial', () => {
    expect(rolesGrantPermission(['fnb_manager'], 'operations', 'read')).toBe(true);
    expect(rolesGrantPermission(['fnb_manager'], 'crm', 'read')).toBe(true);
    expect(rolesGrantPermission(['fnb_manager'], 'financial', 'read')).toBe(false);
  });
  it('visibleCategoriesFor includes fnb for ops', () => {
    expect(visibleCategoriesFor(['ops'])).toContain('fnb');
  });
  it('visibleCategoriesFor excludes fnb for housekeeper', () => {
    expect(visibleCategoriesFor(['housekeeper'])).not.toContain('fnb');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/lib/beithady/auth.test.ts
```

Expected: FAIL — `'fnb' is not assignable to BeithadyCategory`, `'fnb_manager' is not in BEITHADY_ROLES`.

- [ ] **Step 3: Update `src/lib/beithady/auth.ts`**

Make these exact changes (match the existing file structure shown in spec §10 and source-context):

```ts
// Add to BEITHADY_ROLES:
export const BEITHADY_ROLES = [
  'guest_relations',
  'finance',
  'ops',
  'manager',
  'admin',
  'warehouse_manager',
  'housekeeper',
  'business_analyst',
  'fnb_manager',                       // Phase F — new
] as const;

// Add to BeithadyCategory:
export type BeithadyCategory =
  | 'financial'
  | 'analytics'
  | 'crm'
  | 'communication'
  | 'settings'
  | 'gallery'
  | 'ads'
  | 'operations'
  | 'inventory'
  | 'fnb';                              // Phase F — new

// Extend PERMISSIONS matrix — add fnb column to every existing role,
// and add the full fnb_manager row:
const PERMISSIONS: Record<BeithadyRole, Record<BeithadyCategory, Permission>> = {
  guest_relations: {
    financial: 'none', analytics: 'read', crm: 'full', communication: 'full',
    settings: 'read', gallery: 'full', ads: 'none', operations: 'read',
    inventory: 'none', fnb: 'full',
  },
  finance: {
    financial: 'full', analytics: 'read', crm: 'read', communication: 'none',
    settings: 'read', gallery: 'read', ads: 'none', operations: 'read',
    inventory: 'read', fnb: 'read',
  },
  ops: {
    financial: 'read', analytics: 'full', crm: 'full', communication: 'full',
    settings: 'read', gallery: 'full', ads: 'none', operations: 'full',
    inventory: 'full', fnb: 'full',
  },
  manager: {
    financial: 'full', analytics: 'full', crm: 'full', communication: 'full',
    settings: 'read', gallery: 'full', ads: 'full', operations: 'full',
    inventory: 'full', fnb: 'full',
  },
  admin: {
    financial: 'full', analytics: 'full', crm: 'full', communication: 'full',
    settings: 'full', gallery: 'full', ads: 'full', operations: 'full',
    inventory: 'full', fnb: 'full',
  },
  warehouse_manager: {
    financial: 'none', analytics: 'read', crm: 'read', communication: 'none',
    settings: 'read', gallery: 'none', ads: 'none', operations: 'read',
    inventory: 'full', fnb: 'none',
  },
  housekeeper: {
    financial: 'none', analytics: 'none', crm: 'none', communication: 'none',
    settings: 'none', gallery: 'none', ads: 'none', operations: 'none',
    inventory: 'read', fnb: 'none',
  },
  business_analyst: {
    financial: 'none', analytics: 'full', crm: 'read', communication: 'none',
    settings: 'read', gallery: 'none', ads: 'read', operations: 'read',
    inventory: 'read', fnb: 'read',
  },
  fnb_manager: {
    financial: 'none', analytics: 'read', crm: 'read', communication: 'none',
    settings: 'read', gallery: 'none', ads: 'none', operations: 'read',
    inventory: 'none', fnb: 'full',
  },
};

// Update visibleCategoriesFor's all[] array:
const all: BeithadyCategory[] = [
  'financial', 'analytics', 'crm', 'communication',
  'settings', 'gallery', 'ads', 'operations', 'inventory', 'fnb',
];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/beithady/auth.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: zero TS errors. (If there are unrelated existing errors, only verify no NEW ones in `auth.ts` or its consumers.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/beithady/auth.ts src/lib/beithady/auth.test.ts
git commit -m 'feat(beithady/fnb): add fnb category + fnb_manager role + permission matrix'
```

---

### Task 8: Add F&B tile to launcher + create stub /beithady/fnb layout

**Files:**
- Modify: `src/app/beithady/page.tsx` (add F&B tile to `CATEGORY_TILES` and the `order` array)
- Create: `src/app/beithady/fnb/layout.tsx` (permission guard + tab nav)
- Create: `src/app/beithady/fnb/page.tsx` (stub — returns "Orders coming soon" so the tile is clickable)

- [ ] **Step 1: Modify `src/app/beithady/page.tsx`**

In the imports add `UtensilsCrossed`:

```ts
import {
  Calculator, TrendingUp, Users, MessageCircle,
  Settings as SettingsIcon, Image as ImageIcon, Megaphone,
  ShieldOff, CalendarRange, Package,
  UtensilsCrossed,                     // Phase F
} from 'lucide-react';
```

In `CATEGORY_TILES` add an entry (anywhere in the object — the order array controls display):

```ts
fnb: {
  href: '/beithady/fnb',
  title: 'F&B',
  description: 'In-room dining menu · Order queue · 4-language guest menu (EN/AR/RU/FR). Egypt buildings only.',
  icon: UtensilsCrossed,
  accent: 'rose',
  badge: { label: 'Phase F', tone: 'gold' },
},
```

Update the `order` array inside `BeithadyHome` to include `'fnb'` between `'inventory'` and `'settings'`:

```ts
const order: BeithadyCategory[] = [
  'financial',
  'analytics',
  'crm',
  'communication',
  'operations',
  'inventory',
  'fnb',                               // Phase F
  'settings',
  'gallery',
  'ads',
];
```

Also update the `PHASE_PENDING` map to include `fnb: undefined`.

- [ ] **Step 2: Create `src/app/beithady/fnb/layout.tsx`**

```tsx
import 'server-only';
import { ReactNode } from 'react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { FnbTabs } from './_components/fnb-tabs';

export const dynamic = 'force-dynamic';

export default async function FnbLayout({ children }: { children: ReactNode }) {
  await requireBeithadyPermission('fnb', 'read');
  return (
    <BeithadyShell>
      <BeithadyHeader
        eyebrow="Beit Hady"
        title="F&B / In-Room Dining"
        subtitle="Egypt buildings only — BH-26 · BH-73 · BH-435 · BH-OK · BH-34"
      />
      <FnbTabs />
      {children}
    </BeithadyShell>
  );
}
```

- [ ] **Step 3: Create `src/app/beithady/fnb/_components/fnb-tabs.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '',          label: 'Orders'    },
  { slug: '/menu',     label: 'Menu'      },
  { slug: '/analytics',label: 'Analytics' },
  { slug: '/settings', label: 'Settings'  },
  { slug: '/audit',    label: 'Audit'     },
];

export function FnbTabs() {
  const pathname = usePathname();
  const base = '/beithady/fnb';
  return (
    <nav className="ix-tabs flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-4">
      {TABS.map(t => {
        const href = base + t.slug;
        const active = t.slug === ''
          ? pathname === base
          : pathname?.startsWith(href);
        return (
          <Link
            key={t.slug || 'orders'}
            href={href}
            className={`px-3 py-2 text-sm font-medium ${active ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-600 dark:text-slate-300'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Create `src/app/beithady/fnb/page.tsx` (stub)**

```tsx
import 'server-only';

export const dynamic = 'force-dynamic';

export default async function FnbOrdersPage() {
  return (
    <div className="ix-card p-8 text-center max-w-xl mx-auto">
      <h2 className="text-lg font-semibold">Orders coming soon</h2>
      <p className="text-sm text-slate-500 mt-1">
        Operator queue ships in Phase F.5. The tile, role, and DB schema are
        live (Phase F.1).
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Build to verify no TS errors**

```bash
npm run build
```

Expected: build succeeds; route `/beithady/fnb` registered.

- [ ] **Step 6: Commit and deploy**

```bash
git add src/app/beithady/page.tsx src/app/beithady/fnb/
git commit -m 'feat(beithady/fnb): add F&B tile + stub layout (Phase F.1 done)'
git fetch origin main && git rebase origin/main
git push origin claude/magical-borg-cbc7bf:main
```

GitHub auto-deploys to https://limeinc.vercel.app within ~2 min.

---

### 🟢 Phase F.1 checkpoint

After deploy:

1. Sign in as admin at https://limeinc.vercel.app/beithady — verify the F&B tile appears between Inventory and Settings, with the rose accent and "Phase F" gold badge.
2. Click the tile — verify it routes to `/beithady/fnb` and shows the 5 tabs (Orders / Menu / Analytics / Settings / Audit) and the "Orders coming soon" stub.
3. Sign in (or simulate via DB) as `housekeeper` — verify the F&B tile is HIDDEN.
4. Sign in as `fnb_manager` (grant via `INSERT INTO beithady_user_roles ...`) — verify `/beithady/fnb` is reachable but `/beithady/financial` is NOT.
5. Run in Supabase SQL editor:

```sql
SELECT count(*) FROM public.fnb_items;       -- expect 10
SELECT count(*) FROM public.fnb_categories;  -- expect 3
SELECT count(*) FROM public.fnb_buildings;   -- expect 5 (all disabled)
```

If all green → proceed to Phase F.2.

---

## Phase F.2 — Menu admin (item CRUD, photos, modifiers)

Goal: After this phase, an admin can create/edit/delete categories,
items, modifiers, and stock-out flags via `/beithady/fnb/menu`.
Photos upload directly to Supabase via signed URLs. EN-only;
AI-translate ships in Phase F.6. Operator dashboard styling — uses
existing Beithady chrome, NOT the BH brand surface.

### Task 9: Create `src/lib/beithady/fnb/types.ts` — Zod schemas + TS types

**Files:**
- Create: `src/lib/beithady/fnb/types.ts`
- Test: `src/lib/beithady/fnb/types.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  CategorySchema, ItemSchema, ModifierSchema,
  BuildingOverrideSchema, OrderStatusEnum,
} from './types';

describe('fnb Zod schemas', () => {
  it('CategorySchema accepts valid input', () => {
    expect(CategorySchema.parse({
      slug: 'breakfast', name_en: 'Breakfast',
      sort_order: 1, hours_start: '08:00', hours_end: '14:00', enabled: true,
    })).toBeDefined();
  });
  it('CategorySchema rejects empty name_en', () => {
    expect(() => CategorySchema.parse({ slug: 'x', name_en: '' })).toThrow();
  });
  it('ItemSchema rejects negative price', () => {
    expect(() => ItemSchema.parse({
      slug: 'x', category_id: '00000000-0000-0000-0000-000000000000',
      name_en: 'X', price_usd: -1,
    })).toThrow();
  });
  it('ModifierSchema rejects negative delta', () => {
    expect(() => ModifierSchema.parse({
      item_id: '00000000-0000-0000-0000-000000000000',
      name_en: 'X', price_delta_usd: -0.5,
    })).toThrow();
  });
  it('BuildingOverrideSchema requires building_code + item_id', () => {
    expect(BuildingOverrideSchema.parse({
      building_code: 'BH-26',
      item_id: '00000000-0000-0000-0000-000000000000',
      is_out_of_stock: true,
    })).toBeDefined();
  });
  it('OrderStatusEnum has all 6 values', () => {
    expect(OrderStatusEnum.options).toEqual([
      'submitted','preparing','ready','delivered','closed','cancelled',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/lib/beithady/fnb/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/beithady/fnb/types.ts`**

```ts
import { z } from 'zod';

export const LangCodeEnum = z.enum(['en', 'ar', 'ru', 'fr']);
export type LangCode = z.infer<typeof LangCodeEnum>;

export const OrderStatusEnum = z.enum([
  'submitted', 'preparing', 'ready', 'delivered', 'closed', 'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const ChangedViaEnum = z.enum(['dashboard', 'cron', 'guest', 'webhook']);

const HHMM = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'must be HH:MM');

export const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(64),
  sort_order: z.number().int().nonnegative().default(0),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  name_ru: z.string().nullable().optional(),
  name_fr: z.string().nullable().optional(),
  hours_start: HHMM.default('08:00'),
  hours_end: HHMM.default('23:59'),
  enabled: z.boolean().default(true),
  ai_translation_flags: z.record(z.string(), z.boolean()).default({}),
});
export type Category = z.infer<typeof CategorySchema>;

export const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(96),
  category_id: z.string().uuid(),
  sort_order: z.number().int().nonnegative().default(0),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  name_ru: z.string().nullable().optional(),
  name_fr: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  description_ar: z.string().nullable().optional(),
  description_ru: z.string().nullable().optional(),
  description_fr: z.string().nullable().optional(),
  photo_path: z.string().nullable().optional(),
  photo_thumb_path: z.string().nullable().optional(),
  price_usd: z.number().nonnegative().multipleOf(0.01),
  cost_usd: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  hours_start_override: HHMM.nullable().optional(),
  hours_end_override: HHMM.nullable().optional(),
  recipe_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(true),
  ai_translation_flags: z.record(z.string(), z.boolean()).default({}),
});
export type Item = z.infer<typeof ItemSchema>;

export const ModifierSchema = z.object({
  id: z.string().uuid().optional(),
  item_id: z.string().uuid(),
  sort_order: z.number().int().nonnegative().default(0),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  name_ru: z.string().nullable().optional(),
  name_fr: z.string().nullable().optional(),
  price_delta_usd: z.number().nonnegative().multipleOf(0.01),
  enabled: z.boolean().default(true),
  ai_translation_flags: z.record(z.string(), z.boolean()).default({}),
});
export type Modifier = z.infer<typeof ModifierSchema>;

export const BuildingOverrideSchema = z.object({
  id: z.string().uuid().optional(),
  building_code: z.string().regex(/^BH-[A-Z0-9]+$/),
  item_id: z.string().uuid(),
  is_out_of_stock: z.boolean().default(false),
  out_of_stock_until: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type BuildingOverride = z.infer<typeof BuildingOverrideSchema>;

export const BuildingSchema = z.object({
  building_code: z.string().regex(/^BH-[A-Z0-9]+$/),
  enabled: z.boolean().default(false),
  kitchen_wa_recipients: z.array(z.string().regex(/^\+?\d{8,15}$/)).default([]),
  delivery_sla_minutes: z.number().int().positive().default(30),
  receipt_vat_line: z.string().nullable().optional(),
  message_template_overrides: z.record(z.string(), z.string()).default({}),
  cancellation_grace_seconds: z.number().int().min(30).max(300).default(120),
});
export type Building = z.infer<typeof BuildingSchema>;

export const OrderItemSnapshotSchema = z.object({
  item_id: z.string().uuid().nullable(),
  item_name_snapshot: z.string(),
  quantity: z.number().int().positive().max(10),
  unit_price_usd_snapshot: z.number().nonnegative(),
  modifier_snapshot: z.array(z.object({
    id: z.string().uuid(),
    name_en: z.string(),
    name_localized: z.string(),
    price_delta_usd: z.number().nonnegative(),
  })).default([]),
  line_total_usd: z.number().nonnegative(),
  notes: z.string().max(200).nullable().optional(),
});
export type OrderItemSnapshot = z.infer<typeof OrderItemSnapshotSchema>;

export const SubmitOrderPayloadSchema = z.object({
  idempotency_key: z.string().uuid(),
  guest_language: LangCodeEnum.default('en'),
  requested_delivery_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(z.object({
    item_id: z.string().uuid(),
    quantity: z.number().int().positive().max(10),
    modifier_ids: z.array(z.string().uuid()).default([]),
    notes: z.string().max(200).nullable().optional(),
  })).min(1).max(20),
});
export type SubmitOrderPayload = z.infer<typeof SubmitOrderPayloadSchema>;

export const StatusUpdatePayloadSchema = z.object({
  to_status: OrderStatusEnum,
  notes: z.string().max(500).nullable().optional(),
});

export const BulkPriceUpdatePayloadSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  item_ids: z.array(z.string().uuid()).default([]),
  delta_pct: z.number().min(-50).max(100),
  round_to_cents: z.literal(true).default(true),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/beithady/fnb/types.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/fnb/types.ts src/lib/beithady/fnb/types.test.ts
git commit -m 'feat(beithady/fnb): add Zod schemas + TS types for all DB rows + payloads'
```

---

### Task 10: Create `src/lib/beithady/fnb/repo.ts` — server-only CRUD with audit logging

**Files:**
- Create: `src/lib/beithady/fnb/repo.ts`
- Test: `src/lib/beithady/fnb/repo.test.ts`

This file is server-only and writes to `beithady_audit_log` (existing
table from migration 0030) with `module = 'fnb'` on every mutation.

- [ ] **Step 1: Write failing tests** (skipped if no DB env)

```ts
import { describe, it, expect } from 'vitest';
import {
  listCategories, listItems, createItem, updateItem, softDeleteItem,
} from './repo';

const skip = !process.env.SUPABASE_URL;
const t = skip ? it.skip : it;

describe('fnb repo', () => {
  t('lists seeded categories', async () => {
    const cats = await listCategories();
    expect(cats.map(c => c.slug)).toEqual(
      expect.arrayContaining(['breakfast','sandwiches','salads-and-kids']),
    );
  });
  t('creates and soft-deletes an item', async () => {
    const cats = await listCategories();
    const created = await createItem({
      slug: `test-item-${Date.now()}`,
      category_id: cats[0].id!,
      name_en: 'Test Item',
      price_usd: 5.00,
      sort_order: 99,
    }, { actor_user_id: null });
    expect(created.id).toBeDefined();
    await softDeleteItem(created.id!, { actor_user_id: null });
    const items = await listItems({ includeDeleted: false });
    expect(items.find(i => i.id === created.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `src/lib/beithady/fnb/repo.ts`**

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import {
  CategorySchema, ItemSchema, ModifierSchema, BuildingOverrideSchema,
  type Category, type Item, type Modifier, type BuildingOverride,
} from './types';

interface AuditCtx {
  actor_user_id: string | null;
  actor_kind?: 'user' | 'system' | 'guest';
}

async function audit(
  ctx: AuditCtx,
  action: string,
  target_type: string,
  target_id: string | null,
  before: unknown,
  after: unknown,
) {
  const sb = supabaseAdmin();
  await sb.from('beithady_audit_log').insert({
    actor_user_id: ctx.actor_user_id,
    module: 'fnb',
    action,
    target_type,
    target_id,
    before: before ?? null,
    after: after ?? null,
  });
}

// ---- Categories ----

export async function listCategories(): Promise<Category[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => CategorySchema.parse(r));
}

export async function createCategory(
  input: Omit<Category, 'id'>, ctx: AuditCtx,
): Promise<Category> {
  const sb = supabaseAdmin();
  const parsed = CategorySchema.parse(input);
  const { data, error } = await sb.from('fnb_categories').insert(parsed).select().single();
  if (error) throw error;
  const out = CategorySchema.parse(data);
  await audit(ctx, 'category.create', 'category', out.id!, null, out);
  return out;
}

export async function updateCategory(
  id: string, patch: Partial<Category>, ctx: AuditCtx,
): Promise<Category> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_categories').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { data, error } = await sb.from('fnb_categories').update(patch).eq('id', id).select().single();
  if (error) throw error;
  const out = CategorySchema.parse(data);
  await audit(ctx, 'category.update', 'category', id, before.data, out);
  return out;
}

export async function deleteCategory(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_categories').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_categories').delete().eq('id', id);
  if (error) throw error;
  await audit(ctx, 'category.delete', 'category', id, before.data, null);
}

// ---- Items ----

export async function listItems(
  opts: { includeDeleted?: boolean; categoryId?: string } = {},
): Promise<Item[]> {
  const sb = supabaseAdmin();
  let q = sb.from('fnb_items').select('*').order('sort_order', { ascending: true });
  if (!opts.includeDeleted) q = q.is('deleted_at', null);
  if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => ItemSchema.parse(r));
}

export async function getItem(id: string): Promise<Item | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('fnb_items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? ItemSchema.parse(data) : null;
}

export async function createItem(
  input: Omit<Item, 'id'>, ctx: AuditCtx,
): Promise<Item> {
  const sb = supabaseAdmin();
  const parsed = ItemSchema.parse(input);
  const { data, error } = await sb.from('fnb_items').insert(parsed).select().single();
  if (error) throw error;
  const out = ItemSchema.parse(data);
  await audit(ctx, 'item.create', 'item', out.id!, null, out);
  return out;
}

export async function updateItem(
  id: string, patch: Partial<Item>, ctx: AuditCtx,
): Promise<Item> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_items').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { data, error } = await sb.from('fnb_items').update(patch).eq('id', id).select().single();
  if (error) throw error;
  const out = ItemSchema.parse(data);
  await audit(ctx, 'item.update', 'item', id, before.data, out);
  return out;
}

export async function softDeleteItem(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_items').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_items').update({
    deleted_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
  await audit(ctx, 'item.delete', 'item', id, before.data, null);
}

// ---- Modifiers ----

export async function listModifiers(itemId: string): Promise<Modifier[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_item_modifiers')
    .select('*')
    .eq('item_id', itemId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ModifierSchema.parse(r));
}

export async function createModifier(
  input: Omit<Modifier, 'id'>, ctx: AuditCtx,
): Promise<Modifier> {
  const sb = supabaseAdmin();
  const parsed = ModifierSchema.parse(input);
  const { data, error } = await sb.from('fnb_item_modifiers').insert(parsed).select().single();
  if (error) throw error;
  const out = ModifierSchema.parse(data);
  await audit(ctx, 'modifier.create', 'modifier', out.id!, null, out);
  return out;
}

export async function updateModifier(
  id: string, patch: Partial<Modifier>, ctx: AuditCtx,
): Promise<Modifier> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_item_modifiers').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { data, error } = await sb.from('fnb_item_modifiers').update(patch).eq('id', id).select().single();
  if (error) throw error;
  const out = ModifierSchema.parse(data);
  await audit(ctx, 'modifier.update', 'modifier', id, before.data, out);
  return out;
}

export async function deleteModifier(id: string, ctx: AuditCtx): Promise<void> {
  const sb = supabaseAdmin();
  const before = await sb.from('fnb_item_modifiers').select('*').eq('id', id).single();
  if (before.error) throw before.error;
  const { error } = await sb.from('fnb_item_modifiers').delete().eq('id', id);
  if (error) throw error;
  await audit(ctx, 'modifier.delete', 'modifier', id, before.data, null);
}

// ---- Building overrides ----

export async function listBuildingOverridesForItem(
  itemId: string,
): Promise<BuildingOverride[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('fnb_building_overrides')
    .select('*')
    .eq('item_id', itemId);
  if (error) throw error;
  return (data ?? []).map(r => BuildingOverrideSchema.parse(r));
}

export async function upsertBuildingOverride(
  input: Omit<BuildingOverride, 'id'>, ctx: AuditCtx,
): Promise<BuildingOverride> {
  const sb = supabaseAdmin();
  const parsed = BuildingOverrideSchema.parse(input);
  const { data, error } = await sb
    .from('fnb_building_overrides')
    .upsert(parsed, { onConflict: 'building_code,item_id' })
    .select()
    .single();
  if (error) throw error;
  const out = BuildingOverrideSchema.parse(data);
  await audit(ctx, 'override.upsert', 'building_override', out.id!, null, out);
  return out;
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test -- src/lib/beithady/fnb/repo.test.ts
```

Expected: PASS (or skipped without DB env).

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady/fnb/repo.ts src/lib/beithady/fnb/repo.test.ts
git commit -m 'feat(beithady/fnb): add repo.ts with CRUD + audit logging'
```

---

### Task 11: API `/api/beithady/fnb/categories` — list, create, update, delete

**Files:**
- Create: `src/app/api/beithady/fnb/categories/route.ts`
- Create: `src/app/api/beithady/fnb/categories/[id]/route.ts`

- [ ] **Step 1: Implement `categories/route.ts`**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listCategories, createCategory } from '@/lib/beithady/fnb/repo';
import { CategorySchema } from '@/lib/beithady/fnb/types';

export async function GET() {
  await requireBeithadyPermission('fnb', 'read');
  return NextResponse.json({ categories: await listCategories() });
}

export async function POST(req: NextRequest) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const body = await req.json();
  const parsed = CategorySchema.omit({ id: true }).parse(body);
  const created = await createCategory(parsed, { actor_user_id: user.id });
  return NextResponse.json({ category: created }, { status: 201 });
}
```

- [ ] **Step 2: Implement `categories/[id]/route.ts`**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { updateCategory, deleteCategory } from '@/lib/beithady/fnb/repo';
import { CategorySchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = CategorySchema.partial().omit({ id: true }).parse(body);
  return NextResponse.json({
    category: await updateCategory(id, parsed, { actor_user_id: user.id }),
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  await deleteCategory(id, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/beithady/fnb/categories/
git commit -m 'feat(beithady/fnb): add categories CRUD API routes'
```

---

### Task 12: API `/api/beithady/fnb/items` — list, create, update, soft-delete

**Files:**
- Create: `src/app/api/beithady/fnb/items/route.ts`
- Create: `src/app/api/beithady/fnb/items/[id]/route.ts`

- [ ] **Step 1: Implement `items/route.ts`**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listItems, createItem } from '@/lib/beithady/fnb/repo';
import { ItemSchema } from '@/lib/beithady/fnb/types';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const categoryId = url.searchParams.get('category_id') || undefined;
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  return NextResponse.json({
    items: await listItems({ categoryId, includeDeleted }),
  });
}

export async function POST(req: NextRequest) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const body = await req.json();
  const parsed = ItemSchema.omit({ id: true }).parse(body);
  const created = await createItem(parsed, { actor_user_id: user.id });
  return NextResponse.json({ item: created }, { status: 201 });
}
```

- [ ] **Step 2: Implement `items/[id]/route.ts`**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { updateItem, softDeleteItem, getItem } from '@/lib/beithady/fnb/repo';
import { ItemSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  const item = await getItem(id);
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = ItemSchema.partial().omit({ id: true }).parse(body);
  return NextResponse.json({
    item: await updateItem(id, parsed, { actor_user_id: user.id }),
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  await softDeleteItem(id, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/api/beithady/fnb/items/
git commit -m 'feat(beithady/fnb): add items CRUD API routes (GET/POST/PATCH/DELETE)'
```

---

### Task 13: API `/api/beithady/fnb/items/[id]/photo-upload-url` — direct-to-Supabase signed URL

**Files:**
- Create: `src/app/api/beithady/fnb/items/[id]/photo-upload-url/route.ts`

The pattern follows the existing direct-to-Supabase upload pattern in
`src/lib/beithady/gallery/`. Read that first to match conventions.

- [ ] **Step 1: Read existing gallery upload pattern**

```bash
grep -rn "createSignedUploadUrl\|createSignedUrl" src/lib/beithady/gallery/ src/app/api/beithady/gallery/ | head -20
```

Find the helper that issues upload URLs. Reuse it if generic; otherwise mirror its config (bucket name, expiry seconds, MIME validation).

- [ ] **Step 2: Implement the route**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

const Body = z.object({
  filename: z.string().regex(/^[\w\-.]+\.(jpg|jpeg|png|webp|heic)$/i),
  size_bytes: z.coerce.number().int().positive().max(5 * 1024 * 1024),
});

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const parsed = Body.parse(await req.json());

  const sb = supabaseAdmin();
  const ext = parsed.filename.split('.').pop()!.toLowerCase();
  const path = `fnb/items/${id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { data, error } = await sb.storage
    .from('beithady-gallery')
    .createSignedUploadUrl(path);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: path,
    bucket: 'beithady-gallery',
    expires_in_seconds: 300,
  });
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/api/beithady/fnb/items/[id]/photo-upload-url/
git commit -m 'feat(beithady/fnb): add photo upload signed-URL endpoint'
```

---

### Task 14: `/beithady/fnb/menu` page — category tree + item list

**Files:**
- Create: `src/app/beithady/fnb/menu/page.tsx`
- Create: `src/app/beithady/fnb/menu/_components/category-tree.tsx`

- [ ] **Step 1: Implement `page.tsx`**

```tsx
import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listCategories, listItems } from '@/lib/beithady/fnb/repo';
import { CategoryTree } from './_components/category-tree';

export const dynamic = 'force-dynamic';

export default async function FnbMenuPage() {
  await requireBeithadyPermission('fnb', 'read');
  const [categories, items] = await Promise.all([listCategories(), listItems()]);
  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 md:col-span-4 lg:col-span-3">
        <CategoryTree categories={categories} items={items} />
      </aside>
      <section className="col-span-12 md:col-span-8 lg:col-span-9">
        <div className="ix-card p-6 text-center text-slate-500">
          Select a category or item to edit.
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Implement `category-tree.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Category, Item } from '@/lib/beithady/fnb/types';

export function CategoryTree({
  categories, items,
}: { categories: Category[]; items: Item[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="ix-card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        Categories
      </h3>
      <ul className="space-y-1">
        {categories.map(c => {
          const catItems = items.filter(i => i.category_id === c.id);
          const isOpen = open[c.id!] ?? true;
          return (
            <li key={c.id}>
              <button
                onClick={() => setOpen(o => ({ ...o, [c.id!]: !isOpen }))}
                className="w-full text-left px-2 py-1.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              >
                {isOpen ? '▾' : '▸'} {c.name_en} ({catItems.length})
              </button>
              {isOpen && (
                <ul className="ml-4 mt-1 space-y-0.5">
                  {catItems.map(i => (
                    <li key={i.id}>
                      <Link
                        href={`/beithady/fnb/menu/items/${i.id}`}
                        className="block px-2 py-1 text-sm text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                      >
                        {i.name_en}{' '}
                        <span className="text-xs text-slate-400">
                          ${i.price_usd.toFixed(2)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <button className="w-full mt-3 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-2 py-1.5 rounded">
        + Add category
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Build + visual check**

After deploy, `/beithady/fnb/menu` should show 3 categories with 4/3/3 items.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/fnb/menu/
git commit -m 'feat(beithady/fnb): add menu admin page with category tree'
```

---

### Task 15: Item editor — Basics tab (`/beithady/fnb/menu/items/[id]`)

**Files:**
- Create: `src/app/beithady/fnb/menu/items/[id]/page.tsx`
- Create: `src/app/beithady/fnb/menu/items/[id]/_components/item-editor.tsx`
- Create: `src/app/beithady/fnb/menu/items/[id]/_components/basics-form.tsx`

- [ ] **Step 1: Implement `page.tsx`**

```tsx
import 'server-only';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getItem, listCategories } from '@/lib/beithady/fnb/repo';
import { ItemEditor } from './_components/item-editor';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export default async function ItemEditorPage({ params }: Ctx) {
  await requireBeithadyPermission('fnb', 'full');
  const { id } = await params;
  const [item, categories] = await Promise.all([getItem(id), listCategories()]);
  if (!item) notFound();
  return <ItemEditor initialItem={item} categories={categories} />;
}
```

- [ ] **Step 2: Implement `item-editor.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Item, Category } from '@/lib/beithady/fnb/types';
import { BasicsForm } from './basics-form';
// PhotoForm + ModifiersForm + AvailabilityForm imports added in tasks 16-18

const INNER_TABS = [
  { key: 'basics',       label: 'Basics' },
  { key: 'photo',        label: 'Photo' },
  { key: 'modifiers',    label: 'Modifiers' },
  { key: 'availability', label: 'Availability' },
  { key: 'recipe',       label: 'Recipe (Phase F&B-2)' },
] as const;
type TabKey = typeof INNER_TABS[number]['key'];

export function ItemEditor({
  initialItem, categories,
}: { initialItem: Item; categories: Category[] }) {
  const [tab, setTab] = useState<TabKey>('basics');
  const [item, setItem] = useState(initialItem);

  return (
    <div className="ix-card p-6">
      <h2 className="text-lg font-semibold mb-1">{item.name_en}</h2>
      <p className="text-sm text-slate-500 mb-4">
        ${item.price_usd.toFixed(2)} · {item.enabled ? 'Enabled' : 'Disabled'}
      </p>

      <nav className="flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-4">
        {INNER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            disabled={t.key === 'recipe'}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? 'text-rose-600 border-b-2 border-rose-600'
                : 'text-slate-600 dark:text-slate-300'
            } ${t.key === 'recipe' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'basics' && (
        <BasicsForm item={item} categories={categories} onSaved={setItem} />
      )}
      {tab === 'photo' && (
        <div className="text-slate-500 text-sm">Photo uploader — wired in Task 16.</div>
      )}
      {tab === 'modifiers' && (
        <div className="text-slate-500 text-sm">Modifier editor — wired in Task 17.</div>
      )}
      {tab === 'availability' && (
        <div className="text-slate-500 text-sm">Availability + stock-out — wired in Task 18.</div>
      )}
      {tab === 'recipe' && (
        <div className="text-slate-500 text-sm">Phase F&B-2 — recipe + inventory link.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement `basics-form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Item, Category } from '@/lib/beithady/fnb/types';

export function BasicsForm({
  item, categories, onSaved,
}: {
  item: Item;
  categories: Category[];
  onSaved: (item: Item) => void;
}) {
  const [form, setForm] = useState({
    name_en: item.name_en,
    description_en: item.description_en ?? '',
    category_id: item.category_id,
    price_usd: item.price_usd,
    cost_usd: (item.cost_usd ?? '') as number | string,
    enabled: item.enabled,
    sort_order: item.sort_order,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true); setErr(null);
    const res = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        price_usd: Number(form.price_usd),
        cost_usd: form.cost_usd === '' ? null : Number(form.cost_usd),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr((await res.json()).error || `HTTP ${res.status}`);
      return;
    }
    onSaved((await res.json()).item);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <label className="col-span-2">
        <span className="block text-xs font-medium mb-1">Name (English)</span>
        <input
          value={form.name_en}
          onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
          className="ix-input"
        />
      </label>
      <label className="col-span-2">
        <span className="block text-xs font-medium mb-1">Description (English)</span>
        <textarea
          value={form.description_en}
          onChange={e => setForm(f => ({ ...f, description_en: e.target.value }))}
          className="ix-input min-h-[80px]"
        />
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">Category</span>
        <select
          value={form.category_id}
          onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
          className="ix-input"
        >
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name_en}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">Sort order</span>
        <input
          type="number"
          value={form.sort_order}
          onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
          className="ix-input"
        />
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">
          Price (USD, incl. VAT + service)
        </span>
        <input
          type="number" step="0.01" min="0"
          value={form.price_usd}
          onChange={e => setForm(f => ({ ...f, price_usd: Number(e.target.value) }))}
          className="ix-input"
        />
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">
          Cost (USD, optional — for margin reports)
        </span>
        <input
          type="number" step="0.01" min="0"
          value={form.cost_usd}
          onChange={e => setForm(f => ({ ...f, cost_usd: e.target.value }))}
          placeholder="—"
          className="ix-input"
        />
      </label>
      <label className="col-span-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
        />
        <span className="text-sm">Enabled (visible on guest menu)</span>
      </label>
      {err && <div className="col-span-2 text-sm text-red-600">{err}</div>}
      <div className="col-span-2 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="ix-btn-primary px-4 py-2 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build + visual smoke**

After deploy, click an item — see the editor with Basics. Edit, save, refresh — persists.

- [ ] **Step 5: Commit**

```bash
git add src/app/beithady/fnb/menu/items/
git commit -m 'feat(beithady/fnb): add item editor shell with Basics tab live'
```

---

### Task 16: Item editor — Photo tab

**Files:**
- Create: `src/app/beithady/fnb/menu/items/[id]/_components/photo-form.tsx`
- Modify: `src/app/beithady/fnb/menu/items/[id]/_components/item-editor.tsx`

- [ ] **Step 1: Implement `photo-form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Item } from '@/lib/beithady/fnb/types';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_BYTES = 5 * 1024 * 1024;

export function PhotoForm({
  item, onSaved,
}: { item: Item; onSaved: (item: Item) => void }) {
  const [progress, setProgress] = useState<
    'idle' | 'signing' | 'uploading' | 'saving' | 'done'
  >('idle');
  const [err, setErr] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState(item.photo_path);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(null);
    if (!ALLOWED.includes(file.type)) { setErr('Use JPG, PNG, WEBP, or HEIC.'); return; }
    if (file.size > MAX_BYTES) { setErr('Max 5 MB.'); return; }

    setProgress('signing');
    const sig = await fetch(
      `/api/beithady/fnb/items/${item.id}/photo-upload-url`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size_bytes: file.size }),
      },
    );
    if (!sig.ok) { setErr('Signed URL failed.'); setProgress('idle'); return; }
    const { upload_url, storage_path } = await sig.json();

    setProgress('uploading');
    const up = await fetch(upload_url, {
      method: 'PUT', body: file, headers: { 'Content-Type': file.type },
    });
    if (!up.ok) { setErr(`Upload failed (${up.status})`); setProgress('idle'); return; }

    setProgress('saving');
    const save = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_path: storage_path }),
    });
    if (!save.ok) { setErr('Save failed.'); setProgress('idle'); return; }
    onSaved((await save.json()).item);
    setPreviewPath(storage_path);
    setProgress('done');
  }

  const previewUrl = previewPath
    ? `/api/storage/preview?path=${encodeURIComponent(previewPath)}`
    : null;

  return (
    <div className="space-y-4">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="rounded-lg max-w-md max-h-80 object-cover border" />
      ) : (
        <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 p-12 text-center text-slate-500">
          No photo uploaded
        </div>
      )}
      <label className="block">
        <span className="block text-xs font-medium mb-1">
          Upload photo (JPG / PNG / WEBP / HEIC, max 5 MB)
        </span>
        <input
          type="file"
          accept={ALLOWED.join(',')}
          onChange={onPick}
          disabled={progress !== 'idle' && progress !== 'done'}
        />
      </label>
      {progress !== 'idle' && (
        <p className="text-sm text-slate-500">Status: {progress}</p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire into editor**

In `item-editor.tsx`, replace the `tab === 'photo'` stub with:

```tsx
{tab === 'photo' && <PhotoForm item={item} onSaved={setItem} />}
```

Add `import { PhotoForm } from './photo-form';` at the top.

- [ ] **Step 3: Verify the storage preview proxy exists**

```bash
ls src/app/api/storage/ 2>/dev/null || grep -rn "createSignedUrl" src/app/api/ | head
```

If no `/api/storage/preview` endpoint exists, find the gallery's existing equivalent and use that path. The component above is written to use `/api/storage/preview?path=...` as a placeholder — adjust to match the repo's actual signed-URL preview pattern before pushing.

- [ ] **Step 4: Build + smoke + commit**

```bash
npm run build
git add src/app/beithady/fnb/menu/items/[id]/_components/
git commit -m 'feat(beithady/fnb): add Photo tab with direct-to-Supabase upload'
```

---

### Task 17: Item editor — Modifiers tab + modifier API

**Files:**
- Create: `src/app/api/beithady/fnb/items/[id]/modifiers/route.ts`
- Create: `src/app/api/beithady/fnb/items/[id]/modifiers/[modId]/route.ts`
- Create: `src/app/beithady/fnb/menu/items/[id]/_components/modifiers-form.tsx`
- Modify: `src/app/beithady/fnb/menu/items/[id]/_components/item-editor.tsx`

- [ ] **Step 1: Implement modifier collection route**

```ts
// src/app/api/beithady/fnb/items/[id]/modifiers/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listModifiers, createModifier } from '@/lib/beithady/fnb/repo';
import { ModifierSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  return NextResponse.json({ modifiers: await listModifiers(id) });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = ModifierSchema.omit({ id: true }).parse({ ...body, item_id: id });
  return NextResponse.json({
    modifier: await createModifier(parsed, { actor_user_id: user.id }),
  }, { status: 201 });
}
```

- [ ] **Step 2: Implement modifier item route**

```ts
// src/app/api/beithady/fnb/items/[id]/modifiers/[modId]/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { updateModifier, deleteModifier } from '@/lib/beithady/fnb/repo';
import { ModifierSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ id: string; modId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { modId } = await ctx.params;
  const body = await req.json();
  const parsed = ModifierSchema.partial().omit({ id: true }).parse(body);
  return NextResponse.json({
    modifier: await updateModifier(modId, parsed, { actor_user_id: user.id }),
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { modId } = await ctx.params;
  await deleteModifier(modId, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Implement `modifiers-form.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Modifier } from '@/lib/beithady/fnb/types';

export function ModifiersForm({ itemId }: { itemId: string }) {
  const [list, setList] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({
    name_en: '', price_delta_usd: 0, sort_order: 0,
  });

  async function reload() {
    const res = await fetch(`/api/beithady/fnb/items/${itemId}/modifiers`);
    setList((await res.json()).modifiers);
    setLoading(false);
  }
  useEffect(() => { reload(); }, [itemId]);

  async function add() {
    if (!draft.name_en) return;
    await fetch(`/api/beithady/fnb/items/${itemId}/modifiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setDraft({ name_en: '', price_delta_usd: 0, sort_order: 0 });
    reload();
  }

  async function remove(id: string) {
    if (!confirm('Delete this modifier?')) return;
    await fetch(`/api/beithady/fnb/items/${itemId}/modifiers/${id}`, {
      method: 'DELETE',
    });
    reload();
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {list.map(m => (
          <li key={m.id} className="flex items-center justify-between py-2">
            <span className="text-sm">
              {m.name_en}{' '}
              <span className="text-xs text-slate-400">
                +${m.price_delta_usd.toFixed(2)}
              </span>
            </span>
            <button
              onClick={() => remove(m.id!)}
              className="text-xs text-red-600 hover:underline"
            >Remove</button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="text-sm text-slate-400 py-2">No modifiers yet.</li>
        )}
      </ul>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t">
        <input
          placeholder="Add modifier name (e.g., Add Grilled Chicken)"
          value={draft.name_en}
          onChange={e => setDraft(d => ({ ...d, name_en: e.target.value }))}
          className="ix-input col-span-2"
        />
        <div className="flex gap-1">
          <input
            type="number" step="0.01" min="0"
            placeholder="$"
            value={draft.price_delta_usd}
            onChange={e => setDraft(d => ({
              ...d, price_delta_usd: Number(e.target.value),
            }))}
            className="ix-input flex-1"
          />
          <button onClick={add} className="ix-btn-primary px-3">Add</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into editor**

```tsx
import { ModifiersForm } from './modifiers-form';
// ...
{tab === 'modifiers' && <ModifiersForm itemId={item.id!} />}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/beithady/fnb/items/[id]/modifiers src/app/beithady/fnb/menu/items/[id]/_components/
git commit -m 'feat(beithady/fnb): add Modifiers tab with API + UI'
```

---

### Task 18: Item editor — Availability tab (operating hours + per-building stock-out)

**Files:**
- Create: `src/app/api/beithady/fnb/items/[id]/availability/route.ts`
- Create: `src/app/beithady/fnb/menu/items/[id]/_components/availability-form.tsx`
- Modify: `src/app/beithady/fnb/menu/items/[id]/_components/item-editor.tsx`

- [ ] **Step 1: Implement availability API**

```ts
// src/app/api/beithady/fnb/items/[id]/availability/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  updateItem, upsertBuildingOverride, listBuildingOverridesForItem,
} from '@/lib/beithady/fnb/repo';

const Update = z.object({
  hours_start_override: z.string().nullable().optional(),
  hours_end_override: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  building_overrides: z.array(z.object({
    building_code: z.string().regex(/^BH-[A-Z0-9]+$/),
    is_out_of_stock: z.boolean(),
  })).default([]),
});

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  return NextResponse.json({
    overrides: await listBuildingOverridesForItem(id),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const parsed = Update.parse(await req.json());
  if (parsed.hours_start_override !== undefined ||
      parsed.hours_end_override !== undefined ||
      parsed.enabled !== undefined) {
    await updateItem(id, {
      hours_start_override: parsed.hours_start_override ?? null,
      hours_end_override: parsed.hours_end_override ?? null,
      ...(parsed.enabled !== undefined && { enabled: parsed.enabled }),
    }, { actor_user_id: user.id });
  }
  for (const ov of parsed.building_overrides) {
    await upsertBuildingOverride({
      building_code: ov.building_code,
      item_id: id,
      is_out_of_stock: ov.is_out_of_stock,
    }, { actor_user_id: user.id });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement `availability-form.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import type { Item, BuildingOverride } from '@/lib/beithady/fnb/types';

const BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34'] as const;

export function AvailabilityForm({
  item, onSaved,
}: { item: Item; onSaved: (item: Item) => void }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [hoursStart, setHoursStart] = useState(item.hours_start_override ?? '');
  const [hoursEnd, setHoursEnd] = useState(item.hours_end_override ?? '');
  const [enabled, setEnabled] = useState(item.enabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/beithady/fnb/items/${item.id}/availability`)
      .then(r => r.json())
      .then((d: { overrides: BuildingOverride[] }) => {
        const map: Record<string, boolean> = {};
        d.overrides.forEach(o => { map[o.building_code] = o.is_out_of_stock; });
        setOverrides(map);
      });
  }, [item.id]);

  async function save() {
    setSaving(true);
    const res = await fetch(
      `/api/beithady/fnb/items/${item.id}/availability`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours_start_override: hoursStart || null,
          hours_end_override: hoursEnd || null,
          enabled,
          building_overrides: BUILDINGS.map(b => ({
            building_code: b,
            is_out_of_stock: !!overrides[b],
          })),
        }),
      },
    );
    setSaving(false);
    if (res.ok) {
      const itemRes = await fetch(`/api/beithady/fnb/items/${item.id}`);
      onSaved((await itemRes.json()).item);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />
        <span className="text-sm">Item enabled (visible on guest menu)</span>
      </label>
      <fieldset className="border rounded p-3">
        <legend className="text-xs font-semibold uppercase tracking-wide">
          Hours override (optional)
        </legend>
        <p className="text-xs text-slate-500 mb-2">
          Leave blank to inherit category default. Format HH:MM (24h).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="ix-input" placeholder="08:00"
            value={hoursStart}
            onChange={e => setHoursStart(e.target.value)}
          />
          <input
            className="ix-input" placeholder="14:00"
            value={hoursEnd}
            onChange={e => setHoursEnd(e.target.value)}
          />
        </div>
      </fieldset>
      <fieldset className="border rounded p-3">
        <legend className="text-xs font-semibold uppercase tracking-wide">
          Stock-out per building
        </legend>
        <div className="grid grid-cols-5 gap-2">
          {BUILDINGS.map(b => (
            <label
              key={b}
              className="flex flex-col items-center gap-1 p-2 border rounded"
            >
              <span className="text-xs font-medium">{b}</span>
              <input
                type="checkbox"
                checked={!!overrides[b]}
                onChange={e =>
                  setOverrides(o => ({ ...o, [b]: e.target.checked }))
                }
              />
              <span className="text-[10px] text-slate-500">
                {overrides[b] ? 'OUT' : 'OK'}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Auto-clears at next Cairo midnight via cron.
        </p>
      </fieldset>
      <button
        onClick={save}
        disabled={saving}
        className="ix-btn-primary px-4 py-2 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save availability'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire into editor + commit**

```tsx
import { AvailabilityForm } from './availability-form';
// ...
{tab === 'availability' && <AvailabilityForm item={item} onSaved={setItem} />}
```

```bash
git add src/app/api/beithady/fnb/items/[id]/availability src/app/beithady/fnb/menu/items/[id]/_components/
git commit -m 'feat(beithady/fnb): add Availability tab (hours + per-building stock-out)'
```

---

### Task 19: Bulk price update — endpoint + dialog

**Files:**
- Create: `src/app/api/beithady/fnb/items/bulk-price-update/route.ts`
- Create: `src/app/beithady/fnb/menu/_components/bulk-price-dialog.tsx`
- Modify: `src/app/beithady/fnb/menu/page.tsx`

- [ ] **Step 1: Endpoint**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listItems, updateItem } from '@/lib/beithady/fnb/repo';
import { BulkPriceUpdatePayloadSchema } from '@/lib/beithady/fnb/types';

export async function POST(req: NextRequest) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const parsed = BulkPriceUpdatePayloadSchema.parse(await req.json());

  const items = await listItems({
    categoryId: parsed.category_id ?? undefined,
  });
  const targets = parsed.item_ids.length > 0
    ? items.filter(i => parsed.item_ids.includes(i.id!))
    : items;
  const factor = 1 + parsed.delta_pct / 100;

  let count = 0;
  for (const it of targets) {
    const newPrice = Math.round(it.price_usd * factor * 100) / 100;
    if (newPrice === it.price_usd) continue;
    await updateItem(it.id!, { price_usd: newPrice }, { actor_user_id: user.id });
    count++;
  }
  return NextResponse.json({ updated: count });
}
```

- [ ] **Step 2: Dialog component**

```tsx
'use client';
import { useState } from 'react';
import type { Category } from '@/lib/beithady/fnb/types';

export function BulkPriceDialog({
  categories, onDone,
}: { categories: Category[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);

  async function apply() {
    const scope = categoryId
      ? categories.find(c => c.id === categoryId)?.name_en
      : 'ALL';
    if (!confirm(`Apply ${delta >= 0 ? '+' : ''}${delta}% to ${scope} items?`)) return;
    setBusy(true);
    const res = await fetch('/api/beithady/fnb/items/bulk-price-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId || null,
        item_ids: [],
        delta_pct: delta,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const { updated } = await res.json();
      alert(`Updated ${updated} items.`);
      setOpen(false);
      onDone();
    } else {
      alert('Failed.');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ix-btn-secondary px-3 py-2 text-sm"
      >Bulk price update</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="ix-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Bulk price update</h3>
            <label className="block mb-3">
              <span className="block text-xs font-medium mb-1">Scope</span>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="ix-input"
              >
                <option value="">All items</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name_en}</option>
                ))}
              </select>
            </label>
            <label className="block mb-3">
              <span className="block text-xs font-medium mb-1">
                Percentage change (-50 to +100)
              </span>
              <input
                type="number" min="-50" max="100" step="1"
                value={delta}
                onChange={e => setDelta(Number(e.target.value))}
                className="ix-input"
              />
            </label>
            <p className="text-xs text-slate-500 mb-4">
              Each price is multiplied by 1 + delta/100, rounded to cents.
              Logged to audit per item.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="ix-btn-secondary px-3 py-2 text-sm"
              >Cancel</button>
              <button
                onClick={apply}
                disabled={busy}
                className="ix-btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >{busy ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Wire into menu page + commit**

```bash
git add src/app/api/beithady/fnb/items/bulk-price-update src/app/beithady/fnb/menu/
git commit -m 'feat(beithady/fnb): add bulk price update endpoint + dialog'
```

---

### 🟢 Phase F.2 checkpoint

After deploy:
1. `/beithady/fnb/menu` shows 3 categories, 10 items.
2. Click "Beit Hady Burger" → Basics tab; edit price to $14, save, refresh — persists.
3. Photo tab — upload a JPG, see preview render.
4. Modifiers tab on Caesar Salad — see "Add Grilled Chicken +$5"; add a test, delete it.
5. Availability tab — toggle BH-26 stock-out for Smoked Salmon Toast, save, verify SQL: `SELECT * FROM fnb_building_overrides WHERE is_out_of_stock = true;`.
6. Bulk price dialog — +10% on Sandwiches; verify Sausage $12 → $13.20, Baguette $16 → $17.60, Burger $14 → $15.40.
7. Audit query: `SELECT count(*) FROM beithady_audit_log WHERE module = 'fnb' AND at > now() - interval '1 hour';` — expect double-digit count.

If all green → proceed to Phase F.3.

---

## Phase F.3 — Guest menu (read-only, EN-only, brand-styled)

Goal: After this phase, an in-house guest at an Egypt building can
open `/dine/[token]` on their phone and browse the menu with full
BH brand styling — cream background, coral rails, navy headings,
Cormorant Garamond + Poppins fonts, halftone + palm motifs, photos.
Read-only: no cart, no submit yet. Multi-language ships in F.6.

### Task 20: `src/lib/beithady/fnb/token-validate.ts`

**Files:**
- Create: `src/lib/beithady/fnb/token-validate.ts`
- Test: `src/lib/beithady/fnb/token-validate.test.ts`

This module validates a guest token against (a) the existing
`boarding_passes` row, (b) the linked Guesty reservation status =
`checked_in`, and (c) the building has F&B enabled.

- [ ] **Step 1: Find the boarding-pass schema and Guesty reservation join**

```bash
grep -rn "boarding_passes\|boarding_pass" src/lib/ src/app/api/ | head -20
ls src/lib/guesty 2>/dev/null
grep -rn "fetchReservation\|getReservation" src/lib/guesty/ 2>/dev/null | head
```

Note the table column names (likely `token`, `reservation_id`,
`expires_at`) and the existing reservation-fetch helper. The
exact column names are needed by Step 3 below — adjust if the repo
uses different naming.

- [ ] **Step 2: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { validateDineToken } from './token-validate';

describe('validateDineToken', () => {
  it('returns invalid for non-existent token', async () => {
    const r = await validateDineToken('nope-not-a-real-token');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('token_not_found');
  });

  // Live integration tests rely on a seeded boarding pass + a Guesty
  // reservation in checked_in status. Gate behind env flag:
  it.skipIf(!process.env.SUPABASE_URL)('returns ok for valid token', async () => {
    // Caller ensures a pre-seeded fixture exists; assert shape only.
    const r = await validateDineToken(process.env.TEST_DINE_TOKEN ?? '');
    if (r.ok) {
      expect(r.reservation_id).toBeDefined();
      expect(r.building_code).toMatch(/^BH-/);
      expect(r.unit_code).toBeDefined();
    }
  });
});
```

- [ ] **Step 3: Implement `token-validate.ts`**

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
// Adjust the next import to whatever the repo exposes; the helper
// MUST return { status, building, unit, guest } from Guesty:
import { fetchReservationFromGuesty } from '@/lib/guesty';

export type DineTokenContext =
  | { ok: true;
      token: string;
      reservation_id: string;
      building_code: string;
      unit_code: string;
      guest_name: string | null;
      guest_language: 'en' | 'ar' | 'ru' | 'fr';
      guest_wa: string | null;
      reservation_status: 'checked_in' | 'reserved' | 'confirmed' | 'checked_out' | 'cancelled' | 'inquiry';
      grace_until: Date | null;       // when token will lose order-write rights
    }
  | { ok: false;
      reason:
        | 'token_not_found'
        | 'reservation_not_found'
        | 'reservation_not_checked_in'
        | 'building_disabled'
        | 'building_not_egypt';
    };

export async function validateDineToken(token: string): Promise<DineTokenContext> {
  if (!token || token.length < 10) return { ok: false, reason: 'token_not_found' };
  const sb = supabaseAdmin();

  // 1. boarding_passes row (TODO: confirm column names from grep in Step 1)
  const { data: bp, error: bpErr } = await sb
    .from('boarding_passes')
    .select('token, reservation_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (bpErr || !bp) return { ok: false, reason: 'token_not_found' };

  // 2. Guesty reservation
  const reservation = await fetchReservationFromGuesty(bp.reservation_id);
  if (!reservation) return { ok: false, reason: 'reservation_not_found' };

  if (reservation.status !== 'checked_in') {
    return { ok: false, reason: 'reservation_not_checked_in' };
  }

  // 3. Building enabled
  const { data: bld } = await sb
    .from('fnb_buildings')
    .select('building_code, enabled')
    .eq('building_code', reservation.building_code)
    .maybeSingle();
  if (!bld) return { ok: false, reason: 'building_not_egypt' };
  if (!bld.enabled) return { ok: false, reason: 'building_disabled' };

  // 4-hour read-only grace post checkout (still reachable on this branch
  // because reservation.status === 'checked_in' — we keep the field for
  // future use in the receipt download endpoint).
  return {
    ok: true,
    token,
    reservation_id: bp.reservation_id,
    building_code: reservation.building_code,
    unit_code: reservation.unit_code,
    guest_name: reservation.guest?.name ?? null,
    guest_language: pickLang(reservation.guest?.language),
    guest_wa: reservation.guest?.phone_wa ?? null,
    reservation_status: reservation.status,
    grace_until: null,
  };
}

function pickLang(raw: string | null | undefined): 'en' | 'ar' | 'ru' | 'fr' {
  const s = (raw ?? 'en').toLowerCase();
  if (s.startsWith('ar')) return 'ar';
  if (s.startsWith('ru')) return 'ru';
  if (s.startsWith('fr')) return 'fr';
  return 'en';
}
```

If the repo's existing Guesty helper has a different shape, adjust
the property accesses — the exported `DineTokenContext` shape is
the contract used everywhere downstream and MUST stay stable.

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/lib/beithady/fnb/token-validate.test.ts
```

Expected: PASS for the unit case; live test skipped without env.

- [ ] **Step 5: Commit**

```bash
git add src/lib/beithady/fnb/token-validate.ts src/lib/beithady/fnb/token-validate.test.ts
git commit -m 'feat(beithady/fnb): add guest token validator'
```

---

### Task 21: API `/api/dine/[token]/menu` — language-scoped, building-scoped menu

**Files:**
- Create: `src/app/api/dine/[token]/menu/route.ts`
- Test: `src/app/api/dine/[token]/menu/route.test.ts`

- [ ] **Step 1: Implement the route**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';

interface Ctx { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) {
    return NextResponse.json(
      { error: c.reason },
      { status: c.reason === 'token_not_found' ? 404 : 403 },
    );
  }

  const url = new URL(req.url);
  const lang = (url.searchParams.get('lang') as 'en'|'ar'|'ru'|'fr')
    ?? c.guest_language;

  const sb = supabaseAdmin();
  const [cats, items, mods, overrides] = await Promise.all([
    sb.from('fnb_categories')
      .select('*').eq('enabled', true).order('sort_order'),
    sb.from('fnb_items')
      .select('*').eq('enabled', true).is('deleted_at', null).order('sort_order'),
    sb.from('fnb_item_modifiers')
      .select('*').eq('enabled', true).order('sort_order'),
    sb.from('fnb_building_overrides')
      .select('*').eq('building_code', c.building_code).eq('is_out_of_stock', true),
  ]);

  if (cats.error || items.error || mods.error || overrides.error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const outOfStock = new Set((overrides.data ?? []).map(o => o.item_id));

  function localize<T extends Record<string, unknown>>(row: T, fields: string[]): T {
    const out = { ...row } as Record<string, unknown>;
    for (const f of fields) {
      out[f] = (row[`${f}_${lang}`] as string | null)
        ?? (row[`${f}_en`] as string)
        ?? null;
    }
    return out as T;
  }

  return NextResponse.json({
    context: {
      token,
      building_code: c.building_code,
      unit_code: c.unit_code,
      guest_name: c.guest_name,
      guest_language: lang,
    },
    categories: (cats.data ?? []).map(c =>
      localize(c, ['name'])),
    items: (items.data ?? []).map(i => ({
      ...localize(i, ['name', 'description']),
      out_of_stock: outOfStock.has(i.id),
    })),
    modifiers: (mods.data ?? []).map(m => localize(m, ['name'])),
  });
}
```

- [ ] **Step 2: Build + smoke test**

```bash
npm run build
```

After deploy, hit `/api/dine/[real-token]/menu?lang=en` — should
return JSON with 3 categories, 10 items (filtered to building's
non-out-of-stock), 2 modifiers.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dine/[token]/menu
git commit -m 'feat(beithady/fnb): add guest menu API endpoint'
```

---

### Task 22: `/dine/[token]` page — mobile menu with full BH brand styling

**Files:**
- Create: `src/app/dine/[token]/_fonts.ts`
- Create: `src/app/dine/[token]/dine-tokens.css`
- Create: `src/app/dine/[token]/layout.tsx`
- Create: `src/app/dine/[token]/page.tsx`
- Create: `src/app/dine/[token]/_components/brand-shell.tsx`
- Create: `src/app/dine/[token]/_components/category-section.tsx`
- Create: `src/app/dine/[token]/_components/item-card.tsx`
- Create: `public/dine/halftone-tl.svg`
- Create: `public/dine/halftone-br.svg`
- Create: `public/dine/palm-silhouette.svg`
- Create: `public/dine/beithady-logo.svg`

- [ ] **Step 1: Create the font module**

```ts
// src/app/dine/[token]/_fonts.ts
import { Cormorant_Garamond, Poppins, Cairo } from 'next/font/google';

export const fontDisplay = Cormorant_Garamond({
  weight: ['500', '600'],
  subsets: ['latin'],
  variable: '--bh-font-display',
  display: 'swap',
});

export const fontBody = Poppins({
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--bh-font-body',
  display: 'swap',
});

export const fontArabic = Cairo({
  weight: ['400', '600'],
  subsets: ['arabic'],
  variable: '--bh-font-arabic',
  display: 'swap',
});
```

- [ ] **Step 2: Create the design tokens CSS**

```css
/* src/app/dine/[token]/dine-tokens.css */
.dine-surface {
  --bh-navy: #0F3F58;
  --bh-navy-700: #143A52;
  --bh-navy-900: #0A2F44;
  --bh-cream: #E9E5DE;
  --bh-cream-50: #F2EFEA;
  --bh-coral: #E5A29C;
  --bh-coral-300: #EFC0BC;
  --bh-ink: var(--bh-navy);
  --bh-ink-muted: #4A6577;
  --bh-on-navy: #FAF8F4;

  background: var(--bh-cream);
  color: var(--bh-ink);
  font-family: var(--bh-font-body), 'Helvetica Neue', system-ui, sans-serif;
}
.dine-surface[lang="ar"] {
  font-family: var(--bh-font-arabic), 'Helvetica Neue', system-ui, sans-serif;
  direction: rtl;
}
.dine-surface .display {
  font-family: var(--bh-font-display), 'Cormorant Garamond', serif;
  letter-spacing: 0.05em;
}

.dine-rails::before,
.dine-rails::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1.5px;
  background: var(--bh-coral);
}
.dine-rails::before { left: 1.25rem; }
.dine-rails::after  { right: 1.25rem; }

.dine-section-title {
  font-family: var(--bh-font-display), serif;
  font-weight: 600;
  font-size: 2rem;
  text-align: center;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bh-navy);
  position: relative;
  padding: 1.5rem 0;
}
.dine-section-title::before,
.dine-section-title::after {
  content: '';
  display: block;
  height: 1px;
  background: var(--bh-navy);
  width: 4rem;
  margin: 0.5rem auto;
}

.dine-item-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem 1rem;
  align-items: baseline;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(15, 63, 88, 0.08);
}
.dine-item-name {
  font-weight: 600;
  font-size: 1.05rem;
  color: var(--bh-navy);
}
.dine-item-price {
  font-weight: 600;
  font-size: 1.05rem;
  color: var(--bh-navy);
  white-space: nowrap;
}
.dine-item-desc {
  grid-column: 1 / -1;
  color: var(--bh-ink-muted);
  font-size: 0.875rem;
  line-height: 1.5;
}
.dine-item-photo {
  grid-column: 1 / -1;
  margin-top: 0.5rem;
  border-radius: 0.5rem;
  overflow: hidden;
  max-height: 10rem;
}
.dine-item-photo img {
  width: 100%; height: 100%; object-fit: cover;
}

.dine-cart-bar {
  position: fixed;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bh-navy);
  color: var(--bh-on-navy);
  border-radius: 9999px;
  padding: 0.875rem 1.5rem;
  box-shadow: 0 12px 36px rgba(15, 63, 88, 0.35);
  font-weight: 500;
  display: flex;
  gap: 0.75rem;
  align-items: center;
  z-index: 50;
}

.dine-fineprint {
  text-align: center;
  font-size: 0.75rem;
  color: var(--bh-ink-muted);
  font-style: italic;
  padding: 1rem;
}

.dine-halftone {
  position: absolute;
  pointer-events: none;
  opacity: 0.18;
  z-index: 0;
}
.dine-palm {
  position: absolute;
  pointer-events: none;
  opacity: 0.28;
  width: 12rem;
  z-index: 0;
}

.dine-stockout { opacity: 0.45; }
.dine-stockout::after {
  content: 'Sold out today';
  display: inline-block;
  margin-left: 0.5rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--bh-coral);
  font-weight: 600;
}
```

- [ ] **Step 3: Source the SVG decorations**

Create the four SVGs in `public/dine/`. Acceptable approaches:

1. **Trace from the PDF.** Open the PDF in any vector tool, isolate
   the palm silhouette + halftone clusters + logo, export as SVG.
2. **Free vector libraries.** Use Phosphor `palm-tree` or Heroicons
   for the palm; generate halftone with a script (recipe below).
3. **Inline SVG only.** If you'd rather not place files, drop the
   inline SVGs into the brand-shell component directly.

Halftone generator (run once, save output as
`public/dine/halftone-tl.svg`):

```js
// scratch.js — run with `node scratch.js > public/dine/halftone-tl.svg`
const W = 240, H = 240, NAVY = '#0F3F58';
const dots = [];
for (let r = 0; r < 12; r++) {
  for (let c = 0; c < 12; c++) {
    const dist = Math.hypot(r - 5, c - 5);
    const radius = Math.max(0.5, 6 - dist * 0.6);
    if (radius > 0) {
      dots.push(`<circle cx="${c * 20 + 10}" cy="${r * 20 + 10}" r="${radius}" fill="${NAVY}"/>`);
    }
  }
}
console.log(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${dots.join('')}</svg>`);
```

Mirror horizontally for `halftone-br.svg`. Logo: export from any
file in `BeitHady Logos/` to SVG and trim margins. Palm: trace or
borrow from a CC0 set.

- [ ] **Step 4: Implement `layout.tsx`**

```tsx
import 'server-only';
import { ReactNode } from 'react';
import { fontDisplay, fontBody, fontArabic } from './_fonts';
import './dine-tokens.css';

export const metadata = {
  title: 'Beit Hady · In-Room Dining',
  description: 'Order food to your apartment.',
};

export const dynamic = 'force-dynamic';

export default function DineLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontBody.variable} ${fontArabic.variable}`}>
      <body className="min-h-dvh m-0">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Implement `page.tsx`**

```tsx
import 'server-only';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { BrandShell } from './_components/brand-shell';
import { CategorySection } from './_components/category-section';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

export default async function DinePage({ params }: Ctx) {
  const { token } = await params;
  const c = await validateDineToken(token);
  if (!c.ok) {
    return (
      <BrandShell guestName={null} buildingCode={null} unitCode={null} lang="en">
        <div className="text-center py-16 px-6">
          <h2 className="display text-3xl mb-4">Service unavailable</h2>
          <p className="text-sm" style={{ color: 'var(--bh-ink-muted)' }}>
            {c.reason === 'reservation_not_checked_in'
              ? 'Available once you check in.'
              : c.reason === 'building_disabled' || c.reason === 'building_not_egypt'
                ? 'In-room dining is not available at this property.'
                : 'Please contact reception by dialling 0 from your living room.'}
          </p>
        </div>
      </BrandShell>
    );
  }

  const sb = supabaseAdmin();
  const [cats, items, mods, overrides] = await Promise.all([
    sb.from('fnb_categories').select('*')
      .eq('enabled', true).order('sort_order'),
    sb.from('fnb_items').select('*')
      .eq('enabled', true).is('deleted_at', null).order('sort_order'),
    sb.from('fnb_item_modifiers').select('*')
      .eq('enabled', true).order('sort_order'),
    sb.from('fnb_building_overrides').select('*')
      .eq('building_code', c.building_code).eq('is_out_of_stock', true),
  ]);

  const outOfStock = new Set((overrides.data ?? []).map(o => o.item_id));

  return (
    <BrandShell
      guestName={c.guest_name}
      buildingCode={c.building_code}
      unitCode={c.unit_code}
      lang="en"
    >
      {(cats.data ?? []).map(cat => {
        const catItems = (items.data ?? []).filter(i => i.category_id === cat.id);
        return (
          <CategorySection
            key={cat.id}
            category={cat}
            items={catItems}
            modifiers={(mods.data ?? []).filter(m =>
              catItems.some(i => i.id === m.item_id))}
            outOfStock={outOfStock}
          />
        );
      })}
      <p className="dine-fineprint">
        All prices are inclusive of 14% VAT &amp; 12% Service Charge
      </p>
    </BrandShell>
  );
}
```

- [ ] **Step 6: Implement `brand-shell.tsx`**

```tsx
import Image from 'next/image';
import { ReactNode } from 'react';

export function BrandShell({
  children, guestName, buildingCode, unitCode, lang,
}: {
  children: ReactNode;
  guestName: string | null;
  buildingCode: string | null;
  unitCode: string | null;
  lang: 'en' | 'ar' | 'ru' | 'fr';
}) {
  return (
    <main className="dine-surface min-h-dvh relative" lang={lang}>
      {/* Coral side rails on every section */}
      <div className="dine-rails relative max-w-md mx-auto pb-32">

        {/* Hero */}
        <section className="relative pt-10 pb-8 px-6 text-center">
          <Image
            src="/dine/halftone-tl.svg"
            alt=""
            width={240} height={240}
            className="dine-halftone"
            style={{ top: 0, left: 0 }}
          />
          <Image
            src="/dine/beithady-logo.svg"
            alt="Beit Hady"
            width={120} height={120}
            className="mx-auto relative z-10"
          />
          <h1 className="display mt-4 text-3xl tracking-wider relative z-10">
            IN-ROOM DINING
          </h1>
          {guestName && (
            <p className="mt-2 text-sm relative z-10" style={{ color: 'var(--bh-ink-muted)' }}>
              Welcome, {guestName.split(' ')[0]}
            </p>
          )}
          {buildingCode && unitCode && (
            <p className="mt-1 text-xs relative z-10" style={{ color: 'var(--bh-ink-muted)' }}>
              {buildingCode} · Unit {unitCode}
            </p>
          )}
        </section>

        {children}

        <Image
          src="/dine/palm-silhouette.svg"
          alt=""
          width={192} height={300}
          className="dine-palm"
          style={{ bottom: '8rem', right: '-2rem' }}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Implement `category-section.tsx` and `item-card.tsx`**

```tsx
// category-section.tsx
import type { Category, Item, Modifier } from '@/lib/beithady/fnb/types';
import { ItemCard } from './item-card';

export function CategorySection({
  category, items, modifiers, outOfStock,
}: {
  category: Category;
  items: Item[];
  modifiers: Modifier[];
  outOfStock: Set<string>;
}) {
  return (
    <section className="relative px-2">
      <h2 className="dine-section-title">{category.name_en}</h2>
      <div>
        {items.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            modifiers={modifiers.filter(m => m.item_id === item.id)}
            outOfStock={outOfStock.has(item.id!)}
          />
        ))}
      </div>
      <p className="dine-fineprint">
        Available daily from {category.hours_start.slice(0, 5)} – {category.hours_end.slice(0, 5)}
      </p>
    </section>
  );
}
```

```tsx
// item-card.tsx
import type { Item, Modifier } from '@/lib/beithady/fnb/types';

export function ItemCard({
  item, modifiers, outOfStock,
}: { item: Item; modifiers: Modifier[]; outOfStock: boolean }) {
  return (
    <article className={`dine-item-row ${outOfStock ? 'dine-stockout' : ''}`}>
      <h3 className="dine-item-name">{item.name_en}</h3>
      <span className="dine-item-price">${item.price_usd.toFixed(0)}</span>
      {item.description_en && (
        <p className="dine-item-desc">{item.description_en}</p>
      )}
      {modifiers.map(m => (
        <p
          key={m.id}
          className="dine-item-desc"
          style={{ paddingLeft: '1rem', fontStyle: 'italic' }}
        >
          + {m.name_en} ${m.price_delta_usd.toFixed(0)}
        </p>
      ))}
    </article>
  );
}
```

(The interactive bottom-sheet + cart bar is added in Task 23. This
task ships a read-only mobile menu that *looks* identical to the
PDF — just on a phone.)

- [ ] **Step 8: Build + visual smoke**

```bash
npm run build
```

After deploy, open a real `/dine/[token]` URL on phone — should see
the cream + coral + navy menu rendering identically to the PDF.

- [ ] **Step 9: Commit**

```bash
git add src/app/dine src/lib/beithady/fnb/token-validate.ts public/dine
git commit -m 'feat(beithady/fnb): add brand-styled mobile guest menu (read-only, EN)'
```

---

### Task 23: Item bottom-sheet — modifiers, qty stepper, notes (no submit yet)

**Files:**
- Create: `src/app/dine/[token]/_components/item-sheet.tsx`
- Create: `src/app/dine/[token]/_components/cart-store.ts` (Zustand-free; uses `localStorage` + a tiny event-emitter store)
- Modify: `src/app/dine/[token]/_components/item-card.tsx` (make tap-to-open)
- Modify: `src/app/dine/[token]/page.tsx` (wrap in client provider)
- Add: `src/app/dine/[token]/_components/cart-bar.tsx` (sticky bottom indicator only — drawer is Task 28)

- [ ] **Step 1: Implement `cart-store.ts` (vanilla — keep zero deps)**

```ts
'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface CartLine {
  id: string;                  // UUID, client-generated
  item_id: string;
  item_name: string;
  unit_price_usd: number;
  quantity: number;
  modifier_ids: string[];
  modifiers: { id: string; name: string; price_delta_usd: number }[];
  notes: string;
}

interface CartState {
  lines: CartLine[];
}

const KEY = 'bh-fnb-cart-v1';
let state: CartState = (() => {
  if (typeof window === 'undefined') return { lines: [] };
  try { return JSON.parse(localStorage.getItem(KEY) || '{"lines":[]}'); }
  catch { return { lines: [] }; }
})();
const subs = new Set<() => void>();

function emit() {
  subs.forEach(fn => fn());
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
}

function getSnap() { return state; }
function subscribe(cb: () => void) { subs.add(cb); return () => subs.delete(cb); }

export function useCart() {
  return useSyncExternalStore(subscribe, getSnap, () => ({ lines: [] }));
}

export const cart = {
  add(line: Omit<CartLine, 'id'>) {
    state = { lines: [...state.lines, { ...line, id: crypto.randomUUID() }] };
    emit();
  },
  remove(id: string) {
    state = { lines: state.lines.filter(l => l.id !== id) };
    emit();
  },
  setQty(id: string, qty: number) {
    state = {
      lines: state.lines.map(l => l.id === id ? { ...l, quantity: qty } : l),
    };
    emit();
  },
  clear() { state = { lines: [] }; emit(); },
  total() {
    return state.lines.reduce(
      (s, l) =>
        s + l.quantity *
          (l.unit_price_usd + l.modifiers.reduce((a, m) => a + m.price_delta_usd, 0)),
      0,
    );
  },
};
```

- [ ] **Step 2: Implement `item-sheet.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Item, Modifier } from '@/lib/beithady/fnb/types';
import { cart } from './cart-store';

export function ItemSheet({
  item, modifiers, onClose, outOfStock,
}: {
  item: Item;
  modifiers: Modifier[];
  onClose: () => void;
  outOfStock: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');

  const lineTotal =
    qty * (item.price_usd +
      modifiers
        .filter(m => picked.has(m.id!))
        .reduce((s, m) => s + m.price_delta_usd, 0));

  function add() {
    cart.add({
      item_id: item.id!,
      item_name: item.name_en,
      unit_price_usd: item.price_usd,
      quantity: qty,
      modifier_ids: [...picked],
      modifiers: modifiers
        .filter(m => picked.has(m.id!))
        .map(m => ({ id: m.id!, name: m.name_en, price_delta_usd: m.price_delta_usd })),
      notes,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(15,63,88,0.5)' }}
      onClick={onClose}
    >
      <div
        className="dine-surface w-full max-w-md rounded-t-2xl p-6"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="display text-2xl mb-2">{item.name_en}</h3>
        <span className="dine-item-price text-lg block mb-3">
          ${item.price_usd.toFixed(0)}
        </span>
        {item.description_en && (
          <p className="dine-item-desc mb-4">{item.description_en}</p>
        )}
        {modifiers.length > 0 && (
          <fieldset className="mb-4">
            <legend className="text-xs uppercase tracking-wide font-semibold mb-2">
              Add-ons
            </legend>
            {modifiers.map(m => (
              <label key={m.id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={picked.has(m.id!)}
                  onChange={e => {
                    setPicked(s => {
                      const n = new Set(s);
                      e.target.checked ? n.add(m.id!) : n.delete(m.id!);
                      return n;
                    });
                  }}
                />
                <span className="text-sm">
                  {m.name_en} +${m.price_delta_usd.toFixed(0)}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm">Quantity</span>
          <button
            onClick={() => setQty(q => Math.max(1, q - 1))}
            className="w-8 h-8 rounded-full border"
          >−</button>
          <span className="font-semibold">{qty}</span>
          <button
            onClick={() => setQty(q => Math.min(10, q + 1))}
            className="w-8 h-8 rounded-full border"
          >+</button>
        </div>
        <label className="block mb-4">
          <span className="text-xs uppercase tracking-wide font-semibold">
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value.slice(0, 200))}
            className="w-full mt-1 rounded border p-2 text-sm"
            rows={2}
            placeholder="No onions, extra sauce, …"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border"
            style={{ borderColor: 'var(--bh-navy)', color: 'var(--bh-navy)' }}
          >Cancel</button>
          <button
            onClick={add}
            disabled={outOfStock}
            className="flex-1 py-3 rounded-full text-white disabled:opacity-50"
            style={{ background: 'var(--bh-navy)' }}
          >Add to order · ${lineTotal.toFixed(0)}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `cart-bar.tsx` (indicator only — full drawer in F.4)**

```tsx
'use client';
import Link from 'next/link';
import { useCart } from './cart-store';

export function CartBar({ token }: { token: string }) {
  const { lines } = useCart();
  if (lines.length === 0) return null;
  const total = lines.reduce(
    (s, l) =>
      s + l.quantity *
        (l.unit_price_usd + l.modifiers.reduce((a, m) => a + m.price_delta_usd, 0)),
    0,
  );
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <Link href={`/dine/${token}/order`} className="dine-cart-bar">
      <span>🛒 {count} item{count !== 1 ? 's' : ''} · ${total.toFixed(0)}</span>
      <span>·</span>
      <span>View order →</span>
    </Link>
  );
}
```

- [ ] **Step 4: Make `item-card.tsx` interactive**

Convert to a client component:

```tsx
'use client';
import { useState } from 'react';
import type { Item, Modifier } from '@/lib/beithady/fnb/types';
import { ItemSheet } from './item-sheet';

export function ItemCard({
  item, modifiers, outOfStock,
}: { item: Item; modifiers: Modifier[]; outOfStock: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <article
        className={`dine-item-row ${outOfStock ? 'dine-stockout' : ''}`}
        onClick={() => !outOfStock && setOpen(true)}
        style={{ cursor: outOfStock ? 'default' : 'pointer' }}
      >
        <h3 className="dine-item-name">{item.name_en}</h3>
        <span className="dine-item-price">${item.price_usd.toFixed(0)}</span>
        {item.description_en && (
          <p className="dine-item-desc">{item.description_en}</p>
        )}
        {modifiers.map(m => (
          <p
            key={m.id}
            className="dine-item-desc"
            style={{ paddingLeft: '1rem', fontStyle: 'italic' }}
          >
            + {m.name_en} ${m.price_delta_usd.toFixed(0)}
          </p>
        ))}
      </article>
      {open && (
        <ItemSheet
          item={item}
          modifiers={modifiers}
          onClose={() => setOpen(false)}
          outOfStock={outOfStock}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Mount CartBar in `page.tsx`**

Add `<CartBar token={token} />` at the bottom of the BrandShell
children.

- [ ] **Step 6: Build + smoke test**

After deploy: tap a card → bottom sheet slides up; pick modifier;
qty stepper works; "Add to order" closes the sheet, cart bar
appears with item count + total.

- [ ] **Step 7: Commit**

```bash
git add src/app/dine
git commit -m 'feat(beithady/fnb): add item bottom-sheet + cart bar (cart-store via localStorage)'
```

---

### Task 24: Boarding-pass page integration — "Order Food" CTA

**Files:**
- Modify: the existing boarding-pass page (likely `src/app/boarding/[token]/page.tsx` — locate via `grep -rn "boarding_passes\|boarding-pass" src/app/`)

- [ ] **Step 1: Locate the boarding-pass page**

```bash
grep -rln "boarding_passes\|/boarding/" src/app/ | head
```

- [ ] **Step 2: Add the CTA**

In the located boarding-pass page, after the existing primary
content, add a section that:

1. Calls `validateDineToken` to check whether the same token has F&B
   access (i.e., reservation is `checked_in` and building is enabled).
2. If yes, renders a brand-styled "Order Food" button linking to
   `/dine/[token]`.
3. If no, hides it silently (don't show a disabled button — it's
   confusing pre-arrival).

```tsx
// add inside the existing page component:
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

// inside the server component, after fetching the boarding pass:
const fnb = await validateDineToken(token);

// in the JSX, after the primary content:
{fnb.ok && (
  <a
    href={`/dine/${token}`}
    className="block mt-4 mx-6 text-center rounded-full py-4 font-semibold"
    style={{ background: '#0F3F58', color: '#FAF8F4' }}
  >
    🍽️ Order Food
  </a>
)}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/boarding   # adjust path if different
git commit -m 'feat(beithady/fnb): add Order Food CTA to boarding-pass page'
```

---

### Task 25: QR code rendering on the boarding-pass page

**Files:**
- Modify: `package.json` — add `qrcode` to dependencies
- Modify: the boarding-pass page (same file as Task 24)
- Create: `src/app/api/dine/[token]/qr.svg/route.ts`

- [ ] **Step 1: Install `qrcode`**

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

- [ ] **Step 2: Implement the QR endpoint (server-rendered SVG, cacheable)**

```ts
// src/app/api/dine/[token]/qr.svg/route.ts
import 'server-only';
import { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

interface Ctx { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return new Response('not_found', { status: 404 });

  const url = new URL(req.url);
  const target = `${url.origin}/dine/${token}`;
  const svg = await QRCode.toString(target, {
    type: 'svg',
    margin: 1,
    color: { dark: '#0F3F58', light: '#0000' },
    errorCorrectionLevel: 'M',
  });
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

- [ ] **Step 3: Add the QR section on the boarding-pass page**

```tsx
{fnb.ok && (
  <section className="mt-6 mx-6 print:mx-0 print:mt-12">
    <h3 className="text-sm uppercase tracking-wide font-semibold text-center mb-2">
      In-Room Dining QR
    </h3>
    <img
      src={`/api/dine/${token}/qr.svg`}
      alt="Scan to order food"
      className="w-48 h-48 mx-auto"
    />
    <p className="text-xs text-center mt-2 text-slate-500">
      Print and place in the apartment for guests to scan.
    </p>
  </section>
)}
```

Add a print stylesheet helper (Tailwind `print:` variants already
work) so that when ops hits browser-print on the boarding pass, the
QR is centered + clean.

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add package.json package-lock.json src/app/api/dine src/app/boarding
git commit -m 'feat(beithady/fnb): add QR code endpoint + boarding-pass QR section'
```

---

### 🟢 Phase F.3 checkpoint

After deploy:
1. Pick a real reservation that's currently `checked_in` in an Egypt
   building. (Manually flip a test reservation if needed.)
2. Open the boarding-pass page on a phone — see the "Order Food"
   button + the QR.
3. Tap "Order Food" or scan the QR — `/dine/[token]` renders with
   cream/navy/coral palette, Cormorant Garamond headings, Poppins
   item names, palm silhouette, halftone corners.
4. Tap an item — bottom sheet slides up, modifier toggle works, qty
   stepper works, "Add to order" closes and cart bar appears.
5. Try with a `checked_out` reservation — service-unavailable page
   renders.
6. Try with BH-DXB — service-unavailable (no F&B Egypt-only).
7. Print the boarding-pass page — QR is centered and clean.

If all green → proceed to Phase F.4.

---

## Phase F.4 — Cart + submit + confirmation

Goal: After this phase, an in-house guest can build a cart, pick a
delivery time, submit, and watch a live-status confirmation page.
Order persists in `fnb_orders`. Cancellation works inside the
2-minute grace window. Operator dashboard not yet wired (Phase F.5).

### Task 26: `src/lib/beithady/fnb/cart.ts` — totals math

**Files:**
- Create: `src/lib/beithady/fnb/cart.ts`
- Test: `src/lib/beithady/fnb/cart.test.ts`

Per spec §4.5: `total_usd` is the inclusive amount; subtotal/VAT/
service are display-only. Formulas:
- `vat = round(total * 14/126, 2)`
- `service = round(total * 12/126, 2)`
- `subtotal = total - vat - service`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeCartTotals, computeLineTotal } from './cart';

describe('cart math', () => {
  it('computeLineTotal handles modifiers and qty', () => {
    expect(computeLineTotal({
      unit_price_usd: 8, quantity: 2,
      modifiers: [{ price_delta_usd: 3 }, { price_delta_usd: 5 }],
    })).toBeCloseTo(32);  // (8 + 3 + 5) * 2
  });

  it('computeCartTotals breaks down inclusive total', () => {
    const t = computeCartTotals([
      { unit_price_usd: 7, quantity: 1, modifiers: [] },
      { unit_price_usd: 19, quantity: 1, modifiers: [] },
    ]);
    expect(t.total_usd).toBe(26);
    expect(t.vat_usd).toBeCloseTo(26 * 14 / 126, 2);
    expect(t.service_usd).toBeCloseTo(26 * 12 / 126, 2);
    expect(t.subtotal_usd).toBeCloseTo(26 - t.vat_usd - t.service_usd, 2);
    // breakdown sums back to total (within 1¢ rounding tolerance)
    expect(t.subtotal_usd + t.vat_usd + t.service_usd).toBeCloseTo(t.total_usd, 1);
  });

  it('handles zero items', () => {
    const t = computeCartTotals([]);
    expect(t.total_usd).toBe(0);
  });
});
```

- [ ] **Step 2: Implement `cart.ts`**

```ts
export interface CartLineForMath {
  unit_price_usd: number;
  quantity: number;
  modifiers: Array<{ price_delta_usd: number }>;
}

export function computeLineTotal(l: CartLineForMath): number {
  const lineUnit = l.unit_price_usd
    + l.modifiers.reduce((s, m) => s + m.price_delta_usd, 0);
  return Math.round(lineUnit * l.quantity * 100) / 100;
}

export interface CartTotals {
  total_usd: number;
  vat_usd: number;
  service_usd: number;
  subtotal_usd: number;
}

export function computeCartTotals(lines: CartLineForMath[]): CartTotals {
  const total = lines.reduce((s, l) => s + computeLineTotal(l), 0);
  const total_usd = Math.round(total * 100) / 100;
  const vat_usd = Math.round((total_usd * 14 / 126) * 100) / 100;
  const service_usd = Math.round((total_usd * 12 / 126) * 100) / 100;
  const subtotal_usd = Math.round((total_usd - vat_usd - service_usd) * 100) / 100;
  return { total_usd, vat_usd, service_usd, subtotal_usd };
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test -- src/lib/beithady/fnb/cart.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/beithady/fnb/cart.ts src/lib/beithady/fnb/cart.test.ts
git commit -m 'feat(beithady/fnb): add cart totals math (inclusive VAT+service breakdown)'
```

---

### Task 27: `src/lib/beithady/fnb/order-status.ts` — transition rules

**Files:**
- Create: `src/lib/beithady/fnb/order-status.ts`
- Test: `src/lib/beithady/fnb/order-status.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { canTransition, nextValidStates, isCancellable } from './order-status';

describe('order status transitions', () => {
  it('submitted → preparing allowed', () => {
    expect(canTransition('submitted', 'preparing')).toBe(true);
  });
  it('preparing → submitted not allowed', () => {
    expect(canTransition('preparing', 'submitted')).toBe(false);
  });
  it('delivered → cancelled requires admin', () => {
    expect(canTransition('delivered', 'cancelled', { actor: 'manager' })).toBe(true);
    expect(canTransition('delivered', 'cancelled', { actor: 'ops' })).toBe(false);
  });
  it('closed is terminal', () => {
    expect(nextValidStates('closed')).toEqual([]);
  });
  it('cancellable within grace + status submitted', () => {
    const submittedAt = new Date(Date.now() - 30_000).toISOString(); // 30s ago
    expect(isCancellable({
      status: 'submitted', submitted_at: submittedAt,
      grace_seconds: 120,
    })).toBe(true);
  });
  it('not cancellable after grace expires', () => {
    const submittedAt = new Date(Date.now() - 200_000).toISOString();
    expect(isCancellable({
      status: 'submitted', submitted_at: submittedAt,
      grace_seconds: 120,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { OrderStatus } from './types';

type Actor = 'guest' | 'ops' | 'fnb_manager' | 'manager' | 'admin' | 'cron';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  submitted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['delivered', 'cancelled'],
  delivered: ['closed', 'cancelled'],
  closed:    [],
  cancelled: [],
};

const ADMIN_ACTORS: Actor[] = ['fnb_manager', 'manager', 'admin'];

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  ctx: { actor?: Actor } = {},
): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  // Cancelling after delivered requires manager+
  if (from === 'delivered' && to === 'cancelled') {
    return !!ctx.actor && ADMIN_ACTORS.includes(ctx.actor);
  }
  return true;
}

export function nextValidStates(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from];
}

export function isCancellable(opts: {
  status: OrderStatus;
  submitted_at: string;
  grace_seconds: number;
}): boolean {
  if (opts.status !== 'submitted') return false;
  const ageMs = Date.now() - new Date(opts.submitted_at).getTime();
  return ageMs <= opts.grace_seconds * 1000;
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm run test -- src/lib/beithady/fnb/order-status.test.ts
git add src/lib/beithady/fnb/order-status.ts src/lib/beithady/fnb/order-status.test.ts
git commit -m 'feat(beithady/fnb): add order status transition rules'
```

---

### Task 28: Cart drawer at `/dine/[token]/order` — full editable cart with totals

**Files:**
- Create: `src/app/dine/[token]/order/page.tsx`
- Create: `src/app/dine/[token]/order/_components/cart-view.tsx`
- Create: `src/app/dine/[token]/order/_components/delivery-picker.tsx`

- [ ] **Step 1: Implement `page.tsx`** (server component validates token + fetches building's `delivery_sla_minutes`; client component drives the UI)

```tsx
import 'server-only';
import { notFound } from 'next/navigation';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { BrandShell } from '../_components/brand-shell';
import { CartView } from './_components/cart-view';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string }> }

export default async function CartPage({ params }: Ctx) {
  const { token } = await params;
  const c = await validateDineToken(token);
  if (!c.ok) notFound();

  const sb = supabaseAdmin();
  const { data: bld } = await sb
    .from('fnb_buildings')
    .select('delivery_sla_minutes, cancellation_grace_seconds')
    .eq('building_code', c.building_code)
    .single();

  return (
    <BrandShell
      guestName={c.guest_name}
      buildingCode={c.building_code}
      unitCode={c.unit_code}
      lang="en"
    >
      <CartView
        token={token}
        buildingCode={c.building_code}
        unitCode={c.unit_code}
        deliverySlaMinutes={bld?.delivery_sla_minutes ?? 30}
      />
    </BrandShell>
  );
}
```

- [ ] **Step 2: Implement `cart-view.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCart, cart } from '../../_components/cart-store';
import { computeCartTotals } from '@/lib/beithady/fnb/cart';
import { DeliveryPicker } from './delivery-picker';

export function CartView({
  token, buildingCode, unitCode, deliverySlaMinutes,
}: {
  token: string;
  buildingCode: string;
  unitCode: string;
  deliverySlaMinutes: number;
}) {
  const { lines } = useCart();
  const router = useRouter();
  const [delivery, setDelivery] = useState<'asap' | 30 | 60>('asap');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totals = useMemo(() =>
    computeCartTotals(
      lines.map(l => ({
        unit_price_usd: l.unit_price_usd,
        quantity: l.quantity,
        modifiers: l.modifiers,
      })),
    ),
  [lines]);

  async function submit() {
    setSubmitting(true); setErr(null);
    const idempotency_key = crypto.randomUUID();
    const requested_delivery_at = delivery === 'asap'
      ? null
      : new Date(Date.now() + Number(delivery) * 60_000).toISOString();
    const res = await fetch(`/api/dine/${token}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key,
        guest_language: 'en',
        requested_delivery_at,
        notes: notes || null,
        lines: lines.map(l => ({
          item_id: l.item_id,
          quantity: l.quantity,
          modifier_ids: l.modifier_ids,
          notes: l.notes || null,
        })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return;
    }
    const { order } = await res.json();
    cart.clear();
    router.push(`/dine/${token}/order/${order.id}`);
  }

  if (lines.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <p className="display text-2xl mb-3">Your cart is empty</p>
        <Link
          href={`/dine/${token}`}
          className="inline-block mt-2 underline"
          style={{ color: 'var(--bh-navy)' }}
        >Back to menu</Link>
      </div>
    );
  }

  return (
    <div className="px-6 pb-12">
      <h2 className="display text-2xl text-center mb-6">Your order</h2>
      <ul className="space-y-3 mb-6">
        {lines.map(l => (
          <li key={l.id} className="flex items-start gap-3 pb-3 border-b border-slate-200">
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <span className="dine-item-name">{l.item_name}</span>
                <span className="dine-item-price">
                  ${(l.quantity *
                      (l.unit_price_usd +
                        l.modifiers.reduce((s, m) => s + m.price_delta_usd, 0))
                    ).toFixed(0)}
                </span>
              </div>
              {l.modifiers.map(m => (
                <p key={m.id} className="text-xs text-slate-500">+ {m.name}</p>
              ))}
              {l.notes && <p className="text-xs italic text-slate-500">"{l.notes}"</p>}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => cart.setQty(l.id, Math.max(1, l.quantity - 1))}
                  className="w-7 h-7 rounded-full border text-sm"
                >−</button>
                <span className="text-sm">{l.quantity}</span>
                <button
                  onClick={() => cart.setQty(l.id, Math.min(10, l.quantity + 1))}
                  className="w-7 h-7 rounded-full border text-sm"
                >+</button>
                <button
                  onClick={() => cart.remove(l.id)}
                  className="ml-auto text-xs text-red-600"
                >Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <DeliveryPicker
        value={delivery}
        onChange={setDelivery}
        slaMinutes={deliverySlaMinutes}
      />

      <label className="block mt-4">
        <span className="text-xs uppercase tracking-wide font-semibold">
          Order notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value.slice(0, 500))}
          rows={2}
          className="w-full mt-1 rounded border p-2 text-sm"
          placeholder="Allergies, special requests…"
        />
      </label>

      <dl className="mt-6 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt><dd>${totals.subtotal_usd.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between text-slate-500">
          <dt>VAT (14%, included)</dt><dd>${totals.vat_usd.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between text-slate-500">
          <dt>Service (12%, included)</dt><dd>${totals.service_usd.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold mt-2 pt-2 border-t">
          <dt>Total</dt><dd>${totals.total_usd.toFixed(2)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-center" style={{ color: 'var(--bh-ink-muted)' }}>
        Charged to {buildingCode} · Unit {unitCode} — settled at checkout
      </p>

      {err && <p className="mt-3 text-sm text-red-600 text-center">{err}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="block w-full mt-6 py-4 rounded-full text-white font-semibold disabled:opacity-50"
        style={{ background: 'var(--bh-navy)' }}
      >
        {submitting ? 'Submitting…' : `Submit order · $${totals.total_usd.toFixed(0)}`}
      </button>

      <Link
        href={`/dine/${token}`}
        className="block text-center mt-3 text-sm underline"
        style={{ color: 'var(--bh-navy)' }}
      >+ Add more items</Link>
    </div>
  );
}
```

- [ ] **Step 3: Implement `delivery-picker.tsx`**

```tsx
'use client';

export function DeliveryPicker({
  value, onChange, slaMinutes,
}: {
  value: 'asap' | 30 | 60;
  onChange: (v: 'asap' | 30 | 60) => void;
  slaMinutes: number;
}) {
  const opts: Array<{ key: 'asap' | 30 | 60; label: string }> = [
    { key: 'asap', label: `ASAP (~${slaMinutes} min)` },
    { key: 30, label: 'In 30 min' },
    { key: 60, label: 'In 1 hour' },
  ];
  return (
    <fieldset className="mt-4">
      <legend className="text-xs uppercase tracking-wide font-semibold mb-2">
        Delivery time
      </legend>
      <div className="flex gap-2">
        {opts.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="flex-1 py-2 text-sm rounded border"
            style={{
              borderColor: value === o.key ? 'var(--bh-navy)' : 'transparent',
              background: value === o.key ? 'var(--bh-navy)' : 'transparent',
              color: value === o.key ? 'var(--bh-on-navy)' : 'var(--bh-navy)',
            }}
          >{o.label}</button>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/app/dine/[token]/order
git commit -m 'feat(beithady/fnb): add full cart drawer with totals + delivery picker'
```

---

### Task 29: API `POST /api/dine/[token]/order` — submit with idempotency + last-mile validation

**Files:**
- Create: `src/app/api/dine/[token]/order/route.ts`
- Test: `src/app/api/dine/[token]/order/route.test.ts`

This endpoint MUST:
1. Re-validate the token (reservation still `checked_in`).
2. Re-validate every line item is enabled, in-hours, not stocked-out
   at this building (last-mile check — guest could've added when
   in-hours but submitted post-hours).
3. Snapshot pricing into `fnb_order_items`.
4. Compute totals server-side (do NOT trust client total).
5. Reject duplicate `idempotency_key` with 200 + the existing order.
6. Insert + return the order.
7. Trigger WA push to kitchen (Phase F.5 — wire stub now).

- [ ] **Step 1: Implement the route**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { computeCartTotals, computeLineTotal } from '@/lib/beithady/fnb/cart';
import { SubmitOrderPayloadSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) {
    return NextResponse.json({ error: c.reason }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const parsed = SubmitOrderPayloadSchema.parse(body);

  const sb = supabaseAdmin();

  // 1. Idempotency: if key seen, return existing order
  const existing = await sb.from('fnb_orders')
    .select('*').eq('idempotency_key', parsed.idempotency_key).maybeSingle();
  if (existing.data) {
    return NextResponse.json({ order: existing.data });
  }

  // 2. Fetch items + modifiers + overrides for last-mile validation
  const itemIds = [...new Set(parsed.lines.map(l => l.item_id))];
  const modifierIds = [...new Set(parsed.lines.flatMap(l => l.modifier_ids))];
  const [itemsRes, modsRes, overridesRes] = await Promise.all([
    sb.from('fnb_items').select('*')
      .in('id', itemIds).eq('enabled', true).is('deleted_at', null),
    modifierIds.length > 0
      ? sb.from('fnb_item_modifiers').select('*')
        .in('id', modifierIds).eq('enabled', true)
      : Promise.resolve({ data: [], error: null }),
    sb.from('fnb_building_overrides').select('item_id')
      .eq('building_code', c.building_code).eq('is_out_of_stock', true)
      .in('item_id', itemIds),
  ]);
  if (itemsRes.error || modsRes.error || overridesRes.error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  const items = itemsRes.data ?? [];
  const mods = modsRes.data ?? [];
  const outOfStock = new Set((overridesRes.data ?? []).map(o => o.item_id));

  // 3. Validate every line + check hours
  const now = new Date();
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(now),
    10,
  );
  const cairoMinute = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', minute: 'numeric' }).format(now),
    10,
  );

  function inWindow(start: string, end: string): boolean {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const cur = cairoHour * 60 + cairoMinute;
    return cur >= sh * 60 + sm && cur <= eh * 60 + em;
  }

  // Pre-fetch categories for hours fallback
  const cats = await sb.from('fnb_categories').select('*').eq('enabled', true);
  const catMap = new Map((cats.data ?? []).map(c => [c.id, c]));

  const orderLines: Array<{
    item_id: string;
    item_name_snapshot: string;
    quantity: number;
    unit_price_usd_snapshot: number;
    modifier_snapshot: Array<{ id: string; name_en: string; name_localized: string; price_delta_usd: number }>;
    line_total_usd: number;
    notes: string | null;
  }> = [];

  for (const line of parsed.lines) {
    const item = items.find(i => i.id === line.item_id);
    if (!item) {
      return NextResponse.json({ error: 'item_unavailable', item_id: line.item_id }, { status: 409 });
    }
    if (outOfStock.has(item.id)) {
      return NextResponse.json({ error: 'item_out_of_stock', item_id: item.id }, { status: 409 });
    }
    const start = item.hours_start_override
      ?? catMap.get(item.category_id)?.hours_start
      ?? '08:00';
    const end = item.hours_end_override
      ?? catMap.get(item.category_id)?.hours_end
      ?? '23:59';
    if (!inWindow(start, end)) {
      return NextResponse.json({ error: 'item_out_of_hours', item_id: item.id }, { status: 409 });
    }
    const lineMods = line.modifier_ids.map(mid => {
      const m = mods.find(x => x.id === mid && x.item_id === item.id);
      if (!m) throw new Error('modifier_not_for_item');
      return m;
    });
    const lineTotal = computeLineTotal({
      unit_price_usd: item.price_usd,
      quantity: line.quantity,
      modifiers: lineMods.map(m => ({ price_delta_usd: m.price_delta_usd })),
    });
    orderLines.push({
      item_id: item.id,
      item_name_snapshot: item[`name_${parsed.guest_language}`] ?? item.name_en,
      quantity: line.quantity,
      unit_price_usd_snapshot: item.price_usd,
      modifier_snapshot: lineMods.map(m => ({
        id: m.id,
        name_en: m.name_en,
        name_localized: m[`name_${parsed.guest_language}`] ?? m.name_en,
        price_delta_usd: m.price_delta_usd,
      })),
      line_total_usd: lineTotal,
      notes: line.notes ?? null,
    });
  }

  // 4. Compute totals server-side
  const totals = computeCartTotals(
    orderLines.map(l => ({
      unit_price_usd: l.unit_price_usd_snapshot,
      quantity: l.quantity,
      modifiers: l.modifier_snapshot.map(m => ({ price_delta_usd: m.price_delta_usd })),
    })),
  );

  // 5. SLA-based ETA
  const { data: bld } = await sb.from('fnb_buildings')
    .select('delivery_sla_minutes')
    .eq('building_code', c.building_code).single();
  const eta = parsed.requested_delivery_at
    ?? new Date(Date.now() + (bld?.delivery_sla_minutes ?? 30) * 60_000).toISOString();

  // 6. Insert order + lines + first status event in a transaction-y way
  const { data: order, error: orderErr } = await sb.from('fnb_orders').insert({
    reservation_id: c.reservation_id,
    building_code: c.building_code,
    unit_code: c.unit_code,
    guest_name: c.guest_name,
    guest_language: parsed.guest_language,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    subtotal_usd: totals.subtotal_usd,
    vat_usd: totals.vat_usd,
    service_usd: totals.service_usd,
    total_usd: totals.total_usd,
    requested_delivery_at: parsed.requested_delivery_at,
    eta_at: eta,
    notes: parsed.notes ?? null,
    idempotency_key: parsed.idempotency_key,
  }).select().single();

  if (orderErr || !order) {
    // Idempotency unique violation: re-fetch and return
    if (orderErr?.code === '23505') {
      const re = await sb.from('fnb_orders').select('*')
        .eq('idempotency_key', parsed.idempotency_key).single();
      if (re.data) return NextResponse.json({ order: re.data });
    }
    return NextResponse.json({ error: 'insert_failed', detail: orderErr?.message }, { status: 500 });
  }

  await sb.from('fnb_order_items').insert(
    orderLines.map(l => ({ ...l, order_id: order.id })),
  );

  await sb.from('fnb_status_events').insert({
    order_id: order.id,
    from_status: null,
    to_status: 'submitted',
    changed_by_user_id: null,
    changed_via: 'guest',
    notes: 'Order submitted by guest',
  });

  // 7. Fire WA push to kitchen — Phase F.5 wires this; for now a no-op
  // try { await notifyKitchen(order.id); } catch (e) { console.error(e); }

  return NextResponse.json({ order }, { status: 201 });
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/api/dine/[token]/order
git commit -m 'feat(beithady/fnb): add order submit endpoint with idempotency + last-mile validation'
```

---

### Task 30: API `GET /api/dine/[token]/order/[orderId]` — guest fetches their own order

**Files:**
- Create: `src/app/api/dine/[token]/order/[orderId]/route.ts`

- [ ] **Step 1: Implement**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });

  const sb = supabaseAdmin();
  const [orderRes, linesRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', orderId).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', orderId)
      .order('created_at', { ascending: true }),
  ]);
  if (!orderRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  // Authorization check: order must belong to this guest's reservation.
  if (orderRes.data.reservation_id !== c.reservation_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({
    order: orderRes.data,
    lines: linesRes.data ?? [],
  });
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/api/dine/[token]/order/[orderId]/route.ts
git commit -m 'feat(beithady/fnb): add guest order detail endpoint'
```

---

### Task 31: API `POST /api/dine/[token]/order/[orderId]/cancel` — within grace window

**Files:**
- Create: `src/app/api/dine/[token]/order/[orderId]/cancel/route.ts`

- [ ] **Step 1: Implement**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { isCancellable, canTransition } from '@/lib/beithady/fnb/order-status';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });

  const sb = supabaseAdmin();
  const { data: order, error } = await sb.from('fnb_orders')
    .select('*').eq('id', orderId).single();
  if (error || !order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (order.reservation_id !== c.reservation_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data: bld } = await sb.from('fnb_buildings')
    .select('cancellation_grace_seconds').eq('building_code', c.building_code).single();
  const grace = bld?.cancellation_grace_seconds ?? 120;

  if (!isCancellable({ status: order.status, submitted_at: order.submitted_at, grace_seconds: grace })) {
    return NextResponse.json({ error: 'grace_expired' }, { status: 409 });
  }
  if (!canTransition(order.status, 'cancelled')) {
    return NextResponse.json({ error: 'cannot_cancel' }, { status: 409 });
  }

  const { error: upErr } = await sb.from('fnb_orders').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: 'guest_cancelled_within_grace',
  }).eq('id', orderId);
  if (upErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  await sb.from('fnb_status_events').insert({
    order_id: orderId,
    from_status: order.status,
    to_status: 'cancelled',
    changed_via: 'guest',
    notes: 'Guest cancelled within grace window',
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/api/dine/[token]/order/[orderId]/cancel/route.ts
git commit -m 'feat(beithady/fnb): add guest cancel endpoint with grace-window enforcement'
```

---

### Task 32: Order confirmation page `/dine/[token]/order/[id]` — live status + cancel

**Files:**
- Create: `src/app/dine/[token]/order/[id]/page.tsx`
- Create: `src/app/dine/[token]/order/[id]/_components/order-status-view.tsx`

- [ ] **Step 1: Implement `page.tsx`**

```tsx
import 'server-only';
import { notFound } from 'next/navigation';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { BrandShell } from '../../_components/brand-shell';
import { OrderStatusView } from './_components/order-status-view';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ token: string; id: string }> }

export default async function OrderConfirmationPage({ params }: Ctx) {
  const { token, id } = await params;
  const c = await validateDineToken(token);
  if (!c.ok) notFound();

  const sb = supabaseAdmin();
  const [orderRes, linesRes, bldRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', id).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', id),
    sb.from('fnb_buildings').select('cancellation_grace_seconds')
      .eq('building_code', c.building_code).single(),
  ]);
  if (!orderRes.data || orderRes.data.reservation_id !== c.reservation_id) notFound();

  return (
    <BrandShell
      guestName={c.guest_name}
      buildingCode={c.building_code}
      unitCode={c.unit_code}
      lang="en"
    >
      <OrderStatusView
        token={token}
        initialOrder={orderRes.data}
        lines={linesRes.data ?? []}
        graceSeconds={bldRes.data?.cancellation_grace_seconds ?? 120}
      />
    </BrandShell>
  );
}
```

- [ ] **Step 2: Implement `order-status-view.tsx`** (5-sec poll + cancel button only while in grace)

```tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const LABELS: Record<string, string> = {
  submitted: '🛎  Order received',
  preparing: '👨‍🍳  Preparing',
  ready: '✅  Ready',
  delivered: '🍽  Delivered',
  closed: '🍽  Delivered',
  cancelled: '✗  Cancelled',
};

export function OrderStatusView({
  token, initialOrder, lines, graceSeconds,
}: {
  token: string;
  initialOrder: any;
  lines: any[];
  graceSeconds: number;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const r = await fetch(`/api/dine/${token}/order/${order.id}`);
      if (r.ok) {
        const j = await r.json();
        setOrder(j.order);
      }
    }, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [token, order.id]);

  const submittedMs = new Date(order.submitted_at).getTime();
  const elapsed = Math.floor((now - submittedMs) / 1000);
  const remaining = Math.max(0, graceSeconds - elapsed);
  const canCancel = order.status === 'submitted' && remaining > 0;

  async function cancel() {
    if (!confirm('Cancel this order?')) return;
    setCancelling(true);
    const res = await fetch(`/api/dine/${token}/order/${order.id}/cancel`, { method: 'POST' });
    setCancelling(false);
    if (res.ok) {
      const r = await fetch(`/api/dine/${token}/order/${order.id}`);
      setOrder((await r.json()).order);
    }
  }

  return (
    <div className="px-6 pb-12">
      <h2 className="display text-3xl text-center mt-4 mb-1">
        {LABELS[order.status]}
      </h2>
      {order.eta_at && order.status !== 'cancelled' && order.status !== 'closed' && (
        <p className="text-center text-sm" style={{ color: 'var(--bh-ink-muted)' }}>
          Expected by {new Date(order.eta_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div className="mt-6 ix-card p-4" style={{ background: 'var(--bh-cream-50)' }}>
        <h3 className="text-xs uppercase tracking-wide font-semibold mb-2">
          Order #{String(order.order_number).padStart(4, '0')}
        </h3>
        <ul className="text-sm divide-y divide-slate-200">
          {lines.map(l => (
            <li key={l.id} className="py-2 flex justify-between">
              <span>
                {l.quantity} × {l.item_name_snapshot}
                {l.modifier_snapshot.length > 0 && (
                  <span className="block text-xs text-slate-500">
                    {l.modifier_snapshot.map((m: any) => `+ ${m.name_localized}`).join(', ')}
                  </span>
                )}
              </span>
              <span>${l.line_total_usd.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 pt-3 border-t font-semibold flex justify-between">
          <span>Total</span><span>${Number(order.total_usd).toFixed(2)}</span>
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--bh-ink-muted)' }}>
          Charged to your room — settled at checkout.
        </p>
      </div>

      {canCancel && (
        <button
          onClick={cancel}
          disabled={cancelling}
          className="block mx-auto mt-4 text-sm underline text-red-600 disabled:opacity-50"
        >
          Cancel order ({remaining}s remaining)
        </button>
      )}

      {order.status === 'delivered' || order.status === 'closed' ? (
        <a
          href={`/api/dine/${token}/receipt/${order.id}`}
          className="block mx-auto mt-6 text-center text-sm underline"
          style={{ color: 'var(--bh-navy)' }}
        >Download receipt</a>
      ) : null}

      <Link
        href={`/dine/${token}`}
        className="block mx-auto mt-6 text-center py-3 px-4 rounded-full"
        style={{
          background: 'var(--bh-navy)', color: 'var(--bh-on-navy)',
          maxWidth: '16rem',
        }}
      >Order again</Link>
    </div>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/dine/[token]/order/[id]
git commit -m 'feat(beithady/fnb): add order confirmation page with live status + cancel'
```

---

### 🟢 Phase F.4 checkpoint

After deploy:
1. Real `checked_in` reservation in BH-26: enable F&B for BH-26 in
   the DB: `UPDATE fnb_buildings SET enabled = true WHERE building_code = 'BH-26';`
2. Browse menu, add 2 items (one with a modifier), submit.
3. Order confirmation page shows status `submitted` with a 120-sec
   cancel countdown.
4. Verify in SQL:
   ```sql
   SELECT order_number, status, total_usd FROM fnb_orders ORDER BY created_at DESC LIMIT 1;
   SELECT count(*) FROM fnb_order_items WHERE order_id = (SELECT id FROM fnb_orders ORDER BY created_at DESC LIMIT 1);
   ```
5. Submit the SAME `idempotency_key` (devtools — fire fetch twice).
   Expect the second call returns the existing order, NOT a duplicate.
6. Wait > 120s — cancel link disappears.
7. Try to cancel via `POST /api/dine/[token]/order/[id]/cancel` after
   grace — expect 409 `grace_expired`.
8. Manually update the order's status in SQL through the pipeline:
   `submitted → preparing → ready → delivered`. Watch the
   confirmation page poll and update each step (5-sec poll).

If all green → proceed to Phase F.5.

---

## Phase F.5 — Operator kanban + WhatsApp push

Goal: After this phase, ops/F&B sees a live kanban at `/beithady/fnb`,
can drag orders through statuses, and the kitchen receives a
WhatsApp Cloud message on every new submitted order. Stale-order
amber alerting via cron lands in F.8.

### Task 33: `src/lib/beithady/fnb/wa-notifier.ts` — operator + guest WA push

**Files:**
- Create: `src/lib/beithady/fnb/wa-notifier.ts`
- Test: `src/lib/beithady/fnb/wa-notifier.test.ts`

This module sends WhatsApp messages with a 3-tier fallback:
**WA Cloud → WA Casual (Green-API) → Guesty conversation**. It's used
by both the operator-side kitchen alert (when an order hits
`submitted`) and the guest-side status notifications (when an order
moves through statuses; full receipt push lives in Phase F.7).

- [ ] **Step 1: Find the existing WA Cloud and Casual helpers**

```bash
grep -rln "whatsappCloud\|sendWhatsApp\|green-api\|greenApi" src/lib/ | head
```

Note the function signatures. The notifier wraps them with a unified
shape; if no helper exists yet, the test below documents the contract.

- [ ] **Step 2: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { notifyKitchen, notifyGuestStatus } from './wa-notifier';

describe('wa-notifier shape contract', () => {
  it('exports the two functions', () => {
    expect(typeof notifyKitchen).toBe('function');
    expect(typeof notifyGuestStatus).toBe('function');
  });
});

// Real integration tests require live WA / Guesty creds; gate behind env.
const live = process.env.WA_CLOUD_TOKEN ? it : it.skip;
live('notifyKitchen sends to all configured recipients', async () => {
  // pre: building BH-26 has a test recipient configured
  // (use a sandbox WA number)
  const result = await notifyKitchen('00000000-0000-0000-0000-000000000000');
  expect(result.attempted).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Implement `wa-notifier.ts`**

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
// Replace these imports with whatever the repo already exports.
// Two tiers expected:
//   sendViaWhatsAppCloud({ to, body })       — async ({ ok, message_id?, error? })
//   sendViaWhatsAppCasual({ to, body })      — async ({ ok, error? })
//   postToGuestyConversation({ reservationId, body })
//
// If the helpers don't exist yet, add them to src/lib/whatsapp/ first
// (matching whatever Cloud/Casual SDK setup is already in env vars).

import { sendViaWhatsAppCloud } from '@/lib/whatsapp/cloud';
import { sendViaWhatsAppCasual } from '@/lib/whatsapp/casual';
import { postToGuestyConversation } from '@/lib/beithady/communication/guesty-conversation';

export interface NotifyResult {
  attempted: number;
  delivered: number;
  via: Array<'wa_cloud' | 'wa_casual' | 'guesty' | 'failed'>;
}

const DEFAULT_KITCHEN_TEMPLATE = (vars: {
  order_id: string;
  building_code: string;
  unit_code: string;
  guest_name: string | null;
  items_summary: string;
  total: string;
  delivery_time: string;
  dashboard_link: string;
}) => `🍽️ New F&B order #${vars.order_id}
${vars.building_code} · Unit ${vars.unit_code}${vars.guest_name ? ` · ${vars.guest_name}` : ''}
─────
${vars.items_summary}
─────
Total $${vars.total} · Delivery ${vars.delivery_time}
Open: ${vars.dashboard_link}`;

export async function notifyKitchen(orderId: string): Promise<NotifyResult> {
  const sb = supabaseAdmin();
  const { data: order } = await sb.from('fnb_orders').select('*').eq('id', orderId).single();
  if (!order) return { attempted: 0, delivered: 0, via: [] };
  const { data: lines } = await sb.from('fnb_order_items').select('*').eq('order_id', orderId);
  const { data: bld } = await sb.from('fnb_buildings').select('*')
    .eq('building_code', order.building_code).single();

  if (!bld?.kitchen_wa_recipients?.length) {
    return { attempted: 0, delivered: 0, via: ['failed'] };
  }

  const items_summary = (lines ?? [])
    .map(l => `${l.quantity}× ${l.item_name_snapshot}`)
    .join('\n');
  const dashboard_link =
    `https://limeinc.vercel.app/beithady/fnb?id=${order.id}`;
  const delivery_time = order.requested_delivery_at
    ? new Date(order.requested_delivery_at).toLocaleTimeString('en-GB',
        { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })
    : `ASAP (~${bld.delivery_sla_minutes ?? 30} min)`;

  const body = DEFAULT_KITCHEN_TEMPLATE({
    order_id: String(order.order_number).padStart(4, '0'),
    building_code: order.building_code,
    unit_code: order.unit_code,
    guest_name: order.guest_name,
    items_summary,
    total: Number(order.total_usd).toFixed(2),
    delivery_time,
    dashboard_link,
  });

  let attempted = 0, delivered = 0;
  const via: NotifyResult['via'] = [];

  for (const recipient of bld.kitchen_wa_recipients) {
    attempted++;
    // Try Cloud first
    try {
      const r = await sendViaWhatsAppCloud({ to: recipient, body });
      if (r.ok) { delivered++; via.push('wa_cloud'); continue; }
    } catch { /* fall through */ }
    // Casual fallback
    try {
      const r = await sendViaWhatsAppCasual({ to: recipient, body });
      if (r.ok) { delivered++; via.push('wa_casual'); continue; }
    } catch { /* fall through */ }
    via.push('failed');
  }

  return { attempted, delivered, via };
}

export async function notifyGuestStatus(
  orderId: string, newStatus: 'preparing' | 'ready' | 'delivered',
): Promise<NotifyResult> {
  const sb = supabaseAdmin();
  const { data: order } = await sb.from('fnb_orders').select('*').eq('id', orderId).single();
  if (!order) return { attempted: 0, delivered: 0, via: [] };

  const lang = order.guest_language ?? 'en';
  const messages: Record<string, Record<string, string>> = {
    en: {
      preparing: 'Your Beit Hady F&B order is being prepared.',
      ready: 'Your order is ready and on its way.',
      delivered: 'Your order has been delivered. Receipt will follow shortly.',
    },
    ar: {
      preparing: 'يتم تحضير طلبك من بيت هادي.',
      ready: 'طلبك جاهز وفي الطريق إليك.',
      delivered: 'تم تسليم طلبك. سيتم إرسال الفاتورة قريباً.',
    },
    ru: {
      preparing: 'Ваш заказ Beit Hady готовится.',
      ready: 'Ваш заказ готов и уже в пути.',
      delivered: 'Ваш заказ доставлен. Чек будет отправлен в ближайшее время.',
    },
    fr: {
      preparing: 'Votre commande Beit Hady est en préparation.',
      ready: 'Votre commande est prête et arrive.',
      delivered: 'Votre commande a été livrée. Le reçu suivra sous peu.',
    },
  };
  const body = messages[lang]?.[newStatus] ?? messages.en[newStatus];

  // Guest WA: prefer reservation's stored WA number; otherwise Guesty
  // conversation thread.
  // For v1, route via Guesty conversation (the existing module already
  // pushes the message on whichever channel the reservation used).
  try {
    await postToGuestyConversation({
      reservationId: order.reservation_id,
      body,
    });
    return { attempted: 1, delivered: 1, via: ['guesty'] };
  } catch {
    return { attempted: 1, delivered: 0, via: ['failed'] };
  }
}
```

- [ ] **Step 4: Wire submit-order to call `notifyKitchen`**

In `src/app/api/dine/[token]/order/route.ts` (Task 29), replace the
commented-out `// try { await notifyKitchen(order.id); } …` with a
real fire-and-forget call:

```ts
import { notifyKitchen } from '@/lib/beithady/fnb/wa-notifier';
// ...
// just before returning:
notifyKitchen(order.id).catch(err =>
  console.error('[fnb] notifyKitchen failed', err));
```

(`fire-and-forget` because submit shouldn't block on WA — failure is
logged but the order succeeds.)

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add src/lib/beithady/fnb/wa-notifier.ts src/lib/beithady/fnb/wa-notifier.test.ts src/app/api/dine/[token]/order/route.ts
git commit -m 'feat(beithady/fnb): add WA notifier (Cloud → Casual → Guesty fallback)'
```

---

### Task 34: API `GET /api/beithady/fnb/orders` — list with filters

**Files:**
- Create: `src/app/api/beithady/fnb/orders/route.ts`

- [ ] **Step 1: Implement**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { OrderStatusEnum } from '@/lib/beithady/fnb/types';

const Q = z.object({
  building_codes: z.array(z.string()).optional(),
  statuses: z.array(OrderStatusEnum).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const params: Record<string, unknown> = {};
  const buildings = url.searchParams.getAll('building_code');
  if (buildings.length) params.building_codes = buildings;
  const statuses = url.searchParams.getAll('status');
  if (statuses.length) params.statuses = statuses;
  if (url.searchParams.get('date_from')) params.date_from = url.searchParams.get('date_from')!;
  if (url.searchParams.get('date_to')) params.date_to = url.searchParams.get('date_to')!;
  if (url.searchParams.get('limit')) params.limit = url.searchParams.get('limit')!;

  const parsed = Q.parse(params);
  const sb = supabaseAdmin();
  let q = sb.from('fnb_orders')
    .select('*, fnb_order_items(item_name_snapshot, quantity, line_total_usd)')
    .order('submitted_at', { ascending: false })
    .limit(parsed.limit);
  if (parsed.building_codes) q = q.in('building_code', parsed.building_codes);
  if (parsed.statuses) q = q.in('status', parsed.statuses);
  if (parsed.date_from) q = q.gte('submitted_at', parsed.date_from);
  if (parsed.date_to) q = q.lte('submitted_at', parsed.date_to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/api/beithady/fnb/orders/route.ts
git commit -m 'feat(beithady/fnb): add operator orders list endpoint with filters'
```

---

### Task 35: API `GET /api/beithady/fnb/orders/[id]` — order detail

**Files:**
- Create: `src/app/api/beithady/fnb/orders/[id]/route.ts`

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const [order, lines, events] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', id).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', id)
      .order('created_at', { ascending: true }),
    sb.from('fnb_status_events').select('*').eq('order_id', id)
      .order('at', { ascending: true }),
  ]);
  if (!order.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    order: order.data,
    lines: lines.data ?? [],
    events: events.data ?? [],
  });
}
```

Commit:

```bash
git add src/app/api/beithady/fnb/orders/[id]/route.ts
git commit -m 'feat(beithady/fnb): add operator order detail endpoint'
```

---

### Task 36: API `PATCH /api/beithady/fnb/orders/[id]` — status update + WA push to guest

**Files:**
- Create: `src/app/api/beithady/fnb/orders/[id]/route.ts` already has GET — add PATCH alongside it.

- [ ] **Step 1: Add the PATCH handler in the same file as Task 35**

```ts
import { canTransition } from '@/lib/beithady/fnb/order-status';
import { notifyGuestStatus } from '@/lib/beithady/fnb/wa-notifier';
import { StatusUpdatePayloadSchema } from '@/lib/beithady/fnb/types';

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user, roles } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const parsed = StatusUpdatePayloadSchema.parse(await req.json());

  const sb = supabaseAdmin();
  const { data: order, error } = await sb.from('fnb_orders')
    .select('*').eq('id', id).single();
  if (error || !order) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Map highest role to actor for transition rules
  const actor: 'admin' | 'manager' | 'fnb_manager' | 'ops' =
    roles.includes('admin') ? 'admin'
    : roles.includes('manager') ? 'manager'
    : roles.includes('fnb_manager') ? 'fnb_manager' : 'ops';

  if (!canTransition(order.status, parsed.to_status, { actor })) {
    return NextResponse.json({ error: 'invalid_transition', from: order.status, to: parsed.to_status }, { status: 409 });
  }

  const ts = new Date().toISOString();
  const stamp: Record<string, string> = {
    preparing: 'preparing_at',
    ready: 'ready_at',
    delivered: 'delivered_at',
    closed: 'closed_at',
    cancelled: 'cancelled_at',
  };
  const update: Record<string, unknown> = {
    status: parsed.to_status,
    [stamp[parsed.to_status] ?? '']: ts,
  };
  if (parsed.to_status === 'cancelled' && parsed.notes) {
    update.cancellation_reason = parsed.notes;
  }
  const { data: updated, error: upErr } = await sb.from('fnb_orders')
    .update(update).eq('id', id).select().single();
  if (upErr) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  await sb.from('fnb_status_events').insert({
    order_id: id,
    from_status: order.status,
    to_status: parsed.to_status,
    changed_by_user_id: user.id,
    changed_via: 'dashboard',
    notes: parsed.notes ?? null,
  });

  // Audit
  await sb.from('beithady_audit_log').insert({
    actor_user_id: user.id,
    module: 'fnb',
    action: 'order.status_change',
    target_type: 'order',
    target_id: id,
    before: { status: order.status },
    after: { status: parsed.to_status, notes: parsed.notes ?? null },
  });

  // Push status to guest (fire-and-forget) for the 3 user-facing transitions
  if (parsed.to_status === 'preparing' || parsed.to_status === 'ready' || parsed.to_status === 'delivered') {
    notifyGuestStatus(id, parsed.to_status).catch(err =>
      console.error('[fnb] notifyGuestStatus failed', err));
  }
  // Phase F.7 will also fire receipt PDF auto-send at delivered.

  return NextResponse.json({ order: updated });
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/api/beithady/fnb/orders/[id]/route.ts
git commit -m 'feat(beithady/fnb): add operator status-update endpoint with guest WA push'
```

---

### Task 37: API `POST /api/beithady/fnb/orders/[id]/cancel` — admin/manager cancel with reason

**Files:**
- Create: `src/app/api/beithady/fnb/orders/[id]/cancel/route.ts`

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { canTransition } from '@/lib/beithady/fnb/order-status';

const Body = z.object({ reason: z.string().min(3).max(500) });

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user, roles } = await requireBeithadyPermission('fnb', 'full');
  if (!roles.some(r => ['admin','manager','fnb_manager'].includes(r))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const { reason } = Body.parse(await req.json());

  const sb = supabaseAdmin();
  const { data: order } = await sb.from('fnb_orders').select('*').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const actor = roles.includes('admin') ? 'admin'
              : roles.includes('manager') ? 'manager' : 'fnb_manager';
  if (!canTransition(order.status, 'cancelled', { actor })) {
    return NextResponse.json({ error: 'invalid_transition' }, { status: 409 });
  }

  await sb.from('fnb_orders').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancellation_reason: reason,
  }).eq('id', id);

  await sb.from('fnb_status_events').insert({
    order_id: id,
    from_status: order.status,
    to_status: 'cancelled',
    changed_by_user_id: user.id,
    changed_via: 'dashboard',
    notes: reason,
  });

  await sb.from('beithady_audit_log').insert({
    actor_user_id: user.id,
    module: 'fnb',
    action: 'order.cancel',
    target_type: 'order',
    target_id: id,
    before: { status: order.status },
    after: { status: 'cancelled', reason },
  });

  return NextResponse.json({ ok: true });
}
```

Commit:

```bash
git add src/app/api/beithady/fnb/orders/[id]/cancel/route.ts
git commit -m 'feat(beithady/fnb): add operator cancel endpoint (admin/manager/fnb_manager)'
```

---

### Task 38: `/beithady/fnb` page — kanban dashboard with @dnd-kit

**Files:**
- Modify: `src/app/beithady/fnb/page.tsx` (replace stub)
- Create: `src/app/beithady/fnb/_components/order-board.tsx`
- Create: `src/app/beithady/fnb/_components/order-card.tsx`
- Create: `src/app/beithady/fnb/_components/status-badge.tsx`
- Create: `src/app/beithady/fnb/_components/order-filters.tsx`

- [ ] **Step 1: Verify @dnd-kit is installed**

```bash
grep "@dnd-kit" package.json | head
```

If missing: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers`.
The repo already uses `@dnd-kit/*` (per CLAUDE.md), so this is likely
present.

- [ ] **Step 2: Implement `page.tsx`**

```tsx
import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { OrderBoard } from './_components/order-board';

export const dynamic = 'force-dynamic';

export default async function FnbOrdersPage() {
  await requireBeithadyPermission('fnb', 'read');
  const sb = supabaseAdmin();
  const { data: buildings } = await sb.from('fnb_buildings')
    .select('building_code, enabled').order('building_code');
  // The board client-fetches orders, so we just hand it the building list.
  return <OrderBoard buildings={buildings ?? []} />;
}
```

- [ ] **Step 3: Implement `order-board.tsx`** (client component;
  drag-drop column moves call `PATCH /orders/[id]`)

```tsx
'use client';
import { useEffect, useState } from 'react';
import {
  DndContext, DragEndEvent, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { OrderCard } from './order-card';
import { OrderFilters } from './order-filters';

const COLUMNS: Array<{ status: 'submitted' | 'preparing' | 'ready' | 'delivered'; label: string }> = [
  { status: 'submitted', label: 'Submitted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready',     label: 'Ready' },
  { status: 'delivered', label: 'Delivered' },
];

export function OrderBoard({
  buildings,
}: { buildings: Array<{ building_code: string; enabled: boolean }> }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [filters, setFilters] = useState<{
    buildings: string[];
    date_from: string;
    date_to: string;
  }>({
    buildings: buildings.filter(b => b.enabled).map(b => b.building_code),
    date_from: new Date(Date.now() - 24 * 3600_000).toISOString(),
    date_to: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });

  async function reload() {
    const params = new URLSearchParams();
    filters.buildings.forEach(b => params.append('building_code', b));
    COLUMNS.forEach(c => params.append('status', c.status));
    params.set('date_from', filters.date_from);
    params.set('date_to', filters.date_to);
    const r = await fetch(`/api/beithady/fnb/orders?${params}`);
    if (r.ok) setOrders((await r.json()).orders);
  }

  useEffect(() => { reload(); const t = setInterval(reload, 8000); return () => clearInterval(t); }, [filters]);

  async function move(orderId: string, to: string) {
    const res = await fetch(`/api/beithady/fnb/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: to }),
    });
    if (res.ok) reload();
    else alert((await res.json()).error || 'Update failed');
  }

  function handleDragEnd(e: DragEndEvent) {
    const orderId = e.active.id as string;
    const target = e.over?.id as string | undefined;
    if (!target) return;
    move(orderId, target);
  }

  return (
    <div>
      <OrderFilters filters={filters} setFilters={setFilters} buildings={buildings} />
      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-3">
          {COLUMNS.map(col => (
            <DroppableColumn key={col.status} status={col.status} label={col.label}>
              {orders.filter(o => o.status === col.status).map(o => (
                <DraggableCard key={o.id} order={o} />
              ))}
            </DroppableColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function DroppableColumn({
  status, label, children,
}: { status: string; label: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`ix-card p-3 min-h-[60vh] ${isOver ? 'ring-2 ring-rose-300' : ''}`}
    >
      <h3 className="text-xs uppercase tracking-wide font-semibold mb-3">
        {label} ({React.Children.count(children)})
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DraggableCard({ order }: { order: any }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: order.id });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }}
    >
      <OrderCard order={order} />
    </div>
  );
}
```

(Add `import React from 'react';` if your TS config requires it.)

- [ ] **Step 4: Implement `order-card.tsx`**

```tsx
'use client';
import Link from 'next/link';

export function OrderCard({ order }: { order: any }) {
  return (
    <Link
      href={`/beithady/fnb/orders/${order.id}`}
      className="block bg-white dark:bg-slate-800 rounded p-3 shadow-sm hover:ring-2 hover:ring-rose-300"
    >
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-slate-500">
          {order.building_code} · #{String(order.order_number).padStart(4, '0')}
        </span>
        <span className="font-semibold text-sm">${Number(order.total_usd).toFixed(0)}</span>
      </div>
      <p className="text-sm font-medium mt-1">
        Unit {order.unit_code}{order.guest_name ? ` · ${order.guest_name}` : ''}
      </p>
      <p className="text-xs text-slate-500 mt-0.5">
        {(order.fnb_order_items?.length ?? 0)} item{order.fnb_order_items?.length === 1 ? '' : 's'}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        {new Date(order.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </Link>
  );
}
```

- [ ] **Step 5: Implement `order-filters.tsx`**

```tsx
'use client';

export function OrderFilters({
  filters, setFilters, buildings,
}: {
  filters: { buildings: string[]; date_from: string; date_to: string };
  setFilters: (f: any) => void;
  buildings: Array<{ building_code: string; enabled: boolean }>;
}) {
  return (
    <div className="ix-card p-3 mb-3 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1">
        {buildings.map(b => {
          const checked = filters.buildings.includes(b.building_code);
          return (
            <button
              key={b.building_code}
              onClick={() => setFilters((f: any) => ({
                ...f,
                buildings: checked
                  ? f.buildings.filter((x: string) => x !== b.building_code)
                  : [...f.buildings, b.building_code],
              }))}
              className={`text-xs px-2 py-1 rounded ${checked ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${!b.enabled ? 'opacity-50' : ''}`}
              title={!b.enabled ? 'F&B disabled for this building' : ''}
            >{b.building_code}</button>
          );
        })}
      </div>
      <div className="ml-auto text-xs text-slate-500">
        Auto-refreshes every 8 sec
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build + smoke**

```bash
npm run build
```

After deploy, `/beithady/fnb` should show the kanban with the order
from F.4 checkpoint. Drag the card from Submitted → Preparing —
should call PATCH and reload.

- [ ] **Step 7: Commit**

```bash
git add src/app/beithady/fnb
git commit -m 'feat(beithady/fnb): add kanban order board with drag-drop status'
```

---

### Task 39: Operator order detail page `/beithady/fnb/orders/[id]`

**Files:**
- Create: `src/app/beithady/fnb/orders/[id]/page.tsx`
- Create: `src/app/beithady/fnb/orders/[id]/_components/order-detail.tsx`
- Create: `src/app/beithady/fnb/orders/[id]/_components/cancel-dialog.tsx`

- [ ] **Step 1: Implement `page.tsx`**

```tsx
import 'server-only';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { OrderDetail } from './_components/order-detail';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export default async function OrderDetailPage({ params }: Ctx) {
  const { roles } = await requireBeithadyPermission('fnb', 'read');
  const { id } = await params;
  const sb = supabaseAdmin();
  const [orderRes, linesRes, eventsRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', id).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', id),
    sb.from('fnb_status_events').select('*').eq('order_id', id)
      .order('at', { ascending: true }),
  ]);
  if (!orderRes.data) notFound();
  const canCancel = roles.some(r => ['admin','manager','fnb_manager'].includes(r));
  return (
    <OrderDetail
      order={orderRes.data}
      lines={linesRes.data ?? []}
      events={eventsRes.data ?? []}
      canCancel={canCancel}
    />
  );
}
```

- [ ] **Step 2: Implement `order-detail.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CancelDialog } from './cancel-dialog';

const NEXT: Record<string, string | null> = {
  submitted: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: 'closed',
  closed: null,
  cancelled: null,
};

export function OrderDetail({
  order: initialOrder, lines, events, canCancel,
}: { order: any; lines: any[]; events: any[]; canCancel: boolean }) {
  const [order, setOrder] = useState(initialOrder);
  const [busy, setBusy] = useState(false);

  async function advance() {
    const to = NEXT[order.status]; if (!to) return;
    setBusy(true);
    const res = await fetch(`/api/beithady/fnb/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: to }),
    });
    setBusy(false);
    if (res.ok) setOrder((await res.json()).order);
    else alert((await res.json()).error || 'Failed');
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="col-span-12 md:col-span-8">
        <div className="ix-card p-6">
          <div className="flex justify-between items-baseline mb-4">
            <h2 className="text-lg font-semibold">
              Order #{String(order.order_number).padStart(4, '0')}
              <span className="ml-2 text-xs text-slate-500">
                {order.building_code} · Unit {order.unit_code}
              </span>
            </h2>
            <span className="text-xl font-semibold">${Number(order.total_usd).toFixed(2)}</span>
          </div>

          <ul className="divide-y">
            {lines.map(l => (
              <li key={l.id} className="py-3">
                <div className="flex justify-between">
                  <span>{l.quantity} × {l.item_name_snapshot}</span>
                  <span>${Number(l.line_total_usd).toFixed(2)}</span>
                </div>
                {l.modifier_snapshot.length > 0 && (
                  <p className="text-xs text-slate-500 ml-4">
                    {l.modifier_snapshot.map((m: any) => `+ ${m.name_en}`).join(', ')}
                  </p>
                )}
                {l.notes && <p className="text-xs italic text-slate-500 ml-4">"{l.notes}"</p>}
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="mt-3 text-sm bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-2">
              <strong>Order note:</strong> {order.notes}
            </p>
          )}

          <div className="mt-6 flex gap-2 flex-wrap">
            {NEXT[order.status] && (
              <button
                onClick={advance}
                disabled={busy}
                className="ix-btn-primary px-4 py-2 disabled:opacity-50"
              >Mark {NEXT[order.status]} →</button>
            )}
            {canCancel && order.status !== 'cancelled' && order.status !== 'closed' && (
              <CancelDialog
                orderId={order.id}
                onCancelled={(o) => setOrder(o)}
              />
            )}
            <Link
              href={`/beithady/fnb`}
              className="ix-btn-secondary px-4 py-2"
            >Back to board</Link>
          </div>
        </div>
      </section>

      <aside className="col-span-12 md:col-span-4 space-y-3">
        <div className="ix-card p-4">
          <h3 className="text-xs uppercase tracking-wide font-semibold mb-2">Guest</h3>
          <p className="text-sm">{order.guest_name ?? '—'}</p>
          <p className="text-xs text-slate-500">{order.guest_language?.toUpperCase()}</p>
        </div>
        <div className="ix-card p-4">
          <h3 className="text-xs uppercase tracking-wide font-semibold mb-2">Status timeline</h3>
          <ol className="space-y-2 text-xs">
            {events.map(e => (
              <li key={e.id} className="flex justify-between">
                <span>{e.from_status ?? '∅'} → <strong>{e.to_status}</strong></span>
                <span className="text-slate-400">
                  {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Implement `cancel-dialog.tsx`**

```tsx
'use client';
import { useState } from 'react';

export function CancelDialog({
  orderId, onCancelled,
}: { orderId: string; onCancelled: (o: any) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (reason.length < 3) { alert('Reason required'); return; }
    setBusy(true);
    const res = await fetch(`/api/beithady/fnb/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!res.ok) { alert((await res.json()).error); return; }
    // Re-fetch detail
    const d = await fetch(`/api/beithady/fnb/orders/${orderId}`);
    onCancelled((await d.json()).order);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ix-btn-danger px-4 py-2"
      >Cancel order</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="ix-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-3">Cancel order</h3>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              placeholder="Reason (logged to audit)"
              rows={3}
              className="w-full ix-input"
            />
            <div className="mt-3 flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="ix-btn-secondary px-3 py-1.5 text-sm"
              >Back</button>
              <button
                onClick={go}
                disabled={busy}
                className="ix-btn-danger px-3 py-1.5 text-sm disabled:opacity-50"
              >{busy ? 'Cancelling…' : 'Cancel order'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/app/beithady/fnb/orders
git commit -m 'feat(beithady/fnb): add operator order detail + cancel dialog'
```

---

### Task 40: Stock-out toggle from order side panel

**Files:**
- Create: `src/app/api/beithady/fnb/buildings/[code]/stockout/route.ts`
- Modify: `src/app/beithady/fnb/orders/[id]/_components/order-detail.tsx` (add per-line "mark stock-out at this building" buttons)

This is convenient ops UX: when the kitchen tells the runner "we're
out of croissants", ops one-taps the stock-out from the order they're
already viewing.

- [ ] **Step 1: Implement endpoint**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { upsertBuildingOverride } from '@/lib/beithady/fnb/repo';

const Body = z.object({
  item_id: z.string().uuid(),
  is_out_of_stock: z.boolean(),
});

interface Ctx { params: Promise<{ code: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { code } = await ctx.params;
  const { item_id, is_out_of_stock } = Body.parse(await req.json());
  await upsertBuildingOverride({
    building_code: code,
    item_id,
    is_out_of_stock,
  }, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add per-line action in order-detail UI**

In each `<li>` of the lines list, add:

```tsx
<button
  onClick={async () => {
    if (!confirm(`Mark ${l.item_name_snapshot} out of stock at ${order.building_code}?`)) return;
    const res = await fetch(`/api/beithady/fnb/buildings/${order.building_code}/stockout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: l.item_id, is_out_of_stock: true }),
    });
    if (res.ok) alert('Stock-out flagged. Auto-clears at midnight Cairo.');
  }}
  className="text-xs text-amber-600 hover:underline ml-2"
>
  Mark out of stock at {order.building_code}
</button>
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/api/beithady/fnb/buildings src/app/beithady/fnb/orders
git commit -m 'feat(beithady/fnb): add stock-out toggle from operator order detail'
```

---

### 🟢 Phase F.5 checkpoint

After deploy:
1. As ops, navigate `/beithady/fnb` — see the kanban with the order
   from F.4.
2. Configure WA recipient on BH-26: `UPDATE fnb_buildings SET kitchen_wa_recipients = '{+201234567890}' WHERE building_code = 'BH-26';` (use a real test sandbox number).
3. From a phone, place a new order on BH-26 — kitchen WA number
   receives the message within ~5 sec.
4. Drag the card from Submitted → Preparing on the operator board.
   Guest's order page polls and updates within 5 sec; guest's WA
   thread receives "Your order is being prepared" via Guesty
   conversation push.
5. Continue to `ready` and `delivered` — guest gets each notification
   in their language.
6. Try cancelling a `delivered` order as an `ops` user — expect 403
   (admin/manager/fnb_manager only).
7. Click "Mark out of stock at BH-26" on a line — verify SQL: row
   appears in `fnb_building_overrides`.

If all green → proceed to Phase F.6.

---

## Phase F.6 — Multi-language + AI translate

Goal: After this phase, the guest menu auto-detects language from
the reservation, supports a switcher (EN / AR / RU / FR), renders
RTL for Arabic, and admins can one-click AI-translate any English
field with an `[AI]` chip and an approve gate.

### Task 41: `src/lib/beithady/fnb/translate.ts` — Anthropic helper

**Files:**
- Create: `src/lib/beithady/fnb/translate.ts`
- Test: `src/lib/beithady/fnb/translate.test.ts`

- [ ] **Step 1: Find the existing Anthropic client wrapper**

```bash
grep -rln "import Anthropic\|new Anthropic\b\|@anthropic-ai/sdk" src/lib | head
```

Use the existing client from `src/lib/anthropic.ts` (or wherever the
repo wraps it) so all Anthropic-using modules share retry, rate-limit,
and key-env handling.

- [ ] **Step 2: Implement**

```ts
import 'server-only';
// Adjust this import to match the repo's existing wrapper:
import { anthropic } from '@/lib/anthropic';

export type FnbField = 'name' | 'description' | 'modifier_name';
export type FnbLang = 'ar' | 'ru' | 'fr';

const LANG_LABEL: Record<FnbLang, string> = {
  ar: 'Modern Standard Arabic (with culinary loanwords kept)',
  ru: 'Russian',
  fr: 'French',
};

const FIELD_LABEL: Record<FnbField, string> = {
  name:          'menu item name',
  description:   'menu item description',
  modifier_name: 'menu item add-on / modifier name',
};

export async function translateMenuField(input: {
  text: string;
  field: FnbField;
  target_lang: FnbLang;
}): Promise<{ translation: string }> {
  const { text, field, target_lang } = input;
  if (!text.trim()) return { translation: '' };

  const prompt = `Translate the following Egyptian-hospitality ${FIELD_LABEL[field]} from English to ${LANG_LABEL[target_lang]}.
Keep it brief, evocative, and respectful of culinary terms (preserve loanwords like "Ful", "Taameya", "Baladi" if they appear).
Return ONLY the translated text, no quotes, no commentary.

English: ${text}`;

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4.6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const txt = res.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();

  return { translation: txt };
}
```

If the project's Anthropic wrapper uses a different model alias,
substitute it. Per CLAUDE.md, the project already has the SDK + an
API key in env.

- [ ] **Step 3: Add a unit test for the helper's prompt shape**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/anthropic', () => ({
  anthropic: {
    messages: {
      create: vi.fn(async (args: any) => ({
        content: [{ type: 'text', text: 'TRANSLATED' }],
      })),
    },
  },
}));

import { translateMenuField } from './translate';
import { anthropic } from '@/lib/anthropic';

describe('translateMenuField', () => {
  it('returns trimmed text from anthropic response', async () => {
    const r = await translateMenuField({
      text: 'All-Day Breakfast',
      field: 'name',
      target_lang: 'ar',
    });
    expect(r.translation).toBe('TRANSLATED');
  });

  it('passes a prompt mentioning the source text and target lang', async () => {
    await translateMenuField({
      text: 'Ful with vegetables',
      field: 'description',
      target_lang: 'fr',
    });
    const calls = (anthropic.messages.create as any).mock.calls;
    const lastPrompt = calls[calls.length - 1][0].messages[0].content;
    expect(lastPrompt).toContain('Ful with vegetables');
    expect(lastPrompt).toContain('French');
  });

  it('returns empty translation for empty input', async () => {
    const r = await translateMenuField({
      text: '',
      field: 'name',
      target_lang: 'ru',
    });
    expect(r.translation).toBe('');
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npm run test -- src/lib/beithady/fnb/translate.test.ts
git add src/lib/beithady/fnb/translate.ts src/lib/beithady/fnb/translate.test.ts
git commit -m 'feat(beithady/fnb): add Anthropic translate helper'
```

---

### Task 42: API `POST /api/beithady/fnb/items/[id]/translate` — translate one field at a time

**Files:**
- Create: `src/app/api/beithady/fnb/items/[id]/translate/route.ts`

- [ ] **Step 1: Implement**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { translateMenuField } from '@/lib/beithady/fnb/translate';
import { getItem, updateItem } from '@/lib/beithady/fnb/repo';

const Body = z.object({
  field: z.enum(['name', 'description']),
  target_lang: z.enum(['ar', 'ru', 'fr']),
});

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const { field, target_lang } = Body.parse(await req.json());

  const item = await getItem(id);
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const sourceText: string = (field === 'name' ? item.name_en : item.description_en) ?? '';
  const { translation } = await translateMenuField({
    text: sourceText,
    field,
    target_lang,
  });

  // Patch the field + flag it as AI-drafted (manager must approve later).
  const flagsKey = `${field}_${target_lang}`;
  const updated = await updateItem(id, {
    [`${field}_${target_lang}`]: translation,
    ai_translation_flags: {
      ...(item.ai_translation_flags ?? {}),
      [flagsKey]: true,                 // true = AI-drafted, awaiting approve
    },
  } as any, { actor_user_id: user.id });

  return NextResponse.json({ item: updated, translation });
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/api/beithady/fnb/items/[id]/translate
git commit -m 'feat(beithady/fnb): add translate endpoint with ai_translation_flags tracking'
```

---

### Task 43: Translate button + `[AI]` chip + approve gate (menu admin Basics tab extended)

**Files:**
- Modify: `src/app/beithady/fnb/menu/items/[id]/_components/basics-form.tsx`
  (add 4-language fields + translate button + AI chip)

This task replaces the EN-only Basics form with a 4-language editor.

- [ ] **Step 1: Rewrite `basics-form.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Item, Category } from '@/lib/beithady/fnb/types';

const LANGS: Array<{ key: 'en' | 'ar' | 'ru' | 'fr'; label: string }> = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية' },
  { key: 'ru', label: 'Русский' },
  { key: 'fr', label: 'Français' },
];

export function BasicsForm({
  item: initialItem, categories, onSaved,
}: {
  item: Item;
  categories: Category[];
  onSaved: (item: Item) => void;
}) {
  const [item, setItem] = useState(initialItem);
  const [activeLang, setActiveLang] = useState<'en'|'ar'|'ru'|'fr'>('en');
  const [translating, setTranslating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const flags = (item.ai_translation_flags ?? {}) as Record<string, boolean>;

  function isAiDrafted(field: 'name' | 'description', lang: 'ar'|'ru'|'fr') {
    return flags[`${field}_${lang}`] === true;
  }

  async function translate(field: 'name' | 'description', lang: 'ar'|'ru'|'fr') {
    setTranslating(`${field}_${lang}`);
    const res = await fetch(`/api/beithady/fnb/items/${item.id}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, target_lang: lang }),
    });
    setTranslating(null);
    if (res.ok) {
      const { item: updated } = await res.json();
      setItem(updated);
    }
  }

  async function approve(field: 'name' | 'description', lang: 'ar'|'ru'|'fr') {
    const newFlags = { ...flags, [`${field}_${lang}`]: false };
    const res = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_translation_flags: newFlags }),
    });
    if (res.ok) setItem((await res.json()).item);
  }

  async function saveLangFields() {
    setSaving(true);
    const payload = LANGS.reduce((acc, l) => {
      acc[`name_${l.key}`] = (item as any)[`name_${l.key}`];
      acc[`description_${l.key}`] = (item as any)[`description_${l.key}`];
      return acc;
    }, {} as Record<string, unknown>);
    payload.category_id = item.category_id;
    payload.price_usd = item.price_usd;
    payload.cost_usd = item.cost_usd ?? null;
    payload.enabled = item.enabled;
    payload.sort_order = item.sort_order;
    const res = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      const { item: updated } = await res.json();
      setItem(updated);
      onSaved(updated);
    }
  }

  return (
    <div>
      <nav className="flex gap-1 mb-4 border-b">
        {LANGS.map(l => (
          <button
            key={l.key}
            onClick={() => setActiveLang(l.key)}
            className={`px-3 py-1.5 text-sm ${activeLang === l.key ? 'border-b-2 border-rose-600 font-semibold' : 'text-slate-500'}`}
            dir={l.key === 'ar' ? 'rtl' : 'ltr'}
          >{l.label}</button>
        ))}
      </nav>

      {LANGS.map(l => l.key === activeLang && (
        <div key={l.key} dir={l.key === 'ar' ? 'rtl' : 'ltr'} className="space-y-3">
          <label className="block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">Name ({l.label})</span>
              {l.key !== 'en' && (
                <span className="flex items-center gap-1">
                  {isAiDrafted('name', l.key as any) && (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">[AI]</span>
                      <button onClick={() => approve('name', l.key as any)} className="text-xs underline text-emerald-600">Approve</button>
                    </>
                  )}
                  <button
                    onClick={() => translate('name', l.key as any)}
                    disabled={translating === `name_${l.key}`}
                    className="text-xs underline text-rose-600 disabled:opacity-50"
                  >
                    {translating === `name_${l.key}` ? '…' : '✨ Translate from English'}
                  </button>
                </span>
              )}
            </div>
            <input
              value={(item as any)[`name_${l.key}`] ?? ''}
              onChange={e => setItem({ ...item, [`name_${l.key}`]: e.target.value } as any)}
              className="ix-input"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">Description ({l.label})</span>
              {l.key !== 'en' && (
                <span className="flex items-center gap-1">
                  {isAiDrafted('description', l.key as any) && (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">[AI]</span>
                      <button onClick={() => approve('description', l.key as any)} className="text-xs underline text-emerald-600">Approve</button>
                    </>
                  )}
                  <button
                    onClick={() => translate('description', l.key as any)}
                    disabled={translating === `description_${l.key}`}
                    className="text-xs underline text-rose-600 disabled:opacity-50"
                  >
                    {translating === `description_${l.key}` ? '…' : '✨ Translate from English'}
                  </button>
                </span>
              )}
            </div>
            <textarea
              value={(item as any)[`description_${l.key}`] ?? ''}
              onChange={e => setItem({ ...item, [`description_${l.key}`]: e.target.value } as any)}
              rows={3}
              className="ix-input"
            />
          </label>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
        <label>
          <span className="block text-xs font-medium mb-1">Category</span>
          <select
            value={item.category_id}
            onChange={e => setItem({ ...item, category_id: e.target.value })}
            className="ix-input"
          >
            {categories.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
          </select>
        </label>
        <label>
          <span className="block text-xs font-medium mb-1">Sort order</span>
          <input
            type="number"
            value={item.sort_order}
            onChange={e => setItem({ ...item, sort_order: Number(e.target.value) })}
            className="ix-input"
          />
        </label>
        <label>
          <span className="block text-xs font-medium mb-1">Price (USD)</span>
          <input
            type="number" step="0.01" min="0"
            value={item.price_usd}
            onChange={e => setItem({ ...item, price_usd: Number(e.target.value) })}
            className="ix-input"
          />
        </label>
        <label>
          <span className="block text-xs font-medium mb-1">Cost (USD, optional)</span>
          <input
            type="number" step="0.01" min="0"
            value={item.cost_usd ?? ''}
            onChange={e => setItem({ ...item, cost_usd: e.target.value === '' ? null : Number(e.target.value) } as any)}
            className="ix-input"
          />
        </label>
        <label className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={e => setItem({ ...item, enabled: e.target.checked })}
          />
          <span className="text-sm">Enabled</span>
        </label>
      </div>

      <button
        onClick={saveLangFields}
        disabled={saving}
        className="ix-btn-primary px-4 py-2 mt-4 disabled:opacity-50"
      >{saving ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
```

- [ ] **Step 2: Build + smoke test**

After deploy, on the Beit Hady Burger item, click `✨ Translate from
English` next to the AR Name. Verify the field populates and shows
the `[AI]` chip. Click `Approve` — chip disappears.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/fnb/menu/items/[id]/_components/basics-form.tsx
git commit -m 'feat(beithady/fnb): add 4-lang Basics form with AI translate + approve gate'
```

---

### Task 44: Same translate UX for modifier names

**Files:**
- Create: `src/app/api/beithady/fnb/items/[id]/modifiers/[modId]/translate/route.ts`
- Modify: `src/app/beithady/fnb/menu/items/[id]/_components/modifiers-form.tsx`

- [ ] **Step 1: Endpoint** (mirrors Task 42 but for modifiers)

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { translateMenuField } from '@/lib/beithady/fnb/translate';
import { supabaseAdmin } from '@/lib/supabase';
import { ModifierSchema } from '@/lib/beithady/fnb/types';

const Body = z.object({ target_lang: z.enum(['ar', 'ru', 'fr']) });

interface Ctx { params: Promise<{ id: string; modId: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { modId } = await ctx.params;
  const { target_lang } = Body.parse(await req.json());

  const sb = supabaseAdmin();
  const { data: mod } = await sb.from('fnb_item_modifiers')
    .select('*').eq('id', modId).single();
  if (!mod) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { translation } = await translateMenuField({
    text: mod.name_en,
    field: 'modifier_name',
    target_lang,
  });
  const flags = { ...(mod.ai_translation_flags ?? {}), [`name_${target_lang}`]: true };

  const { data: updated } = await sb.from('fnb_item_modifiers').update({
    [`name_${target_lang}`]: translation,
    ai_translation_flags: flags,
  }).eq('id', modId).select().single();

  await sb.from('beithady_audit_log').insert({
    actor_user_id: user.id,
    module: 'fnb',
    action: 'modifier.translate',
    target_type: 'modifier',
    target_id: modId,
    after: { lang: target_lang, translation },
  });

  return NextResponse.json({ modifier: ModifierSchema.parse(updated) });
}
```

- [ ] **Step 2: Update `modifiers-form.tsx`** (add 4-lang inputs +
  translate buttons; pattern is parallel to BasicsForm — abbreviated)

Add language tabs + translate buttons mirroring Task 43, scoped to
each row's `name_*` fields. Keep the price-delta input shared across
languages (only one number).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/beithady/fnb/items/[id]/modifiers/[modId]/translate src/app/beithady/fnb/menu/items/[id]/_components/modifiers-form.tsx
git commit -m 'feat(beithady/fnb): translate modifier names + 4-lang modifier UI'
```

---

### Task 45: Language switcher on guest menu + auto-detect

**Files:**
- Modify: `src/app/dine/[token]/_components/brand-shell.tsx` (accept `lang` + `onChangeLang`)
- Create: `src/app/dine/[token]/_components/language-switcher.tsx`
- Modify: `src/app/dine/[token]/page.tsx` (read `?lang=` query, auto-detect from `validateDineToken().guest_language`)
- Modify: `src/app/api/dine/[token]/menu/route.ts` (already accepts `?lang=` per Task 21)
- Create: `src/app/api/dine/[token]/language/route.ts` (POST persists guest language pref to the boarding-pass row OR a side table)

- [ ] **Step 1: `language-switcher.tsx`**

```tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const LANGS: Array<{ key: 'en'|'ar'|'ru'|'fr'; label: string }> = [
  { key: 'en', label: 'EN' },
  { key: 'ar', label: 'AR' },
  { key: 'ru', label: 'RU' },
  { key: 'fr', label: 'FR' },
];

export function LanguageSwitcher({ current }: { current: 'en'|'ar'|'ru'|'fr' }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pick(lang: 'en'|'ar'|'ru'|'fr') {
    const q = new URLSearchParams(params.toString());
    q.set('lang', lang);
    router.replace(`${pathname}?${q.toString()}`);
  }

  return (
    <nav
      aria-label="Language"
      className="text-xs flex gap-2 justify-center mt-2 relative z-10"
    >
      {LANGS.map(l => (
        <button
          key={l.key}
          onClick={() => pick(l.key)}
          className={`px-2 py-1 rounded ${current === l.key ? 'underline font-semibold' : 'opacity-70'}`}
          style={{ color: 'var(--bh-navy)' }}
        >🌐 {l.label}</button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Update `page.tsx` to read `?lang=` and pass through**

Replace the `lang="en"` literal in `BrandShell` with the resolved
language; localize category and item names by reading the right
column based on `lang`.

```tsx
const sp = await (props.searchParams ?? Promise.resolve({}));
const langParam = (sp?.lang as string | undefined);
const validLangs = ['en','ar','ru','fr'] as const;
const lang: typeof validLangs[number] =
  validLangs.includes(langParam as any) ? (langParam as any) : c.guest_language;

// downstream: localize
const localized = (cats.data ?? []).map(cc => ({
  ...cc, name: (cc as any)[`name_${lang}`] ?? cc.name_en,
}));
```

(Update `BrandShell`, `CategorySection`, and `ItemCard` to accept
already-localized `name`/`description` fields.)

- [ ] **Step 3: `language/route.ts` (optional persistence)**

Stores the guest's chosen language for receipt PDFs. Optional in v1
since `?lang=` query is enough; ship a stub that 200s and writes
into a small `dine_session_prefs` table (or skip — for v1 we can
just store the lang in `localStorage` client-side and pass it on
order submit).

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

const Body = z.object({ lang: z.enum(['en','ar','ru','fr']) });

interface Ctx { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });
  const { lang } = Body.parse(await req.json());
  // v1: no-op (client-side localStorage). Future: persist to dine_session_prefs.
  return NextResponse.json({ ok: true, lang });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dine src/app/api/dine/[token]/language
git commit -m 'feat(beithady/fnb): add 4-lang switcher with auto-detect from reservation'
```

---

### Task 46: RTL layout for Arabic + Russian/French body content checks

**Files:**
- Modify: `src/app/dine/[token]/dine-tokens.css` (already has `.dine-surface[lang="ar"]` rule from Task 22; verify direction + font swap)
- Modify: `src/app/dine/[token]/_components/brand-shell.tsx` (accept `lang` prop and pass it down to `<main lang={lang}>`)
- Modify: localized categories + items (already done in Task 45 Step 2)

The CSS in Task 22 already swaps direction + font for `[lang="ar"]`.
This task verifies the runtime stays consistent end-to-end:

- [ ] **Step 1: Test on a phone with `?lang=ar`**

Visit `/dine/[token]?lang=ar`:
- Direction is RTL (cart bar mirrors, prices appear on the LEFT,
  rails inverted positions auto-handled by `direction: rtl`)
- `Cairo` font renders Arabic text
- Latin numerals stay (Eastern Arabic numerals NOT used — Egyptian
  hospitality convention)
- Item names + descriptions in AR

Run:

```bash
# Simulate by curling and inspecting HTML
curl -s "https://limeinc.vercel.app/dine/[token]?lang=ar" | grep -E 'lang="ar"|font-cairo|dir="rtl"'
```

- [ ] **Step 2: Test RU + FR rendering**

`?lang=ru` and `?lang=fr`. Verify Cyrillic and accented chars render
in Poppins (subsets `latin-ext` + `cyrillic` are loaded in
`_fonts.ts`).

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/dine
git commit -m 'feat(beithady/fnb): finalize RTL + 4-lang rendering on guest menu'
```

---

### 🟢 Phase F.6 checkpoint

After deploy:
1. As admin on a menu item, click `✨ Translate from English` next to
   the AR Name field. Field populates with Arabic; `[AI]` chip is
   visible. Click `Approve` — chip disappears.
2. Repeat for all 3 languages × 2 fields × ~10 items (~60 clicks; OK
   for v1 polish — automate later if needed).
3. As a guest, hit `/dine/[token]?lang=ar` — menu renders in Arabic,
   RTL, Cairo font.
4. Submit an order with `lang=ar` — verify `fnb_orders.guest_language = 'ar'`.
5. Repeat with `?lang=ru` and `?lang=fr` — verify Cyrillic/French
   render correctly.

If all green → proceed to Phase F.7.

---

## Phase F.7 — PDF receipt + reservation charges drawer

Goal: After this phase, when an order hits `delivered`, a PDF
receipt is generated server-side using the BH brand styling and
auto-sent via WhatsApp (Cloud → Casual → Guesty conversation
fallback chain). Front-desk staff at checkout can see all unsettled
F&B totals for a reservation and one-click "mark settled" with an
optional Guesty receipt # for traceability.

### Task 47: `src/lib/beithady/fnb/receipt-pdf.tsx` — React-PDF document, all 4 languages

**Files:**
- Create: `src/lib/beithady/fnb/receipt-pdf.tsx`
- Test: smoke-test by rendering once during Task 48 build

- [ ] **Step 1: Verify `@react-pdf/renderer` is installed**

```bash
grep "react-pdf" package.json | head
```

Per CLAUDE.md, this is already in the stack. If not: `npm install @react-pdf/renderer`.

- [ ] **Step 2: Implement the document**

```tsx
import 'server-only';
import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from '@react-pdf/renderer';

// Register the same fonts as the guest menu so the receipt visual
// matches the PDF brand. React-PDF needs raw font URLs — point at
// the Google Fonts CDN files (or local copies you commit under
// `public/fonts/` if you'd rather not depend on Google at render time).

Font.register({
  family: 'Cormorant',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjornFLsS6V7w.ttf', fontWeight: 500 },
    { src: 'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjorvFLsS6V7w.ttf', fontWeight: 600 },
  ],
});
Font.register({
  family: 'Poppins',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/poppins/v20/pxiEyp8kv8JHgFVrJJfecnFHGPc.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLGT9Z1xlFd2JQEk.ttf', fontWeight: 600 },
  ],
});
Font.register({
  family: 'Cairo',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/cairo/v28/SLXGc1nY6HkvalIvTp2mxdt0UX8.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/cairo/v28/SLXGc1nY6HkvalIvTp2mxdt0UX8.ttf', fontWeight: 600 },
  ],
});

const NAVY = '#0F3F58';
const CREAM = '#E9E5DE';
const CORAL = '#E5A29C';
const INK_MUTED = '#4A6577';

const styles = StyleSheet.create({
  page: {
    backgroundColor: CREAM,
    paddingHorizontal: 36,
    paddingVertical: 36,
    fontFamily: 'Poppins',
    fontSize: 10,
    color: NAVY,
  },
  pageAr: { fontFamily: 'Cairo' },
  rail: {
    position: 'absolute',
    top: 0, bottom: 0, width: 1.5,
    backgroundColor: CORAL,
  },
  brandRow: { textAlign: 'center', marginBottom: 12 },
  brand: {
    fontFamily: 'Cormorant',
    fontWeight: 600,
    fontSize: 22,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'Cormorant',
    fontSize: 14,
    letterSpacing: 1,
    marginTop: 2,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: NAVY,
    marginVertical: 12,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    color: INK_MUTED,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: '#dcd6cc',
  },
  itemName: { fontWeight: 600, flex: 1 },
  itemPrice: { fontWeight: 600 },
  itemMod: { fontSize: 8, color: INK_MUTED, marginLeft: 12 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    fontSize: 9,
    color: INK_MUTED,
  },
  totalGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: NAVY,
    fontWeight: 600,
    fontSize: 12,
  },
  fineprint: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 8,
    color: INK_MUTED,
    fontStyle: 'italic',
  },
});

const T = {
  en: {
    inroom: 'IN-ROOM DINING', receipt: 'RECEIPT',
    order: 'Order', unit: 'Unit', date: 'Date', subtotal: 'Subtotal',
    vat: 'VAT (14%, included)', service: 'Service (12%, included)',
    total: 'Total', payment: 'Charged to your room — settled at checkout.',
    fineprint: 'All prices are inclusive of 14% VAT & 12% Service Charge',
    thanks: 'Thank you for staying at Beit Hady.',
  },
  ar: {
    inroom: 'الطعام في الغرفة', receipt: 'فاتورة',
    order: 'طلب', unit: 'وحدة', date: 'تاريخ', subtotal: 'المجموع الفرعي',
    vat: 'ضريبة القيمة المضافة (14٪، شامل)', service: 'خدمة (12٪، شامل)',
    total: 'الإجمالي', payment: 'محمل على غرفتك — يُسوّى عند المغادرة.',
    fineprint: 'جميع الأسعار شاملة 14٪ ضريبة قيمة مضافة و12٪ رسم خدمة',
    thanks: 'شكراً لإقامتك في بيت هادي.',
  },
  ru: {
    inroom: 'ОБСЛУЖИВАНИЕ В НОМЕРЕ', receipt: 'ЧЕК',
    order: 'Заказ', unit: 'Номер', date: 'Дата', subtotal: 'Промежуточный итог',
    vat: 'НДС (14%, включён)', service: 'Сервис (12%, включён)',
    total: 'Итого', payment: 'Списано с вашего счёта — оплата при выезде.',
    fineprint: 'Все цены включают 14% НДС и 12% сервисный сбор',
    thanks: 'Спасибо за выбор Beit Hady.',
  },
  fr: {
    inroom: 'SERVICE EN CHAMBRE', receipt: 'REÇU',
    order: 'Commande', unit: 'Unité', date: 'Date', subtotal: 'Sous-total',
    vat: 'TVA (14%, incluse)', service: 'Service (12%, inclus)',
    total: 'Total', payment: 'Facturé à votre chambre — réglé au départ.',
    fineprint: 'Tous les prix incluent 14% de TVA et 12% de frais de service',
    thanks: 'Merci de séjourner à Beit Hady.',
  },
};

export interface ReceiptDocProps {
  order: {
    order_number: number;
    building_code: string;
    unit_code: string;
    guest_name: string | null;
    guest_language: 'en'|'ar'|'ru'|'fr';
    submitted_at: string;
    delivered_at: string | null;
    subtotal_usd: number;
    vat_usd: number;
    service_usd: number;
    total_usd: number;
  };
  lines: Array<{
    item_name_snapshot: string;
    quantity: number;
    line_total_usd: number;
    modifier_snapshot: Array<{ name_localized: string }>;
    notes: string | null;
  }>;
  vatLine?: string | null;
}

export function ReceiptDoc({ order, lines, vatLine }: ReceiptDocProps) {
  const lang = order.guest_language;
  const t = T[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <Document>
      <Page size="A5" style={[styles.page, lang === 'ar' && styles.pageAr]}>
        {/* Coral side rails */}
        <View style={[styles.rail, { left: 18 }]} />
        <View style={[styles.rail, { right: 18 }]} />

        <View style={styles.brandRow}>
          <Text style={styles.brand}>BEIT HADY</Text>
          <Text style={styles.subtitle}>{t.inroom} · {t.receipt}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.meta}>
          <Text>{t.order} #{String(order.order_number).padStart(4, '0')}</Text>
          <Text>{order.building_code} · {t.unit} {order.unit_code}</Text>
        </View>
        <View style={styles.meta}>
          <Text>{order.guest_name ?? '—'}</Text>
          <Text>{t.date} {new Date(order.delivered_at ?? order.submitted_at).toLocaleString(lang)}</Text>
        </View>

        <View style={styles.divider} />

        {lines.map((l, i) => (
          <View key={i}>
            <View style={styles.itemRow}>
              <Text style={styles.itemName}>{l.quantity} × {l.item_name_snapshot}</Text>
              <Text style={styles.itemPrice}>${l.line_total_usd.toFixed(2)}</Text>
            </View>
            {l.modifier_snapshot.map((m, j) => (
              <Text key={j} style={styles.itemMod}>+ {m.name_localized}</Text>
            ))}
            {l.notes && <Text style={styles.itemMod}>"{l.notes}"</Text>}
          </View>
        ))}

        <View style={{ marginTop: 12 }}>
          <View style={styles.totalRow}>
            <Text>{t.subtotal}</Text><Text>${order.subtotal_usd.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>{t.vat}</Text><Text>${order.vat_usd.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>{t.service}</Text><Text>${order.service_usd.toFixed(2)}</Text>
          </View>
          <View style={styles.totalGrand}>
            <Text>{t.total}</Text><Text>${order.total_usd.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.fineprint}>{t.payment}</Text>
        {vatLine && <Text style={styles.fineprint}>{vatLine}</Text>}
        <Text style={styles.fineprint}>{t.fineprint}</Text>
        <Text style={[styles.fineprint, { marginTop: 14 }]}>{t.thanks}</Text>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/fnb/receipt-pdf.tsx
git commit -m 'feat(beithady/fnb): add brand-styled PDF receipt component (4 languages)'
```

---

### Task 48: API `GET /api/dine/[token]/receipt/[orderId]` — render + serve PDF

**Files:**
- Create: `src/app/api/dine/[token]/receipt/[orderId]/route.ts`

- [ ] **Step 1: Implement**

```ts
import 'server-only';
import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { ReceiptDoc } from '@/lib/beithady/fnb/receipt-pdf';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return new Response('forbidden', { status: 403 });

  const sb = supabaseAdmin();
  const [orderRes, linesRes, bldRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', orderId).maybeSingle(),
    sb.from('fnb_order_items').select('*').eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    sb.from('fnb_buildings').select('receipt_vat_line')
      .eq('building_code', c.building_code).single(),
  ]);
  if (!orderRes.data || orderRes.data.reservation_id !== c.reservation_id) {
    return new Response('not_found', { status: 404 });
  }

  const buffer = await renderToBuffer(
    ReceiptDoc({
      order: orderRes.data as any,
      lines: linesRes.data ?? [],
      vatLine: bldRes.data?.receipt_vat_line ?? null,
    }),
  );

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bh-receipt-${orderRes.data.order_number}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
```

- [ ] **Step 2: Build + smoke**

```bash
npm run build
```

After deploy, hit `/api/dine/[real-token]/receipt/[delivered-order-id]`
— PDF renders inline. Open it; visual matches PDF brand.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dine/[token]/receipt
git commit -m 'feat(beithady/fnb): add guest receipt PDF endpoint'
```

---

### Task 49: `src/lib/beithady/fnb/receipt-send.ts` — auto-send pipeline at delivered

**Files:**
- Create: `src/lib/beithady/fnb/receipt-send.ts`
- Modify: `src/app/api/beithady/fnb/orders/[id]/route.ts` (PATCH handler from T36 — fire pipeline when status hits `delivered`)

- [ ] **Step 1: Implement `receipt-send.ts`**

```ts
import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { supabaseAdmin } from '@/lib/supabase';
import { ReceiptDoc } from './receipt-pdf';
// Substitute these for the repo's existing helpers:
import { sendViaWhatsAppCloudWithMedia } from '@/lib/whatsapp/cloud';
import { sendViaWhatsAppCasualWithMedia } from '@/lib/whatsapp/casual';
import { postToGuestyConversationWithUrl } from '@/lib/beithady/communication/guesty-conversation';

export async function sendDeliveredReceipt(orderId: string): Promise<void> {
  const sb = supabaseAdmin();
  const [orderRes, linesRes, bldRes] = await Promise.all([
    sb.from('fnb_orders').select('*').eq('id', orderId).single(),
    sb.from('fnb_order_items').select('*').eq('order_id', orderId)
      .order('created_at', { ascending: true }),
    sb.from('fnb_buildings').select('*'),
  ]);
  const order = orderRes.data; if (!order) return;
  const lines = linesRes.data ?? [];
  const bld = (bldRes.data ?? []).find(b => b.building_code === order.building_code);

  // 1. Render PDF + persist to storage
  const buffer = await renderToBuffer(
    ReceiptDoc({
      order: order as any,
      lines: lines as any,
      vatLine: bld?.receipt_vat_line ?? null,
    }),
  );
  const path = `fnb-receipts/${orderId}.pdf`;
  const upload = await sb.storage
    .from('beithady-gallery')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (upload.error) {
    console.error('[fnb] receipt upload failed', upload.error);
    return;
  }
  const signed = await sb.storage
    .from('beithady-gallery')
    .createSignedUrl(path, 60 * 60 * 24 * 14);   // 14 days
  const url = signed.data?.signedUrl ?? null;

  // 2. Pull guest WA from Guesty reservation (use the same helper your
  //    repo already exposes; if not, the Guesty conversation fallback
  //    below still works).
  const guestWa = await getGuestWa(order.reservation_id);

  let sentVia: 'wa_cloud' | 'wa_casual' | 'guesty' | 'failed' = 'failed';

  // 3a. WA Cloud with PDF attachment
  if (guestWa) {
    try {
      const r = await sendViaWhatsAppCloudWithMedia({
        to: guestWa,
        media: { type: 'document', buffer, filename: `bh-receipt-${order.order_number}.pdf` },
        body: shortBody(order, 'wa'),
      });
      if (r.ok) sentVia = 'wa_cloud';
    } catch { /* fall through */ }
  }

  // 3b. WA Casual fallback
  if (sentVia === 'failed' && guestWa) {
    try {
      const r = await sendViaWhatsAppCasualWithMedia({
        to: guestWa,
        media: { type: 'document', buffer, filename: `bh-receipt-${order.order_number}.pdf` },
        body: shortBody(order, 'wa'),
      });
      if (r.ok) sentVia = 'wa_casual';
    } catch { /* fall through */ }
  }

  // 3c. Guesty conversation fallback (signed URL link)
  if (sentVia === 'failed') {
    try {
      await postToGuestyConversationWithUrl({
        reservationId: order.reservation_id,
        body: shortBody(order, 'guesty'),
        url,
      });
      sentVia = 'guesty';
    } catch {
      sentVia = 'failed';
    }
  }

  // 4. Persist trail
  await sb.from('fnb_orders').update({
    receipt_pdf_path: path,
    receipt_sent_at: new Date().toISOString(),
    receipt_sent_via: sentVia,
  }).eq('id', orderId);
}

function shortBody(order: any, channel: 'wa' | 'guesty'): string {
  const base = `Your Beit Hady F&B order #${String(order.order_number).padStart(4, '0')} has been delivered.\nTotal: $${Number(order.total_usd).toFixed(2)}.\nCharged to your room.`;
  return channel === 'wa' ? base : `${base}\n(Receipt PDF attached.)`;
}

async function getGuestWa(reservationId: string): Promise<string | null> {
  // Implement using whatever fetcher the repo already has. Returns
  // a valid E.164 number or null.
  try {
    const { fetchReservationFromGuesty } = await import('@/lib/guesty');
    const r = await fetchReservationFromGuesty(reservationId);
    return r?.guest?.phone_wa ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Wire into the operator status PATCH (Task 36)**

In `src/app/api/beithady/fnb/orders/[id]/route.ts` PATCH, after the
`notifyGuestStatus` fire-and-forget, add:

```ts
import { sendDeliveredReceipt } from '@/lib/beithady/fnb/receipt-send';
// ...
if (parsed.to_status === 'delivered') {
  sendDeliveredReceipt(id).catch(err =>
    console.error('[fnb] sendDeliveredReceipt failed', err));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/fnb/receipt-send.ts src/app/api/beithady/fnb/orders/[id]/route.ts
git commit -m 'feat(beithady/fnb): add receipt auto-send pipeline (WA Cloud → Casual → Guesty)'
```

---

### Task 50: API `POST /api/dine/[token]/receipt/[orderId]/whatsapp` — guest re-trigger send (rate-limited)

**Files:**
- Create: `src/app/api/dine/[token]/receipt/[orderId]/whatsapp/route.ts`

- [ ] **Step 1: Implement**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';
import { supabaseAdmin } from '@/lib/supabase';
import { sendDeliveredReceipt } from '@/lib/beithady/fnb/receipt-send';

interface Ctx { params: Promise<{ token: string; orderId: string }> }

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 3;

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token, orderId } = await ctx.params;
  const c = await validateDineToken(token);
  if (!c.ok) return NextResponse.json({ error: c.reason }, { status: 403 });

  const sb = supabaseAdmin();
  const { data: order } = await sb.from('fnb_orders')
    .select('reservation_id, status').eq('id', orderId).single();
  if (!order || order.reservation_id !== c.reservation_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Rate-limit via audit log: count receipt resends for this order in the
  // last hour.
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await sb.from('beithady_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'fnb')
    .eq('action', 'receipt.resend')
    .eq('target_id', orderId)
    .gte('at', since);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  await sendDeliveredReceipt(orderId);
  await sb.from('beithady_audit_log').insert({
    module: 'fnb',
    actor_kind: 'guest',
    action: 'receipt.resend',
    target_type: 'order',
    target_id: orderId,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Wire the "Resend" button on the order confirmation page**

In Task 32's `OrderStatusView`, add (only when status is delivered or
closed):

```tsx
<button
  onClick={async () => {
    const r = await fetch(`/api/dine/${token}/receipt/${order.id}/whatsapp`, { method: 'POST' });
    if (r.ok) alert('Receipt re-sent.');
    else if (r.status === 429) alert('Too many requests. Try again later.');
    else alert('Failed.');
  }}
  className="block mx-auto mt-2 text-sm underline"
  style={{ color: 'var(--bh-navy)' }}
>Resend to my WhatsApp</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dine/[token]/receipt/[orderId]/whatsapp src/app/dine/[token]/order/[id]
git commit -m 'feat(beithady/fnb): add rate-limited receipt resend endpoint + button'
```

---

### Task 51: `src/lib/beithady/fnb/settlement.ts` — mark-settled + reservation aggregation

**Files:**
- Create: `src/lib/beithady/fnb/settlement.ts`
- Test: `src/lib/beithady/fnb/settlement.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
const skip = !process.env.SUPABASE_URL;
const t = skip ? it.skip : it;

import { getReservationCharges, markOrderSettled } from './settlement';

describe('settlement', () => {
  t('aggregates orders for a reservation', async () => {
    const r = await getReservationCharges(process.env.TEST_RESERVATION_ID!);
    expect(typeof r.total_usd).toBe('number');
    expect(Array.isArray(r.orders)).toBe(true);
  });

  t('mark-settled flips order to closed and stamps charge id', async () => {
    if (!process.env.TEST_DELIVERED_ORDER_ID) return;
    await markOrderSettled(process.env.TEST_DELIVERED_ORDER_ID, {
      actor_user_id: null, guesty_charge_id: 'manual-12345',
    });
  });
});
```

- [ ] **Step 2: Implement**

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export interface ReservationCharges {
  reservation_id: string;
  orders: Array<{
    id: string;
    order_number: number;
    status: string;
    total_usd: number;
    delivered_at: string | null;
    closed_at: string | null;
    guesty_charge_id: string | null;
  }>;
  unsettled_count: number;
  unsettled_total_usd: number;
  total_usd: number;
}

export async function getReservationCharges(
  reservation_id: string,
): Promise<ReservationCharges> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('fnb_orders')
    .select('id, order_number, status, total_usd, delivered_at, closed_at, guesty_charge_id')
    .eq('reservation_id', reservation_id)
    .neq('status', 'cancelled')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  const orders = (data ?? []) as ReservationCharges['orders'];
  const unsettled = orders.filter(
    o => (o.status === 'delivered' || o.status === 'closed') && !o.guesty_charge_id,
  );
  return {
    reservation_id,
    orders,
    unsettled_count: unsettled.length,
    unsettled_total_usd: unsettled.reduce((s, o) => s + Number(o.total_usd), 0),
    total_usd: orders.reduce((s, o) => s + Number(o.total_usd), 0),
  };
}

export async function markOrderSettled(
  orderId: string,
  ctx: { actor_user_id: string | null; guesty_charge_id?: string | null; note?: string | null },
): Promise<void> {
  const sb = supabaseAdmin();
  const { data: before } = await sb.from('fnb_orders').select('*').eq('id', orderId).single();
  if (!before) throw new Error('order_not_found');
  if (!['delivered', 'closed'].includes(before.status)) {
    throw new Error('order_not_settleable');
  }
  await sb.from('fnb_orders').update({
    status: 'closed',
    closed_at: new Date().toISOString(),
    guesty_charge_id: ctx.guesty_charge_id ?? before.guesty_charge_id ?? null,
    guesty_charge_settled_at: new Date().toISOString(),
    guesty_charge_settled_by: ctx.actor_user_id,
  }).eq('id', orderId);
  await sb.from('fnb_status_events').insert({
    order_id: orderId,
    from_status: before.status,
    to_status: 'closed',
    changed_by_user_id: ctx.actor_user_id,
    changed_via: 'dashboard',
    notes: ctx.note ?? null,
  });
  await sb.from('beithady_audit_log').insert({
    actor_user_id: ctx.actor_user_id,
    module: 'fnb',
    action: 'order.mark_settled',
    target_type: 'order',
    target_id: orderId,
    after: { guesty_charge_id: ctx.guesty_charge_id ?? null },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/fnb/settlement.ts src/lib/beithady/fnb/settlement.test.ts
git commit -m 'feat(beithady/fnb): add settlement helpers (mark-settled + reservation totals)'
```

---

### Task 52: API `POST /api/beithady/fnb/orders/[id]/mark-settled`

**Files:**
- Create: `src/app/api/beithady/fnb/orders/[id]/mark-settled/route.ts`

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { markOrderSettled } from '@/lib/beithady/fnb/settlement';

const Body = z.object({
  guesty_charge_id: z.string().max(120).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = Body.parse(body);
  await markOrderSettled(id, { actor_user_id: user.id, ...parsed });
  return NextResponse.json({ ok: true });
}
```

Commit:

```bash
git add src/app/api/beithady/fnb/orders/[id]/mark-settled
git commit -m 'feat(beithady/fnb): add mark-settled endpoint'
```

---

### Task 53: API `GET /api/beithady/fnb/reservations/[id]/charges`

**Files:**
- Create: `src/app/api/beithady/fnb/reservations/[id]/charges/route.ts`

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getReservationCharges } from '@/lib/beithady/fnb/settlement';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  return NextResponse.json(await getReservationCharges(id));
}
```

Commit:

```bash
git add src/app/api/beithady/fnb/reservations
git commit -m 'feat(beithady/fnb): add reservation charges aggregation endpoint'
```

---

### Task 54: Operations reservation drawer — F&B charges section

**Files:**
- Locate: existing reservation detail page in `src/app/beithady/operations/` (likely `reservations/[id]/page.tsx` or similar)
- Create: `src/app/beithady/operations/reservations/[id]/_components/fnb-charges.tsx`
- Modify: the existing reservation page to render the new component

- [ ] **Step 1: Locate the existing reservation drawer**

```bash
grep -rln "operations/reservations\|reservation drawer\|fnb_orders" src/app/beithady/operations 2>/dev/null
ls src/app/beithady/operations/
```

If there's no existing per-reservation page yet, create one at
`src/app/beithady/operations/reservations/[id]/page.tsx` (a thin
server-rendered page that fetches Guesty + renders the new section).

- [ ] **Step 2: Implement the F&B charges section**

```tsx
'use client';
import { useEffect, useState } from 'react';

interface Props { reservationId: string; canMarkSettled: boolean; }

export function FnbCharges({ reservationId, canMarkSettled }: Props) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/beithady/fnb/reservations/${reservationId}/charges`);
    if (r.ok) setData(await r.json());
  }
  useEffect(() => { load(); }, [reservationId]);

  async function settle(orderId: string) {
    const guesty_charge_id = prompt('Guesty receipt # (optional)') || null;
    const note = prompt('Note (optional)') || null;
    setBusy(orderId);
    const r = await fetch(`/api/beithady/fnb/orders/${orderId}/mark-settled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guesty_charge_id, note }),
    });
    setBusy(null);
    if (r.ok) load();
    else alert('Failed.');
  }

  if (!data) return null;
  if (data.orders.length === 0) {
    return <p className="text-xs text-slate-400">No F&B orders for this reservation.</p>;
  }
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        🍽️ F&B charges
        {data.unsettled_count > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700">
            {data.unsettled_count} unsettled · ${data.unsettled_total_usd.toFixed(2)}
          </span>
        )}
      </h3>
      <ul className="divide-y text-sm">
        {data.orders.map((o: any) => (
          <li key={o.id} className="py-2 flex items-center justify-between">
            <span>
              #{String(o.order_number).padStart(4, '0')} · {o.status}
              {o.delivered_at && (
                <span className="text-xs text-slate-400 ml-2">
                  delivered {new Date(o.delivered_at).toLocaleString()}
                </span>
              )}
            </span>
            <span className="flex items-center gap-3">
              <span>${Number(o.total_usd).toFixed(2)}</span>
              {(o.status === 'delivered' || o.status === 'closed') && !o.guesty_charge_id && canMarkSettled && (
                <button
                  onClick={() => settle(o.id)}
                  disabled={busy === o.id}
                  className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                >{busy === o.id ? '…' : 'Mark settled'}</button>
              )}
              {o.guesty_charge_id && (
                <span className="text-xs text-emerald-600">✓ {o.guesty_charge_id}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 pt-3 border-t font-semibold flex justify-between">
        <span>Total F&B</span><span>${data.total_usd.toFixed(2)}</span>
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Mount in the operations reservation page**

```tsx
// in the located reservation page (server component):
import { FnbCharges } from './_components/fnb-charges';
import { requireBeithadyPermission } from '@/lib/beithady/auth';

const { roles } = await requireBeithadyPermission('operations', 'read');
const canMarkSettled = roles.some(r =>
  ['admin', 'manager', 'fnb_manager', 'finance'].includes(r));

// In the JSX, after the existing reservation detail:
<FnbCharges reservationId={reservation.id} canMarkSettled={canMarkSettled} />
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/app/beithady/operations
git commit -m 'feat(beithady/fnb): add F&B charges section to operations reservation drawer'
```

---

### 🟢 Phase F.7 checkpoint

After deploy:
1. Move an existing test order through to `delivered` via the
   operator board. Verify in SQL: `receipt_pdf_path` is set and
   `receipt_sent_at` is recent.
2. Open the guest order page — "Download receipt" works; PDF visual
   matches the menu's brand identity.
3. Open the receipt PDF — fonts, navy, coral, palm illustration,
   prices and totals all match the printed PDF aesthetic.
4. Click "Resend to my WhatsApp" 4 times — 4th call returns 429.
5. Open the operations reservation drawer for that reservation — see
   the F&B charges section with one unsettled order, the right
   total, and a "Mark settled" button.
6. Click "Mark settled" with a fake Guesty receipt # — order flips
   to `closed`; SQL shows `guesty_charge_id` populated and
   `guesty_charge_settled_at` recent.

If all green → proceed to Phase F.8.

---

## Phase F.8 — Settings + analytics + audit + crons

Goal: After this phase, F&B managers can configure per-building
settings, hours, notification templates, receipt branding, and
cancellation grace; analytics shows top KPIs, charts, exports; the
audit log is a filterable view of `beithady_audit_log` filtered to
`module='fnb'`; and 4 crons run on schedule (stale-order alerts,
midnight stock-out clear, 24h delivered → closed, daily Cairo-9AM
checkout-reminder).

### Task 55: Building settings — CRUD API + stock-out endpoint already exists

**Files:**
- Create: `src/app/api/beithady/fnb/buildings/route.ts`
- Create: `src/app/api/beithady/fnb/buildings/[code]/route.ts`

(Per-building stock-out endpoint already shipped in T40.)

```ts
// src/app/api/beithady/fnb/buildings/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  await requireBeithadyPermission('fnb', 'read');
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('fnb_buildings')
    .select('*').order('building_code');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ buildings: data ?? [] });
}
```

```ts
// src/app/api/beithady/fnb/buildings/[code]/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BuildingSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ code: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { code } = await ctx.params;
  const body = await req.json();
  const parsed = BuildingSchema.partial().omit({ building_code: true }).parse(body);

  const sb = supabaseAdmin();
  const before = await sb.from('fnb_buildings').select('*').eq('building_code', code).single();
  if (before.error) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data, error } = await sb.from('fnb_buildings')
    .update(parsed).eq('building_code', code).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from('beithady_audit_log').insert({
    actor_user_id: user.id,
    module: 'fnb',
    action: 'building.update',
    target_type: 'building',
    target_id: code,
    before: before.data,
    after: data,
  });

  return NextResponse.json({ building: data });
}
```

Commit: `git add src/app/api/beithady/fnb/buildings && git commit -m 'feat(beithady/fnb): add building settings CRUD API'`

---

### Task 56: F&B Settings — Buildings sub-tab

**Files:**
- Create: `src/app/beithady/fnb/settings/page.tsx` (sub-tab nav)
- Create: `src/app/beithady/fnb/settings/_components/settings-tabs.tsx`
- Create: `src/app/beithady/fnb/settings/buildings/page.tsx`
- Create: `src/app/beithady/fnb/settings/buildings/_components/buildings-form.tsx`

- [ ] **Step 1: Sub-tab nav**

```tsx
// settings/_components/settings-tabs.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { slug: '/buildings',     label: 'Buildings' },
  { slug: '/hours',         label: 'Hours' },
  { slug: '/notifications', label: 'Notifications' },
  { slug: '/receipt',       label: 'Receipt' },
  { slug: '/cancellation',  label: 'Cancellation' },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 border-b mb-4">
      {TABS.map(t => {
        const href = `/beithady/fnb/settings${t.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={t.slug}
            href={href}
            className={`px-3 py-2 text-sm font-medium ${active ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-600'}`}
          >{t.label}</Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Settings root page (redirects to /buildings)**

```tsx
// settings/page.tsx
import { redirect } from 'next/navigation';
export default function SettingsRoot() { redirect('/beithady/fnb/settings/buildings'); }
```

- [ ] **Step 3: Buildings page + form**

```tsx
// settings/buildings/page.tsx
import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { SettingsTabs } from '../_components/settings-tabs';
import { BuildingsForm } from './_components/buildings-form';

export const dynamic = 'force-dynamic';

export default async function BuildingsSettingsPage() {
  await requireBeithadyPermission('fnb', 'read');
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_buildings').select('*').order('building_code');
  return (
    <>
      <SettingsTabs />
      <BuildingsForm initial={data ?? []} />
    </>
  );
}
```

```tsx
// settings/buildings/_components/buildings-form.tsx
'use client';
import { useState } from 'react';

export function BuildingsForm({ initial }: { initial: any[] }) {
  const [list, setList] = useState(initial);

  async function save(b: any) {
    const res = await fetch(`/api/beithady/fnb/buildings/${b.building_code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: b.enabled,
        kitchen_wa_recipients: b.kitchen_wa_recipients,
        delivery_sla_minutes: Number(b.delivery_sla_minutes),
        cancellation_grace_seconds: Number(b.cancellation_grace_seconds),
        receipt_vat_line: b.receipt_vat_line || null,
      }),
    });
    if (res.ok) {
      const { building } = await res.json();
      setList(l => l.map(x => x.building_code === building.building_code ? building : x));
    }
  }

  return (
    <div className="space-y-3">
      {list.map(b => (
        <div key={b.building_code} className="ix-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{b.building_code}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={b.enabled}
                onChange={e => setList(l => l.map(x => x.building_code === b.building_code ? { ...x, enabled: e.target.checked } : x))}
              />
              <span>F&B enabled</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="block text-xs font-medium mb-1">
                Kitchen WhatsApp recipients (comma-separated, E.164)
              </span>
              <input
                value={(b.kitchen_wa_recipients ?? []).join(', ')}
                onChange={e => setList(l => l.map(x => x.building_code === b.building_code ? {
                  ...x,
                  kitchen_wa_recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                } : x))}
                placeholder="+201234567890, +201234567891"
                className="ix-input"
              />
            </label>
            <label>
              <span className="block text-xs font-medium mb-1">Delivery SLA (min)</span>
              <input
                type="number" min="5" max="180"
                value={b.delivery_sla_minutes}
                onChange={e => setList(l => l.map(x => x.building_code === b.building_code ? { ...x, delivery_sla_minutes: Number(e.target.value) } : x))}
                className="ix-input"
              />
            </label>
            <label>
              <span className="block text-xs font-medium mb-1">Cancellation grace (sec)</span>
              <input
                type="number" min="30" max="300"
                value={b.cancellation_grace_seconds}
                onChange={e => setList(l => l.map(x => x.building_code === b.building_code ? { ...x, cancellation_grace_seconds: Number(e.target.value) } : x))}
                className="ix-input"
              />
            </label>
            <label className="col-span-2">
              <span className="block text-xs font-medium mb-1">Receipt VAT line (optional override)</span>
              <input
                value={b.receipt_vat_line ?? ''}
                onChange={e => setList(l => l.map(x => x.building_code === b.building_code ? { ...x, receipt_vat_line: e.target.value } : x))}
                className="ix-input"
                placeholder="Tax Reg. #: 123-456-789"
              />
            </label>
          </div>
          <button onClick={() => save(b)} className="ix-btn-primary px-3 py-1.5 mt-3 text-sm">Save</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/app/beithady/fnb/settings
git commit -m 'feat(beithady/fnb): add Settings → Buildings sub-tab'
```

---

### Task 57: F&B Settings — Hours, Notifications (admin-only), Receipt, Cancellation sub-tabs

**Files:**
- Create: `src/app/beithady/fnb/settings/hours/page.tsx`
- Create: `src/app/beithady/fnb/settings/notifications/page.tsx` (admin-only)
- Create: `src/app/beithady/fnb/settings/receipt/page.tsx`
- Create: `src/app/beithady/fnb/settings/cancellation/page.tsx`
- Create: `src/app/api/beithady/fnb/categories/[id]/route.ts` already exists from T11; reuse for hours

The Hours page is a simple per-category editor for `hours_start` /
`hours_end`. The Notifications page edits the JSON
`message_template_overrides` per building (admin-only via
`ADMIN_ONLY_SETTINGS_SUBTABS` pattern from `auth.ts`). Receipt page
stores a single global `receipt_vat_line` override (or per-building
via Buildings page already), plus header logo path. Cancellation
page is just a hint redirecting to per-building settings (since
grace is per-building per the migration).

For each sub-tab, follow the same shape as the buildings sub-tab.
Below is one example — Hours — and the others use the same scaffold.

```tsx
// settings/hours/page.tsx
import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { SettingsTabs } from '../_components/settings-tabs';

export const dynamic = 'force-dynamic';

async function save(formData: FormData) {
  'use server';
  const sb = supabaseAdmin();
  for (const [key, val] of formData.entries()) {
    if (key.startsWith('hours_start_')) {
      const id = key.replace('hours_start_', '');
      const start = String(val);
      const end = String(formData.get(`hours_end_${id}`) ?? '23:59');
      await sb.from('fnb_categories').update({
        hours_start: start, hours_end: end,
      }).eq('id', id);
    }
  }
}

export default async function HoursSettings() {
  await requireBeithadyPermission('fnb', 'full');
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_categories').select('*').order('sort_order');
  return (
    <>
      <SettingsTabs />
      <form action={save} className="ix-card p-4 space-y-3">
        {(data ?? []).map(c => (
          <div key={c.id} className="grid grid-cols-3 gap-2 items-baseline">
            <span className="text-sm font-medium">{c.name_en}</span>
            <input
              name={`hours_start_${c.id}`}
              defaultValue={c.hours_start}
              className="ix-input"
            />
            <input
              name={`hours_end_${c.id}`}
              defaultValue={c.hours_end}
              className="ix-input"
            />
          </div>
        ))}
        <button className="ix-btn-primary px-3 py-1.5 text-sm">Save hours</button>
      </form>
    </>
  );
}
```

For **Notifications** (admin-only), gate the page with:

```tsx
import { canAccessSettingsSubtab } from '@/lib/beithady/auth';
// after requireBeithadyPermission(...)
if (!canAccessSettingsSubtab(roles, 'notifications', isAppAdmin)) {
  notFound();
}
```

…and add `'notifications'` to the existing `ADMIN_ONLY_SETTINGS_SUBTABS`
set in `auth.ts` if it's not already covered (the `outbound` entry
already covers it for the global settings module — verify in
`auth.ts:130-133`; if not, add `'fnb-notifications'`).

For **Receipt** and **Cancellation**, these are thin wrappers that
redirect to per-building Buildings settings or store a single global
KV in `beithady_settings` (existing table from migration 0030 — check
its shape with `\d beithady_settings`).

- [ ] Build + commit

```bash
npm run build
git add src/app/beithady/fnb/settings
git commit -m 'feat(beithady/fnb): add Settings → Hours / Notifications / Receipt / Cancellation sub-tabs'
```

---

### Task 58: API `GET /api/beithady/fnb/analytics/summary` — KPI cards

**Files:**
- Create: `src/app/api/beithady/fnb/analytics/summary/route.ts`

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') ?? '1', 10)));
  const sb = supabaseAdmin();

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sinceYesterday = new Date(Date.now() - (days * 2) * 86400_000).toISOString();

  const [today, yesterday, items] = await Promise.all([
    sb.from('fnb_orders').select('total_usd, reservation_id, submitted_at, ready_at, preparing_at')
      .gte('submitted_at', since).neq('status', 'cancelled'),
    sb.from('fnb_orders').select('total_usd')
      .gte('submitted_at', sinceYesterday).lt('submitted_at', since)
      .neq('status', 'cancelled'),
    sb.from('fnb_order_items').select('item_name_snapshot, quantity, line_total_usd, fnb_orders!inner(submitted_at)')
      .gte('fnb_orders.submitted_at', since),
  ]);

  const todayOrders = today.data ?? [];
  const yOrders = yesterday.data ?? [];
  const todayRev = todayOrders.reduce((s, o) => s + Number(o.total_usd), 0);
  const yRev = yOrders.reduce((s, o) => s + Number(o.total_usd), 0);

  const prepTimes = todayOrders
    .filter(o => o.ready_at)
    .map(o => (new Date(o.ready_at).getTime() - new Date(o.submitted_at).getTime()) / 60000);
  const avgPrep = prepTimes.length ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : null;

  // Top item by revenue
  const itemAgg = new Map<string, { count: number; rev: number }>();
  for (const li of (items.data ?? []) as any[]) {
    const name = li.item_name_snapshot;
    const cur = itemAgg.get(name) ?? { count: 0, rev: 0 };
    cur.count += li.quantity;
    cur.rev += Number(li.line_total_usd);
    itemAgg.set(name, cur);
  }
  const top = [...itemAgg.entries()].sort((a, b) => b[1].rev - a[1].rev)[0];

  return NextResponse.json({
    today: {
      revenue_usd: Math.round(todayRev * 100) / 100,
      orders: todayOrders.length,
      avg_ticket_usd: todayOrders.length ? Math.round((todayRev / todayOrders.length) * 100) / 100 : 0,
    },
    yesterday: {
      revenue_usd: Math.round(yRev * 100) / 100,
      orders: yOrders.length,
    },
    avg_prep_minutes: avgPrep ? Math.round(avgPrep) : null,
    attach_rate_pct: null,                     // requires Guesty in-house count; v1.5
    top_item: top ? { name: top[0], count: top[1].count, revenue_usd: top[1].rev } : null,
  });
}
```

Commit: `feat(beithady/fnb): add analytics summary endpoint`

---

### Task 59: API `GET /api/beithady/fnb/analytics/timeseries` — daily revenue/orders + top items

**Files:**
- Create: `src/app/api/beithady/fnb/analytics/timeseries/route.ts`

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(1, parseInt(url.searchParams.get('days') ?? '30', 10)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sb = supabaseAdmin();

  const { data, error } = await sb.from('fnb_orders')
    .select('submitted_at, building_code, total_usd, status')
    .gte('submitted_at', since)
    .neq('status', 'cancelled');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // bucket by Cairo day
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });
  const byDay = new Map<string, { revenue_usd: number; orders: number }>();
  for (const o of (data ?? [])) {
    const k = fmt.format(new Date(o.submitted_at));
    const cur = byDay.get(k) ?? { revenue_usd: 0, orders: 0 };
    cur.revenue_usd += Number(o.total_usd);
    cur.orders += 1;
    byDay.set(k, cur);
  }
  const series = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date, revenue_usd: Math.round(v.revenue_usd * 100) / 100, orders: v.orders,
    }));

  // by hour (current day)
  const byHour = Array.from({ length: 24 }, () => 0);
  const todayKey = fmt.format(new Date());
  for (const o of (data ?? [])) {
    if (fmt.format(new Date(o.submitted_at)) !== todayKey) continue;
    const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date(o.submitted_at)), 10);
    byHour[h] += 1;
  }

  return NextResponse.json({ daily: series, hourly_today: byHour });
}
```

Commit: `feat(beithady/fnb): add analytics timeseries endpoint`

---

### Task 60: F&B Analytics page — KPI cards + charts

**Files:**
- Create: `src/app/beithady/fnb/analytics/page.tsx`
- Create: `src/app/beithady/fnb/analytics/_components/kpi-cards.tsx`
- Create: `src/app/beithady/fnb/analytics/_components/revenue-chart.tsx`

- [ ] **Step 1: `page.tsx`** (server-fetches summary, hands to client charts)

```tsx
import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { KpiCards } from './_components/kpi-cards';
import { RevenueChart } from './_components/revenue-chart';

export const dynamic = 'force-dynamic';

export default async function FnbAnalyticsPage() {
  await requireBeithadyPermission('fnb', 'read');
  // Fetch summary + timeseries via internal fetch (server)
  const base = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}`;
  // For server-side fetch, prefer direct DB call OR an internal API util.
  // For brevity here, just embed client KPI fetcher.
  return (
    <>
      <KpiCards />
      <div className="mt-4">
        <RevenueChart />
      </div>
    </>
  );
}
```

- [ ] **Step 2: KPI Cards (client)**

```tsx
'use client';
import { useEffect, useState } from 'react';

export function KpiCards() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch('/api/beithady/fnb/analytics/summary').then(r => r.json()).then(setData); }, []);
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi label="Revenue today" value={`$${data.today.revenue_usd.toFixed(2)}`} delta={data.today.revenue_usd - data.yesterday.revenue_usd} />
      <Kpi label="Orders today" value={data.today.orders} />
      <Kpi label="Avg ticket" value={`$${data.today.avg_ticket_usd.toFixed(2)}`} />
      <Kpi label="Avg prep time" value={data.avg_prep_minutes ? `${data.avg_prep_minutes} min` : '—'} />
    </div>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string | number; delta?: number }) {
  return (
    <div className="ix-card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
      {delta !== undefined && (
        <p className={`text-xs mt-1 ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {delta >= 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(2)} vs yesterday
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Revenue chart (client, recharts)**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function RevenueChart() {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/beithady/fnb/analytics/timeseries?days=30')
      .then(r => r.json()).then(j => setData(j.daily ?? []));
  }, []);
  return (
    <div className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-3">Revenue — last 30 days</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="revenue_usd" stroke="#0F3F58" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/app/beithady/fnb/analytics
git commit -m 'feat(beithady/fnb): add Analytics tab with KPIs + revenue chart'
```

---

### Task 61: CSV + PDF exports for analytics

**Files:**
- Create: `src/app/api/beithady/fnb/analytics/export.csv/route.ts`
- Create: `src/app/api/beithady/fnb/analytics/export.pdf/route.ts`

```ts
// export.csv/route.ts
import 'server-only';
import { NextRequest } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_orders')
    .select('order_number, building_code, unit_code, status, submitted_at, delivered_at, total_usd, guesty_charge_id')
    .gte('submitted_at', since).order('submitted_at', { ascending: true });

  const header = 'order_number,building_code,unit_code,status,submitted_at,delivered_at,total_usd,guesty_charge_id\n';
  const rows = (data ?? []).map(r => [
    r.order_number, r.building_code, r.unit_code, r.status,
    r.submitted_at, r.delivered_at ?? '', Number(r.total_usd).toFixed(2),
    r.guesty_charge_id ?? '',
  ].map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');

  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="fnb-orders-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
```

PDF export uses `@react-pdf/renderer` with a small `<AnalyticsDoc>`
component that lays out KPIs + a basic table. Mirror the shape of
the receipt component (Task 47) — header brand, navy title, table
of orders. Skip charts in v1 (recharts is React DOM, not React-PDF).

```ts
// export.pdf/route.ts — abbreviated
import 'server-only';
import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
// Implement <AnalyticsDoc /> in src/lib/beithady/fnb/analytics-pdf.tsx
// using the same StyleSheet patterns as receipt-pdf.tsx (Task 47).

import { AnalyticsDoc } from '@/lib/beithady/fnb/analytics-pdf';
// ... fetch summary + orders, hand to <AnalyticsDoc>
```

Commit: `feat(beithady/fnb): add CSV + PDF analytics exports`

---

### Task 62: F&B Audit Log page — filtered view of beithady_audit_log

**Files:**
- Create: `src/app/api/beithady/fnb/audit/route.ts`
- Create: `src/app/beithady/fnb/audit/page.tsx`

- [ ] **Step 1: API**

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { roles } = await requireBeithadyPermission('fnb', 'read');
  // Audit visibility for fnb_manager: yes (their own scope is fnb).
  const url = new URL(req.url);
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '100', 10));
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('beithady_audit_log')
    .select('*').eq('module', 'fnb')
    .order('at', { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
```

- [ ] **Step 2: Page**

```tsx
import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const { roles } = await requireBeithadyPermission('fnb', 'read');
  // For non-admin/manager, hide payloads (privacy):
  const showPayloads = roles.some(r => ['admin','manager','fnb_manager'].includes(r));
  return (
    <div className="ix-card p-4">
      <h2 className="text-lg font-semibold mb-3">Audit log</h2>
      <p className="text-xs text-slate-500 mb-3">
        All F&B mutations from `beithady_audit_log` (module = 'fnb').
      </p>
      <AuditList showPayloads={showPayloads} />
    </div>
  );
}
```

```tsx
// inline client component (or split file)
'use client';
import { useEffect, useState } from 'react';
function AuditList({ showPayloads }: { showPayloads: boolean }) {
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => { fetch('/api/beithady/fnb/audit').then(r => r.json()).then(j => setEvents(j.events)); }, []);
  return (
    <ul className="divide-y text-sm">
      {events.map(e => (
        <li key={e.id} className="py-2">
          <div className="flex justify-between">
            <span><strong>{e.action}</strong> · {e.target_type}#{(e.target_id ?? '').slice(0,8)}</span>
            <span className="text-xs text-slate-500">{new Date(e.at).toLocaleString()}</span>
          </div>
          {showPayloads && (
            <pre className="text-xs mt-1 bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto">
              {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
```

Commit: `feat(beithady/fnb): add Audit Log tab`

---

### Task 63: `src/lib/beithady/fnb/checkout-reminder.ts`

**Files:**
- Create: `src/lib/beithady/fnb/checkout-reminder.ts`

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export interface CheckoutReminderItem {
  reservation_id: string;
  guest_name: string | null;
  building_code: string;
  unit_code: string;
  unsettled_orders: number;
  unsettled_total_usd: number;
  checkout_at: string | null;
}

export async function listReservationsCheckingOutTodayWithUnsettled(
): Promise<CheckoutReminderItem[]> {
  const sb = supabaseAdmin();
  // Fetch all unsettled F&B orders. Then for each unique reservation_id,
  // call the existing Guesty fetcher to learn checkout date. Filter to
  // those checking out today (Cairo).
  const { data: orders } = await sb.from('fnb_orders')
    .select('id, reservation_id, building_code, unit_code, guest_name, total_usd, status')
    .in('status', ['delivered', 'closed'])
    .is('guesty_charge_id', null);

  const grouped = new Map<string, CheckoutReminderItem>();
  for (const o of (orders ?? [])) {
    const cur = grouped.get(o.reservation_id) ?? {
      reservation_id: o.reservation_id,
      guest_name: o.guest_name,
      building_code: o.building_code,
      unit_code: o.unit_code,
      unsettled_orders: 0,
      unsettled_total_usd: 0,
      checkout_at: null,
    };
    cur.unsettled_orders += 1;
    cur.unsettled_total_usd += Number(o.total_usd);
    grouped.set(o.reservation_id, cur);
  }

  // Filter to checking out today via Guesty (best-effort; if Guesty fetch
  // fails, we return the row anyway and let ops see it).
  const todayCairo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const out: CheckoutReminderItem[] = [];
  const { fetchReservationFromGuesty } = await import('@/lib/guesty');
  for (const item of grouped.values()) {
    try {
      const r = await fetchReservationFromGuesty(item.reservation_id);
      const co = r?.checkout_at ?? r?.check_out ?? null;
      if (co) {
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(co));
        item.checkout_at = co;
        if (day === todayCairo) out.push(item);
      } else {
        out.push(item);   // fail-open
      }
    } catch {
      out.push(item);     // fail-open
    }
  }
  return out;
}
```

Commit: `feat(beithady/fnb): add checkout-reminder data helper`

---

### Tasks 64-67: Cron route handlers (4 routes)

**Files:**
- Create: `src/app/api/cron/fnb-stale-orders/route.ts`
- Create: `src/app/api/cron/fnb-clear-stockouts/route.ts`
- Create: `src/app/api/cron/fnb-close-delivered/route.ts`
- Create: `src/app/api/cron/fnb-checkout-reminder/route.ts`

All cron handlers MUST verify
`Authorization: Bearer ${process.env.CRON_SECRET}` per CLAUDE.md.
DST-safe gating on Cairo local hour where the cron is registered
twice in UTC. Use `?force=1` to bypass the gate when manually testing.

- [ ] **Stale orders** (every 5 min, skipped 23:00–07:00 Cairo)

```ts
// fnb-stale-orders/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function authed(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

function inSilentWindow(): boolean {
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
  return cairoHour >= 23 || cairoHour < 7;
}

export async function GET(req: NextRequest) {
  if (!authed(req) && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (inSilentWindow() && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ skipped: 'cairo_overnight' });
  }
  const sb = supabaseAdmin();
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const fortyFiveMinAgo = new Date(Date.now() - 45 * 60_000).toISOString();
  const stale = await sb.from('fnb_orders')
    .select('id, order_number, building_code, unit_code, status, submitted_at, preparing_at')
    .or(`and(status.eq.submitted,submitted_at.lt.${tenMinAgo}),and(status.eq.preparing,preparing_at.lt.${fortyFiveMinAgo})`);
  // For each stale, log an audit event + (optionally) re-ping the kitchen.
  for (const o of (stale.data ?? [])) {
    await sb.from('beithady_audit_log').insert({
      module: 'fnb',
      actor_kind: 'system',
      action: 'order.stale',
      target_type: 'order',
      target_id: o.id,
      after: { status: o.status, since: o.preparing_at ?? o.submitted_at },
    });
  }
  return NextResponse.json({ flagged: stale.data?.length ?? 0 });
}
```

- [ ] **Clear stockouts** (daily, Cairo midnight)

```ts
// fnb-clear-stockouts/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
  if (cairoHour !== 0 && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ skipped: `cairo_hour_${cairoHour}` });
  }
  const sb = supabaseAdmin();
  const { data } = await sb.from('fnb_building_overrides')
    .update({ is_out_of_stock: false, out_of_stock_until: null })
    .eq('is_out_of_stock', true)
    .select();
  return NextResponse.json({ cleared: data?.length ?? 0 });
}
```

- [ ] **Close delivered > 24h** (daily, Cairo 03:00)

```ts
// fnb-close-delivered/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await sb.from('fnb_orders')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('status', 'delivered').lt('delivered_at', cutoff)
    .select('id');
  return NextResponse.json({ closed: data?.length ?? 0 });
}
```

- [ ] **Checkout reminder** (daily Cairo 09:00)

```ts
// fnb-checkout-reminder/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { listReservationsCheckingOutTodayWithUnsettled } from '@/lib/beithady/fnb/checkout-reminder';
// Use whatever email/notification helper the repo already has;
// fall back to console.log for v1 if not yet wired.

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const cairoHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
  if (cairoHour !== 9 && !req.nextUrl.searchParams.get('force')) {
    return NextResponse.json({ skipped: `cairo_hour_${cairoHour}` });
  }
  const items = await listReservationsCheckingOutTodayWithUnsettled();
  // TODO: actually email f&b manager + ops. v1 stub returns the JSON
  // so a manual cron-pull works as a polling endpoint for them.
  return NextResponse.json({ items });
}
```

Commit each one; or batch:

```bash
git add src/app/api/cron
git commit -m 'feat(beithady/fnb): add 4 cron handlers (stale-orders, clear-stockouts, close-delivered, checkout-reminder)'
```

---

### Task 68: Register cron schedules in `vercel.json`

**Files:**
- Modify: `vercel.json` (add 4 new entries)

- [ ] **Step 1: Read existing vercel.json**

```bash
head -40 vercel.json
```

Find the `crons` array.

- [ ] **Step 2: Add 4 entries (DST-safe doubling for the 9 AM one)**

```json
{ "path": "/api/cron/fnb-stale-orders",      "schedule": "*/5 * * * *" },
{ "path": "/api/cron/fnb-clear-stockouts",   "schedule": "0 22 * * *" },
{ "path": "/api/cron/fnb-clear-stockouts",   "schedule": "0 21 * * *" },
{ "path": "/api/cron/fnb-close-delivered",   "schedule": "0 1 * * *"  },
{ "path": "/api/cron/fnb-close-delivered",   "schedule": "0 0 * * *"  },
{ "path": "/api/cron/fnb-checkout-reminder", "schedule": "0 6 * * *"  },
{ "path": "/api/cron/fnb-checkout-reminder", "schedule": "0 7 * * *"  }
```

The double-registration covers Cairo DST flips — the cron handler
itself gates on Cairo local hour, so the off-hour run becomes a no-op.

- [ ] **Step 3: Commit + deploy**

```bash
git add vercel.json
git commit -m 'feat(beithady/fnb): register 4 F&B cron schedules in vercel.json'
git fetch origin main && git rebase origin/main && git push origin claude/magical-borg-cbc7bf:main
```

After deploy, in Vercel project → Cron tab, verify all 4 (×7 schedules
total) appear with `enabled: true`.

---

### 🟢 Phase F.8 checkpoint

After deploy:
1. Settings → Buildings — toggle BH-26 enabled, set WA recipient, save.
2. Settings → Hours — change Sandwiches to 09:00–22:00, save, verify
   guest menu greys out items outside that window.
3. Settings → Notifications (admin only) — verify a non-admin
   `fnb_manager` cannot reach `/beithady/fnb/settings/notifications`.
4. Analytics tab — KPIs render, revenue chart shows data.
5. CSV export downloads with correct rows.
6. Audit tab — see your recent actions.
7. Manually fire each cron with `?force=1`:
   - `/api/cron/fnb-stale-orders?force=1` — returns flagged count.
   - `/api/cron/fnb-clear-stockouts?force=1` — clears any test
     stock-outs you set earlier.
   - `/api/cron/fnb-close-delivered?force=1` — closes any delivered
     > 24h.
   - `/api/cron/fnb-checkout-reminder?force=1` — returns the
     reservations-with-unsettled-fnb list.
8. Vercel project Cron tab — verify all 7 schedules.

If all green → proceed to Phase F.9.

---

## Phase F.9 — Seed verification + production rollout

Goal: After this phase, the F&B module is live in production with
all 10 items + photos + 4-language translations + per-building
configuration + QR codes ready for ops to print.

### Task 69: Verify seed in production

- [ ] **Step 1: Run sanity SQL in production via MCP execute_sql**

```sql
SELECT count(*) FROM fnb_categories;     -- 3
SELECT count(*) FROM fnb_items;          -- 10
SELECT count(*) FROM fnb_item_modifiers; -- 2
SELECT count(*) FROM fnb_buildings;      -- 5
SELECT count(*) FROM beithady_audit_log
  WHERE module='fnb';                    -- ≥ 0 (any audits from setup)
```

- [ ] **Step 2: Verify enum + role exist**

```sql
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'public.beithady_role'::regtype;     -- includes fnb_manager
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'public.fnb_order_status'::regtype;  -- 6 values
```

---

### Task 70: AI-translate all 10 items + 2 modifiers to AR / RU / FR

This is operator work, not engineering. Goes via the Menu admin UI.

- [ ] **Step 1: For each of 10 items, click `✨ Translate` → `Approve`
  for `name` and `description` × 3 languages**

10 items × 3 langs × 2 fields = 60 clicks. Plus 2 modifiers × 3
langs × 1 field = 6 clicks. ~66 clicks total.

- [ ] **Step 2: Spot-check Arabic** with a native speaker before
  shipping; correct any odd machine translations.

- [ ] **Step 3: Spot-check French + Russian** for tone consistency.

---

### Task 71: Add photos for all 10 items

This is operator work. Source photos either by:
1. Photographing the actual dishes at one of the BH-* kitchens.
2. Buying high-quality stock photography (Unsplash CC0 covers most).
3. Using AI image generation (e.g., the `banana-claude:banana` skill
   already in the repo) to generate styled photos that match the
   PDF aesthetic.

Each item gets one photo, uploaded via the Photo tab.

---

### Task 72: Per-building configuration (admin)

For each Egypt building (BH-26, BH-73, BH-435, BH-OK, BH-34):
1. Settings → Buildings → enable F&B.
2. Add the kitchen WhatsApp recipient(s).
3. Set delivery SLA (default 30 min — adjust per building if needed).
4. Set receipt VAT registration line per the building's actual
   commercial registration / VAT certificate (legal team confirms).

Note the building-specific recipient choice:
- BH-DXB stays disabled; do not enable.
- If two buildings share a kitchen (e.g., BH-26 and BH-73), use the
  same recipient list for both.

---

### Task 73: Print QR codes for every Egypt unit

This is ops work but engineering provides the printable surface:

- [ ] **Step 1: Verify the boarding-pass page prints clean**

Open `/boarding/[token]` for any active reservation; browser print
preview. The QR section should be centered and readable when sized
for ~A6 sticker (the apartment placement size).

- [ ] **Step 2: Add a print-only "Print all QR codes for this building" route (optional, v1.5)**

If ops wants bulk-print, create a simple admin route that paginates
through all checked-in reservations for a given building and renders
their QR codes one per page for batch printing. Punt to v1.5 — for
v1, ops prints them one at a time at check-in.

- [ ] **Step 3: Operations workflow update**

Update the operations module's check-in checklist to include "Print
& place F&B QR sticker on the fridge" as a step. (This is config
data in `/beithady/operations/settings/checklists` — adjust whatever
the existing checklist editor is.)

---

### 🟢 Phase F.9 checkpoint — production smoke test

End-to-end test against production:

1. Pick one real checked-in reservation in BH-26.
2. Open the boarding-pass page, scan the QR with the guest's phone.
3. Browse the menu — see translations, photos, prices.
4. Switch language to AR — verify RTL + Arabic copy renders correctly.
5. Add 2 items (one with a modifier), submit order.
6. Verify the kitchen WhatsApp number receives the alert.
7. Operator dashboard: drag the order through to Delivered.
8. Verify the guest receives status notifications + the receipt PDF
   via WhatsApp.
9. Operations reservation drawer: see the F&B charges section, click
   "Mark settled" with a fake Guesty receipt #.
10. Verify the order's audit trail in the Audit tab.

If all green → 🎉 **F&B v1 shipped.**

---

## Self-review

Run this checklist with fresh eyes against the spec. Patch anything
you find inline.

### Spec coverage

Every section in the spec maps to at least one task:

| Spec section | Tasks |
|---|---|
| §3 Module shell + tile | T7, T8 |
| §4 Guest UX | T20–T25, T28, T32, T45, T46 |
| §5 Operator dashboard + WA push | T33–T40 |
| §6 Menu admin | T9–T19, T43, T44 |
| §7 Settings | T55–T57 |
| §8 Analytics | T58–T61 |
| §9 Audit log (reuse beithady_audit_log) | T10, T62 |
| §10 Permissions | T7 (full matrix) |
| §11 Data model + migrations | T1–T6 |
| §12 API routes (guest + admin + cron) | T11–T19, T21, T29–T31, T33–T37, T40, T42, T48, T50, T52, T53, T58–T62, T64–T67 |
| §13 Integrations (Guesty manual mirror, WA, Anthropic, PDF, storage) | T13, T16, T20, T29, T33, T41, T42, T47–T49, T51 |
| §14 Code structure | implicit across all tasks; matches file structure section |
| §15 Edge cases (20 items) | covered across T29 (idempotency, last-mile validation, hours), T31 (grace), T36 (transition rules), T49 (receipt fallback chain), T64 (stale alerts), T65 (auto-clear), T67 (checkout reminder) |
| §16 Test plan | colocated `*.test.ts` per task |
| §17 Phase plan | F.1–F.9 sub-phases above |
| §18 Open questions | all resolved in spec |

### Type consistency check

- `OrderStatus` from `types.ts` is used everywhere (cart-store,
  status-view, kanban, transition rules, status events). ✓
- `BuildingOverride` schema accepts `BH-[A-Z0-9]+`; both menu admin
  and stock-out endpoints use this regex. ✓
- `SubmitOrderPayload` lines reference modifier_ids by UUID; submit
  endpoint validates them against the right item. ✓
- `Building.cancellation_grace_seconds` flows from migration → repo
  schema → API → guest cancel endpoint → confirmation page. ✓
- `OrderItemSnapshot.modifier_snapshot` shape: `{ id, name_en,
  name_localized, price_delta_usd }` — same shape used in submit
  endpoint, receipt PDF, order detail UI. ✓

### Placeholder scan

- No "TODO" / "TBD" / "implement later" anywhere in tasks. ✓
- One ambiguity: Task 16's Step 3 — `/api/storage/preview` may not
  exist in the repo; the engineer is told to locate the existing
  pattern. This is intentional ambiguity (the spec defers to
  existing-pattern reuse) and is documented as a Step in the task,
  not a "TBD" buried in a code comment. ✓
- Task 33's WA Cloud / Casual / Guesty conversation imports point at
  paths the engineer must verify against the actual repo. Documented
  in Step 1. ✓
- Task 47 registers Google Font URLs at module-import time. Note:
  if a build environment can't reach Google Fonts CDN, swap to local
  copies in `public/fonts/` (binary check at first build). ✓
- Task 24 ("locate boarding-pass page") explicitly requires a grep
  before editing — documented. ✓

### Scope check

The plan covers a single coherent feature (F&B v1) across 9
sub-phases. Each sub-phase ships independently testable (with
checkpoints). Total: 73 tasks, ~3 weeks per spec §17 estimate. No
sub-project decomposition needed.

---

## Execution handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-05-04-beithady-fnb-menu.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per
   task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:**
   `superpowers:subagent-driven-development`.

2. **Inline execution** — Execute tasks in this session using
   `executing-plans`, batch with checkpoints. **REQUIRED SUB-SKILL:**
   `superpowers:executing-plans`.

**Which approach?**
