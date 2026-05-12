# BH Financials — Beginning Balances & Snapshot Module · Spec

**Status:** Draft, awaiting user review
**Date:** 2026-05-12
**Owner:** kareem
**Related:** `src/lib/beithady-opening-balance-2026.ts` (to be removed), `src/lib/financials-pnl.ts` (to be edited), `src/app/beithady/financials/page.tsx` (to be refactored)

---

## 1. Goal

Build a Beithady financials module that:

1. Persists **dated opening-balance snapshots** in the database — both account-level and per-partner — so the balance sheet, payables, and partner ledgers no longer depend on Odoo's 365-day move-line retention window.
2. Imports partner-level ledger xlsx files (Suppliers, Owners, and 6 more accounts) into those snapshots, with operator review of fuzzy partner matches and explicit handling of reconciliation variances between partner totals and account totals.
3. Re-freezes a new snapshot every quarter on a 6-month lag (Q4-2025 due by 30-Jun-2026; Q1-2026 due by 30-Sep-2026; etc.), with a Sunday Cairo-9-AM cron reminder, manual operator confirmation, and versioned re-freezes for audit.
4. Surfaces an audit-grade Reconciliation view that shows account ↔ ledger ↔ Odoo move-lines variance per snapshot, per account, with drill-down and trend over time.

The first snapshot to be created is **31-Dec-2025 · consolidated · v1**, seeded from the existing TS const `BEITHADY_OPENING_BALANCES_2026` plus the two partner-ledger xlsx files in `Lime Domains/Beithady/FINANCIALS/` (Suppliers — 85 partners, total −8,567,422.64 EGP; Owners — 6 partners, total −2,518,213.03 EGP).

## 2. Locked decisions (clarifying questions answered)

| # | Question | Answer |
|---|---|---|
| Q1 | Snapshot cadence | **C** — quarterly snapshot, 6-month lag. Period-end Q is due by Q + 6 months. Early-freeze allowed any time books are closed. |
| Q2 | Reconciliation-gap policy | **A** — synthetic `__UNALLOCATED_<code>` partner row per affected account. Variance must be auditable via a dedicated Reconciliation view (hard requirement). |
| Q3 | Owners on consolidated | All 6 owners (incl. A1 HOSPITALITY) treated as **external** — no intercompany elimination for owners. Shown on consolidated AND per-company under an "Owner Payables" group, distinct from Suppliers. A1 removed from `getIntercompanyPartnerIds()` exclude set. |
| Q4 | Partner-seed scope | **Everything** — module supports partner-level seeds for all 6+ partner-tracked balance-sheet accounts. Today's import covers Suppliers + Owners; an Import Queue tile surfaces the 6 still-missing ledgers. |
| Q5 | Module placement | **Hybrid (C)** — promote `/beithady/financials/` to a cockpit with tiles. Extract existing PnL/BS/Payables into focused subpages; add Ledgers / Snapshots / Reconciliation / Import as new subpages. |
| Q6 | Snapshot trigger | **B + (i)** — Sunday 09:00 Cairo cron reminder (banner + WhatsApp + morning-brief) + manual "Freeze Snapshot" confirmation; re-freezes are **versioned** (old marked `superseded`, full audit trail preserved). |

**Architecture approach chosen:** **A** — versioned snapshots persisted in DB + on-the-fly current-balance compute (no materialized rollup, no SQL views). Mirrors the existing `buildBalanceSheet` "seed + Odoo deltas" pattern at the partner level.

## 3. Data model (4 tables · migration `0117_bh_financials_balance_snapshots.sql`)

### 3.1 `bh_balance_snapshots` (header)

One row per snapshot version for a given period-end + company-scope.

```
id                uuid pk
period_end        date          -- e.g. 2025-12-31
company_scope     text          -- 'consolidated' | 'egypt' | 'dubai' | 'a1'
version           int           -- 1, 2, 3… (incremented on re-freeze)
status            text          -- 'draft' | 'frozen' | 'superseded'
frozen_at         timestamptz nullable
frozen_by         uuid nullable -- fk → account_users.id
source_kind       text          -- 'xlsx_import' | 'odoo_snapshot' | 'manual_edit'
notes             text nullable
created_at        timestamptz default now()
updated_at        timestamptz default now()

UNIQUE (period_end, company_scope, version)
PARTIAL UNIQUE (period_end, company_scope) WHERE status = 'frozen'
INDEX (status), (period_end DESC)
```

