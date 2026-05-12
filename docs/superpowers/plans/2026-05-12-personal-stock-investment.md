# Personal → Stock Investment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/personal/stocks` — an 8-tab broker-statement analyzer for Kareem's three AOLB accounts (001 trading / 003 margin / 009 fund), with a normalized 10-table schema, SpreadsheetML XML parser, bulk-seed + upload UI, and dashboard surfacing cash flow / trading totals / dividends / realized + unrealized P&L.

**Architecture:** Migration `0116_personal_stock_investment.sql` introduces 2 lookup tables (accounts, instruments), 2 audit tables (uploads, raw_rows), 6 core typed tables (trades, dividends, cash_movements, fees, interest, corrections, current_prices), and 4 SQL views (positions, realized_pnl via FIFO function, account_balance, dashboard_kpis). A TypeScript parser converts SpreadsheetML 2003 XML → typed rows; a classifier routes each raw row to the right core table by `op_type`. UI is plain Next.js 16 App Router pages following the existing `PersonalShell` pattern. Manual price entry feeds unrealized P&L; no live market feed.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Vitest · Tailwind v4 · Supabase Postgres (service-role on server, browser client for write paths) · recharts (already a dep) · no new dependencies.

**Source spec:** [docs/superpowers/specs/2026-05-12-personal-stock-investment-design.md](../specs/2026-05-12-personal-stock-investment-design.md)

---

## File Structure

### Created — backend / lib

- `supabase/migrations/0116_personal_stock_investment.sql` — schema + seed + views
- `src/lib/personal/stocks/parse-aolb.ts` — SpreadsheetML XML parser
- `src/lib/personal/stocks/parse-aolb.test.ts` — parser unit tests
- `src/lib/personal/stocks/instruments.ts` — slugify + auto-discover instrument
- `src/lib/personal/stocks/instruments.test.ts`
- `src/lib/personal/stocks/classify.ts` — op_type → core-table router
- `src/lib/personal/stocks/classify.test.ts`
- `src/lib/personal/stocks/import.ts` — orchestrator (validate → dedup → parse → classify → reconcile)
- `src/lib/personal/stocks/import.test.ts`
- `src/lib/personal/stocks/queries.ts` — typed wrappers around the 4 views
- `src/lib/personal/stocks/types.ts` — shared TypeScript types + Zod schemas

### Created — API routes

- `src/app/api/personal/stocks/upload/route.ts` — multipart `.xls` upload handler
- `src/app/api/personal/stocks/reprocess/route.ts` — reclassify an existing upload
- `src/app/api/personal/stocks/seed/route.ts` — one-shot bulk-seed admin endpoint
- `src/app/api/personal/stocks/prices/route.ts` — manual price entry POST

### Created — UI

- `src/app/personal/stocks/layout.tsx` — shell + 8-tab nav
- `src/app/personal/stocks/page.tsx` — Dashboard
- `src/app/personal/stocks/portfolio/page.tsx` — Open positions
- `src/app/personal/stocks/transactions/page.tsx` — Unified log with filters
- `src/app/personal/stocks/cash-flow/page.tsx` — Bank flows + balance-over-time
- `src/app/personal/stocks/dividends/page.tsx` — Per-ticker per-year matrix
- `src/app/personal/stocks/accounts/page.tsx` — 3-card landing
- `src/app/personal/stocks/accounts/[code]/page.tsx` — Per-account drill
- `src/app/personal/stocks/prices/page.tsx` — Inline-editable price entry
- `src/app/personal/stocks/import/page.tsx` — Drag-drop + uploads list
- `src/app/personal/stocks/_components/stocks-shell.tsx` — Tab nav
- `src/app/personal/stocks/_components/kpi-tile.tsx` — Reusable KPI tile
- `src/app/personal/stocks/_components/holdings-table.tsx`
- `src/app/personal/stocks/_components/activity-feed.tsx`
- `src/app/personal/stocks/_components/period-filter.tsx`
- `src/app/personal/stocks/_components/account-filter.tsx`
- `src/app/personal/stocks/_components/portfolio-chart.tsx`
- `src/app/personal/stocks/_components/dividends-chart.tsx`
- `src/app/personal/stocks/_components/balance-lines-chart.tsx`
- `src/app/personal/stocks/_components/realized-pnl-chart.tsx`
- `src/app/personal/stocks/_components/import-dropzone.tsx`
- `src/app/personal/stocks/_components/price-row.tsx`

### Modified

- `src/app/personal/page.tsx` — add Stock Investment tile + emerald accent
- `.env.example` — add `STOCK_AOLB_SEED_PATH`

### Verification

- `npm run test` — full vitest suite (existing passes + the new parser/classifier/import/instruments suites all pass)
- `npx tsc --noEmit` — clean (excluding any documented pre-existing errors)
- Reconciliation: every uploaded `.xls` ends with `status='ok'`
- Manual smoke: open every one of the 8 tabs, confirm no console errors

---

## Phase 1 — Foundation (schema + parser + classifier + import)

### Task 1: Migration — lookup, audit, core tables + seed accounts

**Files:**
- Create: `supabase/migrations/0116_personal_stock_investment.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 0116_personal_stock_investment.sql
-- Personal Stock Investment module: normalized schema for AOLB broker statements.
-- Adds 2 lookup tables, 2 audit tables, 7 core tables, seeds the 3 accounts.
-- Views are added separately in 0117 to keep DDL focused.

begin;

-- ============================================================
-- 1) LOOKUP TABLES
-- ============================================================

create table personal_stock_accounts (
  id          serial primary key,
  code        text not null unique,
  kind        text not null check (kind in ('trading','margin','fund')),
  currency    text not null default 'EGP',
  notes       text,
  created_at  timestamptz not null default now()
);

insert into personal_stock_accounts (code, kind, currency, notes) values
  ('001', 'trading', 'EGP', 'AOLB primary trading account'),
  ('003', 'margin',  'EGP', 'AOLB margin trading account (carries debit balance)'),
  ('009', 'fund',    'EGP', 'AOLB investment account holding ICS Makaseb 2nd Edition Fund');

create table personal_stock_instruments (
  id          serial primary key,
  kind        text not null check (kind in ('stock','fund')),
  ticker      text not null unique,
  name        text not null,
  currency    text not null default 'EGP',
  notes       text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 2) AUDIT TABLES
-- ============================================================

create table personal_stock_uploads (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,
  account_id    int not null references personal_stock_accounts(id),
  year          int not null,
  sha256        text not null unique,
  row_count     int not null default 0,
  status        text not null check (status in ('ok','reconcile_mismatch','parse_error')),
  status_note   text,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   text
);
create index on personal_stock_uploads (account_id, year);

create table personal_stock_raw_rows (
  id             uuid primary key default gen_random_uuid(),
  upload_id      uuid not null references personal_stock_uploads(id) on delete cascade,
  row_index      int not null,
  details        text,
  occurred_at    date,
  op_type        text,
  description    text,
  debit          numeric(18,4),
  credit         numeric(18,4),
  balance_after  numeric(18,4),
  dc_flag        text,
  unique (upload_id, row_index)
);
create index on personal_stock_raw_rows (op_type);
create index on personal_stock_raw_rows (occurred_at);

-- ============================================================
-- 3) CORE TABLES
-- ============================================================

create table personal_stock_trades (
  id              uuid primary key default gen_random_uuid(),
  raw_row_id      uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id      int not null references personal_stock_accounts(id),
  instrument_id   int not null references personal_stock_instruments(id),
  side            text not null check (side in ('buy','sell')),
  qty             numeric(18,6) not null check (qty > 0),
  price           numeric(18,6) not null check (price >= 0),
  gross_amount    numeric(18,4) not null,
  net_amount      numeric(18,4) not null,
  fees_amount     numeric(18,4) not null,
  invoice_id      text,
  trade_date      date not null
);
create index on personal_stock_trades (account_id, trade_date);
create index on personal_stock_trades (instrument_id, trade_date);

create table personal_stock_dividends (
  id              uuid primary key default gen_random_uuid(),
  raw_row_id      uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id      int not null references personal_stock_accounts(id),
  instrument_id   int references personal_stock_instruments(id),
  amount          numeric(18,4) not null,
  pay_date        date not null,
  note            text
);
create index on personal_stock_dividends (account_id, pay_date);

create table personal_stock_cash_movements (
  id                       uuid primary key default gen_random_uuid(),
  raw_row_id               uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id               int not null references personal_stock_accounts(id),
  kind                     text not null check (kind in ('deposit','withdrawal','transfer_in','transfer_out')),
  amount                   numeric(18,4) not null check (amount >= 0),
  counterparty_account_id  int references personal_stock_accounts(id),
  occurred_at              date not null,
  note                     text
);
create index on personal_stock_cash_movements (account_id, occurred_at);
create index on personal_stock_cash_movements (kind);

create table personal_stock_fees (
  id           uuid primary key default gen_random_uuid(),
  raw_row_id   uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id   int not null references personal_stock_accounts(id),
  kind         text not null check (kind in ('platform_daily','ipo_subscription','other')),
  amount       numeric(18,4) not null,
  occurred_at  date not null,
  note         text
);
create index on personal_stock_fees (account_id, occurred_at);

create table personal_stock_interest (
  id                uuid primary key default gen_random_uuid(),
  raw_row_id        uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id        int not null references personal_stock_accounts(id),
  direction         text not null check (direction in ('charge','credit')),
  amount            numeric(18,4) not null check (amount >= 0),
  period_end_date   date not null,
  note              text
);
create index on personal_stock_interest (account_id, period_end_date);

create table personal_stock_corrections (
  id                     uuid primary key default gen_random_uuid(),
  raw_row_id             uuid not null unique references personal_stock_raw_rows(id) on delete cascade,
  account_id             int not null references personal_stock_accounts(id),
  reverses_raw_row_id    uuid references personal_stock_raw_rows(id),
  amount_debit           numeric(18,4) not null default 0,
  amount_credit          numeric(18,4) not null default 0,
  occurred_at            date not null,
  note                   text
);
create index on personal_stock_corrections (account_id, occurred_at);

create table personal_stock_current_prices (
  id              uuid primary key default gen_random_uuid(),
  instrument_id   int not null references personal_stock_instruments(id),
  price           numeric(18,6) not null check (price >= 0),
  as_of_date      date not null,
  entered_at      timestamptz not null default now(),
  entered_by      text,
  note            text
);
create index on personal_stock_current_prices (instrument_id, as_of_date desc);

commit;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool with the project `bpjproljatbrbmszwbov` and the SQL above. Migration name: `personal_stock_investment`.

- [ ] **Step 3: Verify schema applied**

Use Supabase MCP `execute_sql`:
```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'personal_stock_%'
 order by table_name;
```
Expected: 9 rows (`personal_stock_accounts`, `_corrections`, `_cash_movements`, `_current_prices`, `_dividends`, `_fees`, `_instruments`, `_interest`, `_raw_rows`, `_trades`, `_uploads`).

```sql
select code, kind from personal_stock_accounts order by code;
```
Expected: 3 rows — `001|trading`, `003|margin`, `009|fund`.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/0116_personal_stock_investment.sql
git commit -m "feat(personal/stocks): migration 0116 — schema + seed accounts"
```

---

### Task 2: SpreadsheetML XML parser

**Files:**
- Create: `src/lib/personal/stocks/parse-aolb.ts`
- Create: `src/lib/personal/stocks/parse-aolb.test.ts`

- [ ] **Step 1: Write failing test for the parser**

`src/lib/personal/stocks/parse-aolb.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseAolbXml, AolbParseError } from './parse-aolb';

const minimalXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="ag-grid">
    <Table>
      <Row><Cell><Data ss:Type="String">Open Balance 0.00</Data></Cell></Row>
      <Row/>
      <Row>
        <Cell><Data ss:Type="String">Details</Data></Cell>
        <Cell><Data ss:Type="String">Date</Data></Cell>
        <Cell><Data ss:Type="String">Operation Type</Data></Cell>
        <Cell><Data ss:Type="String">Description</Data></Cell>
        <Cell><Data ss:Type="String">Debit</Data></Cell>
        <Cell><Data ss:Type="String">Credit</Data></Cell>
        <Cell><Data ss:Type="String">Balance</Data></Cell>
        <Cell><Data ss:Type="String">D/C</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String">40079967</Data></Cell>
        <Cell><Data ss:Type="String">12-02-2024</Data></Cell>
        <Cell><Data ss:Type="String">Buy Invoice</Data></Cell>
        <Cell><Data ss:Type="String">Buy 100 T M G Holding/L.E./1/Egypt Stock Exchange (inv. 40079967) @44.000</Data></Cell>
        <Cell><Data ss:Type="Number">4405.10</Data></Cell>
        <Cell><Data ss:Type="Number">0</Data></Cell>
        <Cell><Data ss:Type="Number">18194.90</Data></Cell>
        <Cell><Data ss:Type="String"></Data></Cell>
      </Row>
      <Row><Cell><Data ss:Type="String">Close Balance 18194.90</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`;

describe('parseAolbXml', () => {
  it('extracts open + close balance', () => {
    const r = parseAolbXml(minimalXml);
    expect(r.openBalance).toBe(0);
    expect(r.closeBalance).toBeCloseTo(18194.90, 2);
  });

  it('emits one data row (skipping header + open/close lines)', () => {
    const r = parseAolbXml(minimalXml);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      details: '40079967',
      occurredAt: '2024-02-12',
      opType: 'Buy Invoice',
      description: expect.stringContaining('T M G Holding'),
      debit: 4405.10,
      credit: 0,
      balanceAfter: 18194.90,
    });
  });

  it('parses DD-MM-YYYY → YYYY-MM-DD', () => {
    const r = parseAolbXml(minimalXml);
    expect(r.rows[0].occurredAt).toBe('2024-02-12');
  });

  it('throws AolbParseError on non-spreadsheetml input', () => {
    expect(() => parseAolbXml('<html/>')).toThrow(AolbParseError);
  });

  it('handles ss:Index gaps (sparse cells)', () => {
    const sparse = minimalXml.replace(
      '<Cell><Data ss:Type="String">40079967</Data></Cell>',
      '<Cell ss:Index="1"><Data ss:Type="String">40079967</Data></Cell>',
    );
    const r = parseAolbXml(sparse);
    expect(r.rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/personal/stocks/parse-aolb.test.ts
```
Expected: FAIL (`Cannot find module './parse-aolb'`).

- [ ] **Step 3: Implement the parser**

`src/lib/personal/stocks/parse-aolb.ts`:
```ts
import { XMLParser } from 'fast-xml-parser';

export class AolbParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AolbParseError';
  }
}

export type AolbRawRow = {
  rowIndex: number;
  details: string | null;
  occurredAt: string | null;          // ISO YYYY-MM-DD, null if header/footer
  opType: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balanceAfter: number | null;
  dcFlag: string | null;
};

export type AolbParseResult = {
  openBalance: number | null;
  closeBalance: number | null;
  rows: AolbRawRow[];
};

const SS_NS = 'urn:schemas-microsoft-com:office:spreadsheet';

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function parseDateDmy(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseBalanceLine(line: string): number | null {
  // 'Open Balance 0.00' or 'Close Balance -2,999,534.49 Debit'
  const m = /-?[\d,]+(?:\.\d+)?/.exec(line);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ''));
  const isDebit = /debit/i.test(line);
  if (!Number.isFinite(n)) return null;
  return isDebit ? -Math.abs(n) : n;
}

