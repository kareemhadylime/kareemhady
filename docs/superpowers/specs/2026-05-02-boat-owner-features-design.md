# Boat Module — Owner-Role Feature Expansion (Design Spec)

**Date:** 2026-05-02
**Status:** Spec — pending implementation plan
**Branch:** `claude/inspiring-booth-3d348a`
**Rollout:** Single-shot release (one PR, one big migration set, one deploy)

---

## 1. Overview

Adds five Owner-role features to the existing Boat Rental module at `/emails/boat-rental/owner/*`:

1. Multi-skipper roster per boat (replaces today's single-skipper columns on the boats table)
2. Manual reservation creation by owner (parallel to the existing broker-only flow)
3. Multi-payment ledger per trip with auto-close on full payment (replaces today's one-payment-per-trip model)
4. Expense tracking with universal payable model — every expense is a bill with a payment ledger; "pay now" toggle creates expense + payment in one transaction
5. Recurring expense templates with daily cron auto-generation (Marina docking, Insurance, etc.)

Plus one cross-cutting addition:

6. 24-hour pre-trip WhatsApp reminder in Arabic to owner + default skipper

The existing owner blocks calendar (shipped in migration 0018) is retained as-is.

---

## 2. Goals & non-goals

### Goals

- Give owners a self-service surface for skipper management, manual bookings, financial tracking, and expense management
- Universal payable model so trip payments and expense payments share a consistent mental model and SQL shape
- Auto-generate recurring bills (Marina) so owners don't forget them
- Arabic 24h reminders so the operational team gets a same-day-language nudge
- Keep all existing broker and admin flows working — additive only

### Non-goals

- Replacing the broker flow — brokers continue to create reservations the same way
- Multi-currency — everything stays EGP
- Tax tracking / VAT
- Per-skipper P&L (we have the data after this release; UI for it is future work)
- Editable past P&L periods (the P&L view is a live computation; no period close)
- Supplier/vendor management beyond a free-text vendor name field
- Bank reconciliation
- Photo annotation / OCR on receipts (just upload + view)

---

## 3. Decisions log (from Q1–Q7 brainstorming)

| Q | Decision | Rationale |
|---|----------|-----------|
| Q1 Skipper model | Multi-skipper roster per boat | Trip-related "Part-time skipper fee" expense implies different skippers on different trips |
| Q2 Manual reservation lifecycle | Skip the hold, start as `confirmed` | Owner-created bookings don't need a 2h hold window |
| Q2 Source attribution | Hybrid — registered broker dropdown + inline "+ add new external broker" | Best of both: analytics for registered brokers, flexibility for external ones |
| Q3 Trip payment auto-close | Auto-flip to `paid_to_owner` on `sum(payments) >= trip_price` | Zero-click close, matches mark-paid UX |
| Q3 Overpayment policy | Block | Server rejects with "would overpay by EGP X" |
| Q4 Expense receipt | Optional photo upload per expense | Reuses existing Storage pattern |
| Q4 Recurring expense | Template + daily cron auto-generates as payable bills | Set-and-forget |
| Q5 Pay-now/Pay-later | Per-expense toggle on create form | Owner picks at entry; underlying schema is uniform |
| Q4 Fuel tips | Separate `fuel_tips_egp` column on the fuel expense row | P&L can break it out |
| Q4 Categories | 10 categories: Amenities, Part-time Skipper, Marina Docking, Fuel, Repair, Insurance, Boat License, Full-time Skipper Salary, Maintenance Contract, Other | Comprehensive enum from day one |
| Q6 Tabs | A3 — `OWNER_TABS` grows from 4 to 6 (adds Skippers, Money) | Cleanest mobile UX |
| Q6 P&L scope | B3 — fleet P&L with per-boat drill-down at top of Money tab | Most useful single view |
| Q6 Admin visibility | C1 — admin sees everything | No separate gates on new tables |
| Q6 Manual reservation placement | D3 — both calendar context-menu AND dedicated `/owner/reservations/new` page | Calendar tap is fast path; dedicated page for far-future dates |
| Q6 Money tab structure | Separate routes per sub-section | Cleaner URLs, easier deep linking |
| Q6 Calendar interaction | Right-click (desktop) / long-press (mobile) → context menu | Less cramped than tabbed modal |
| Q7 Notifications | Default set + 24h pre-trip reminder in Arabic to owner + default skipper | See section 8 |
| — Legacy skipper columns | DROP `boat_rental_boats.skipper_name/whatsapp` in this release as migration 0072 (after all readers migrated) | User chose full cleanup over deferred follow-up |
| — Recurring categories | Include all 4 extras (Insurance / License / Full-time Skipper Salary / Maintenance Contract) | Zero-risk to add now |

---

## 4. Data model

### 4.1 New tables

#### `boat_rental_skippers`
```sql
create table public.boat_rental_skippers (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boat_rental_boats(id) on delete cascade,
  name        text not null,
  whatsapp    text not null,                    -- E.164 without '+', Green-API format
  is_default  boolean not null default false,
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index boat_rental_skippers_default_per_boat
  on public.boat_rental_skippers (boat_id) where is_default = true;
create index idx_boat_rental_skippers_boat
  on public.boat_rental_skippers (boat_id, active);
```

The partial unique index enforces at most one default per boat. The application layer ensures at least one default per boat (when adding a new skipper to a boat that has none, force `is_default=true`; when changing the default, atomically unset the previous one).

#### `boat_rental_external_brokers`
```sql
create table public.boat_rental_external_brokers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.boat_rental_owners(id) on delete cascade,
  name        text not null,
  phone       text,
  created_at  timestamptz not null default now()
);
create unique index boat_rental_external_brokers_per_owner
  on public.boat_rental_external_brokers (owner_id, lower(trim(name)));
```

Owner's personal address book. Lowercased + trimmed unique key prevents "Hisham" / "hisham " duplicates.

#### `boat_rental_expenses`
```sql
create table public.boat_rental_expenses (
  id                       uuid primary key default gen_random_uuid(),
  boat_id                  uuid not null references public.boat_rental_boats(id),
  owner_id                 uuid not null references public.boat_rental_owners(id),  -- denormalized
  reservation_id           uuid references public.boat_rental_reservations(id),
  category                 text not null check (category in (
                             'amenities','part_time_skipper',
                             'marina_docking','fuel','repair',
                             'insurance','boat_license','full_time_skipper_salary',
                             'maintenance_contract','other'
                           )),
  expense_date             date not null,
  amount_egp               numeric(10,2) not null check (amount_egp >= 0),
  description              text,
  -- Fuel-only fields
  fuel_liters              numeric(8,2),
  fuel_price_per_liter     numeric(8,2),
  fuel_tips_egp            numeric(10,2),
  -- Skipper-attribution fields
  skipper_id               uuid references public.boat_rental_skippers(id),
  -- Recurrence link
  recurring_template_id    uuid references public.boat_rental_recurring_expense_templates(id),
  -- Receipt + status
  receipt_path             text,                       -- Supabase Storage path
  status                   text not null default 'open' check (status in ('open','paid','cancelled')),
  vendor_name              text,                        -- free text, optional
  created_by               uuid not null references public.app_users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_boat_rental_expenses_boat_date
  on public.boat_rental_expenses (boat_id, expense_date desc);
create index idx_boat_rental_expenses_open_per_owner
  on public.boat_rental_expenses (owner_id, status) where status = 'open';
create index idx_boat_rental_expenses_reservation
  on public.boat_rental_expenses (reservation_id) where reservation_id is not null;
create index idx_boat_rental_expenses_template
  on public.boat_rental_expenses (recurring_template_id) where recurring_template_id is not null;
```

Trip-related categories (`amenities`, `part_time_skipper`) populate `reservation_id`. General categories leave it null. Server-side validation enforces the per-category required fields (e.g., `part_time_skipper` requires `skipper_id`; `fuel` requires liters + price; `repair` requires description).

#### `boat_rental_expense_payments`
```sql
create table public.boat_rental_expense_payments (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.boat_rental_expenses(id) on delete cascade,
  amount_egp   numeric(10,2) not null check (amount_egp > 0),
  paid_date    date not null,
  method       text not null check (method in ('cash','bank_transfer','instapay','card','other')),
  note         text,
  recorded_by  uuid not null references public.app_users(id),
  created_at   timestamptz not null default now()
);
create index idx_boat_rental_expense_payments_expense
  on public.boat_rental_expense_payments (expense_id, paid_date desc);
```

No UNIQUE constraint — multiple partial payments per expense allowed. Same overpayment block as trip payments: server validates `existing_total + new_amount <= expense.amount_egp` and rejects if it would exceed.

#### `boat_rental_recurring_expense_templates`
```sql
create table public.boat_rental_recurring_expense_templates (
  id              uuid primary key default gen_random_uuid(),
  boat_id         uuid not null references public.boat_rental_boats(id) on delete cascade,
  owner_id        uuid not null references public.boat_rental_owners(id),
  category        text not null,                            -- same enum as expenses (validated by trigger)
  vendor_name     text,
  amount_egp      numeric(10,2) not null check (amount_egp > 0),
  frequency       text not null check (frequency in ('monthly','quarterly','yearly')),
  day_of_period   int not null check (day_of_period between 1 and 28),  -- monthly: day 1-28
  month_of_year   int check (month_of_year between 1 and 12),           -- yearly only: which month
  description     text,
  active          boolean not null default true,
  next_run_date   date not null,
  last_run_date   date,
  created_by      uuid not null references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_boat_rental_recurring_due
  on public.boat_rental_recurring_expense_templates (next_run_date) where active = true;
```

`day_of_period` capped at 28 to avoid month-end edge cases (Feb 30 etc.) — owner who needs "last day of month" can pick day 28 in MVP. `month_of_year` is only used when `frequency='yearly'`.

#### `boat_rental_owner_settings`
```sql
create table public.boat_rental_owner_settings (
  owner_id                  uuid primary key references public.boat_rental_owners(id) on delete cascade,
  default_fuel_price_per_l  numeric(8,2),
  preferred_marina_vendor   text,
  notification_lang         text not null default 'en' check (notification_lang in ('en','ar')),
  reminder_24h_lang         text not null default 'ar' check (reminder_24h_lang in ('en','ar')),
  whatsapp                  text,                          -- override owner.whatsapp for notifications if set
  prefs_json                jsonb not null default '{}'::jsonb,  -- forward-compat
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
```

One row per owner, auto-created on first settings save.

### 4.2 Modifications to existing tables

#### `boat_rental_payments` — drop UNIQUE, become a ledger
```sql
alter table public.boat_rental_payments drop constraint boat_rental_payments_reservation_id_key;
create index if not exists idx_boat_rental_payments_reservation
  on public.boat_rental_payments (reservation_id, paid_at desc);
```

#### `boat_rental_reservations` — manual source + 24h reminder + role attribution
```sql
alter table public.boat_rental_reservations
  alter column broker_id drop not null,
  add column source text not null default 'registered_broker'
    check (source in ('registered_broker','external_broker','client_direct')),
  add column external_broker_id uuid references public.boat_rental_external_brokers(id),
  add column created_by_role text check (created_by_role in ('broker','owner','admin')),
  add column reminder_24h_sent_at timestamptz,
  add constraint reservation_source_consistency check (
    (source = 'registered_broker' and broker_id is not null and external_broker_id is null) or
    (source = 'external_broker'   and broker_id is null     and external_broker_id is not null) or
    (source = 'client_direct'     and broker_id is null     and external_broker_id is null)
  );

create index idx_boat_rental_reservations_reminder_due
  on public.boat_rental_reservations (booking_date)
  where reminder_24h_sent_at is null and status in ('confirmed','details_filled');
```

Existing reservations get `source='registered_broker'` (matches their pre-existing `broker_id NOT NULL` state) and `created_by_role='broker'` via backfill in the same migration.

#### `boat_rental_boats` — drop legacy skipper columns (after all readers migrated)
```sql
-- Migration 0072, runs LAST after all UI readers updated
alter table public.boat_rental_boats
  drop column skipper_name,
  drop column skipper_whatsapp;
```

### 4.3 Storage

Reuse existing `boat-rental` bucket:
- `expense-receipts/{expense_id}/{uuid}.{jpg|png|webp|pdf}`

### 4.4 Audit log additions

New action values for `boat_rental_audit_log.action`:
- `manual_reservation_create`
- `expense_create`
- `expense_payment`
- `expense_cancel`
- `recurring_expense_generate`
- `trip_reminder_24h_sent`
- `skipper_add` / `skipper_set_default` / `skipper_deactivate`

---

## 5. Migrations — order & rollback

Six new files in `supabase/migrations/` (numbering leaves a gap at 0071 to keep the destructive column-drop visually separate as 0072):

| File | Purpose | Risk |
|------|---------|------|
| `0066_boat_skippers_roster.sql` | Create `boat_rental_skippers`, backfill from `boats.skipper_name/whatsapp` (is_default=true, active=true) | Low — additive |
| `0067_boat_external_brokers_and_reservation_source.sql` | Create `boat_rental_external_brokers`, alter reservations (drop NOT NULL on broker_id, add source/external_broker_id/created_by_role/reminder_24h_sent_at + consistency CHECK + reminder partial index), backfill existing rows | Medium — alters live table |
| `0068_boat_payments_ledger.sql` | Drop UNIQUE on `boat_rental_payments`, add new index | Medium — must audit code that assumes single payment |
| `0069_boat_expenses_and_payments.sql` | Create `boat_rental_expenses` + `boat_rental_expense_payments` | Low — additive |
| `0070_boat_recurring_expense_templates.sql` | Create `boat_rental_recurring_expense_templates` + `boat_rental_owner_settings` | Low — additive |
| `0072_drop_legacy_skipper_columns.sql` | DROP `boat_rental_boats.skipper_name`, `skipper_whatsapp` | High — destructive, must run AFTER all UI readers updated |

Each file's header includes a commented `-- DOWN:` block with manual rollback SQL.

**Pre-deploy verification:**
1. Create Supabase branch via `mcp__supabase__create_branch`
2. Apply 0066 → 0072 in order
3. Smoke test: insert a skipper, insert a manual reservation, insert a payment ledger, insert an expense, insert an expense payment, fire one recurring template manually
4. Verify backfill: count of `boat_rental_skippers` rows = count of distinct `boats` with non-null `skipper_name`
5. Merge branch only after smoke test passes

**Audit step before 0068 deploys:** grep all `boat_rental_payments` reads in `src/`. Confirm none assume `.maybeSingle()` returns the only row. Refactor any that do.

**Code-readers-update step before 0072 deploys:** all 13 files identified during exploration that reference `skipper_name` / `skipper_whatsapp` get refactored to read from `boat_rental_skippers WHERE is_default=true` (or pass the chosen skipper for the trip):
- `src/app/api/cron/boat-rental/auto-close-skipper-cash/route.ts`
- `src/app/emails/boat-rental/admin/boats/{actions.ts, page.tsx, [id]/page.tsx}`
- `src/app/emails/boat-rental/admin/{dashboard, setup}/page.tsx`
- `src/app/emails/boat-rental/broker/{actions.ts, availability/page.tsx, payments/page.tsx, trip/[id]/page.tsx}`
- `src/app/emails/boat-rental/owner/booking/[id]/page.tsx`
- `src/app/emails/boat-rental/print/[id]/page.tsx`
- `src/lib/boat-rental/notifications.ts`

---

## 6. UI design

### 6.1 Tab structure

`OWNER_TABS` in `src/app/emails/boat-rental/_components/tabs.tsx` grows from 4 entries to 6:

```
My Boats · Boat Catalogue · Calendar · Reservations · Skippers · Money
```

`mobileTemplate(6)` already supports the layout (3-up rows on mobile). No nav rewrite needed.

### 6.2 Skippers tab — `/emails/boat-rental/owner/skippers`

Lists all skippers grouped by boat. Star icon marks the default. Per row: name, WhatsApp, status (active/inactive), default flag.

Actions:
- **+ Add skipper** modal: pick boat, name, WhatsApp (E.164 validated), optional "set as default" toggle. On save, server action `addSkipperAction` inserts. If `is_default=true`, atomically clears the previous default.
- **Edit** — same modal pre-filled
- **Set as default** — flips this row to default, unsets others for same boat
- **Mark inactive** — soft delete; `active=false`. Inactive skippers don't appear in pickers but still resolve in historical expense rows.
- **Delete** — only allowed if no expenses or trip-level overrides reference this skipper. Otherwise the action button is disabled with tooltip "Cannot delete — has expense history; mark inactive instead."

### 6.3 Manual reservation flow — two entry points

#### Entry A — Calendar context menu (right-click / long-press)

In `src/app/emails/boat-rental/owner/calendar/_components/interactive-grid.tsx`, add right-click handler (desktop) and long-press handler (mobile, ~500ms hold). Shows a context menu at cursor / touch point with two options:

```
[ 📅 Block this date ]
[ 🚤 Reserve this date ]
```

- **Block** opens the existing block-day dialog (no behavior change)
- **Reserve** opens a new reservation modal pre-filled with the date and showing tier/default-price preview

Reservation modal fields:
- Date (read-only, from clicked cell)
- Tier (read-only, auto-resolved)
- Trip price (EGP, prefilled from pricing table, editable — enables price overrides)
- Source (radio: registered broker / external broker / client direct)
- Conditional: broker dropdown (registered) OR external broker dropdown with inline "+ add new" (external) OR nothing (client direct)
- Skipper for this trip (dropdown, defaults to boat's default skipper)
- Special requests (multi-line text, optional)
- [Cancel] [Create]

Submit → `createManualReservationAction(formData)` — see section 7.

#### Entry B — Dedicated page `/emails/boat-rental/owner/reservations/new`

Same field set but full-page layout with breathing room. Reachable from a `[+ Create reservation]` button on the Reservations tab. Same server action.

#### External broker inline-add UX

The dropdown's last option is the literal text `+ Add new broker…`. Selecting it swaps the dropdown for a small inline form:
```
Name:  [ ─────── ]    Phone (optional): [ ─────── ]
                                              [Cancel] [Save]
```
Save → `addExternalBrokerAction(name, phone)` — INSERTs into `boat_rental_external_brokers` (or returns existing row if normalized name matches), re-renders the dropdown with the new entry selected.

### 6.4 Booking detail rebuild — `/emails/boat-rental/owner/booking/[id]`

Existing single-payment `MarkPaidForm` is replaced by a payment ledger UI:

```
Trip price:          EGP 8,000
Total received:      EGP 5,500
Remaining:           EGP 2,500   ← bold

Payments (3)                        [+ Record payment]
  May 10  Bank transfer   EGP 3,000   recorded by you
  May 12  Instapay        EGP 2,000   recorded by you
  May 15  Cash            EGP   500   recorded by you
```

`[+ Record payment]` opens an inline form:
- Date (default today)
- Method (cash / bank_transfer / instapay / card / other)
- Amount (server-validates `total + amount <= price`, rejects with "Would overpay by EGP X")
- Note (optional)
- Submit → if remaining hits 0, server flips status to `paid_to_owner` + enqueues `trip_payment_complete` notification

The existing offline-aware `MarkPaidForm` component is renamed to `RecordPaymentForm` and reworked. The IndexedDB queue + replay endpoint at `/api/boat-rental/owner/mark-paid-replay` are kept; idempotency keys move from per-reservation to per-payment-row UUID.

Trip-related expense rows (Amenities, Part-time Skipper) for this reservation are surfaced in a small subsection below the payment ledger:
```
Trip-related expenses (2)               EGP 1,650 total
  May 18  Amenities (life jackets, snacks)   EGP   850
  May 18  Part-time skipper (Karim Saad)     EGP   800
```
Click to open the expense detail (in the Money tab).

### 6.5 Money tab — separate routes

Sub-nav inside Money tab:
```
Overview (Fleet P&L)  ·  Expenses  ·  Bills  ·  Recurring
```

Each is a separate route — easier deep-linking, sub-navigation done via tab strip at the top of each Money page.

#### `/emails/boat-rental/owner/money` — Overview / Fleet P&L

- Date range filter (default: current month, options: this month / last month / this quarter / this year / custom)
- Summary table: row per boat with Revenue / Expenses / Net / Trips / Open Bills, plus an "All boats" total row
- Bar chart: expenses by category for the selected period (horizontal bars, no JS chart library needed — pure CSS widths from computed totals)
- Click a boat row → drills into per-boat P&L (same layout, single boat scope, with `?boat_id=X` query param)

Computed via a single SQL aggregate query joining payments, expenses, and reservations, scoped to the owner's boats and date range.

#### `/emails/boat-rental/owner/money/expenses` — Expenses ledger

- Filters: boat, category, status (open / paid / cancelled), date range
- Paginated list (50 per page), most recent first
- Each row: date, boat, category, amount, status badge, receipt indicator, description preview
- Trip-related rows show their linked reservation as a subtitle link
- Click a row → expense detail page (`/owner/money/expenses/[id]`) with:
  - Header showing all category-specific fields
  - Payment ledger (mirroring trip payment ledger)
  - [+ Record payment] button (same form as bills)
  - Edit / Cancel actions
- `[+ New expense]` button opens the universal create form (section 6.7)

#### `/emails/boat-rental/owner/money/bills` — Open payables

Filtered subset of expenses where `status='open'`. Sorted by oldest first with overdue highlighting (>7 days since `expense_date`).

```
Open bills (3)                        Total owing: EGP 7,500
─────────────────────────────────────────────────────────────
May 15  Lime Cruiser   Marina docking   EGP 5,000   [Pay now]
May 10  Lime Bayliner  Insurance        EGP 1,500   [Pay now]
Apr 28  Lime Cruiser   Repair           EGP 1,000   [Pay now]   ⚠ 4 days old
```

`[Pay now]` opens an inline payment form (date / method / amount / note). Partial allowed. Auto-flip to `paid` when sum hits expense amount. Row disappears from this list once paid.

#### `/emails/boat-rental/owner/money/recurring` — Recurring templates manager

- List of active and paused templates
- `[+ New template]` form: boat, category, vendor name, amount, frequency, day_of_period, (month_of_year if yearly), description
- Per row: Edit / Pause / Delete (delete only if no generated expenses reference it; otherwise Pause)
- Showing: Next run date, last run date, status

### 6.6 Owner Settings — `/emails/boat-rental/owner/settings`

Reachable from a gear icon in the owner page header. Single-page form:

- Default fuel price/liter (EGP) — prefills new fuel expenses
- Preferred Marina vendor name — prefills marina docking expense + recurring template
- Notification language preference (EN / AR) — overrides per-template default
- 24h trip reminder language (EN / AR) — defaults to AR per Q7
- WhatsApp number for notifications (overrides `boat_rental_owners.whatsapp` if set)
- Save → upserts `boat_rental_owner_settings`

### 6.7 Universal expense create form

Modal/page (depending on context) with category-conditional fields:

| Category | Required extra fields |
|----------|----------------------|
| Amenities | Trip-link (reservation dropdown), description |
| Part-time skipper | Trip-link, **Skipper picker** (boat's roster, excluding default) |
| Marina docking | Vendor name (optional, prefills from settings) |
| Fuel | Liters + price/liter (prefills from settings) → Subtotal computed live → Tips → Total computed live |
| Repair | Description (required) |
| Insurance / License / Maintenance contract | Vendor name (optional), description |
| Full-time skipper salary | Skipper picker, period covered (free text) |
| Other | Free-text type field, description |

Common fields (always visible): Boat, Category, Date, Amount, Receipt photo upload, Payment status toggle (Pay now [+ method picker] / Pay later).

**"Pay now" semantics:** when toggled on, the form creates the expense AND a single expense_payment row covering the **full amount** of the expense, with `paid_date = expense_date` and the picked method. There is no partial-amount entry on the create form. If the owner needs to record a partial payment at create time, they should leave "Pay now" off (creating an Open bill) and then record the partial via the expense detail page's payment ledger. This keeps the create form simple and consistent.

Submit → `createExpenseAction(formData)`:
- INSERT expense (status defaults to `open`)
- If "Pay now" selected: INSERT one expense_payment row for the full amount in the same DB transaction, then UPDATE expense.status = `paid`
- Otherwise: leave expense.status = `open`
- If receipt photo uploaded: store in `expense-receipts/{expense_id}/{uuid}.{ext}`, set `receipt_path`
- Audit log entry: `expense_create` (and `expense_payment` if pay-now)

### 6.8 Calendar reservation color update

Manual reservations created by owners share the existing `confirmed` (blue) color — same lifecycle status. The `source` shows in the booking detail header. No new calendar color introduced.

---

## 7. Server actions

New server actions in `src/app/emails/boat-rental/owner/actions.ts`:

| Action | Inputs | Validation |
|--------|--------|------------|
| `addSkipperAction` | boat_id, name, whatsapp, is_default | Owner owns boat; whatsapp E.164; default-uniqueness atomic |
| `editSkipperAction` | id, fields | Owner owns the skipper's boat |
| `setDefaultSkipperAction` | id | Atomically unset previous default |
| `deactivateSkipperAction` | id | If has dependents: just deactivate; if not: allow delete |
| `createManualReservationAction` | boat_id, date, price, source, broker_id?, external_broker_id?, skipper_id?, notes | Owner owns boat; date not in past; date not already booked or owner-blocked; source/broker fields consistent |
| `addExternalBrokerAction` | name, phone? | Returns existing if normalized name matches |
| `recordTripPaymentAction` | reservation_id, amount, method, paid_date, note? | Owner owns reservation's boat; reservation in (`confirmed`, `details_filled`); amount > 0; total + amount <= price |
| `createExpenseAction` | full expense form data + pay_now toggle | Per-category required fields; if pay_now, also creates expense_payment in same tx |
| `recordExpensePaymentAction` | expense_id, amount, method, paid_date, note? | Owner owns expense's boat; expense.status = 'open'; total + amount <= expense.amount |
| `editExpenseAction` | id, fields | Owner owns expense; expense.status != 'cancelled' |
| `cancelExpenseAction` | id, reason | Owner owns expense; sets status = 'cancelled' |
| `createRecurringTemplateAction` | boat_id, category, amount, frequency, day_of_period, month_of_year?, vendor?, description? | Computes initial `next_run_date` |
| `editRecurringTemplateAction` | id, fields | Recomputes `next_run_date` if frequency/day changed |
| `pauseRecurringTemplateAction` | id | Sets active = false |
| `saveOwnerSettingsAction` | settings fields | Upsert by owner_id |

All actions follow the existing pattern: `requireBoatRoleOrThrow('owner')`, then explicit owner-scope checks, then logAudit, then revalidatePath.

### Helper: `computeNextRunDate(frequency, day_of_period, month_of_year, last_run_date)`

Pure function in `src/lib/boat-rental/recurring.ts`:
- monthly → next month at `day_of_period`
- quarterly → next quarter at `day_of_period` of first month of quarter
- yearly → next year at `month_of_year` + `day_of_period`

Cap day_of_period at 28 in the input form prevents Feb-end edge cases.

### Helper: `paymentBalance(reservationId | expenseId)`

Returns `{ total_paid, remaining, is_complete }` for both trip and expense payment ledgers. Used by UI and by auto-close logic.

---

## 8. Notifications

### 8.1 New template_keys

| Key | Trigger | Recipients | Default Lang |
|-----|---------|------------|--------------|
| `manual_reservation_created` | Owner creates manual reservation | Default skipper of boat | EN |
| `trip_payment_complete` | Trip auto-flips to `paid_to_owner` | Owner + registered broker (if `source='registered_broker'`) | EN |
| `recurring_expense_generated` | Cron auto-generates a bill | Owner | EN |
| `trip_reminder_24h` | T-24h cron fires | Owner + default skipper | **AR** |

Owner can override default lang via Owner Settings.

### 8.2 Template bodies (rendered into `rendered_body` at enqueue time)

`trip_reminder_24h` (AR):
```
🚤 تذكير: رحلة غدًا

القارب: {boat_name}
التاريخ: {booking_date}
وقت الانطلاق: {trip_ready_time}
الوجهة: {destination_name}
العميل: {client_name} ({guest_count} ضيف)
الكابتن: {skipper_name}
{notes_if_present}
```

`manual_reservation_created` (EN, to skipper):
```
Hi {skipper_name}, you're booked for a trip on {booking_date} on {boat_name}.
Owner ({owner_name}) will share trip details closer to the date.
```

`recurring_expense_generated` (EN, to owner):
```
🧾 New bill generated: {vendor_name} — {category_label}
Amount: EGP {amount}
Boat: {boat_name}
Open in app to record payment: {short_url}
```

`trip_payment_complete` (EN, to owner):
```
✅ Trip {short_ref} fully paid.
Boat: {boat_name} · {booking_date}
Total received: EGP {amount} ({n} payment{s})
```

### 8.3 Existing infrastructure reuse

All notifications go through `boat_rental_notifications` table + `enqueueNotification()` in `src/lib/boat-rental/notifications.ts` + the existing Green-API outbox flusher. **No new outbox infrastructure.** Just new template_keys and template bodies.

---

## 9. Cron jobs

Two new handlers, registered in `vercel.json`:

```json
{ "path": "/api/cron/boat-rental/generate-recurring-expenses", "schedule": "0 6 * * *" },
{ "path": "/api/cron/boat-rental/trip-reminders-24h",          "schedule": "0 * * * *" }
```

Both gated by `Authorization: Bearer $CRON_SECRET` header check (existing pattern).

### 9.1 `generate-recurring-expenses` (daily 06:00 UTC)

```
SELECT * FROM boat_rental_recurring_expense_templates
WHERE active = true AND next_run_date <= CURRENT_DATE;

For each template:
  -- idempotency check
  IF EXISTS (SELECT 1 FROM boat_rental_expenses
             WHERE recurring_template_id = template.id
               AND expense_date = CURRENT_DATE)
    skip
  ELSE
    INSERT into boat_rental_expenses (
      boat_id, owner_id, category, expense_date,
      amount_egp, vendor_name, description,
      recurring_template_id, status='open',
      created_by=template.created_by
    )
    UPDATE template SET
      last_run_date = CURRENT_DATE,
      next_run_date = computeNextRunDate(...)
    enqueueNotification(owner, 'recurring_expense_generated', { vendor, amount, boat })
    logAudit('recurring_expense_generate', payload={template_id, expense_id})
```

### 9.2 `trip-reminders-24h` (hourly, top of each hour)

```
SELECT r.*, b.id boat_id, b.name boat_name, ...
FROM boat_rental_reservations r
JOIN boat_rental_boats b ON b.id = r.boat_id
WHERE r.status IN ('confirmed','details_filled')
  AND r.reminder_24h_sent_at IS NULL
  AND r.booking_date = (cairoToday() + INTERVAL '1 day');

For each reservation:
  fetch default skipper (boat_rental_skippers WHERE boat_id=X AND is_default=true)
  fetch owner + owner_settings (for override whatsapp + lang)
  fetch destination + booking trip details
  enqueueNotification(owner.whatsapp, 'trip_reminder_24h', AR/EN per setting, ...)
  enqueueNotification(skipper.whatsapp, 'trip_reminder_24h', AR, ...)
  UPDATE reservation SET reminder_24h_sent_at = now()
  logAudit('trip_reminder_24h_sent', payload={reservation_id})
```

Hourly cadence means reminder fires within 1 hour of the T-24h boundary. Idempotent via `reminder_24h_sent_at` column.

---

## 10. Testing strategy

### 10.1 Unit tests (`vitest`)

Bring in `vitest` as a dev dependency for pure-function tests in `src/lib/boat-rental/`:

| Module | Tests |
|--------|-------|
| `recurring.ts` | `computeNextRunDate` for monthly/quarterly/yearly; edge cases (day 28 in Feb non-leap, Dec → Jan rollover, year rollover) |
| `payment-balance.ts` | Trip + expense balance math; overpayment detection |
| `pricing.ts` (existing) | Add tests for the new manual-reservation tier resolution path if it differs |

UI gets manual QA only. Integration tests deferred (the project doesn't have a test harness today).

### 10.2 Manual QA checklist (post-deploy)

1. **Skippers tab:** add → edit → set default → mark inactive → delete (when unused)
2. **Manual reservation via calendar context menu:** right-click empty future day → Reserve → modal → submit → calendar refreshes, day flips blue
3. **Manual reservation via dedicated page:** `/owner/reservations/new` → form → submit → redirects to booking detail
4. **External broker inline-add:** dropdown → "+ Add new" → form → save → re-renders selected
5. **Trip payment ledger:** record 3 partial payments → 4th would overpay → server rejects with explicit message → record exact remaining → status auto-flips to `paid_to_owner` → WhatsApp arrives
6. **Trip payment offline:** disable network → record payment → toast says "saved offline" → re-enable → IndexedDB queue replays → server accepts
7. **Expense create (pay-now):** new expense → pay-now toggle on → submit → expense appears with status=`paid`, 1 payment row created
8. **Expense create (pay-later):** new expense → pay-now off → submit → expense appears with status=`open`, 0 payments
9. **Bills page:** open bills shown, [Pay now] inline form works, partial allowed, full payment auto-closes
10. **Recurring template:** create monthly Marina template → force-trigger cron with `?force=1` → expense generated → owner gets WhatsApp
11. **24h reminder:** create reservation for ~25h from now → wait or force-trigger cron → owner + default skipper receive Arabic WhatsApp
12. **Money tab navigation:** all 4 sub-routes load, Fleet P&L numbers reconcile to expenses/payments
13. **Owner Settings:** save defaults → create new fuel expense → liters/price prefilled
14. **Admin role:** admin login still sees all owner data (skippers, expenses, payables) — per C1
15. **Mobile:** all new tabs + long-press calendar context menu work on iPhone PWA
16. **Receipt upload:** upload jpg → expense detail shows thumbnail → click opens signed URL
17. **Skipper deletion guard:** add a fake expense referencing a skipper → try delete → action disabled with tooltip → mark inactive instead works

### 10.3 Force-trigger crons

Both new crons accept `?force=1` query param to bypass time-of-day gates (matching existing pattern from `/api/cron/daily/route.ts`). For testing, hit them with valid `Authorization: Bearer $CRON_SECRET` header + `?force=1`.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Massive QA surface for single-shot release | Pre-deploy: full QA checklist on Supabase branch before merge to main |
| Existing single-payment code paths break when UNIQUE drops | Pre-0068: grep all `boat_rental_payments` reads, audit assumptions |
| Existing `MarkPaidForm` offline queue breaks with multi-payment | Refactor idempotency-key from per-reservation to per-payment-row UUID; keep existing IndexedDB schema, add a column for payment-row UUID |
| 24h reminder uses CURRENT default skipper at notification time, not at-reservation-creation time | Acceptable — owner can override skipper at trip-detail-fill time; documented in spec |
| Recurring template fires for inactive/deleted boat | Cron query joins `boats` and skips inactive ones |
| External broker name "Hisham " (trailing space) duplicates "Hisham" | Unique constraint on `(owner_id, lower(trim(name)))` prevents this |
| Arabic reminder template misrenders for Latin boat names | Templates concatenate Arabic boilerplate + raw values; Green-API handles UTF-8; tested manually in QA |
| Migration 0072 (drop columns) runs but a code path still references the dropped column | Pre-0072 deploy: confirm grep for `skipper_name|skipper_whatsapp` returns zero matches in `src/`. If found, refactor first. |
| Daily cron generates a bill for a paused template | Cron's WHERE clause includes `active = true` |
| Owner sees expenses across boats they don't own (cross-tenancy bug) | Every server action checks `getOwnedOwnerIds(me)` and filters by it |
| Receipt upload to Storage but DB insert fails | Use Supabase Storage's signed-upload pattern; on DB failure, attempt cleanup of orphan storage objects (best-effort) |
| Performance: Money tab Fleet P&L query slow with many expenses | Initial query is owner-scoped (small set); add covering indexes; profile if dataset grows |

---

## 12. Done criteria

The release is **done** when:

1. All 6 migrations (0066, 0067, 0068, 0069, 0070, 0072) applied to production Supabase
2. All UI screens deployed and reachable at the documented routes
3. 17-item QA checklist (section 10.2) passes
4. Both new crons fire successfully on first natural trigger (not just `?force=1`)
5. `boat_rental_boats.skipper_name/whatsapp` columns dropped — confirm `\d boat_rental_boats` in psql shows them gone
6. Existing broker + admin flows still work (no regression)
7. Auto-deploy convention followed: feature branch merged to `main` → `vercel --prod`
8. `SESSION_HANDOFF.md` updated with shipped state

---

## 13. Out of scope / future work

- Per-skipper P&L (we have the data; UI is later)
- Skipper payroll tracking distinct from per-trip fees
- Multi-currency
- Full vendor/supplier directory beyond free-text vendor name
- Bank reconciliation
- OCR / AI auto-categorization on receipts
- Editable past P&L periods (period close)
- Ability for admin to see other owners' financial data via a tenant-switcher (admin sees per their existing access pattern)
- Email notifications (channel column in notifications table supports it but flush logic is WhatsApp-only)
- Recurring templates with day_of_period > 28 (e.g., "last day of month")

---

## 14. Implementation phasing within the single PR

Although the user chose single-shot release, the work order WITHIN the PR is:

1. Schema migrations 0066, 0067, 0069, 0070 (additive, low-risk)
2. Skippers tab + actions
3. Audit + refactor all `boat_rental_payments` readers (prep for 0068)
4. Migration 0068 + payment-ledger UI
5. Manual reservation flow (calendar context menu + dedicated page + actions)
6. Expense domain (create form, list, detail, payment ledger)
7. Recurring template manager + cron handler
8. 24h reminder cron
9. Money tab routes (overview, expenses, bills, recurring)
10. Owner Settings page
11. Refactor all `skipper_name/whatsapp` readers to use `boat_rental_skippers`
12. Migration 0072 (drop legacy columns)
13. Vitest setup + unit tests
14. QA on Supabase branch
15. Merge to main → `vercel --prod`

---

## 15. References

- Existing schema: `supabase/migrations/0016_boat_rental.sql`, `0018_owner_blocks_and_cancellation_requests.sql`, `0019_skipper_cash_collection.sql`
- Existing owner UI: `src/app/emails/boat-rental/owner/`
- Existing notification helpers: `src/lib/boat-rental/notifications.ts`
- Existing pricing/TZ helpers: `src/lib/boat-rental/pricing.ts`
- Tab nav: `src/app/emails/boat-rental/_components/tabs.tsx`