**Invariant:** at most one row per (`period_end`, `company_scope`) has `status = 'frozen'` at a time. Re-freeze swaps `superseded`/`frozen` atomically in a single transaction.

### 3.2 `bh_balance_snapshot_accounts` (account-level)

Replaces the TS const `BEITHADY_OPENING_BALANCES_2026`. ~75–100 rows per snapshot.

```
id                       uuid pk
snapshot_id              uuid fk → bh_balance_snapshots (ON DELETE CASCADE)
account_code             text   -- e.g. '227002'
account_name             text
account_type             text   -- Odoo type ('liability_payable', 'asset_cash', …)
account_type_override    text nullable  -- for consolidated-view reclass (e.g. '222008' → 'liability_non_current')
opening_raw              numeric(18,2)   -- Odoo sign (debit − credit)
partner_total            numeric(18,2) nullable  -- cached sum of related partner rows
variance                 numeric(18,2) GENERATED ALWAYS AS (opening_raw - COALESCE(partner_total, opening_raw)) STORED
variance_status          text default 'open'  -- 'open' | 'investigating' | 'accepted' | 'resolved'
variance_notes           text nullable
created_at               timestamptz default now()
updated_at               timestamptz default now()

UNIQUE (snapshot_id, account_code, account_name)
INDEX (snapshot_id), (variance) WHERE variance != 0
```

### 3.3 `bh_balance_snapshot_partners` (partner-level)

Per-partner balances inside a snapshot. The new capability.

```
id                       uuid pk
snapshot_id              uuid fk → bh_balance_snapshots (ON DELETE CASCADE)
account_code             text
partner_kind             text   -- 'supplier' | 'owner' | 'customer' | 'employee' | 'landlord' | 'noteholder' | 'unallocated'
partner_id               int nullable  -- fk → odoo_partners.id (null = synthetic OR unmatched)
partner_name_raw         text   -- exact name from xlsx, preserved for audit
partner_name_normalized  text   -- lower, trim, strip leading numeric prefix
opening_balance          numeric(18,2)
currency                 text default 'EGP'  -- v1 is EGP-only; column reserved for multi-currency
is_synthetic             bool default false  -- true for __UNALLOCATED_<code>
match_confidence         text   -- 'exact' | 'fuzzy' | 'unmatched' | 'synthetic'
match_score              numeric(4,3) nullable  -- 0..1 for fuzzy matches
match_warnings           text[] default '{}'
created_at               timestamptz default now()
updated_at               timestamptz default now()

UNIQUE (snapshot_id, account_code, partner_name_raw)
INDEX (snapshot_id, partner_kind)
INDEX (partner_id) WHERE partner_id IS NOT NULL
```

### 3.4 `bh_balance_snapshot_uploads` (xlsx audit)

One row per uploaded file. Modeled after `personal_stock_uploads`.

```
id                  uuid pk
snapshot_id         uuid fk → bh_balance_snapshots nullable
account_code        text   -- operator-tagged target account
period_end          date   -- operator-tagged target period
company_scope       text   -- operator-tagged target scope
filename            text
file_sha256         text UNIQUE  -- dedup guard
storage_path        text   -- Supabase storage key
uploaded_at         timestamptz default now()
uploaded_by         uuid nullable
raw_row_count       int nullable
parsed_partner_count int nullable
parse_status        text default 'pending'  -- 'pending' | 'parsed' | 'committed' | 'failed' | 'rejected'
parse_errors        jsonb default '[]'
raw_rows            jsonb nullable  -- full parsed rows pre-classification (for reprocess)
classified_rows     jsonb nullable  -- post-match rows with partner_id assignments

INDEX (snapshot_id), (parse_status)
```

### 3.5 `bh_financials_reminders` (cron-banner state)

One row per overdue quarter that the cron has flagged. Read by the cockpit banner.