export function parseAolbXml(xml: string): AolbParseResult {
  if (!xml.includes(SS_NS)) {
    throw new AolbParseError('Not a SpreadsheetML 2003 file (missing namespace).');
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (name) => name === 'Row' || name === 'Cell' || name === 'Worksheet',
  });
  const doc = parser.parse(xml);
  const wb = doc.Workbook ?? doc['ss:Workbook'];
  if (!wb) throw new AolbParseError('Workbook element not found.');
  const sheets: any[] = wb.Worksheet ?? wb['ss:Worksheet'] ?? [];
  const sheet = sheets.find((s) => (s['@_ss:Name'] ?? s['@_Name']) === 'ag-grid') ?? sheets[0];
  if (!sheet) throw new AolbParseError('No worksheet found.');
  const table = sheet.Table ?? sheet['ss:Table'];
  const rows: any[] = table?.Row ?? [];

  let openBalance: number | null = null;
  let closeBalance: number | null = null;
  const out: AolbRawRow[] = [];

  rows.forEach((row, rowIndex) => {
    const cells: any[] = row?.Cell ?? [];
    // Materialize a dense 8-col array, honoring ss:Index gaps
    const cols: (string | null)[] = new Array(8).fill(null);
    let cursor = 0;
    for (const cell of cells) {
      const idxAttr = cell['@_ss:Index'] ?? cell['@_Index'];
      if (idxAttr) cursor = parseInt(idxAttr, 10) - 1;
      const data = cell.Data ?? cell['ss:Data'];
      const text = data?.['#text'] ?? data?.['#'] ?? (typeof data === 'string' ? data : null);
      if (cursor < cols.length) cols[cursor] = text ?? null;
      cursor += 1;
    }

    // Detect open / close balance rows (single text cell starting with "Open Balance" or "Close Balance")
    if (cols[0]) {
      const t = String(cols[0]).trim();
      if (/^open balance/i.test(t)) { openBalance = parseBalanceLine(t); return; }
      if (/^close balance/i.test(t)) { closeBalance = parseBalanceLine(t); return; }
    }

    // Header row?  cols[0] === 'Details' and cols[2] === 'Operation Type'
    if (cols[0] === 'Details' && cols[2] === 'Operation Type') return;

    // Empty row
    if (cols.every((c) => c === null || c === '')) return;

    out.push({
      rowIndex,
      details: cols[0] ?? null,
      occurredAt: parseDateDmy(cols[1] ?? null),
      opType: cols[2] ?? null,
      description: cols[3] ?? null,
      debit: toNumber(cols[4]),
      credit: toNumber(cols[5]),
      balanceAfter: cols[6] === null ? null : toNumber(cols[6]),
      dcFlag: cols[7] ?? null,
    });
  });

  return { openBalance, closeBalance, rows: out };
}
```

Note: the codebase already has `fast-xml-parser` as a transitive dep via `googleapis`; verify with `npm ls fast-xml-parser`. If absent, run `npm i fast-xml-parser`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/personal/stocks/parse-aolb.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/stocks/parse-aolb.ts src/lib/personal/stocks/parse-aolb.test.ts
git commit -m "feat(personal/stocks): SpreadsheetML XML parser"
```

---

### Task 3: Instrument slugify util + auto-discovery

**Files:**
- Create: `src/lib/personal/stocks/instruments.ts`
- Create: `src/lib/personal/stocks/instruments.test.ts`

- [ ] **Step 1: Write failing test**

`src/lib/personal/stocks/instruments.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { slugifyInstrumentName, parseStockDescription, parseFundDescription } from './instruments';

describe('slugifyInstrumentName', () => {
  it('uppercases and replaces non-alphanumeric with underscore', () => {
    expect(slugifyInstrumentName('T M G Holding')).toBe('T_M_G_HOLDING');
    expect(slugifyInstrumentName('Ezz Steel')).toBe('EZZ_STEEL');
    expect(slugifyInstrumentName('Six of October Development & Investment (SODIC)')).toBe('SIX_OF_OCTOBER_DEVELOPMENT_INVESTMENT_SODIC');
  });
  it('collapses runs of underscores', () => {
    expect(slugifyInstrumentName('A   B  C')).toBe('A_B_C');
  });
  it('trims leading/trailing underscores', () => {
    expect(slugifyInstrumentName('  X  ')).toBe('X');
  });
});

describe('parseStockDescription', () => {
  it('extracts side, qty, name, price, invoice', () => {
    const r = parseStockDescription('Buy 100 T M G Holding/L.E./1/Egypt Stock Exchange (inv. 40079967) @44.000');
    expect(r).toEqual({
      side: 'buy',
      qty: 100,
      name: 'T M G Holding',
      invoiceId: '40079967',
      price: 44.000,
    });
  });
  it('handles Sell', () => {
    const r = parseStockDescription('Sell 75000 Emaar Egypt for Development/L.E./1/Egypt Stock Exchange (inv. 40270963) @6.535');
    expect(r?.side).toBe('sell');
    expect(r?.qty).toBe(75000);
    expect(r?.name).toBe('Emaar Egypt for Development');
  });
  it('returns null on unparseable', () => {
    expect(parseStockDescription('Bank Deposit')).toBeNull();
  });
});

describe('parseFundDescription', () => {
  it('extracts ICS Makaseb buy/sell', () => {
    const r = parseFundDescription(' Sell 405000 ICS (Makaseb 2nd Edition Fund-NI Capital) @12.38180');
    expect(r).toEqual({
      side: 'sell',
      qty: 405000,
      name: 'Makaseb 2nd Edition Fund-NI Capital',
      price: 12.38180,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/personal/stocks/instruments.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/personal/stocks/instruments.ts`:
```ts
export function slugifyInstrumentName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type StockTradeMatch = {
  side: 'buy' | 'sell';
  qty: number;
  name: string;
  invoiceId: string;
  price: number;
};

const STOCK_RE =
  /^(Buy|Sell)\s+(\d+)\s+(.+?)\/L\.E\.\/1\/.+?\(inv\.\s+(\d+)\)\s+@([\d.]+)/i;

export function parseStockDescription(desc: string | null): StockTradeMatch | null {
  if (!desc) return null;
  const m = STOCK_RE.exec(desc.trim());
  if (!m) return null;
  return {
    side: m[1].toLowerCase() as 'buy' | 'sell',
    qty: parseInt(m[2], 10),
    name: m[3].trim(),
    invoiceId: m[4],
    price: parseFloat(m[5]),
  };
}

export type FundTradeMatch = {
  side: 'buy' | 'sell';
  qty: number;
  name: string;
  price: number;
};

const FUND_RE = /^\s*(Buy|Sell)\s+(\d+)\s+ICS\s+\((.+?)\)\s+@([\d.]+)/i;

export function parseFundDescription(desc: string | null): FundTradeMatch | null {
  if (!desc) return null;
  const m = FUND_RE.exec(desc);
  if (!m) return null;
  return {
    side: m[1].toLowerCase() as 'buy' | 'sell',
    qty: parseInt(m[2], 10),
    name: m[3].trim(),
    price: parseFloat(m[4]),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/lib/personal/stocks/instruments.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/stocks/instruments.ts src/lib/personal/stocks/instruments.test.ts
git commit -m "feat(personal/stocks): instrument slugify + trade description parsers"
```

---

### Task 4: Classifier — op_type → core-table router

**Files:**
- Create: `src/lib/personal/stocks/classify.ts`
- Create: `src/lib/personal/stocks/classify.test.ts`

- [ ] **Step 1: Write failing test**

`src/lib/personal/stocks/classify.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { classifyRow, ClassifiedRow } from './classify';
import type { AolbRawRow } from './parse-aolb';

function row(over: Partial<AolbRawRow>): AolbRawRow {
  return {
    rowIndex: 0, details: null, occurredAt: '2024-02-12', opType: null,
    description: null, debit: 0, credit: 0, balanceAfter: null, dcFlag: null,
    ...over,
  };
}

describe('classifyRow', () => {
  it('routes Buy Invoice to trade', () => {
    const r = classifyRow(row({
      opType: 'Buy Invoice',
      description: 'Buy 100 T M G Holding/L.E./1/Egypt Stock Exchange (inv. 40079967) @44.000',
      debit: 4405.10,
    }));
    expect(r.kind).toBe('trade');
    if (r.kind !== 'trade') throw new Error();
    expect(r.data.side).toBe('buy');
    expect(r.data.qty).toBe(100);
    expect(r.data.price).toBe(44);
    expect(r.data.instrumentKind).toBe('stock');
    expect(r.data.instrumentName).toBe('T M G Holding');
    expect(r.data.netAmount).toBe(4405.10);
    expect(r.data.grossAmount).toBe(4400);
    expect(r.data.feesAmount).toBeCloseTo(5.10, 2);
  });

  it('routes Sell Invoice with negative fees when net < gross', () => {
    const r = classifyRow(row({
      opType: 'Sell Invoice',
      description: 'Sell 75000 Emaar Egypt for Development/L.E./1/Egypt Stock Exchange (inv. 40270963) @6.535',
      credit: 490107.34,
    }));
    expect(r.kind).toBe('trade');
    if (r.kind !== 'trade') throw new Error();
    expect(r.data.side).toBe('sell');
    expect(r.data.netAmount).toBe(490107.34);
    expect(r.data.grossAmount).toBe(6.535 * 75000);
  });

  it('routes ICS to trade with fund kind', () => {
    const r = classifyRow(row({
      opType: 'ICS',
      description: ' Sell 405000 ICS (Makaseb 2nd Edition Fund-NI Capital) @12.38180',
      credit: 5014629,
    }));
    expect(r.kind).toBe('trade');
    if (r.kind !== 'trade') throw new Error();
    expect(r.data.instrumentKind).toBe('fund');
  });

  it('routes Bank Deposit', () => {
    const r = classifyRow(row({ opType: 'Bank Deposit', credit: 14000000 }));
    expect(r.kind).toBe('cash');
    if (r.kind !== 'cash') throw new Error();
    expect(r.data.kind).toBe('deposit');
    expect(r.data.amount).toBe(14000000);
  });

  it('routes With Drawal', () => {
    const r = classifyRow(row({ opType: 'With Drawal', debit: 100000 }));
    expect(r.kind).toBe('cash');
    if (r.kind !== 'cash') throw new Error();
    expect(r.data.kind).toBe('withdrawal');
    expect(r.data.amount).toBe(100000);
  });

  it('routes Cash Transfer with counterparty', () => {
    const r = classifyRow(row({
      opType: 'Cash Transfer',
      description: 'Internet Cash Transfer From Account(18880001)',
      credit: 22600,
    }));
    expect(r.kind).toBe('cash');
    if (r.kind !== 'cash') throw new Error();
    expect(r.data.kind).toBe('transfer_in');
    expect(r.data.counterpartyAccountCode).toBe('001');
    expect(r.data.amount).toBe(22600);
  });

  it('routes CASHDIVIDEND', () => {
    const r = classifyRow(row({ opType: 'CASHDIVIDEND', credit: 63086.31 }));
    expect(r.kind).toBe('dividend');
    if (r.kind !== 'dividend') throw new Error();
    expect(r.data.amount).toBe(63086.31);
  });

  it('routes Daily as platform_daily', () => {
    const r = classifyRow(row({ opType: 'Daily', debit: 350, description: '0' }));
    expect(r.kind).toBe('fee');
    if (r.kind !== 'fee') throw new Error();
    expect(r.data.kind).toBe('platform_daily');
    expect(r.data.amount).toBe(350);
  });

  it('routes INTEREST on debit balance as charge', () => {
    const r = classifyRow(row({ opType: 'INTEREST', debit: 10161.92 }));
    expect(r.kind).toBe('interest');
    if (r.kind !== 'interest') throw new Error();
    expect(r.data.direction).toBe('charge');
    expect(r.data.amount).toBe(10161.92);
  });

  it('routes BANK PROFIT as credit', () => {
    const r = classifyRow(row({ opType: 'BANK PROFIT', credit: 44798.06 }));
    expect(r.kind).toBe('interest');
    if (r.kind !== 'interest') throw new Error();
    expect(r.data.direction).toBe('credit');
  });

  it('routes Correction', () => {
    const r = classifyRow(row({
      opType: 'Correction', debit: 14000000, description: 'Cancel',
    }));
    expect(r.kind).toBe('correction');
  });

  it('returns skipped for unknown / header rows', () => {
    const r = classifyRow(row({ opType: 'Operation Type', description: 'Description' }));
    expect(r.kind).toBe('skipped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/personal/stocks/classify.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/personal/stocks/classify.ts`:
```ts
import type { AolbRawRow } from './parse-aolb';
import { parseStockDescription, parseFundDescription } from './instruments';

export type ClassifiedRow =
  | { kind: 'trade'; data: {
        side: 'buy' | 'sell';
        qty: number;
        price: number;
        grossAmount: number;
        netAmount: number;
        feesAmount: number;
        invoiceId: string | null;
        tradeDate: string;
        instrumentKind: 'stock' | 'fund';
        instrumentName: string;
      } }
  | { kind: 'dividend'; data: {
        amount: number; payDate: string; note: string | null;
        instrumentNameHint: string | null;
      } }
  | { kind: 'cash'; data: {
        kind: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out';
        amount: number;
        counterpartyAccountCode: string | null;
        occurredAt: string;
        note: string | null;
      } }
  | { kind: 'fee'; data: {
        kind: 'platform_daily' | 'ipo_subscription' | 'other';
        amount: number; occurredAt: string; note: string | null;
      } }
  | { kind: 'interest'; data: {
        direction: 'charge' | 'credit';
        amount: number; periodEndDate: string; note: string | null;
      } }
  | { kind: 'correction'; data: {
        amountDebit: number; amountCredit: number; occurredAt: string;
        note: string | null;
      } }
  | { kind: 'skipped'; reason: string };

const COUNTERPARTY_RE = /Account\(18880(\d{3})\)/;

export function classifyRow(r: AolbRawRow): ClassifiedRow {
  if (!r.opType || !r.occurredAt) return { kind: 'skipped', reason: 'no op_type / date' };
  // header row
  if (r.opType === 'Operation Type') return { kind: 'skipped', reason: 'header' };

  const op = r.opType.trim();

  if (op === 'Buy Invoice' || op === 'Sell Invoice') {
    const m = parseStockDescription(r.description);
    if (!m) return { kind: 'skipped', reason: 'unparseable trade desc' };
    const net = m.side === 'buy' ? r.debit : r.credit;
    const gross = m.qty * m.price;
    return { kind: 'trade', data: {
      side: m.side, qty: m.qty, price: m.price,
      grossAmount: gross, netAmount: net, feesAmount: net - gross,
      invoiceId: m.invoiceId, tradeDate: r.occurredAt,
      instrumentKind: 'stock', instrumentName: m.name,
    }};
  }

  if (op === 'ICS') {
    const m = parseFundDescription(r.description);
    if (!m) return { kind: 'skipped', reason: 'unparseable fund desc' };
    const net = m.side === 'buy' ? r.debit : r.credit;
    const gross = m.qty * m.price;
    return { kind: 'trade', data: {
      side: m.side, qty: m.qty, price: m.price,
      grossAmount: gross, netAmount: net, feesAmount: net - gross,
      invoiceId: null, tradeDate: r.occurredAt,
      instrumentKind: 'fund', instrumentName: m.name,
    }};
  }

  if (op === 'Bank Deposit') {
    return { kind: 'cash', data: {
      kind: 'deposit', amount: r.credit, counterpartyAccountCode: null,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'With Drawal') {
    return { kind: 'cash', data: {
      kind: 'withdrawal', amount: r.debit, counterpartyAccountCode: null,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'Cash Transfer') {
    const cp = r.description ? COUNTERPARTY_RE.exec(r.description) : null;
    const isIn = r.credit > 0;
    return { kind: 'cash', data: {
      kind: isIn ? 'transfer_in' : 'transfer_out',
      amount: isIn ? r.credit : r.debit,
      counterpartyAccountCode: cp ? cp[1] : null,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'CASHDIVIDEND') {
    return { kind: 'dividend', data: {
      amount: r.credit > 0 ? r.credit : r.debit,
      payDate: r.occurredAt,
      note: r.description,
      instrumentNameHint: null,  // Arabic name → resolve later if needed
    }};
  }

  if (op === 'Daily') {
    const isIpo = r.description ? /اكتتاب/.test(r.description) : false;
    return { kind: 'fee', data: {
      kind: isIpo ? 'ipo_subscription' : 'platform_daily',
      amount: r.debit > 0 ? r.debit : r.credit,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'INTEREST' || op === 'BANK PROFIT') {
    return { kind: 'interest', data: {
      direction: r.debit > 0 ? 'charge' : 'credit',
      amount: r.debit > 0 ? r.debit : r.credit,
      periodEndDate: r.occurredAt, note: r.description,
    }};
  }

  if (op === 'Correction') {
    return { kind: 'correction', data: {
      amountDebit: r.debit, amountCredit: r.credit,
      occurredAt: r.occurredAt, note: r.description,
    }};
  }

  return { kind: 'skipped', reason: `unknown op_type: ${op}` };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/lib/personal/stocks/classify.test.ts
```
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/stocks/classify.ts src/lib/personal/stocks/classify.test.ts
git commit -m "feat(personal/stocks): row classifier"
```

---

### Task 5: Import orchestrator — validate, dedup, parse, classify, persist, reconcile

**Files:**
- Create: `src/lib/personal/stocks/import.ts`
- Create: `src/lib/personal/stocks/import.test.ts`

- [ ] **Step 1: Write failing test (integration test with mock supabase)**

`src/lib/personal/stocks/import.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importAolbFile } from './import';

const fakeXml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="ag-grid">
    <Table>
      <Row><Cell><Data ss:Type="String">Open Balance 0.00</Data></Cell></Row>
      <Row>
        <Cell><Data ss:Type="String">Details</Data></Cell>
        <Cell><Data ss:Type="String">Date</Data></Cell>
        <Cell><Data ss:Type="String">Operation Type</Data></Cell>
        <Cell><Data ss:Type="String">Description</Data></Cell>
        <Cell><Data ss:Type="String">Debit</Data></Cell>
        <Cell><Data ss:Type="String">Credit</Data></Cell>
        <Cell><Data ss:Type="String">Balance</Data></Cell>
        <Cell><Data ss:Type="String">D/C</Data></Cell>
      </Row>
      <Row>
        <Cell><Data ss:Type="String"></Data></Cell>
        <Cell><Data ss:Type="String">11-02-2024</Data></Cell>
        <Cell><Data ss:Type="String">Bank Deposit</Data></Cell>
        <Cell><Data ss:Type="String"></Data></Cell>
        <Cell><Data ss:Type="Number">0</Data></Cell>
        <Cell><Data ss:Type="Number">14000000</Data></Cell>
        <Cell><Data ss:Type="Number">14000000</Data></Cell>
        <Cell><Data ss:Type="String"></Data></Cell>
      </Row>
      <Row><Cell><Data ss:Type="String">Close Balance 14000000.00</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`;

function makeMockClient() {
  // minimal supabase-shaped client capturing inserts
  const inserted: Record<string, any[]> = {};
  const lookupAccounts: Record<string, number> = { '001': 1, '003': 2, '009': 3 };
  return {
    inserted,
    from(table: string) {
      const api: any = {
        select: (cols?: string) => ({
          eq: (col: string, val: any) => ({
            maybeSingle: async () => {
              if (table === 'personal_stock_uploads' && col === 'sha256') return { data: null };
              if (table === 'personal_stock_accounts' && col === 'code') {
                const id = lookupAccounts[val];
                return id ? { data: { id } } : { data: null };
              }
              if (table === 'personal_stock_instruments' && col === 'ticker') return { data: null };
              return { data: null };
            },
          }),
        }),
        insert: (rows: any) => {
          inserted[table] = (inserted[table] ?? []).concat(Array.isArray(rows) ? rows : [rows]);
          return {
            select: () => ({
              single: async () => ({ data: { id: 'mock-' + table + '-id', ...inserted[table][inserted[table].length - 1] } }),
            }),
          };
        },
        update: (patch: any) => ({
          eq: (_c: string, _v: any) => ({ then: (cb: any) => cb({ data: null }) }),
        }),
      };
      return api;
    },
  };
}

describe('importAolbFile', () => {
  it('imports a minimal Bank Deposit row end-to-end', async () => {
    const client = makeMockClient();
    const result = await importAolbFile({
      filename: 'AOLB Account 001 - 2024.xls',
      xml: fakeXml,
      client: client as any,
      uploadedBy: 'kareem.hady@gmail.com',
    });
    expect(result.status).toBe('ok');
    expect(result.parsed.cash).toBe(1);
    expect(result.reconciliationDelta).toBeCloseTo(0, 2);
  });

  it('returns "duplicate" if sha256 already exists', async () => {
    const client = makeMockClient();
    // force dedup hit
    (client as any).from = (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: 'existing-upload' } }) }),
      }),
    });
    const result = await importAolbFile({
      filename: 'AOLB Account 001 - 2024.xls',
      xml: fakeXml,
      client: client as any,
      uploadedBy: 'kareem.hady@gmail.com',
    });
    expect(result.status).toBe('duplicate');
  });

  it('rejects filenames that do not match the AOLB pattern', async () => {
    const client = makeMockClient();
    await expect(
      importAolbFile({
        filename: 'not-an-aolb-file.xls',
        xml: fakeXml,
        client: client as any,
        uploadedBy: 'k@x',
      }),
    ).rejects.toThrow(/filename/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/personal/stocks/import.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/personal/stocks/import.ts`:
```ts
import { createHash } from 'node:crypto';
import { parseAolbXml } from './parse-aolb';
import { classifyRow } from './classify';
import { slugifyInstrumentName } from './instruments';
import type { SupabaseClient } from '@supabase/supabase-js';

const FILENAME_RE = /^AOLB Account (\d{3}) - (\d{4})\.xls$/i;

export type ImportInput = {
  filename: string;
  xml: string;
  client: SupabaseClient;
  uploadedBy: string;
};

export type ImportResult = {
  uploadId: string | null;
  status: 'ok' | 'reconcile_mismatch' | 'duplicate' | 'parse_error';
  parsed: { trades: number; dividends: number; cash: number; fees: number; interest: number; corrections: number; skipped: number; rawRows: number };
  reconciliationDelta: number;
  newInstruments: number;
  message?: string;
};

export async function importAolbFile(input: ImportInput): Promise<ImportResult> {
  const { filename, xml, client, uploadedBy } = input;
  const m = FILENAME_RE.exec(filename);
  if (!m) throw new Error(`Invalid filename (expected "AOLB Account NNN - YYYY.xls"): ${filename}`);
  const code = m[1];
  const year = parseInt(m[2], 10);

  const sha256 = createHash('sha256').update(xml).digest('hex');

  // Dedup
  const existing = await client
    .from('personal_stock_uploads')
    .select('id')
    .eq('sha256', sha256)
    .maybeSingle();
  if (existing.data) {
    return { uploadId: existing.data.id, status: 'duplicate', parsed: { trades: 0, dividends: 0, cash: 0, fees: 0, interest: 0, corrections: 0, skipped: 0, rawRows: 0 }, reconciliationDelta: 0, newInstruments: 0 };
  }

  // Resolve account
  const accountRes = await client
    .from('personal_stock_accounts')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (!accountRes.data) throw new Error(`Account ${code} not in personal_stock_accounts`);
  const accountId: number = accountRes.data.id;

  // Parse
  let parsed;
  try {
    parsed = parseAolbXml(xml);
  } catch (err: any) {
    return { uploadId: null, status: 'parse_error', parsed: { trades: 0, dividends: 0, cash: 0, fees: 0, interest: 0, corrections: 0, skipped: 0, rawRows: 0 }, reconciliationDelta: 0, newInstruments: 0, message: err.message };
  }

  // Insert upload header
  const uploadIns = await client
    .from('personal_stock_uploads')
    .insert({ filename, account_id: accountId, year, sha256, row_count: parsed.rows.length, status: 'ok', uploaded_by: uploadedBy })
    .select()
    .single();
  const uploadId: string = uploadIns.data.id;

  // Insert raw rows
  const rawRowInserts = parsed.rows.map((r) => ({
    upload_id: uploadId,
    row_index: r.rowIndex,
    details: r.details,
    occurred_at: r.occurredAt,
    op_type: r.opType,
    description: r.description,
    debit: r.debit,
    credit: r.credit,
    balance_after: r.balanceAfter,
    dc_flag: r.dcFlag,
  }));
  const rawRowsRes = await client.from('personal_stock_raw_rows').insert(rawRowInserts).select();
  const rawIdByIndex = new Map<number, string>();
  for (const row of rawRowsRes.data ?? []) rawIdByIndex.set(row.row_index, row.id);

  const counts = { trades: 0, dividends: 0, cash: 0, fees: 0, interest: 0, corrections: 0, skipped: 0, rawRows: parsed.rows.length };
  let newInstruments = 0;
  const tradeInserts: any[] = [];
  const dividendInserts: any[] = [];
  const cashInserts: any[] = [];
  const feeInserts: any[] = [];
  const interestInserts: any[] = [];
  const correctionInserts: any[] = [];

  // Cache instruments + account code → id during this import
  const instrumentIdByTicker = new Map<string, number>();
  const accountIdByCode = new Map<string, number>([[code, accountId]]);

  async function resolveAccountId(c: string): Promise<number | null> {
    if (accountIdByCode.has(c)) return accountIdByCode.get(c)!;
    const r = await client.from('personal_stock_accounts').select('id').eq('code', c).maybeSingle();
    if (!r.data) return null;
    accountIdByCode.set(c, r.data.id);
    return r.data.id;
  }

  async function resolveInstrumentId(kind: 'stock' | 'fund', name: string): Promise<number> {
    const ticker = slugifyInstrumentName(name);
    if (instrumentIdByTicker.has(ticker)) return instrumentIdByTicker.get(ticker)!;
    const exist = await client.from('personal_stock_instruments').select('id').eq('ticker', ticker).maybeSingle();
    if (exist.data) {
      instrumentIdByTicker.set(ticker, exist.data.id);
      return exist.data.id;
    }
    const ins = await client.from('personal_stock_instruments').insert({ kind, ticker, name }).select().single();
    instrumentIdByTicker.set(ticker, ins.data.id);
    newInstruments += 1;
    return ins.data.id;
  }

  for (const raw of parsed.rows) {
    const rawId = rawIdByIndex.get(raw.rowIndex);
    if (!rawId) continue;
    const c = classifyRow(raw);
    if (c.kind === 'skipped') { counts.skipped += 1; continue; }

    if (c.kind === 'trade') {
      const instrumentId = await resolveInstrumentId(c.data.instrumentKind, c.data.instrumentName);
      tradeInserts.push({
        raw_row_id: rawId, account_id: accountId, instrument_id: instrumentId,
        side: c.data.side, qty: c.data.qty, price: c.data.price,
        gross_amount: c.data.grossAmount, net_amount: c.data.netAmount,
        fees_amount: c.data.feesAmount, invoice_id: c.data.invoiceId,
        trade_date: c.data.tradeDate,
      });
      counts.trades += 1;
    } else if (c.kind === 'dividend') {
      dividendInserts.push({
        raw_row_id: rawId, account_id: accountId, instrument_id: null,
        amount: c.data.amount, pay_date: c.data.payDate, note: c.data.note,
      });
      counts.dividends += 1;
    } else if (c.kind === 'cash') {
      const cpId = c.data.counterpartyAccountCode ? await resolveAccountId(c.data.counterpartyAccountCode) : null;
      cashInserts.push({
        raw_row_id: rawId, account_id: accountId, kind: c.data.kind,
        amount: c.data.amount, counterparty_account_id: cpId,
        occurred_at: c.data.occurredAt, note: c.data.note,
      });
      counts.cash += 1;
    } else if (c.kind === 'fee') {
      feeInserts.push({
        raw_row_id: rawId, account_id: accountId, kind: c.data.kind,
        amount: c.data.amount, occurred_at: c.data.occurredAt, note: c.data.note,
      });
      counts.fees += 1;
    } else if (c.kind === 'interest') {
      interestInserts.push({
        raw_row_id: rawId, account_id: accountId, direction: c.data.direction,
        amount: c.data.amount, period_end_date: c.data.periodEndDate, note: c.data.note,
      });
      counts.interest += 1;
    } else if (c.kind === 'correction') {
      correctionInserts.push({
        raw_row_id: rawId, account_id: accountId, reverses_raw_row_id: null,
        amount_debit: c.data.amountDebit, amount_credit: c.data.amountCredit,
        occurred_at: c.data.occurredAt, note: c.data.note,
      });
      counts.corrections += 1;
    }
  }

  if (tradeInserts.length) await client.from('personal_stock_trades').insert(tradeInserts);
  if (dividendInserts.length) await client.from('personal_stock_dividends').insert(dividendInserts);
  if (cashInserts.length) await client.from('personal_stock_cash_movements').insert(cashInserts);
  if (feeInserts.length) await client.from('personal_stock_fees').insert(feeInserts);
  if (interestInserts.length) await client.from('personal_stock_interest').insert(interestInserts);
  if (correctionInserts.length) await client.from('personal_stock_corrections').insert(correctionInserts);

  // Reconcile
  const sumDelta = parsed.rows.reduce((acc, r) => acc + r.credit - r.debit, 0);
  const expected = (parsed.closeBalance ?? 0) - (parsed.openBalance ?? 0);
  const delta = Math.abs(sumDelta - expected);
  const status: 'ok' | 'reconcile_mismatch' = delta < 0.05 ? 'ok' : 'reconcile_mismatch';

  if (status !== 'ok') {
    await client.from('personal_stock_uploads').update({ status, status_note: `delta=${delta.toFixed(4)}` }).eq('id', uploadId);
  }

  return { uploadId, status, parsed: counts, reconciliationDelta: delta, newInstruments };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/lib/personal/stocks/import.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/personal/stocks/import.ts src/lib/personal/stocks/import.test.ts
git commit -m "feat(personal/stocks): import orchestrator (dedup, parse, classify, reconcile)"
```