```
id                  uuid pk
period_end          date          -- the quarter that needs freezing
company_scope       text          -- 'consolidated' | 'egypt' | 'dubai' | 'a1'
first_seen_at       timestamptz default now()
last_seen_at        timestamptz default now()
dismissed_until     timestamptz nullable  -- "Dismiss for 7 days"
resolved_at         timestamptz nullable  -- set when matching snapshot freezes
notification_sent_at jsonb default '{}'   -- {whatsapp: ts, morning_brief: ts}

UNIQUE (period_end, company_scope)
INDEX (resolved_at) WHERE resolved_at IS NULL
```

### 3.6 Migration plan

`0117_bh_financials_balance_snapshots.sql` is forward-only and:

1. Creates the 4 tables + indexes + constraints above.
2. Seeds `bh_balance_snapshots` with one row: `(period_end=2025-12-31, company_scope='consolidated', version=1, status='frozen', frozen_at=now(), source_kind='xlsx_import')`.
3. Seeds `bh_balance_snapshot_accounts` with the ~75 rows from `BEITHADY_OPENING_BALANCES_2026` (account_code · account_name · account_type · opening_raw all preserved bit-for-bit). The `account_type_override` values from `ACCOUNT_TYPE_OVERRIDES` are seeded into that column.
4. Leaves `bh_balance_snapshot_partners` empty — populated by the Suppliers + Owners imports done immediately after migration.

The migration is verified by a vitest integration test that asserts the seeded rows match the TS const to the cent.

## 4. Routes & UI

### 4.1 Route map

| Route | Status | Purpose |
|---|---|---|
| `/beithady/financials/` | **refactor** | Cockpit landing — 3 status cards + 7 tiles |
| `/beithady/financials/performance/` | **new, extracted** | PnL (lift & shift from current page) |
| `/beithady/financials/balance-sheet/` | **new, extracted** | BS (lift & shift; reads opening from DB) |
| `/beithady/financials/payables/` | **new, extracted** | Aging report (lift & shift; A1 included on consolidated) |
| `/beithady/financials/ledgers/` | **NEW** | Partner-level current balance (kind sub-tabs) |
| `/beithady/financials/snapshots/` | **NEW** | List snapshots; freeze; re-freeze |
| `/beithady/financials/snapshots/[id]` | **NEW** | One snapshot's account + partner detail |
| `/beithady/financials/reconciliation/` | **NEW** | Variance audit (hard req from Q2) |
| `/beithady/financials/import/` | **NEW** | xlsx upload; Import Queue showing missing ledgers |
| `/beithady/financials/import/[upload_id]` | **NEW** | Review parsed rows before commit |

The legacy `/beithady/financial/` (singular stub, 56 lines) is deleted and a redirect added in `next.config.ts`.

### 4.2 Cockpit landing

Three status cards at the top:

1. **Active snapshot** — period_end + version + scope + frozen_at.
2. **Open variance** — sum of account-level open variances; click → Reconciliation page.
3. **Next snapshot due** — first quarter-end whose +6mo deadline is closest, with "freeze window opens" date.

Seven tiles below, each linking to a subpage. The Reconciliation tile shows a 🔴 badge when any account has `variance_status = 'open'` and variance ≠ 0.

### 4.3 Ledgers subpage

URL: `/beithady/financials/ledgers/?kind=supplier&asof=today&scope=consolidated`.

Kind sub-tab strip across the top (Suppliers · Owners · Customers · Landlords · Employees · Noteholders). Filters: as-of date, company scope, snapshot base (defaults to latest frozen for the scope). Table columns: **Partner · Opening · Deltas YTD · Current bal · Last move**. The synthetic `__UNALLOCATED_<code>` row is rendered with a red dot and a tooltip explaining it.

Sum row at the bottom asserts equality with the account-level Balance Sheet number; mismatch shows a 🔴 banner linking to Reconciliation.

### 4.4 Snapshots subpage

List all snapshots grouped by `period_end` (newest first), each with its versions. Actions: **Open draft** (continue working on a non-frozen snapshot) · **Freeze snapshot** (commit a draft) · **Re-freeze with corrections** (clone the current frozen rows into a new draft) · **View detail**.

### 4.5 Reconciliation subpage

Variance table (one row per account on the active snapshot) with columns: **Code · Account name · Account total · Partner total · Variance · Status**. Drill-down on click shows source-by-source breakdown and resolution actions: **Assign variance to a partner** · **Add resolution note** · **Mark accepted** · **Investigate**.