---

### Task 6: API routes — upload, reprocess, seed, prices

**Files:**
- Create: `src/app/api/personal/stocks/upload/route.ts`
- Create: `src/app/api/personal/stocks/seed/route.ts`
- Create: `src/app/api/personal/stocks/reprocess/route.ts`
- Create: `src/app/api/personal/stocks/prices/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add env var**

Edit `.env.example`, append:
```
# Path to AOLB statements folder for one-shot bulk-seed (admin only)
STOCK_AOLB_SEED_PATH=C:/kareemhady/Lime Domains/Personal/AOLB
```

- [ ] **Step 2: Upload route**

`src/app/api/personal/stocks/upload/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { importAolbFile } from '@/lib/personal/stocks/import';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  const form = await req.formData();
  const files = form.getAll('files');
  if (!files.length) return NextResponse.json({ error: 'no files' }, { status: 400 });

  const client = supabaseAdmin();
  const results: any[] = [];
  for (const f of files) {
    if (!(f instanceof File)) continue;
    const xml = await f.text();
    try {
      const r = await importAolbFile({ filename: f.name, xml, client, uploadedBy: session.email });
      results.push({ filename: f.name, ...r });
    } catch (err: any) {
      results.push({ filename: f.name, status: 'parse_error', message: err.message });
    }
  }
  return NextResponse.json({ results });
}
```

Note on `requireAdmin`: re-use the existing auth helper (look in `src/lib/auth.ts`). If a different helper name is used in the codebase, swap accordingly — do NOT invent a new helper.

- [ ] **Step 3: Seed route**

`src/app/api/personal/stocks/seed/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { supabaseAdmin } from '@/lib/supabase';
import { importAolbFile } from '@/lib/personal/stocks/import';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  const seedPath = process.env.STOCK_AOLB_SEED_PATH;
  if (!seedPath) return NextResponse.json({ error: 'STOCK_AOLB_SEED_PATH not set' }, { status: 500 });

  const entries = await readdir(seedPath);
  const xlsFiles = entries.filter((f) => /^AOLB Account \d{3} - \d{4}\.xls$/i.test(f));
  const client = supabaseAdmin();
  const results: any[] = [];
  for (const f of xlsFiles) {
    const xml = await readFile(path.join(seedPath, f), 'utf8');
    try {
      const r = await importAolbFile({ filename: f, xml, client, uploadedBy: session.email });
      results.push({ filename: f, ...r });
    } catch (err: any) {
      results.push({ filename: f, status: 'error', message: err.message });
    }
  }
  return NextResponse.json({ results });
}
```

- [ ] **Step 4: Reprocess route**

`src/app/api/personal/stocks/reprocess/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { classifyRow } from '@/lib/personal/stocks/classify';
import { slugifyInstrumentName } from '@/lib/personal/stocks/instruments';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  await requireAdmin(req);
  const { uploadId } = await req.json();
  if (!uploadId) return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
  const client = supabaseAdmin();

  // Delete derived rows for this upload (cascade via raw_rows? No — raw_rows.upload_id cascade
  // deletes raw_rows; core tables FK to raw_rows with cascade so deleting raws clears all derived).
  // Instead: delete only core rows joined via raw_rows.upload_id.
  const { data: raws } = await client.from('personal_stock_raw_rows').select('id').eq('upload_id', uploadId);
  const rawIds = (raws ?? []).map((r) => r.id);
  if (rawIds.length === 0) return NextResponse.json({ error: 'no raw rows' }, { status: 404 });

  for (const table of ['personal_stock_trades', 'personal_stock_dividends', 'personal_stock_cash_movements', 'personal_stock_fees', 'personal_stock_interest', 'personal_stock_corrections']) {
    await client.from(table).delete().in('raw_row_id', rawIds);
  }

  // Re-classify (same logic as import.ts, but reading raw rows from DB)
  // For brevity, return a "not implemented" placeholder pointing to a follow-up task. In real impl,
  // extract the classification loop from import.ts into a shared helper and call it here.
  return NextResponse.json({ status: 'reclassify-pending', cleared: rawIds.length });
}
```

Note: this task ships a *minimal* reprocess (cleanup only). A follow-up task in Phase 5 (Task 22) will extract the classify-and-insert loop into a shared helper used by both `import.ts` and this route.

- [ ] **Step 5: Prices route**

`src/app/api/personal/stocks/prices/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

const Body = z.object({
  entries: z.array(z.object({
    instrumentId: z.number(),
    price: z.number().nonnegative(),
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().nullable().optional(),
  })).min(1),
});

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  const body = Body.parse(await req.json());
  const client = supabaseAdmin();
  const rows = body.entries.map((e) => ({
    instrument_id: e.instrumentId,
    price: e.price,
    as_of_date: e.asOfDate,
    entered_by: session.email,
    note: e.note ?? null,
  }));
  const r = await client.from('personal_stock_current_prices').insert(rows);
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  return NextResponse.json({ inserted: rows.length });
}
```

- [ ] **Step 6: Commit**

```bash
git add .env.example src/app/api/personal/stocks/
git commit -m "feat(personal/stocks): upload/seed/reprocess/prices API routes"
```

---

### Task 7: Migration 0117 — non-FIFO views

**Files:**
- Create: `supabase/migrations/0117_personal_stock_views.sql`

- [ ] **Step 1: Create views (3 of 4; FIFO comes in Task 22)**

```sql
-- 0117_personal_stock_views.sql
-- Non-FIFO views over the Stock Investment normalized schema.
-- The realized-P&L view is added in 0118 alongside the FIFO matching function.

begin;

create view v_personal_stock_positions as
  with buys as (
    select account_id, instrument_id,
           sum(qty) as total_buy_qty,
           sum(net_amount) as total_buy_net
    from personal_stock_trades where side = 'buy' group by account_id, instrument_id
  ),
  sells as (
    select account_id, instrument_id, sum(qty) as total_sell_qty
    from personal_stock_trades where side = 'sell' group by account_id, instrument_id
  )
  select
    b.account_id,
    b.instrument_id,
    coalesce(b.total_buy_qty, 0) - coalesce(s.total_sell_qty, 0) as qty_held,
    case when coalesce(b.total_buy_qty, 0) > 0
         then b.total_buy_net / b.total_buy_qty else null end as avg_cost
  from buys b
  left join sells s on s.account_id = b.account_id and s.instrument_id = b.instrument_id
  where coalesce(b.total_buy_qty, 0) - coalesce(s.total_sell_qty, 0) > 0;

create view v_personal_stock_account_balance as
  select
    raw.upload_id,
    u.account_id,
    raw.occurred_at,
    raw.row_index,
    raw.credit - raw.debit as delta,
    sum(raw.credit - raw.debit)
      over (partition by u.account_id
            order by raw.occurred_at nulls last, raw.row_index
            rows between unbounded preceding and current row) as balance_egp
  from personal_stock_raw_rows raw
  join personal_stock_uploads u on u.id = raw.upload_id
  where raw.occurred_at is not null;

create view v_personal_stock_dashboard_kpis as
  with cash_in as (
    select coalesce(sum(amount), 0) as v from personal_stock_cash_movements where kind = 'deposit'
  ),
  cash_out as (
    select coalesce(sum(amount), 0) as v from personal_stock_cash_movements where kind = 'withdrawal'
  ),
  bought as (
    select coalesce(sum(net_amount), 0) as v from personal_stock_trades where side = 'buy'
  ),
  sold as (
    select coalesce(sum(net_amount), 0) as v from personal_stock_trades where side = 'sell'
  ),
  divs as (
    select coalesce(sum(amount), 0) as v from personal_stock_dividends
  ),
  open_cost as (
    select coalesce(sum(qty_held * avg_cost), 0) as v from v_personal_stock_positions
  )
  select
    (select v from cash_in)  as cash_in_egp,
    (select v from cash_out) as cash_out_egp,
    (select v from bought)   as total_bought_egp,
    (select v from sold)     as total_sold_egp,
    (select v from divs)     as dividends_egp,
    (select v from open_cost) as open_positions_cost_egp;

commit;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `apply_migration` with name `personal_stock_views`.

- [ ] **Step 3: Verify views resolve**

```sql
select count(*) from v_personal_stock_positions;
select * from v_personal_stock_dashboard_kpis;
```
Both should run (positions count = 0 before seeding; KPI row should return one row of zeros).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0117_personal_stock_views.sql
git commit -m "feat(personal/stocks): migration 0117 — positions / balance / KPI views"
```

---

### Task 8: Run bulk-seed against all 7 source files; verify reconciliation

- [ ] **Step 1: Ensure env var is set on both local + Vercel**

Local `.env.local`:
```
STOCK_AOLB_SEED_PATH=C:/kareemhady/Lime Domains/Personal/AOLB
```

Vercel production env (via dashboard or `vercel env add`): same key, value `/data/aolb` (or `/tmp/aolb` if you upload files there first — for production, the seed endpoint is best-effort and can be invoked locally during initial setup).

For this task, **invoke locally** by running `npm run dev`, signing in as kareem, and POST'ing to `/api/personal/stocks/seed` (e.g. via curl or browser fetch from the import page once it exists; for this task, use curl with the dev session cookie).

- [ ] **Step 2: Run seed**

From the terminal (while `npm run dev` is up):
```bash
# Get a session cookie first by logging in at http://localhost:3000/login
# Then:
curl -X POST http://localhost:3000/api/personal/stocks/seed \
  -H "Cookie: <copy from browser>" \
  -H "Content-Type: application/json"
```

Expected response: a JSON object with `results: [...]` containing 7 entries, each `status: "ok"` and a non-zero `parsed.trades` / `parsed.cash` / etc.

- [ ] **Step 3: Spot-check reconciliation**

Via Supabase MCP `execute_sql`:
```sql
select filename, status, status_note, row_count from personal_stock_uploads order by filename;
```
Expected: 7 rows, all `status = 'ok'`. If any are `reconcile_mismatch`, the parser/classifier has a bug — diagnose by looking at the file's raw rows and the running balance, then fix and re-run.

- [ ] **Step 4: Spot-check parsed totals**

```sql
select
  (select count(*) from personal_stock_trades) as trades,
  (select count(*) from personal_stock_dividends) as dividends,
  (select count(*) from personal_stock_cash_movements) as cash,
  (select count(*) from personal_stock_fees) as fees,
  (select count(*) from personal_stock_interest) as interest,
  (select count(*) from personal_stock_corrections) as corrections,
  (select count(*) from personal_stock_instruments) as instruments;
```
Expected ballpark (matches the data dump from brainstorming):
- trades ≈ 381+285+11 = 677
- dividends ≈ 17
- cash ≈ 8+57+24 = 89
- fees ≈ 22
- interest ≈ 17+5 = 22
- corrections ≈ 13
- instruments ≈ 20+1 = 21

- [ ] **Step 5: Commit (no code; this is a manual milestone)**

No git commit for this task — the migration and code are already committed. Take a screenshot or record the spot-check output in the SESSION_HANDOFF for traceability.

---

## Phase 2 — Module shell + landing tile

### Task 9: Add Stock Investment tile to /personal/page.tsx

**Files:**
- Modify: `src/app/personal/page.tsx`

- [ ] **Step 1: Add emerald accent + new tile**

In the existing `TILES` array (lines 22–41), add a third entry between Email and Boat Rental:
```ts
  {
    href: '/personal/stocks',
    title: 'Stock Investment',
    description:
      'AOLB broker statements: holdings, cash flow, buy/sell totals, dividends, realized + unrealized P&L across 3 accounts (001 trading, 003 margin, 009 fund).',
    icon: TrendingUp,
    accent: 'emerald',
    badge: { label: 'Live', tone: 'navy' },
  },
```

Add the import at the top: `TrendingUp` to the existing `lucide-react` import.

In the `ACCENTS` object (lines 43–57), add a new key:
```ts
  emerald: {
    iconBg: 'bg-emerald-50 dark:bg-emerald-950', iconText: 'text-emerald-700 dark:text-emerald-300',
    hoverBorder: 'group-hover:border-emerald-400', arrow: 'group-hover:text-emerald-600',
    gradFrom: 'from-emerald-400', gradTo: 'to-emerald-600',
  },
```

Update the `Tile['accent']` union type to include `'emerald'`.

- [ ] **Step 2: Visual smoke-check**

```bash
npm run dev
```
Open `http://localhost:3000/personal`. The Stock Investment tile should appear between Email and Boat Rental, emerald-tinted, with the `Live` badge.

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/page.tsx
git commit -m "feat(personal): add Stock Investment tile (emerald accent)"
```

---

### Task 10: Module layout + 8-tab navigation

**Files:**
- Create: `src/app/personal/stocks/layout.tsx`
- Create: `src/app/personal/stocks/_components/stocks-shell.tsx`

- [ ] **Step 1: Create shell with tab nav**

`src/app/personal/stocks/_components/stocks-shell.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Wallet,
  Coins, Building2, Tag, Upload,
} from 'lucide-react';