A second tab **Trend** shows per-account variance across all snapshots in chronological order, so an operator can see whether a recurring variance is shrinking quarter-over-quarter.

### 4.6 Import subpage

Upload UI (drag-drop xlsx) on the left. Operator tags **account_code**, **period_end**, and **company_scope** before parse. SHA-256 hash rejects duplicate uploads.

Right side shows the **Import Queue**: tiles for each partner-tracked account that does NOT yet have partner-level rows in the latest frozen snapshot. As of today, 6 tiles: Customers (122001) · Contract Insurance Guarantee (113002) · Loans for employees (124005) · Salaries in advance (124006) · Accrued Salaries (223001) · Notes Payable holders (221001).

Clicking through to `/import/[upload_id]` shows the review screen (Section 5 of the brainstorm visuals): per-row match badges, inline partner override, "+ Create odoo_partner" shortcut, prominent variance banner, **Approve variance & commit** action.

## 5. Import pipeline

Five stages:

1. **Upload** — file hashed, stored in Supabase storage, row created in `bh_balance_snapshot_uploads` with `parse_status = 'pending'`.
2. **Parse** — `xlsx-import.ts` reads with `exceljs`, extracts `(partner_name_raw, balance)` rows, skips header rows, persists `raw_rows` jsonb, sets `parse_status = 'parsed'`.
3. **Classify + match** — normalizes names (lower, trim, strip leading numeric prefix like `"020. "`), fuzzy-matches against `odoo_partners.name` using token-set ratio + Levenshtein, tags rows as `exact` / `fuzzy` (with score) / `unmatched`. Computes `partner_total` and `variance` against the account-level seed.
4. **Review** — operator validates on `/import/[upload_id]`. Can override partner_id, create new `odoo_partners` rows, edit balances if necessary. Variance is shown prominently.
5. **Commit** — atomic transaction: upserts into `bh_balance_snapshot_partners` (FK → target snapshot, which can be `draft` or already `frozen`); if variance ≠ 0, inserts synthetic `__UNALLOCATED_<code>` row; updates `bh_balance_snapshot_accounts.partner_total`; sets `parse_status = 'committed'`. `raw_rows` preserved for reprocess.

Reprocessing an upload (operator finds a parse bug): the row is cloned, edited, re-committed. Old committed partner rows are replaced atomically.

## 6. Snapshot lifecycle

### 6.1 Cadence math

A snapshot for `period_end` P is **due by** P + 6 calendar months.

| Period | period_end | Due by | Status today (2026-05-12) |
|---|---|---|---|
| Q4-2025 | 2025-12-31 | 2026-06-30 | Frozen early today |
| Q1-2026 | 2026-03-31 | 2026-09-30 | Queued |
| Q2-2026 | 2026-06-30 | 2026-12-31 | Queued |
| Q3-2026 | 2026-09-30 | 2027-03-31 | Queued |
| Q4-2026 | 2026-12-31 | 2027-06-30 | Queued |

```
nextSnapshotDue(scope, now):
  for each quarter Q whose period_end ≤ now:
    if Q + 6mo ≤ now AND no frozen snapshot for (Q, scope):
      return Q  -- overdue
  return first quarter Q whose period_end ≤ now AND no frozen snapshot
```

Pure date math in `cadence.ts`; no DB access.

### 6.2 State machine

```
[no snapshot] → status='draft'  (operator clicks "Begin draft")
status='draft' → status='frozen' (operator clicks "Freeze snapshot")
status='frozen' + re-freeze → status='superseded' (old) + status='frozen' (new, version=v+1)
```

DB-level invariant via partial unique index: at most one `frozen` row per (`period_end`, `company_scope`).

**What requires a version bump vs. an in-place edit:**

| Change | Version bump? | Reason |
|---|---|---|
| Add partner-ledger rows to an account that had none | **No** | Partner rows are additive; account-level numbers don't change. `partner_total` and `variance` re-compute. |
| Re-assign an `__UNALLOCATED_<code>` chunk to a real partner | **No** | Total per account unchanged. |
| Fix a parse-bug in an upload and re-import | **No** | Same source, corrected data. |
| Account-level `opening_raw` value changes (back-dated journal in Odoo) | **Yes** | This changes the balance sheet. Must re-freeze with version+1. |
| Re-classify `account_type_override` for an account | **Yes** | Changes BS grouping. |