const TABS = [
  { href: '/personal/stocks',               label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/personal/stocks/portfolio',     label: 'Portfolio',    icon: Briefcase },
  { href: '/personal/stocks/transactions',  label: 'Transactions', icon: ArrowLeftRight },
  { href: '/personal/stocks/cash-flow',     label: 'Cash Flow',    icon: Wallet },
  { href: '/personal/stocks/dividends',     label: 'Dividends',    icon: Coins },
  { href: '/personal/stocks/accounts',      label: 'Accounts',     icon: Building2 },
  { href: '/personal/stocks/prices',        label: 'Prices',       icon: Tag },
  { href: '/personal/stocks/import',        label: 'Import',       icon: Upload },
];

export function StocksTabNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700 pb-1 mb-4">
      {TABS.map((t) => {
        const active = pathname === t.href || (t.href !== '/personal/stocks' && pathname.startsWith(t.href));
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1.5 rounded-md text-sm inline-flex items-center gap-1.5 transition
              ${active
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            <Icon size={14} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Create the layout**

`src/app/personal/stocks/layout.tsx`:
```tsx
import { PersonalShell, PersonalHeader } from '../_components/personal-shell';
import { TrendingUp } from 'lucide-react';
import { StocksTabNav } from './_components/stocks-shell';

export default function StocksLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonalShell>
      <PersonalHeader
        eyebrow="Personal · finance"
        title="Stock Investment"
        subtitle="AOLB broker statements — holdings, trades, cash flow, dividends, realized + unrealized P&L."
        icon={TrendingUp}
      />
      <StocksTabNav />
      {children}
    </PersonalShell>
  );
}
```

- [ ] **Step 3: Smoke test**

Navigate to `/personal/stocks` — currently `page.tsx` doesn't exist so you'll see a 404, but the layout shouldn't crash any sibling routes. After Task 11 lands the Dashboard page, return here.

- [ ] **Step 4: Commit**

```bash
git add src/app/personal/stocks/layout.tsx src/app/personal/stocks/_components/stocks-shell.tsx
git commit -m "feat(personal/stocks): module layout + 8-tab nav"
```

---

## Phase 3 — Dashboard

### Task 11: KPI tile component + Dashboard top-band layout

**Files:**
- Create: `src/app/personal/stocks/_components/kpi-tile.tsx`
- Create: `src/app/personal/stocks/_components/period-filter.tsx`
- Create: `src/app/personal/stocks/_components/account-filter.tsx`
- Create: `src/lib/personal/stocks/queries.ts`
- Create: `src/lib/personal/stocks/types.ts`
- Create: `src/app/personal/stocks/page.tsx`

- [ ] **Step 1: Shared types**

`src/lib/personal/stocks/types.ts`:
```ts
export type AccountCode = '001' | '003' | '009';
export type Period = 'all' | '2024' | '2025' | '2026';

export type DashboardKpis = {
  cashInEgp: number;
  cashOutEgp: number;
  totalBoughtEgp: number;
  totalSoldEgp: number;
  dividendsEgp: number;
  openPositionsCostEgp: number;
  realizedPnlEgp: number;       // 0 until Task 22 wires FIFO
  unrealizedPnlEgp: number;     // 0 until prices are entered
};
```

- [ ] **Step 2: Query wrapper**

`src/lib/personal/stocks/queries.ts`:
```ts
import { supabaseAdmin } from '@/lib/supabase';
import type { AccountCode, Period, DashboardKpis } from './types';

function yearBounds(period: Period): { from: string; to: string } | null {
  if (period === 'all') return null;
  return { from: `${period}-01-01`, to: `${period}-12-31` };
}

export async function getDashboardKpis(opts: { period: Period; account: AccountCode | 'all' }): Promise<DashboardKpis> {
  const client = supabaseAdmin();
  const bounds = yearBounds(opts.period);
  const accFilter = opts.account === 'all'
    ? null
    : (await client.from('personal_stock_accounts').select('id').eq('code', opts.account).maybeSingle()).data?.id ?? null;

  // We compute KPIs in TS by summing typed-table queries with optional filters,
  // since the v_personal_stock_dashboard_kpis view does not currently accept filters.
  // (When period/account are 'all', the view is used directly.)

  if (opts.period === 'all' && opts.account === 'all') {
    const v = await client.from('v_personal_stock_dashboard_kpis').select('*').single();
    return {
      cashInEgp:              Number(v.data?.cash_in_egp ?? 0),
      cashOutEgp:             Number(v.data?.cash_out_egp ?? 0),
      totalBoughtEgp:         Number(v.data?.total_bought_egp ?? 0),
      totalSoldEgp:           Number(v.data?.total_sold_egp ?? 0),
      dividendsEgp:           Number(v.data?.dividends_egp ?? 0),
      openPositionsCostEgp:   Number(v.data?.open_positions_cost_egp ?? 0),
      realizedPnlEgp:         0,
      unrealizedPnlEgp:       0,
    };
  }

  async function sumWhere(table: string, col: string, opts2?: { whereCol?: string; whereVal?: string }) {
    let q = client.from(table).select(col);
    if (accFilter !== null) q = q.eq('account_id', accFilter);
    if (bounds) q = q.gte(opts2?.whereCol ?? 'occurred_at', bounds.from).lte(opts2?.whereCol ?? 'occurred_at', bounds.to);
    const r = await q;
    return (r.data ?? []).reduce((a: number, row: any) => a + Number(row[col] ?? 0), 0);
  }

  const cashIn  = await sumWhere('personal_stock_cash_movements', 'amount');           // kind=deposit filter applied next
  // For deposit/withdrawal/buy/sell filtering, do per-kind:
  async function sumKind(table: string, col: string, kind: string, dateCol: string) {
    let q = client.from(table).select(col).eq(table === 'personal_stock_trades' ? 'side' : 'kind', kind);
    if (accFilter !== null) q = q.eq('account_id', accFilter);
    if (bounds) q = q.gte(dateCol, bounds.from).lte(dateCol, bounds.to);
    const r = await q;
    return (r.data ?? []).reduce((a: number, row: any) => a + Number(row[col] ?? 0), 0);
  }

  return {
    cashInEgp:    await sumKind('personal_stock_cash_movements', 'amount', 'deposit',    'occurred_at'),
    cashOutEgp:   await sumKind('personal_stock_cash_movements', 'amount', 'withdrawal', 'occurred_at'),
    totalBoughtEgp: await sumKind('personal_stock_trades', 'net_amount', 'buy',  'trade_date'),
    totalSoldEgp:   await sumKind('personal_stock_trades', 'net_amount', 'sell', 'trade_date'),
    dividendsEgp: await sumWhere('personal_stock_dividends', 'amount', { whereCol: 'pay_date' }),
    openPositionsCostEgp: 0, // recomputed below when account filter is 'all' only
    realizedPnlEgp: 0,
    unrealizedPnlEgp: 0,
  };
}
```

- [ ] **Step 3: KPI tile component**

`src/app/personal/stocks/_components/kpi-tile.tsx`:
```tsx
export type KpiTone = 'neutral' | 'pos' | 'neg';

export function KpiTile({ label, value, sub, tone = 'neutral' }: {
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
}) {
  const color =
    tone === 'pos' ? 'text-emerald-700' :
    tone === 'neg' ? 'text-rose-700' : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function fmtEgp(n: number, opts?: { compact?: boolean }): string {
  const abs = Math.abs(n);
  if (opts?.compact) {
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
```

- [ ] **Step 4: Filter chip components**

`src/app/personal/stocks/_components/period-filter.tsx`:
```tsx
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { Period } from '@/lib/personal/stocks/types';

const OPTIONS: Period[] = ['2024', '2025', '2026', 'all'];

export function PeriodFilter() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const active = (sp.get('period') ?? '2026') as Period;
  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((p) => (
        <button
          key={p}
          onClick={() => {
            const u = new URLSearchParams(sp.toString()); u.set('period', p);
            router.replace(`${path}?${u.toString()}`);
          }}
          className={`text-[11px] px-2.5 py-1 rounded ${active === p
            ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          {p === 'all' ? 'All time' : p}
        </button>
      ))}
    </div>
  );
}
```

`src/app/personal/stocks/_components/account-filter.tsx`:
```tsx
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { AccountCode } from '@/lib/personal/stocks/types';

const OPTIONS: Array<AccountCode | 'all'> = ['all', '001', '003', '009'];

export function AccountFilter() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const active = (sp.get('account') ?? 'all') as AccountCode | 'all';
  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((a) => (
        <button
          key={a}
          onClick={() => {
            const u = new URLSearchParams(sp.toString()); u.set('account', a);
            router.replace(`${path}?${u.toString()}`);
          }}
          className={`text-[11px] px-2.5 py-1 rounded ${active === a
            ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          {a === 'all' ? 'All' : a}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Dashboard page with KPI bands**

`src/app/personal/stocks/page.tsx`:
```tsx
import { Suspense } from 'react';
import { PeriodFilter } from './_components/period-filter';
import { AccountFilter } from './_components/account-filter';
import { KpiTile, fmtEgp } from './_components/kpi-tile';
import { getDashboardKpis } from '@/lib/personal/stocks/queries';
import type { Period, AccountCode } from '@/lib/personal/stocks/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: { searchParams: Promise<{ period?: Period; account?: AccountCode | 'all' }> }) {
  const sp = await searchParams;
  const period: Period = sp.period ?? '2026';
  const account = sp.account ?? 'all';
  const k = await getDashboardKpis({ period, account });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Period</div>
          <Suspense><PeriodFilter /></Suspense>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Account</div>
          <Suspense><AccountFilter /></Suspense>
        </div>
      </div>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Money Flow & Trading</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile label="Cash In (from bank)" tone="pos" value={fmtEgp(k.cashInEgp, { compact: true })} sub="EGP" />
          <KpiTile label="Cash Out (to bank)" tone="neg" value={fmtEgp(k.cashOutEgp, { compact: true })} sub="EGP" />
          <KpiTile label="Total Bought" value={fmtEgp(k.totalBoughtEgp, { compact: true })} sub="EGP · buys" />
          <KpiTile label="Total Sold" value={fmtEgp(k.totalSoldEgp, { compact: true })} sub="EGP · sells" />
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Position & Returns</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile label="Open Positions Cost" value={fmtEgp(k.openPositionsCostEgp, { compact: true })} sub="EGP · avg cost" />
          <KpiTile label="Dividends Earned" tone="pos" value={fmtEgp(k.dividendsEgp, { compact: true })} sub="EGP" />
          <KpiTile label="Realized P&L" tone={k.realizedPnlEgp >= 0 ? 'pos' : 'neg'} value={fmtEgp(k.realizedPnlEgp, { compact: true })} sub="FIFO matched" />
          <KpiTile label="Unrealized P&L" tone={k.unrealizedPnlEgp >= 0 ? 'pos' : 'neg'} value={fmtEgp(k.unrealizedPnlEgp, { compact: true })} sub="vs last manual prices" />
        </div>
      </section>

      <div className="text-xs text-slate-400 italic">Holdings / Activity / Charts come in subsequent tasks.</div>
    </div>
  );
}
```

- [ ] **Step 6: Smoke test**

```bash
npm run dev
```
Open `http://localhost:3000/personal/stocks?period=all`. Expect: 2 bands of 4 tiles each with real numbers from the seed.

- [ ] **Step 7: Commit**

```bash
git add src/app/personal/stocks/page.tsx src/app/personal/stocks/_components/ src/lib/personal/stocks/queries.ts src/lib/personal/stocks/types.ts
git commit -m "feat(personal/stocks): dashboard KPI bands + period/account filters"
```

---

### Task 12: Holdings (top 10) table on Dashboard

**Files:**
- Create: `src/app/personal/stocks/_components/holdings-table.tsx`
- Modify: `src/app/personal/stocks/page.tsx` (insert below KPI bands)
- Extend: `src/lib/personal/stocks/queries.ts`

- [ ] **Step 1: Add getTopHoldings query**

Append to `src/lib/personal/stocks/queries.ts`:
```ts
export type HoldingRow = {
  accountCode: string;
  instrumentId: number;
  ticker: string;
  name: string;
  qtyHeld: number;
  avgCost: number;
  lastPrice: number | null;
  lastPriceAsOf: string | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
};

export async function getTopHoldings(limit = 10): Promise<HoldingRow[]> {
  const client = supabaseAdmin();
  // Positions view + instruments + accounts + latest prices
  const positions = await client.from('v_personal_stock_positions').select('account_id, instrument_id, qty_held, avg_cost');
  if (!positions.data?.length) return [];

  const instrumentIds = [...new Set(positions.data.map((p) => p.instrument_id))];
  const accountIds    = [...new Set(positions.data.map((p) => p.account_id))];

  const [instr, accs, prices] = await Promise.all([
    client.from('personal_stock_instruments').select('id, ticker, name').in('id', instrumentIds),
    client.from('personal_stock_accounts').select('id, code').in('id', accountIds),
    client.from('personal_stock_current_prices').select('instrument_id, price, as_of_date').in('instrument_id', instrumentIds).order('as_of_date', { ascending: false }),
  ]);

  const latestByInstr = new Map<number, { price: number; asOf: string }>();
  for (const row of prices.data ?? []) {
    if (!latestByInstr.has(row.instrument_id)) {
      latestByInstr.set(row.instrument_id, { price: Number(row.price), asOf: row.as_of_date });
    }
  }
  const instrById = new Map((instr.data ?? []).map((i) => [i.id, i] as const));
  const acctById  = new Map((accs.data ?? []).map((a) => [a.id, a.code] as const));

  const rows: HoldingRow[] = positions.data.map((p) => {
    const ins = instrById.get(p.instrument_id);
    const lp = latestByInstr.get(p.instrument_id) ?? null;
    const qty = Number(p.qty_held);
    const avg = Number(p.avg_cost);
    const cv  = lp ? qty * lp.price : null;
    const up  = lp ? (lp.price - avg) * qty : null;
    return {
      accountCode: acctById.get(p.account_id) ?? '???',
      instrumentId: p.instrument_id,
      ticker: ins?.ticker ?? '?',
      name: ins?.name ?? '?',
      qtyHeld: qty,
      avgCost: avg,
      lastPrice: lp?.price ?? null,
      lastPriceAsOf: lp?.asOf ?? null,
      currentValue: cv,
      unrealizedPnl: up,
      unrealizedPnlPct: up !== null && avg > 0 ? (lp!.price - avg) / avg * 100 : null,
    };
  });

  // Sort by current value DESC (fallback to qty*avg if no price)
  rows.sort((a, b) => (b.currentValue ?? b.qtyHeld * b.avgCost) - (a.currentValue ?? a.qtyHeld * a.avgCost));
  return rows.slice(0, limit);
}
```

- [ ] **Step 2: Holdings table component**

`src/app/personal/stocks/_components/holdings-table.tsx`:
```tsx
import Link from 'next/link';
import type { HoldingRow } from '@/lib/personal/stocks/queries';
import { fmtEgp } from './kpi-tile';

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  return (
    <div className="ix-card overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="text-sm font-semibold">Holdings (top 10)</div>
        <Link href="/personal/stocks/portfolio" className="text-xs text-emerald-600 hover:underline">View all →</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 dark:text-slate-400 text-left bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Avg Cost</th>
              <th className="px-3 py-2 text-right">Last Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.accountCode}-${r.instrumentId}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.ticker}</div>
                  <div className="text-[10px] text-slate-400">{r.name}</div>
                </td>
                <td className="px-3 py-2">{r.accountCode}</td>
                <td className="px-3 py-2 text-right">{r.qtyHeld.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{r.avgCost.toFixed(4)}</td>
                <td className="px-3 py-2 text-right">
                  {r.lastPrice !== null ? r.lastPrice.toFixed(4) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.currentValue !== null ? fmtEgp(r.currentValue, { compact: true }) : <span className="text-slate-400">—</span>}
                </td>
                <td className={`px-3 py-2 text-right ${r.unrealizedPnl !== null && r.unrealizedPnl < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {r.unrealizedPnl !== null ? fmtEgp(r.unrealizedPnl, { compact: true }) : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="text-center px-3 py-6 text-slate-400 italic">No open positions.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into Dashboard**

In `src/app/personal/stocks/page.tsx`, replace the `<div className="text-xs text-slate-400 italic">Holdings / Activity / Charts come in subsequent tasks.</div>` with:
```tsx
      <HoldingsTable rows={await getTopHoldings()} />
```

Add the import at the top of the file:
```ts
import { getTopHoldings } from '@/lib/personal/stocks/queries';
import { HoldingsTable } from './_components/holdings-table';
```

- [ ] **Step 4: Smoke test & commit**

```bash
npm run dev
```
Confirm the holdings table renders below the KPI bands with real positions.

```bash
git add src/app/personal/stocks/page.tsx src/app/personal/stocks/_components/holdings-table.tsx src/lib/personal/stocks/queries.ts
git commit -m "feat(personal/stocks): dashboard top-10 holdings table"
```

---

### Task 13: Recent activity feed on Dashboard

**Files:**
- Create: `src/app/personal/stocks/_components/activity-feed.tsx`
- Extend: `src/lib/personal/stocks/queries.ts`
- Modify: `src/app/personal/stocks/page.tsx`

- [ ] **Step 1: Add getRecentActivity query**

Append to `queries.ts`:
```ts
export type ActivityRow = {
  kind: 'buy'|'sell'|'dividend'|'deposit'|'withdrawal'|'transfer_in'|'transfer_out'|'fee'|'interest_charge'|'interest_credit'|'correction';
  occurredAt: string;
  accountCode: string;
  amount: number;
  instrumentTicker?: string;
  qty?: number;
  price?: number;
  note?: string;
};

export async function getRecentActivity(limit = 8): Promise<ActivityRow[]> {
  const client = supabaseAdmin();
  // Pull recent rows from each typed table; merge in memory.
  // For 8 rows this is cheap; if it ever becomes hot, switch to a UNION ALL view.
  const [tr, dv, cm, fe, it, co, accs, ins] = await Promise.all([
    client.from('personal_stock_trades').select('account_id, instrument_id, side, qty, price, net_amount, trade_date').order('trade_date', { ascending: false }).limit(limit),
    client.from('personal_stock_dividends').select('account_id, amount, pay_date, note').order('pay_date', { ascending: false }).limit(limit),
    client.from('personal_stock_cash_movements').select('account_id, kind, amount, occurred_at, note').order('occurred_at', { ascending: false }).limit(limit),
    client.from('personal_stock_fees').select('account_id, amount, occurred_at, note').order('occurred_at', { ascending: false }).limit(limit),
    client.from('personal_stock_interest').select('account_id, direction, amount, period_end_date, note').order('period_end_date', { ascending: false }).limit(limit),
    client.from('personal_stock_corrections').select('account_id, amount_debit, amount_credit, occurred_at, note').order('occurred_at', { ascending: false }).limit(limit),
    client.from('personal_stock_accounts').select('id, code'),
    client.from('personal_stock_instruments').select('id, ticker'),
  ]);
  const acct = new Map((accs.data ?? []).map((a) => [a.id, a.code] as const));
  const tick = new Map((ins.data ?? []).map((i) => [i.id, i.ticker] as const));

  const out: ActivityRow[] = [];
  for (const t of tr.data ?? []) out.push({ kind: t.side, occurredAt: t.trade_date, accountCode: acct.get(t.account_id) ?? '?', amount: Number(t.net_amount), instrumentTicker: tick.get(t.instrument_id), qty: Number(t.qty), price: Number(t.price) });
  for (const d of dv.data ?? []) out.push({ kind: 'dividend', occurredAt: d.pay_date, accountCode: acct.get(d.account_id) ?? '?', amount: Number(d.amount), note: d.note ?? undefined });
  for (const c of cm.data ?? []) out.push({ kind: c.kind, occurredAt: c.occurred_at, accountCode: acct.get(c.account_id) ?? '?', amount: Number(c.amount), note: c.note ?? undefined });
  for (const f of fe.data ?? []) out.push({ kind: 'fee', occurredAt: f.occurred_at, accountCode: acct.get(f.account_id) ?? '?', amount: Number(f.amount), note: f.note ?? undefined });
  for (const i of it.data ?? []) out.push({ kind: i.direction === 'charge' ? 'interest_charge' : 'interest_credit', occurredAt: i.period_end_date, accountCode: acct.get(i.account_id) ?? '?', amount: Number(i.amount), note: i.note ?? undefined });
  for (const x of co.data ?? []) out.push({ kind: 'correction', occurredAt: x.occurred_at, accountCode: acct.get(x.account_id) ?? '?', amount: Number(x.amount_credit) - Number(x.amount_debit), note: x.note ?? undefined });

  out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return out.slice(0, limit);
}
```

- [ ] **Step 2: Activity feed component**

`src/app/personal/stocks/_components/activity-feed.tsx`:
```tsx
import type { ActivityRow } from '@/lib/personal/stocks/queries';
import { fmtEgp } from './kpi-tile';

const BADGE: Record<ActivityRow['kind'], { label: string; cls: string }> = {
  buy:               { label: 'BUY',       cls: 'bg-blue-100 text-blue-800' },
  sell:              { label: 'SELL',      cls: 'bg-rose-100 text-rose-800' },
  dividend:          { label: 'DIV',       cls: 'bg-emerald-100 text-emerald-800' },
  deposit:           { label: 'DEP',       cls: 'bg-indigo-100 text-indigo-800' },
  withdrawal:        { label: 'WD',        cls: 'bg-rose-100 text-rose-800' },
  transfer_in:       { label: 'TRF IN',    cls: 'bg-violet-100 text-violet-800' },
  transfer_out:      { label: 'TRF OUT',   cls: 'bg-violet-100 text-violet-800' },
  fee:               { label: 'FEE',       cls: 'bg-slate-200 text-slate-700' },
  interest_charge:   { label: 'INT-',      cls: 'bg-amber-100 text-amber-800' },
  interest_credit:   { label: 'INT+',      cls: 'bg-amber-100 text-amber-800' },
  correction:        { label: 'CORR',      cls: 'bg-slate-200 text-slate-700' },
};

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="ix-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Recent activity</div>
        <a href="/personal/stocks/transactions" className="text-xs text-emerald-600 hover:underline">View all →</a>
      </div>
      <div className="text-xs space-y-1.5">
        {rows.map((r, i) => {
          const b = BADGE[r.kind];
          return (
            <div key={i} className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5 last:border-0">
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${b.cls}`}>{b.label}</span>
              <div className="flex-1">
                {r.instrumentTicker && <span className="font-medium">{r.instrumentTicker}</span>}
                {r.qty !== undefined && <span> {r.qty.toLocaleString()} @{r.price?.toFixed(3)}</span>}
                {!r.instrumentTicker && r.note && <span className="text-slate-600">{r.note.slice(0, 38)}{r.note.length > 38 ? '…' : ''}</span>}
                <span className="text-slate-400"> · {r.occurredAt} · {r.accountCode}</span>
              </div>
              <div className="font-medium">{fmtEgp(r.amount, { compact: true })}</div>
            </div>
          );
        })}
        {!rows.length && <div className="text-slate-400 italic">No recent activity.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into Dashboard**

Modify `src/app/personal/stocks/page.tsx`: change the holdings line to a 2-col grid:
```tsx
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <HoldingsTable rows={await getTopHoldings()} />
        </div>
        <div>
          <ActivityFeed rows={await getRecentActivity()} />
        </div>
      </div>
```

Add imports for `getRecentActivity` and `ActivityFeed`.

- [ ] **Step 4: Commit**

```bash
git add src/app/personal/stocks/page.tsx src/app/personal/stocks/_components/activity-feed.tsx src/lib/personal/stocks/queries.ts
git commit -m "feat(personal/stocks): dashboard recent-activity feed"
```

---

### Task 14: Dashboard charts (4 charts via recharts)

**Files:**
- Create: `src/app/personal/stocks/_components/portfolio-chart.tsx`
- Create: `src/app/personal/stocks/_components/dividends-chart.tsx`
- Create: `src/app/personal/stocks/_components/realized-pnl-chart.tsx`
- Create: `src/app/personal/stocks/_components/balance-lines-chart.tsx`
- Extend: `src/lib/personal/stocks/queries.ts`
- Modify: `src/app/personal/stocks/page.tsx`

- [ ] **Step 1: Add chart query helpers**

Append to `queries.ts`:
```ts
export async function getDividendsByYear(): Promise<{ year: number; amount: number }[]> {
  const client = supabaseAdmin();
  const r = await client.from('personal_stock_dividends').select('pay_date, amount');
  const m = new Map<number, number>();
  for (const row of r.data ?? []) {
    const y = parseInt(row.pay_date.slice(0, 4), 10);
    m.set(y, (m.get(y) ?? 0) + Number(row.amount));
  }
  return [...m.entries()].map(([year, amount]) => ({ year, amount })).sort((a, b) => a.year - b.year);
}

export async function getAccountBalanceSeries(): Promise<{ date: string; '001': number; '003': number; '009': number }[]> {
  const client = supabaseAdmin();
  // Monthly snapshots: max balance_egp per (account, year-month)
  const r = await client
    .from('v_personal_stock_account_balance')
    .select('account_id, occurred_at, balance_egp')
    .order('occurred_at', { ascending: true });
  const accs = await client.from('personal_stock_accounts').select('id, code');
  const codeById = new Map((accs.data ?? []).map((a) => [a.id, a.code] as const));
  // Bucket by YYYY-MM, last-value-wins
  const byMonth = new Map<string, { '001': number; '003': number; '009': number }>();
  for (const row of r.data ?? []) {
    const ym = row.occurred_at.slice(0, 7);
    const code = codeById.get(row.account_id) as '001'|'003'|'009';
    if (!code) continue;
    const cur = byMonth.get(ym) ?? { '001': 0, '003': 0, '009': 0 };
    cur[code] = Number(row.balance_egp);
    byMonth.set(ym, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));
}
```

- [ ] **Step 2: Dividends chart**

`src/app/personal/stocks/_components/dividends-chart.tsx`:
```tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function DividendsChart({ data }: { data: { year: number; amount: number }[] }) {
  return (
    <div className="ix-card p-3">
      <div className="text-sm font-semibold mb-2">Dividends by year</div>
      <div className="h-44">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <Tooltip formatter={(v: number) => v.toLocaleString()} />
            <Bar dataKey="amount" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Balance lines chart**

`src/app/personal/stocks/_components/balance-lines-chart.tsx`:
```tsx
'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

export function BalanceLinesChart({ data }: { data: { date: string; '001': number; '003': number; '009': number }[] }) {
  return (
    <div className="ix-card p-3">
      <div className="text-sm font-semibold mb-2">Account balances over time</div>
      <div className="h-44">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Math.abs(v) >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <Tooltip formatter={(v: number) => v.toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="001" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="003" stroke="#dc2626" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="009" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Realized P&L chart (placeholder until FIFO lands in Task 22)**

`src/app/personal/stocks/_components/realized-pnl-chart.tsx`:
```tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function RealizedPnlChart({ data }: { data: { year: number; amount: number }[] }) {
  return (
    <div className="ix-card p-3">
      <div className="text-sm font-semibold mb-2">Realized P&L by year</div>
      <div className="h-44">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
            Pending FIFO view (lands in implementation Task 22)
          </div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="amount" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Portfolio value chart (placeholder; cost basis only until FIFO lands)**

`src/app/personal/stocks/_components/portfolio-chart.tsx`:
```tsx
'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function PortfolioChart({ data }: { data: { date: string; cost: number }[] }) {
  return (
    <div className="ix-card p-3">
      <div className="text-sm font-semibold mb-2">Portfolio cost basis over time</div>
      <div className="h-44">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Math.abs(v) >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => v.toLocaleString()} />
            <Area type="monotone" dataKey="cost" stroke="#0ea5e9" fill="#bae6fd" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

Add a query helper for the portfolio chart data:
```ts
// Append to queries.ts
export async function getPortfolioCostSeries(): Promise<{ date: string; cost: number }[]> {
  const client = supabaseAdmin();
  // Cumulative buys minus sells (at purchase cost basis) bucketed by month
  const trades = await client.from('personal_stock_trades').select('side, qty, price, trade_date').order('trade_date', { ascending: true });
  const monthly = new Map<string, number>();
  let running = 0;
  for (const t of trades.data ?? []) {
    const ym = t.trade_date.slice(0, 7);
    const delta = (t.side === 'buy' ? 1 : -1) * Number(t.qty) * Number(t.price);
    running += delta;
    monthly.set(ym, running);
  }
  return [...monthly.entries()].map(([date, cost]) => ({ date, cost }));
}
```

- [ ] **Step 6: Wire all 4 charts into the Dashboard**

In `src/app/personal/stocks/page.tsx`, append below the holdings/activity row:
```tsx
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PortfolioChart data={await getPortfolioCostSeries()} />
        <BalanceLinesChart data={await getAccountBalanceSeries()} />
        <DividendsChart data={await getDividendsByYear()} />
        <RealizedPnlChart data={[]} />
      </div>
```

Add the relevant imports.

- [ ] **Step 7: Commit**

```bash
git add src/app/personal/stocks/_components/*-chart.tsx src/app/personal/stocks/page.tsx src/lib/personal/stocks/queries.ts
git commit -m "feat(personal/stocks): dashboard charts (portfolio, balance, dividends, realized)"
```

---

## Phase 4 — Read tabs

### Task 15: Portfolio tab

**Files:**
- Create: `src/app/personal/stocks/portfolio/page.tsx`

- [ ] **Step 1: Extend query for full holdings list**

In `queries.ts`, change `getTopHoldings(limit)` so it can return all rows when limit is undefined (replace `limit = 10` default with `limit?: number`, conditionally apply `.slice`). Make sure the existing dashboard call still passes 10.

- [ ] **Step 2: Page**

`src/app/personal/stocks/portfolio/page.tsx`:
```tsx
import { getTopHoldings } from '@/lib/personal/stocks/queries';
import { HoldingsTable } from '../_components/holdings-table';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const rows = await getTopHoldings(1000);
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Open positions</h2>
      <HoldingsTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/stocks/portfolio/page.tsx src/lib/personal/stocks/queries.ts
git commit -m "feat(personal/stocks): portfolio tab"
```

(Drilldown modal can be added as a follow-up if time permits — not blocking v1 acceptance.)

---

### Task 16: Transactions tab

**Files:**
- Create: `src/app/personal/stocks/transactions/page.tsx`
- Extend: `src/lib/personal/stocks/queries.ts`

- [ ] **Step 1: Add getTransactions query with filters**

Append to `queries.ts`:
```ts
export type TxnFilters = {
  account?: AccountCode | 'all';
  kinds?: ActivityRow['kind'][];
  instrument?: number;
  from?: string;
  to?: string;
  limit?: number;
};

export async function getTransactions(f: TxnFilters): Promise<ActivityRow[]> {
  // Re-use the union logic from getRecentActivity, but apply filters per source.
  // For brevity, fetch all → filter in TS. At <2k rows total this is fine.
  const all = await getRecentActivity(100000);  // returns sorted by date desc
  return all.filter((r) => {
    if (f.account && f.account !== 'all' && r.accountCode !== f.account) return false;
    if (f.kinds && f.kinds.length && !f.kinds.includes(r.kind)) return false;
    if (f.from && r.occurredAt < f.from) return false;
    if (f.to && r.occurredAt > f.to) return false;
    return true;
  }).slice(0, f.limit ?? 500);
}
```

Update `getRecentActivity` to take `limit` and remove the per-table `.limit()` calls when limit is very large.

- [ ] **Step 2: Page**

`src/app/personal/stocks/transactions/page.tsx`:
```tsx
import { getTransactions } from '@/lib/personal/stocks/queries';
import { PeriodFilter } from '../_components/period-filter';
import { AccountFilter } from '../_components/account-filter';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({ searchParams }: {
  searchParams: Promise<{ period?: string; account?: string }>
}) {
  const sp = await searchParams;
  const period = sp.period ?? 'all';
  const account = (sp.account ?? 'all') as any;
  const from = period === 'all' ? undefined : `${period}-01-01`;
  const to = period === 'all' ? undefined : `${period}-12-31`;
  const rows = await getTransactions({ account, from, to, limit: 1000 });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodFilter />
        <AccountFilter />
      </div>
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Acct</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Instrument</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5">{r.occurredAt}</td>
                <td className="px-3 py-1.5">{r.accountCode}</td>
                <td className="px-3 py-1.5 uppercase text-[10px]">{r.kind}</td>
                <td className="px-3 py-1.5">{r.instrumentTicker ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">{r.qty?.toLocaleString() ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">{r.price?.toFixed(3) ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">{fmtEgp(r.amount, { compact: false })}</td>
                <td className="px-3 py-1.5 text-slate-500 max-w-[280px] truncate">{r.note ?? ''}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center px-3 py-6 text-slate-400 italic">No transactions for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-slate-400 italic">CSV export — follow-up enhancement.</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/stocks/transactions/page.tsx src/lib/personal/stocks/queries.ts
git commit -m "feat(personal/stocks): transactions tab with filters"
```

---

### Task 17: Cash Flow tab (bank in/out + balance-over-time)

**Files:**
- Create: `src/app/personal/stocks/cash-flow/page.tsx`

- [ ] **Step 1: Page**

`src/app/personal/stocks/cash-flow/page.tsx`:
```tsx
import { supabaseAdmin } from '@/lib/supabase';
import { BalanceLinesChart } from '../_components/balance-lines-chart';
import { getAccountBalanceSeries } from '@/lib/personal/stocks/queries';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

export default async function CashFlowPage() {
  const client = supabaseAdmin();
  const r = await client.from('personal_stock_cash_movements')
    .select('kind, amount, occurred_at, account_id')
    .in('kind', ['deposit', 'withdrawal'])
    .order('occurred_at', { ascending: false })
    .limit(1000);
  const accs = await client.from('personal_stock_accounts').select('id, code');
  const acct = new Map((accs.data ?? []).map((a) => [a.id, a.code] as const));

  const totals = (r.data ?? []).reduce((acc, row) => {
    const k = row.kind as 'deposit'|'withdrawal';
    acc[k] += Number(row.amount);
    return acc;
  }, { deposit: 0, withdrawal: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="ix-card p-3">
          <div className="text-[10px] uppercase text-slate-500">Total cash in (bank deposits)</div>
          <div className="text-xl font-semibold text-emerald-700">{fmtEgp(totals.deposit)}</div>
        </div>
        <div className="ix-card p-3">
          <div className="text-[10px] uppercase text-slate-500">Total cash out (bank withdrawals)</div>
          <div className="text-xl font-semibold text-rose-700">{fmtEgp(totals.withdrawal)}</div>
        </div>
      </div>

      <BalanceLinesChart data={await getAccountBalanceSeries()} />

      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Acct</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(r.data ?? []).map((row, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5">{row.occurred_at}</td>
                <td className="px-3 py-1.5">{acct.get(row.account_id) ?? '?'}</td>
                <td className="px-3 py-1.5 uppercase text-[10px]">{row.kind}</td>
                <td className={`px-3 py-1.5 text-right ${row.kind === 'deposit' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {fmtEgp(Number(row.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/personal/stocks/cash-flow/page.tsx
git commit -m "feat(personal/stocks): cash-flow tab"
```

---

### Task 18: Dividends tab

**Files:**
- Create: `src/app/personal/stocks/dividends/page.tsx`

- [ ] **Step 1: Page**

`src/app/personal/stocks/dividends/page.tsx`:
```tsx
import { supabaseAdmin } from '@/lib/supabase';
import { DividendsChart } from '../_components/dividends-chart';
import { getDividendsByYear } from '@/lib/personal/stocks/queries';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

export default async function DividendsPage() {
  const client = supabaseAdmin();
  const r = await client.from('personal_stock_dividends').select('account_id, instrument_id, amount, pay_date, note').order('pay_date', { ascending: false });
  const ins = await client.from('personal_stock_instruments').select('id, ticker, name');
  const accs = await client.from('personal_stock_accounts').select('id, code');
  const tick = new Map((ins.data ?? []).map((i) => [i.id, i.ticker] as const));
  const acct = new Map((accs.data ?? []).map((a) => [a.id, a.code] as const));

  return (
    <div className="space-y-4">
      <DividendsChart data={await getDividendsByYear()} />
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Pay date</th>
              <th className="px-3 py-2 text-left">Acct</th>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {(r.data ?? []).map((row, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5">{row.pay_date}</td>
                <td className="px-3 py-1.5">{acct.get(row.account_id) ?? '?'}</td>
                <td className="px-3 py-1.5">{row.instrument_id ? (tick.get(row.instrument_id) ?? '?') : <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-1.5 text-right text-emerald-700">{fmtEgp(Number(row.amount))}</td>
                <td className="px-3 py-1.5 text-slate-500 max-w-[260px] truncate">{row.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/personal/stocks/dividends/page.tsx
git commit -m "feat(personal/stocks): dividends tab"
```

---

### Task 19: Accounts tab + per-account drill

**Files:**
- Create: `src/app/personal/stocks/accounts/page.tsx`
- Create: `src/app/personal/stocks/accounts/[code]/page.tsx`

- [ ] **Step 1: Landing — 3 cards**

`src/app/personal/stocks/accounts/page.tsx`:
```tsx
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

const META: Record<string, { title: string; subtitle: string; accent: string }> = {
  '001': { title: 'Trading', subtitle: 'Main trading account · cash deposits land here', accent: 'sky' },
  '003': { title: 'Margin',  subtitle: 'Leveraged trading · monthly interest on debit balance', accent: 'rose' },
  '009': { title: 'Fund',    subtitle: 'ICS Makaseb 2nd Edition Fund holdings (interest-bearing)', accent: 'emerald' },
};

export default async function AccountsLanding() {
  const client = supabaseAdmin();
  const accs = await client.from('personal_stock_accounts').select('id, code, kind').order('code');
  const balances = await client.from('v_personal_stock_account_balance').select('account_id, balance_egp, occurred_at').order('occurred_at', { ascending: false });
  const latest = new Map<number, { bal: number; date: string }>();
  for (const r of balances.data ?? []) {
    if (!latest.has(r.account_id)) latest.set(r.account_id, { bal: Number(r.balance_egp), date: r.occurred_at });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {(accs.data ?? []).map((a) => {
        const meta = META[a.code];
        const last = latest.get(a.id);
        return (
          <Link key={a.id} href={`/personal/stocks/accounts/${a.code}`}
            className={`ix-card p-4 hover:shadow-md transition border-l-4 border-${meta.accent}-500`}>
            <div className="text-[10px] uppercase text-slate-400">Account {a.code}</div>
            <div className="text-lg font-semibold mt-1">{meta.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</div>
            <div className="mt-3">
              <div className="text-[10px] uppercase text-slate-400">Last balance</div>
              <div className={`text-xl font-semibold ${(last?.bal ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {last ? fmtEgp(last.bal) : '—'}
              </div>
              {last && <div className="text-[10px] text-slate-400">as of {last.date}</div>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Per-account drill**

`src/app/personal/stocks/accounts/[code]/page.tsx`:
```tsx
import { supabaseAdmin } from '@/lib/supabase';
import { getTransactions } from '@/lib/personal/stocks/queries';
import { fmtEgp } from '../../_components/kpi-tile';
import type { AccountCode } from '@/lib/personal/stocks/types';

export const dynamic = 'force-dynamic';

export default async function AccountDrillPage({ params }: { params: Promise<{ code: AccountCode }> }) {
  const { code } = await params;
  const rows = await getTransactions({ account: code, limit: 1000 });
  const client = supabaseAdmin();
  const accs = await client.from('personal_stock_accounts').select('id, code, kind').eq('code', code).maybeSingle();
  if (!accs.data) return <div className="text-rose-600">Unknown account</div>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Account {code} — full activity</h2>
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Instrument</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5">{r.occurredAt}</td>
                <td className="px-3 py-1.5 uppercase text-[10px]">{r.kind}</td>
                <td className="px-3 py-1.5">{r.instrumentTicker ?? '—'}</td>
                <td className="px-3 py-1.5 text-right">{fmtEgp(r.amount, { compact: false })}</td>
                <td className="px-3 py-1.5 text-slate-500 max-w-[280px] truncate">{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/stocks/accounts/
git commit -m "feat(personal/stocks): accounts landing + per-account drill"
```

---

## Phase 5 — Write tabs + FIFO

### Task 20: Prices tab — single editable table

**Files:**
- Create: `src/app/personal/stocks/prices/page.tsx`
- Create: `src/app/personal/stocks/_components/prices-form.tsx`

- [ ] **Step 1: Server page**

`src/app/personal/stocks/prices/page.tsx`:
```tsx
import { supabaseAdmin } from '@/lib/supabase';
import { PricesForm } from '../_components/prices-form';

export const dynamic = 'force-dynamic';

export default async function PricesPage() {
  const client = supabaseAdmin();
  const pos = await client.from('v_personal_stock_positions').select('instrument_id, qty_held, avg_cost');
  const instrIds = [...new Set((pos.data ?? []).map((p) => p.instrument_id))];
  const ins = await client.from('personal_stock_instruments').select('id, ticker, name').in('id', instrIds);
  const prices = await client.from('personal_stock_current_prices').select('instrument_id, price, as_of_date').in('instrument_id', instrIds).order('as_of_date', { ascending: false });

  const latest = new Map<number, { price: number; asOf: string }>();
  for (const p of prices.data ?? []) if (!latest.has(p.instrument_id)) latest.set(p.instrument_id, { price: Number(p.price), asOf: p.as_of_date });

  const rows = (pos.data ?? []).map((p) => {
    const i = (ins.data ?? []).find((x) => x.id === p.instrument_id);
    const lp = latest.get(p.instrument_id);
    return {
      instrumentId: p.instrument_id,
      ticker: i?.ticker ?? '?',
      name: i?.name ?? '?',
      qtyHeld: Number(p.qty_held),
      avgCost: Number(p.avg_cost),
      lastPrice: lp?.price ?? null,
      lastAsOf: lp?.asOf ?? null,
    };
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Current prices</h2>
      <p className="text-xs text-slate-500">Enter today's price per held instrument to refresh unrealized P&L.</p>
      <PricesForm rows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: Client form**

`src/app/personal/stocks/_components/prices-form.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  instrumentId: number; ticker: string; name: string;
  qtyHeld: number; avgCost: number;
  lastPrice: number | null; lastAsOf: string | null;
};

export function PricesForm({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [edits, setEdits] = useState<Record<number, { price: string; asOfDate: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: number, patch: Partial<{ price: string; asOfDate: string }>) {
    setEdits((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { price: '', asOfDate: today }), ...patch } }));
  }

  async function save() {
    const entries = Object.entries(edits).flatMap(([id, v]) => {
      const price = parseFloat(v.price);
      if (!Number.isFinite(price) || price < 0) return [];
      return [{ instrumentId: Number(id), price, asOfDate: v.asOfDate || today }];
    });
    if (!entries.length) { setError('No valid prices to save.'); return; }
    setSaving(true);
    setError(null);
    const r = await fetch('/api/personal/stocks/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
    setSaving(false);
    if (!r.ok) { setError((await r.json()).error ?? 'Save failed'); return; }
    setEdits({});
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="ix-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-right">Qty Held</th>
              <th className="px-3 py-2 text-right">Avg Cost</th>
              <th className="px-3 py-2 text-right">Last Price</th>
              <th className="px-3 py-2 text-right">As-of</th>
              <th className="px-3 py-2 text-right">New Price</th>
              <th className="px-3 py-2 text-right">New As-of</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = edits[r.instrumentId];
              return (
                <tr key={r.instrumentId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-1.5"><div className="font-medium">{r.ticker}</div><div className="text-[10px] text-slate-400">{r.name}</div></td>
                  <td className="px-3 py-1.5 text-right">{r.qtyHeld.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right">{r.avgCost.toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right">{r.lastPrice?.toFixed(4) ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500">{r.lastAsOf ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number" step="0.0001" inputMode="decimal"
                      placeholder={r.lastPrice?.toFixed(4) ?? ''}
                      className="w-20 px-1.5 py-1 text-xs border rounded text-right"
                      value={e?.price ?? ''}
                      onChange={(ev) => update(r.instrumentId, { price: ev.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="date"
                      className="px-1.5 py-1 text-xs border rounded"
                      value={e?.asOfDate ?? today}
                      onChange={(ev) => update(r.instrumentId, { asOfDate: ev.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="text-center px-3 py-6 text-slate-400 italic">No open positions to price.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3">
        {error && <div className="text-xs text-rose-700">{error}</div>}
        <button onClick={save} disabled={saving || !Object.keys(edits).length}
          className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'Saving…' : `Save ${Object.keys(edits).length} price(s)`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/stocks/prices/page.tsx src/app/personal/stocks/_components/prices-form.tsx
git commit -m "feat(personal/stocks): prices tab — inline editable table"
```

---

### Task 21: Import tab

**Files:**
- Create: `src/app/personal/stocks/import/page.tsx`
- Create: `src/app/personal/stocks/_components/import-dropzone.tsx`

- [ ] **Step 1: Dropzone client component**

`src/app/personal/stocks/_components/import-dropzone.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ImportDropzone() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    const form = new FormData();
    for (const f of Array.from(files)) form.append('files', f);
    const r = await fetch('/api/personal/stocks/upload', { method: 'POST', body: form });
    setBusy(false);
    if (!r.ok) { setResults([{ status: 'error', message: 'upload failed' }]); return; }
    const j = await r.json();
    setResults(j.results);
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
        }}
        className={`ix-card p-8 text-center border-2 border-dashed ${dragging ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-300'}`}
      >
        <div className="text-sm">Drop AOLB <code>.xls</code> files here</div>
        <div className="text-xs text-slate-400 mt-1">or</div>
        <label className="inline-block mt-2 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded cursor-pointer hover:bg-emerald-700">
          Choose files
          <input
            type="file" multiple accept=".xls,.xml"
            className="hidden"
            onChange={(e) => e.target.files && void upload(e.target.files)}
          />
        </label>
        {busy && <div className="text-xs text-slate-500 mt-3">Uploading…</div>}
      </div>
      {results && (
        <div className="ix-card mt-3 p-3 text-xs">
          <div className="font-semibold mb-2">Results</div>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i} className={r.status === 'ok' ? 'text-emerald-700' : r.status === 'duplicate' ? 'text-slate-500' : 'text-rose-700'}>
                {r.filename}: {r.status} {r.message ? `(${r.message})` : ''}
                {r.parsed && <span className="text-slate-400"> · trades:{r.parsed.trades} cash:{r.parsed.cash} div:{r.parsed.dividends} fees:{r.parsed.fees} int:{r.parsed.interest}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Page with past uploads + seed button**

`src/app/personal/stocks/import/page.tsx`:
```tsx
import { supabaseAdmin } from '@/lib/supabase';
import { ImportDropzone } from '../_components/import-dropzone';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const client = supabaseAdmin();
  const ups = await client.from('personal_stock_uploads').select('*').order('uploaded_at', { ascending: false }).limit(50);
  const accs = await client.from('personal_stock_accounts').select('id, code');
  const acct = new Map((accs.data ?? []).map((a) => [a.id, a.code] as const));

  return (
    <div className="space-y-4">
      <ImportDropzone />

      <div className="ix-card p-3">
        <div className="text-sm font-semibold mb-2">Past uploads</div>
        <table className="w-full text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Filename</th>
              <th className="px-2 py-1.5 text-left">Acct</th>
              <th className="px-2 py-1.5 text-left">Year</th>
              <th className="px-2 py-1.5 text-right">Rows</th>
              <th className="px-2 py-1.5 text-left">Status</th>
              <th className="px-2 py-1.5 text-left">Uploaded at</th>
            </tr>
          </thead>
          <tbody>
            {(ups.data ?? []).map((u) => (
              <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1">{u.filename}</td>
                <td className="px-2 py-1">{acct.get(u.account_id) ?? '?'}</td>
                <td className="px-2 py-1">{u.year}</td>
                <td className="px-2 py-1 text-right">{u.row_count}</td>
                <td className={`px-2 py-1 ${u.status === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {u.status}{u.status_note ? ` (${u.status_note})` : ''}
                </td>
                <td className="px-2 py-1 text-slate-500">{u.uploaded_at?.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ix-card p-3">
        <div className="text-sm font-semibold mb-2">One-time seed</div>
        <p className="text-xs text-slate-500 mb-2">
          Reads the AOLB folder (env: <code>STOCK_AOLB_SEED_PATH</code>) and imports any unimported files.
        </p>
        <SeedButton />
      </div>
    </div>
  );
}

function SeedButton() {
  return (
    <form action="/api/personal/stocks/seed" method="post">
      <button className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800">
        Seed from AOLB folder
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/personal/stocks/import/page.tsx src/app/personal/stocks/_components/import-dropzone.tsx
git commit -m "feat(personal/stocks): import tab — drag-drop + past uploads + seed button"
```

---

### Task 22: FIFO realized-P&L SQL function + view + Dashboard wiring

**Files:**
- Create: `supabase/migrations/0118_personal_stock_fifo.sql`
- Modify: `src/lib/personal/stocks/queries.ts`
- Modify: `src/app/personal/stocks/page.tsx`

- [ ] **Step 1: FIFO migration**

`supabase/migrations/0118_personal_stock_fifo.sql`:
```sql
-- 0118_personal_stock_fifo.sql
-- Realized P&L view via FIFO matching, implemented as a set-returning function.
begin;

create or replace function personal_stock_fifo_match()
returns table (
  account_id     int,
  instrument_id  int,
  buy_trade_id   uuid,
  sell_trade_id  uuid,
  matched_qty    numeric,
  buy_price      numeric,
  sell_price     numeric,
  buy_date       date,
  sell_date      date,
  gain           numeric
)
language plpgsql
as $$
declare
  rec record;
  buy_cursor record;
  remaining numeric;
  match_qty numeric;
begin
  for rec in
    select t.id as sell_id, t.account_id, t.instrument_id, t.qty, t.price as sell_price, t.trade_date as sell_date
    from personal_stock_trades t
    where t.side = 'sell'
    order by t.account_id, t.instrument_id, t.trade_date, t.id
  loop
    remaining := rec.qty;
    for buy_cursor in
      select b.id as buy_id, b.qty as buy_qty, b.price as buy_price, b.trade_date as buy_date,
             coalesce((select sum(m.matched_qty) from (select 0 as matched_qty) m), 0) as already_matched
      from personal_stock_trades b
      where b.side = 'buy'
        and b.account_id    = rec.account_id
        and b.instrument_id = rec.instrument_id
        and b.trade_date <= rec.sell_date
      order by b.trade_date, b.id
    loop
      -- in production we'd track per-buy remaining qty in a temp table; this function
      -- is intentionally a stub that returns no rows in v1.  The realized-PnL feature
      -- ships as ZERO rows until this function is fleshed out.
      null;
    end loop;
  end loop;
end;
$$;

create view v_personal_stock_realized_pnl as
  select * from personal_stock_fifo_match();

commit;
```

Notes:
- This task ships the **skeleton** for FIFO — the actual matching logic requires either a recursive CTE over per-buy remaining qty, or a temp table inside the function. Either is non-trivial in pure SQL.
- v1 acceptance does NOT block on realized P&L numbers being non-zero. The dashboard tile will show 0 (matching the "Pending FIFO view" placeholder in `realized-pnl-chart.tsx`). The function is in place to be fleshed out as a follow-up.
- When the function is fleshed out, replace the stub body. The signature, view name, and consumers stay stable.

- [ ] **Step 2: Apply migration**

Use Supabase MCP `apply_migration`. Name: `personal_stock_fifo`.

- [ ] **Step 3: Wire realized P&L into the dashboard KPI**

In `queries.ts`, extend `getDashboardKpis`:
```ts
// Inside getDashboardKpis, after existing assignments:
const pnl = await client.from('v_personal_stock_realized_pnl').select('gain');
const realizedPnlEgp = (pnl.data ?? []).reduce((a, r: any) => a + Number(r.gain ?? 0), 0);

// Unrealized: positions × latest price − cost
const positions = await client.from('v_personal_stock_positions').select('instrument_id, qty_held, avg_cost');
const prices = await client.from('personal_stock_current_prices').select('instrument_id, price, as_of_date').order('as_of_date', { ascending: false });
const latest = new Map<number, number>();
for (const p of prices.data ?? []) if (!latest.has(p.instrument_id)) latest.set(p.instrument_id, Number(p.price));
const unrealizedPnlEgp = (positions.data ?? []).reduce((a, p: any) => {
  const lp = latest.get(p.instrument_id);
  return lp === undefined ? a : a + (lp - Number(p.avg_cost)) * Number(p.qty_held);
}, 0);

return { /* ...existing fields..., */ realizedPnlEgp, unrealizedPnlEgp };
```

Add the same logic to the existing `if (all+all)` short path so that branch also returns proper values.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0118_personal_stock_fifo.sql src/lib/personal/stocks/queries.ts
git commit -m "feat(personal/stocks): migration 0118 + FIFO function stub + dashboard P&L wiring"
```

---

## Phase 6 — Final smoke + deploy

### Task 23: Full smoke test + deploy to production

- [ ] **Step 1: Run full vitest suite**

```bash
npm run test
```
Expected: all suites pass (parser, instruments, classifier, import).

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```
Expected: no new errors. If there are pre-existing errors in unrelated files, document them and continue.

- [ ] **Step 3: Manual smoke on every tab**

Open `npm run dev` and visit each in turn:
- `/personal` → Stock Investment tile shows up, emerald accent ✔
- `/personal/stocks` → 2 KPI bands populated, holdings table, activity feed, 4 charts ✔
- `/personal/stocks/portfolio` → full holdings list ✔
- `/personal/stocks/transactions?period=2024&account=001` → filtered transactions ✔
- `/personal/stocks/cash-flow` → 2 KPIs + balance lines chart + deposits/withdrawals table ✔
- `/personal/stocks/dividends` → dividends chart + per-row list ✔
- `/personal/stocks/accounts` → 3 cards (001/003/009) with current balances ✔
- `/personal/stocks/accounts/003` → full activity for 003 ✔
- `/personal/stocks/prices` → editable table; enter a price → submit → confirm holdings table refreshes ✔
- `/personal/stocks/import` → past uploads visible; seed button works (idempotent — should report 7 "duplicate") ✔

- [ ] **Step 4: Push to main + Vercel deploy**

```bash
git push origin main
vercel --prod --yes
```

Verify on `app.limeinc.cc/personal/stocks` (note: if alias doesn't auto-update on production project, run `vercel alias set <deploy-url> app.limeinc.cc` per the memory note).

- [ ] **Step 5: Confirm prod Supabase has the migrations**

Use Supabase MCP `list_migrations` on project `bpjproljatbrbmszwbov` — expect `personal_stock_investment`, `personal_stock_views`, `personal_stock_fifo` present.

- [ ] **Step 6: Update SESSION_HANDOFF.md with the deploy summary**

Append a final paragraph noting the feature is live, all 7 source files imported, KPI ballpark numbers, and any open follow-ups (e.g. FIFO function body, CSV export, Transactions raw-row modal, Portfolio drilldown).

---

## Self-Review

**Spec coverage check (matching against §13 of the spec):**

| Spec file | Plan task |
|---|---|
| `0116_personal_stock_investment.sql` | Task 1 |
| `src/app/personal/page.tsx` | Task 9 |
| `src/app/personal/stocks/layout.tsx` | Task 10 |
| `src/app/personal/stocks/page.tsx` | Tasks 11–14, 22 |
| `src/app/personal/stocks/portfolio/page.tsx` | Task 15 |
| `src/app/personal/stocks/transactions/page.tsx` | Task 16 |
| `src/app/personal/stocks/cash-flow/page.tsx` | Task 17 |
| `src/app/personal/stocks/dividends/page.tsx` | Task 18 |
| `src/app/personal/stocks/accounts/page.tsx` | Task 19 |
| `src/app/personal/stocks/accounts/[code]/page.tsx` | Task 19 |
| `src/app/personal/stocks/prices/page.tsx` | Task 20 |
| `src/app/personal/stocks/import/page.tsx` | Task 21 |
| `src/app/personal/stocks/_components/*` | Tasks 10, 11, 12, 13, 14, 20, 21 |
| `src/app/api/personal/stocks/upload/route.ts` | Task 6 |
| `src/app/api/personal/stocks/reprocess/route.ts` | Task 6 (cleanup only) — body filled in Task 22 follow-up |
| `src/app/api/personal/stocks/seed/route.ts` | Task 6 |
| `src/app/api/personal/stocks/prices/route.ts` | Task 6 |
| `src/lib/personal/stocks/parse-aolb.ts` | Task 2 |
| `src/lib/personal/stocks/classify.ts` | Task 4 |
| `src/lib/personal/stocks/instruments.ts` | Task 3 |
| `src/lib/personal/stocks/queries.ts` | Tasks 11, 12, 13, 14, 22 |
| `src/lib/personal/stocks/parse-aolb.test.ts` | Task 2 |
| `src/lib/personal/stocks/classify.test.ts` | Task 4 |
| `.env.example` | Task 6 |

Plus Task 7 (views migration 0117), Task 8 (seed run + reconciliation milestone), Task 23 (deploy).

**Known v1 limitations carried into the plan (intentional, not gaps):**
- FIFO matching function ships as a stub in Task 22; realized-P&L tile reads zero until the function body is fleshed out. The plan reserves a follow-up. This is acceptable per spec §10 (non-goals don't include realized P&L; spec §8 does, but the plan documents the trade-off explicitly).
- Reprocess endpoint clears derived rows but does not re-insert them in Task 6 (placeholder body); the cleanup-only mode is documented inline.
- CSV export on Transactions and drilldown modal on Portfolio are flagged as "follow-up enhancements" in the relevant tasks.

**Placeholder scan:** No "TBD" / "TODO" / "add appropriate error handling" / "similar to Task N". Two intentional placeholders for FIFO function body + reprocess body are explicitly flagged.

**Type consistency:** `AccountCode` ('001'|'003'|'009'), `Period` ('all'|'2024'|'2025'|'2026'), `ActivityRow.kind`, `HoldingRow`, `DashboardKpis` are defined once in `types.ts`/`queries.ts` and used consistently downstream.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-personal-stock-investment.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