Every in-place edit (no-bump) writes to `audit_log` with action `bh_snapshot_partner_edit` so the audit trail is preserved even without a version increment.

### 6.3 Freeze action

`POST /beithady/financials/snapshots/[id]/freeze` (server action):

1. Validate draft has account-level rows.
2. For each affected account where `partner_total ≠ opening_raw`, ensure a synthetic `__UNALLOCATED_<code>` row exists with the delta.
3. In a transaction:
   - `UPDATE bh_balance_snapshots SET status='superseded' WHERE period_end=$p AND company_scope=$s AND status='frozen'`
   - `UPDATE bh_balance_snapshots SET status='frozen', frozen_at=now(), frozen_by=$user, version=$nextVersion WHERE id=$draft_id`
4. Invalidate Next.js cache for `/beithady/financials/*`.
5. Write to existing `audit_log` table with `action='bh_snapshot_freeze'` and payload `{snapshot_id, period_end, scope, version}`.

### 6.4 Cron reminder

Handler: `src/app/api/cron/bh-financials-snapshot-reminder/route.ts`.

Schedule (DST-safe pair in `vercel.json`):
```json
{ "path": "/api/cron/bh-financials-snapshot-reminder", "schedule": "0 6 * * 0" },
{ "path": "/api/cron/bh-financials-snapshot-reminder", "schedule": "0 7 * * 0" }
```

Handler gates on Cairo local hour == 9 and `Authorization: Bearer $CRON_SECRET`. Logic:

1. Compute `nextSnapshotDue('consolidated', now)`.
2. If the due quarter is overdue (period_end + 6mo ≤ today) AND no frozen snapshot exists, insert (or refresh) a reminder row in `bh_financials_reminders` (idempotent per quarter).
3. Send WhatsApp via Green-API to kareem.
4. Add a line to the morning-brief payload.
5. `?force=1` bypasses the 9-AM gate for manual testing.

A cockpit banner reads from `bh_financials_reminders` and shows a 🔴 alert with **Start draft** and **Dismiss for 7 days** actions.

### 6.5 Books-closed pre-flight (optional warning)

Before freeze, optionally query Odoo for `(a)` unposted journal entries on partner-tracked accounts within the period and `(b)` the period-lock flag on `account.fiscalyear`. If either fails, show a warning ("📅 Period is open in Odoo — proceed anyway?"). Non-blocking.

## 7. Existing code impact

### 7.1 Files refactored

- **`src/app/beithady/financials/page.tsx`** — shrinks from 1182 → ~200 lines, becomes the cockpit. All current PnL/BS/Payables rendering moves to the new extracted subpages.
- **`src/lib/financials-pnl.ts`**:
  - `buildBalanceSheet` swaps the `BEITHADY_OPENING_BALANCES_2026` import for `loadOpeningBalanceSnapshot({ period_end, scope })` which reads from `bh_balance_snapshot_accounts`. Return type unchanged.
  - `buildPayablesReport` and the `getIntercompanyPartnerIds()` helper stop excluding A1 partner_id from `consolidated`. Test assertions for prior A1-exclusion behavior get updated.
- **`vercel.json`** — adds the 2 new cron entries for `bh-financials-snapshot-reminder`.

### 7.2 Files added

```
supabase/migrations/0117_bh_financials_balance_snapshots.sql

src/lib/beithady/financials/
  cadence.ts             cadence.test.ts
  partner-match.ts       partner-match.test.ts
  xlsx-import.ts         xlsx-import.test.ts
  snapshots.ts           snapshots.test.ts
  ledgers.ts             ledgers.test.ts
  reconciliation.ts      reconciliation.test.ts

src/app/api/cron/bh-financials-snapshot-reminder/route.ts

src/app/beithady/financials/performance/page.tsx
src/app/beithady/financials/balance-sheet/page.tsx
src/app/beithady/financials/payables/page.tsx
src/app/beithady/financials/ledgers/page.tsx
src/app/beithady/financials/snapshots/page.tsx
src/app/beithady/financials/snapshots/[id]/page.tsx
src/app/beithady/financials/reconciliation/page.tsx
src/app/beithady/financials/import/page.tsx
src/app/beithady/financials/import/[upload_id]/page.tsx

src/app/beithady/financials/_components/
  SnapshotCard.tsx
  PartnerLedgerTable.tsx
  VarianceDrilldown.tsx
```

### 7.3 Files deleted

- **`src/lib/beithady-opening-balance-2026.ts`** — content migrated to DB.
- **`src/app/beithady/financial/page.tsx`** (singular stub) — redirect to `/beithady/financials` added in `next.config.ts`.

## 8. Testing

### 8.1 Unit (vitest, colocated `*.test.ts`)

- **`cadence.test.ts`** — `period_end + 6mo` math across DST boundaries; `nextSnapshotDue` for normal / overdue / already-frozen cases; "early freeze" allowed.
- **`partner-match.test.ts`** — exact match; fuzzy with prefix-strip (`"020. B.Tech"` → `"B.Tech"`); Arabic name passthrough; ambiguous candidate handling.
- **`xlsx-import.test.ts`** — parses the 2 xlsx files copied into `src/lib/beithady/financials/__fixtures__/` (gitignored `Lime Domains/` is not test-accessible); asserts 85 suppliers totaling −8,567,422.64 and 6 owners totaling −2,518,213.03; header-row skipping; bad-row error capture in `parse_errors`.
- **`snapshots.test.ts`** — freeze transitions; re-freeze increments version and supersedes; partial-unique-index enforces single `frozen` per (period_end, scope).
- **`ledgers.test.ts`** — opening + delta math; synthetic `__UNALLOCATED` inclusion; scope filtering; as-of date.
- **`reconciliation.test.ts`** — variance computation; 4-state lifecycle; trend computation across versions.

### 8.2 Integration

- **Migration idempotency** — apply 0117 twice; verify no duplicate rows; check seeded accounts match TS const to the cent.
- **buildBalanceSheet regression** — for `asOf=2026-02-28 · consolidated`, output matches a fixture (`__fixtures__/balance-sheet-2026-02-28.json`) derived from `BeithadyBalanceSheet 28-2.xlsx` once at fixture-creation time. Fixture is committed; the source xlsx stays out of the repo.
- **Payables A1 inclusion** — `buildPayablesReport('consolidated')` now returns the A1 partner row.
- **End-to-end import** — upload suppliers xlsx; review; commit; query `bh_balance_snapshot_partners`; assert 85 + 1 synthetic.
- **Freeze atomicity** — call freeze while old version is frozen; assert both transitions in one transaction.

## 9. Migration & rollout

Single PR, single deploy:

1. Apply migration `0117_…` via Supabase MCP `apply_migration`.
2. Run `npm run test` (vitest) — all green.
3. Run `npx tsc --noEmit` — no new errors (allowed to keep the 2 pre-existing unrelated errors in `qrcode` and `@testing-library/react`).
4. Commit · push to `main` · Vercel auto-deploy via GitHub integration.
5. After deploy: open `/beithady/financials/import/` and upload the 2 partner-ledger xlsx files to populate `bh_balance_snapshot_partners`.
6. Operator visits `/beithady/financials/balance-sheet/` and confirms numbers match the pre-deploy view to the cent (the TS-const → DB swap is value-identical).

No data loss path. The TS const is deleted in the same commit that adds the migration; if `apply_migration` is skipped, `buildBalanceSheet` will fail loudly rather than silently produce wrong numbers.

## 10. Out of scope (deferred)

- Per-partner trend chart on the Ledgers page (current balance over time).
- Auto-import from Odoo's API on snapshot freeze (instead of xlsx upload).
- Multi-currency support on partner ledgers (EGP-only for v1; existing `currency` column on `bh_balance_snapshot_partners` defers this).
- ML-suggested partner-match model trained on prior assignments.
- Cash Flow statement (a future cockpit tile, but not implemented in this scope).
- Operator-editable intercompany flag on `odoo_partners` (skipped per Q3 answer — all owners are external).

## 11. Open questions for review

None blocking. The 6 clarifying questions are answered and locked. If the user wants to challenge any of them before implementation begins, they should mark the corresponding section here before approving the spec.

---

**Brainstorming session artifacts:** `.superpowers/brainstorm/3301-1778609938/content/` (welcome, approaches, design-1 through design-5).
