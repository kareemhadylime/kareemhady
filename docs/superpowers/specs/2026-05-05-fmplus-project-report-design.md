# FM+ Project Report Tab — Design Spec

**Date:** 2026-05-05
**Author:** Claude (Opus 4.7) with kareemhady
**Status:** Design approved (all 5 sections + brand retrofit scope confirmed). Pending spec review before writing-plans phase.

---

## 1. Overview

Add a new **Project Report** tab to the FM+ Project Budget module (`/fmplus/financial/budget/`). The tab renders a management-grade dashboard view of a single (contract, year, scenario) combination and exports it as an A4 PDF. It is the artifact that escorts a budget through approval, gets sent to customers as a quotation, or anchors a periodic ops review.

The same component generates four distinct audience modes from one underlying data source — each mode controls field visibility per a strict matrix.

**Bundled with this work:** retrofit of the entire FM+ module's branding (logo, colors, fonts) to match the official 2025 rebranding guidelines, since the existing `fmplus-logo.tsx` and amber palette in use across `/fmplus/*` are wrong.

## 2. Out of Scope (this spec)

- Server-side caching of generated PDFs (v2 enhancement; every load currently re-aggregates).
- Digital sign-off via on-page action button writing to `project_year_signoffs` (v1 stores the row but only the printed signature lines are filled in physically; in-app sign-off button is v2).
- Forwarding the PDF via email directly from the export dialog (v2; v1 = browser download only).
- Project Report appearing in cron / scheduled reports.
- Multi-contract portfolio rollup (this spec covers a single contract; portfolio-level reporting is a separate effort).
- Annual increasing percentage (inflation) modelling beyond what `inflation-calc.ts` already provides.
- Editing `payment_terms` / `customer_contacts` / `scope_summary` from anywhere other than the existing `EditContractForm`.

## 3. Brainstorm decisions (Q1–Q8)

Decisions captured during brainstorm, recorded here so the spec is self-contained.

| # | Decision | Choice |
|---|---|---|
| Q1 | Audience scope | **E** — Multi-mode toggle (Pre-contract / Sign-off / Customer / Snapshot) |
| Q2 | Default mode + permission | **B + 1** — Sign-off is default; anyone with budget-view can switch any mode |
| Q3 | Year scope | **C** — Per-year by default; auto-append "Contract Rollup" page if multi-year |
| Q4 | Year status gate | **B** — Status pill in header (DRAFT amber / PUBLISHED green); no diagonal watermark |
| Q5 | Comparison view | **A** — Auto "Change vs Initial" section when scenario != initial |
| Q6 | Page format | **C** — Mixed orientation (portrait main pages, landscape for budget/manning detail) |
| Q7 | Bilingual | **B** — Export dialog has [ EN / AR / Both stacked ] picker independent of on-screen toggle |
| Q8 | Field visibility matrix | Confirmed (see §10); customer mode strips ALL cost detail; admin uploads customer logo; sign-off blocks 2 lines per mode; customer-facing blocks export when year is draft |

Architecture: **Approach 1** — `@react-pdf/renderer` + parallel HTML tree, sharing one data function `buildProjectReport(...)`. Same library as existing `variance-pdf.tsx`. Supports per-page orientation for Q6-C.

Brand retrofit scope: **B** — Bundle FM+ module retrofit with the Project Report work in one plan (Phases A → B+C parallel).

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Browser                             │
│  ┌────────────────────┐    ┌────────────────────────┐   │
│  │ Tab: /report       │    │ Modal: Export Dialog   │   │
│  │ <OnScreenReport/>  │    │ pick lang → POST       │   │
│  │ (Tailwind, scroll) │    │                        │   │
│  └────────────────────┘    └────────────────────────┘   │
│           │                          │                   │
└───────────┼──────────────────────────┼───────────────────┘
            │ fetch                    │ POST blob
            ▼                          ▼
┌──────────────────────────────────────────────────────────┐
│  Next.js Server (Vercel)                                 │
│                                                          │
│  /report/[contractId]/page.tsx (RSC)                    │
│       │                                                  │
│       ▼                                                  │
│  buildProjectReport(contractId, yearId, mode, lang)     │
│       │  (parallel queries)                              │
│       ▼                                                  │
│  ReportData (shaped + visibility-stripped)              │
│       │                                                  │
│       ├──→ <OnScreenReport/>     (HTML render)          │
│       └──→ <ProjectReportDocument/>                     │
│                  (renderToBuffer → PDF blob)             │
└──────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase (project_contracts, project_years, etc.)      │
│  + storage bucket "customer-logos"                       │
└──────────────────────────────────────────────────────────┘
```

### Key invariants
1. **Data function is single source of truth.** Both HTML and PDF trees consume `ReportData`; no UI logic ever queries Supabase directly.
2. **Defense-in-depth visibility strip.** Customer-mode field hiding happens at data layer (fields literally absent), not just at render. Eliminates accidental cost-data leaks via component bugs.
3. **PDF generation is server-side.** Buffer returned via Next.js route handler; no client-side print dialog. Enables draft-export blocking, allows server-only audit logging.
4. **Bilingual is a render-time concern.** Data layer always returns both `label_en` and `label_ar`; `lang` parameter only affects the React tree.

## 5. File Structure

```
src/lib/fmplus/budget/report/
├── build-report.ts          buildProjectReport(...) entry + sub-helpers
├── types.ts                 ReportData, SectionData, ReportMode, ReportLang
├── visibility.ts            applyVisibility(data, mode) — defense-in-depth strip
├── theme.ts                 PDF_THEME constants (real FM+ brand colors + fonts)
├── pdf-document.tsx         <ProjectReportDocument> top-level
├── pdf-pages/
│   ├── cover-hero.tsx
│   ├── project-details.tsx
│   ├── service-line-summary.tsx
│   ├── manning-table.tsx               (landscape)
│   ├── budget-breakdown.tsx            (landscape)
│   ├── mobilization.tsx
│   ├── payment-terms.tsx
│   ├── change-vs-initial.tsx           (conditional)
│   ├── variance-snapshot.tsx           (conditional, mode=snapshot)
│   ├── sign-off.tsx
│   └── contract-rollup.tsx             (conditional, multi-year)
├── pdf-shared/
│   ├── pdf-header.tsx                   (FM+ logo + customer logo + status pill)
│   ├── pdf-footer.tsx                   (page X of Y + generated meta)
│   ├── label-dual.tsx                   (bilingual EN / AR / both stacked)
│   └── status-pill.tsx
└── on-screen/
    ├── on-screen-report.tsx
    └── sections/                         (mirror of pdf-pages/, Tailwind-styled)

src/app/fmplus/financial/budget/report/
├── page.tsx                              tab landing — contract picker grid
├── [contractId]/
│   ├── page.tsx                          renders <OnScreenReport>
│   ├── _components/
│   │   ├── report-mode-toggle.tsx
│   │   ├── report-year-picker.tsx
│   │   └── report-export-dialog.tsx
│   └── actions.ts
└── _components/
    └── empty-state.tsx

src/app/api/fmplus/budget/report/[contractId]/[yearId]/pdf/
└── route.ts                              GET → application/pdf (renderToBuffer)

src/lib/fmplus/brand.ts                   shared brand tokens (colors + font references)
src/app/fmplus/_components/
├── fmplus-logo.tsx                      REBUILT as 4-quadrant geometric "+" monogram
└── fmplus-hero.tsx                      RETROFIT with real brand tokens

supabase/migrations/
├── 0083_fmplus_budget_report_columns.sql      ALTER project_contracts + new tables
└── 0084_fmplus_brand_storage_bucket.sql       (or via Supabase dashboard)
```

Tab strip update — add 9th tab in `BudgetTabStrip`:

```ts
{ id: 'report', label: 'Report', href: '/fmplus/financial/budget/report', Icon: FileText, ... }
```

Position: between Variance and Compare.

## 6. Data Model Changes

### 6.1 Migration `0083_fmplus_budget_report_columns.sql`

```sql
-- New columns on project_contracts
ALTER TABLE public.project_contracts
  ADD COLUMN customer_logo_url   text,
  ADD COLUMN customer_contacts   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN payment_terms       text,
  ADD COLUMN scope_summary       text;

-- Sign-off history
CREATE TABLE public.project_year_signoffs (
  id           bigserial PRIMARY KEY,
  year_id      bigint NOT NULL REFERENCES public.project_years(id) ON DELETE CASCADE,
  signed_by    uuid NOT NULL REFERENCES auth.users(id),
  signed_role  text NOT NULL CHECK (signed_role IN
                  ('project_manager','finance_director','fmplus_signatory','customer_signatory')),
  signed_at    timestamptz NOT NULL DEFAULT now(),
  mode         text NOT NULL CHECK (mode IN ('pre','signoff','customer','snapshot')),
  notes        text
);
CREATE INDEX project_year_signoffs_year_idx ON public.project_year_signoffs (year_id, signed_at DESC);

-- Export audit log
CREATE TABLE public.budget_report_exports (
  id          bigserial PRIMARY KEY,
  year_id     bigint NOT NULL REFERENCES public.project_years(id) ON DELETE CASCADE,
  contract_id bigint NOT NULL REFERENCES public.project_contracts(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('pre','signoff','customer','snapshot')),
  lang        text NOT NULL CHECK (lang IN ('en','ar','both')),
  exported_by uuid NOT NULL REFERENCES auth.users(id),
  exported_at timestamptz NOT NULL DEFAULT now(),
  user_agent  text
);
CREATE INDEX budget_report_exports_year_idx ON public.budget_report_exports (year_id, exported_at DESC);
CREATE INDEX budget_report_exports_contract_idx ON public.budget_report_exports (contract_id, exported_at DESC);
```

### 6.2 `customer_contacts` JSONB shape

```ts
{
  name: string;
  role: string;
  email: string;
  phone: string;
  primary: boolean;     // exactly one entry should have primary: true
}[]
```

PDF renders up to 3 contacts (primary first, then by `id` order); `+N more` collapses overflow on screen.

### 6.3 Storage bucket

```
Bucket name:  customer-logos
Public:       yes (logos may circulate externally on customer-facing PDFs)
Path:         customer-logos/{contract_id}.{ext}
Allowed:      image/png, image/jpeg, image/svg+xml
Size cap:     2 MB
Upload via:   existing direct-to-Supabase signed-URL pattern (CLAUDE.md "Image uploads")
```

### 6.4 Schema updates

`src/lib/fmplus/budget/schema.ts`:
- Extend `ProjectContractSchema` with the 4 new fields (all optional except `customer_contacts` defaults `[]`).
- Add `CustomerContactSchema` validating `{name, role, email, phone, primary}`.
- Add `ProjectYearSignoffSchema` and `BudgetReportExportSchema`.

## 7. Data Aggregation: `buildProjectReport`

```ts
// src/lib/fmplus/budget/report/build-report.ts

export type ReportMode = 'pre' | 'signoff' | 'customer' | 'snapshot';
export type ReportLang = 'en' | 'ar' | 'both';

export interface BuildReportInput {
  contract_id: number;
  year_id: number;
  mode: ReportMode;
  lang: ReportLang;
}

export async function buildProjectReport(input: BuildReportInput): Promise<ReportData> {
  // 1-7: parallel loads
  const [contract, year, yearServices, lines, mob, signoffs] = await Promise.all([
    loadContract(input.contract_id),
    loadYear(input.year_id),
    loadYearServices(input.year_id),
    loadBudgetLines(input.year_id),
    loadMobilization(input.contract_id),
    loadSignoffs(input.year_id),
  ]);

  // 7. (conditional) Initial sibling for delta
  const initialLines = year.scenario !== 'initial'
    ? await loadInitialSiblingLines(input.contract_id, year.year_index)
    : null;

  // 8. (conditional) All-years rollup
  const allYears = await loadAllYearsForContract(input.contract_id);
  const rollupLines = allYears.length > 1
    ? await loadAllYearsLines(allYears.map(y => y.id))
    : null;

  // 9. Aggregate
  const data: ReportData = aggregate({
    contract, year, yearServices, lines, mob, signoffs,
    initialLines, allYears, rollupLines,
    mode: input.mode, lang: input.lang,
  });

  // 10. Apply visibility strip (defense-in-depth for customer mode)
  return applyVisibility(data, input.mode);
}
```

`ReportData` shape (full type in `types.ts`):

```ts
interface ReportData {
  meta: {
    contract: ContractInfo;
    year: YearInfo;
    mode: ReportMode;
    lang: ReportLang;
    generated_at: string;
    generated_by: string;
  };
  project_details: ProjectDetailsSection;
  service_lines: ServiceLineSummarySection;
  manning: ManningSection;
  budget_breakdown: BudgetBreakdownSection;
  mobilization: MobilizationSection | null;
  payment_terms: PaymentTermsSection | null;
  change_vs_initial: ChangeSection | null;
  variance_snapshot: VarianceSection | null;
  contract_rollup: ContractRollupSection | null;
  signoff: SignoffSection;
}
```

### `applyVisibility` strip rules per mode

| Field path | pre | signoff | customer | snapshot |
|---|:-:|:-:|:-:|:-:|
| `budget_breakdown.lines[*].unit_cost` | ✅ | ✅ | ❌ delete | ✅ |
| `budget_breakdown.lines[*].qty` | ✅ | ✅ | ❌ delete | ✅ |
| `budget_breakdown.lines[*].ctc_*` | ✅ | ✅ | ❌ delete | ✅ |
| `manning.*.hc_budgeted` | ✅ | ✅ | ❌ delete | ✅ |
| `service_lines.*.gp_pct` and `.gp_egp` | ✅ | ✅ | ❌ delete | ✅ |
| `mobilization.lines[]` (full detail) | ✅ | ✅ | ❌ replaced with `{summary_text, total_egp}` | ✅ |
| `change_vs_initial` | ❌ null | ✅ if scenario != initial | ❌ null | ❌ null |
| `payment_terms` | ⚠️ "proposed" badge | ✅ | ✅ | ❌ null |
| `variance_snapshot` | ❌ null | ❌ null | ❌ null | ✅ |

### Performance

- TRIO single-year (159 budget lines) ≈ 8 queries, target <300ms aggregate (p95).
- City Gate multi-year (3 years × ~150 lines each) ≈ +1 query for rollup, target <500ms.
- No v1 caching. Every load re-aggregates.

### Tests (`build-report.test.ts`)

```
✓ signoff mode returns full cost detail
✓ customer mode strips ctc_rate from every budget line
✓ customer mode strips gp_pct
✓ customer mode collapses mobilization to summary
✓ change_vs_initial null when scenario=initial
✓ change_vs_initial populated when scenario=revised + initial sibling exists
✓ change_vs_initial null when scenario=revised but no initial sibling exists
✓ contract_rollup null on single-year contract
✓ contract_rollup populated on multi-year contract
✓ payment_terms null in snapshot mode
✓ every label has both label_en and label_ar
```

## 8. PDF Page Layout

Top-level `<ProjectReportDocument>` composes pages by mode + scenario. Each `<Page>` declares its orientation explicitly. Header + footer rendered on every page via shared components.

| # | Page | Orientation | pre | signoff | customer | snapshot |
|---|---|---|:-:|:-:|:-:|:-:|
| 1 | Cover / KPI Hero | portrait | ✅ | ✅ | ✅ | ✅ |
| 2 | Project Details | portrait | ✅ | ✅ | ✅ | ✅ |
| 3 | Service Line Summary | portrait | ✅ | ✅ | ✅ (offer/fee view) | ✅ |
| 4 | Manning Detail | **landscape** | ✅ | ✅ | ✅ (HC required only, sub-section roll-up) | ✅ |
| 5 | Budget Breakdown Matrix (per-cat × per-svc cost grid) | **landscape** | ✅ | ✅ | ❌ HIDDEN (cost-leak risk) | ✅ |
| 6 | Mobilization | portrait | ✅ if exists | ✅ if exists | ⚠️ collapsed to single summary line | ✅ if exists |
| 7 | Payment Terms | portrait | ⚠️ "proposed" badge | ✅ if exists | ✅ if exists | ❌ HIDDEN |
| 8 | Change vs Initial | portrait | ❌ | ✅ if scenario != initial | ❌ | ❌ |
| 9 | Variance Snapshot | portrait | ❌ | ❌ | ❌ | ✅ |
| 10 | Sign-off Block (2 lines) | portrait | ❌ | ✅ (PM + Finance Director) | ✅ (FMPlus + Customer Signatory) | ❌ |
| 11 | Contract Rollup | portrait | ✅ if multi-year | ✅ if multi-year | ✅ if multi-year (offer/fee view) | ✅ if multi-year |

**Page-count expectation by mode:**
- Single-year, signoff, initial scenario, mobilization exists → **8 pages** (1+2+3+4+5+6+7+10)
- Single-year, signoff, revised scenario, mobilization exists → **9 pages** (+8 Change vs Initial)
- Multi-year, signoff → **10 pages** (+11 Rollup)
- Single-year, customer mode, mobilization exists → **6 pages** (1+2+3+4+6+7+10; skips 5)
- Single-year, snapshot mode, mobilization exists → **7 pages** (1+2+3+4+5+6+9; skips 7+10)

**Customer-mode "Service Line Summary" (page 3) — offer/fee view:**

Customer mode replaces the cost-detail breakdown with a fees-only table. The "monthly fee" customer pays per service line is derived from contract-level math:

```
service_line_monthly_fee = contract_value
                         × (service_line_annual_cost / contract_total_annual_cost)
                         / 12
```

I.e., the contract value is allocated to service lines proportionally to their cost share, then divided by 12. This avoids exposing per-line offer rate computation while still giving customer a clear breakdown of "what am I paying for HK vs MEP vs LS."

The table:

| Service Line | HC Required | Monthly Fee | Annual Fee Ex VAT | Annual Incl VAT |
|---|---:|---:|---:|---:|
| Housekeeping | 60 | 1,032,614 | 12,391,373 | 14,126,165 |
| MEP | 30 | 1,180,986 | 14,171,832 | 16,155,888 |
| ... | ... | ... | ... | ... |
| **Total** | **120** | **2,876,287** | **34,510,421** | **39,341,880** |

Internal modes (pre/signoff/snapshot) show the cost-detail version: HC required + budgeted, monthly cost, GP %, GP EGP per service line.

### Page header (every page)

```
┌─────────────────────────────────────────────────────────┐
│  [FM+ Logo]                          [Customer Logo*]   │  *only mode=customer
│  TRIO COMPOUND · Sign-off · DRAFT                       │
└─────────────────────────────────────────────────────────┘
```

### Page footer (every page)

```
Generated by kareemhady · 2026-05-05 14:32  ·  Page 4 of 9
```

`@react-pdf/renderer` `render={({pageNumber, totalPages}) => ...}` for the dynamic page count.

## 9. FM+ Brand Tokens (real brand)

`src/lib/fmplus/brand.ts`:

```ts
export const FMPLUS_BRAND = {
  colors: {
    yellow:    '#FDCF00',  // primary — vibrant
    gold:      '#EEB91D',  // accent — deeper for hierarchy
    black:     '#000000',  // anchor
    greyDark:  '#8A867F',  // warm taupe — supportive contrast
    greyLight: '#D4D4D4',  // neutral base
  },
  fonts: {
    display: 'Lalezar',           // headlines
    serif:   'DM Serif Display',  // primary text + subheadings
    body:    'Lato',              // body text
    arabic:  'NotoSansArabic',    // Arabic content fallback
  },
  logo: {
    aspect: 4.19 / 5.19,          // locked per brand guidelines
  },
} as const;
```

### Tailwind v4 theme additions (`globals.css`)

```css
@theme {
  --color-fmplus-yellow:     #FDCF00;
  --color-fmplus-gold:       #EEB91D;
  --color-fmplus-black:      #000000;
  --color-fmplus-grey-dark:  #8A867F;
  --color-fmplus-grey-light: #D4D4D4;

  --font-display: var(--font-lalezar);
  --font-serif:   var(--font-dm-serif);
  --font-body:    var(--font-lato);
}
```

### Google Fonts via `next/font/google` (root `layout.tsx`)

```ts
import { Lalezar, DM_Serif_Display, Lato } from 'next/font/google';

const lalezar = Lalezar({ subsets: ['latin', 'arabic'], weight: '400', variable: '--font-lalezar' });
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-dm-serif' });
const lato    = Lato({ subsets: ['latin'], weight: ['400','700','900'], variable: '--font-lato' });
```

### `@react-pdf/renderer` Font registration

```ts
// src/lib/fmplus/budget/report/theme.ts
import { Font } from '@react-pdf/renderer';

Font.register({ family: 'Lalezar',          src: '/fonts/Lalezar-Regular.ttf' });
Font.register({ family: 'DM Serif Display', src: '/fonts/DMSerifDisplay-Regular.ttf' });
Font.register({ family: 'Lato',             fonts: [
  { src: '/fonts/Lato-Regular.ttf' },
  { src: '/fonts/Lato-Bold.ttf', fontWeight: 700 },
  { src: '/fonts/Lato-Black.ttf', fontWeight: 900 },
]});
Font.register({ family: 'NotoSansArabic',   src: '/fonts/NotoSansArabic-Regular.ttf' });
```

Font files live in `public/fonts/`. NotoSansArabic already exists from v2.1 polish; the other 3 added.

### Logo rebuild

`fmplus-logo.tsx` becomes a `<svg>` rendering 4 quadrant tiles in the precise geometry from Asset 4. Each tile is a black-on-yellow (or yellow-on-white, depending on `variant` prop) modular shape that combines to form the `+` monogram. Wordmark "FMPLUS" + "FACILITY MANAGEMENT" tagline rendered below in Lato Black + Lato Light. Aspect 4.19:5.19 enforced via the `viewBox`.

API:
```ts
<FmplusLogo size="sm|md|lg|xl" variant="black-on-yellow|yellow-on-white|white-on-black|monochrome-black" />
```

`<Svg>` equivalent for `@react-pdf/renderer` mirrors the same geometry.

## 10. Modes, Visibility, Edge Cases

### 10.1 Mode toolbar UX

```
[ Pre-contract ] [ Sign-off ✓ ] [ Customer ] [ Snapshot ]    Year: [Y1▾]   [ Export PDF ▸ ]
```

- Pill toggle (4 modes); Sign-off active = filled fmplus-yellow + black text. Others outlined grey.
- Mode change updates URL `?mode=signoff`; deep links + refresh preserve mode.
- `Customer` mode + `year.status='draft'` → page renders banner "Customer-facing report requires year status = published. Publish in Editor first." and disables `[ Export PDF ]` button (greyed-out + tooltip).

### 10.2 Export dialog

Modal with:
- Mode (read-only, current view)
- Language radio: `( ) English   ( ) العربية   ( ) Both stacked`
- Filename preview (computed live)
- `[ Cancel ]  [ Download PDF ]`

`Download PDF` posts to `/api/fmplus/budget/report/{contractId}/{yearId}/pdf?mode={mode}&lang={lang}`. Response is an `application/pdf` blob; browser triggers download. Audit row inserted into `budget_report_exports`.

### 10.3 Edge cases (full table)

| Scenario | Behavior |
|---|---|
| No mobilization lines | Mobilization page omitted from PDF; on-screen section omitted |
| No `payment_terms` text | Payment Terms page omitted |
| `customer_logo_url` null + customer mode | Placeholder box "Customer Logo" — does not block export |
| `customer_logo_url` null + non-customer mode | No customer logo block at all |
| `year.status='draft'` + customer mode | On-screen banner + Export PDF disabled |
| Multi-year contract | Year picker in toolbar; Contract Rollup page auto-appended |
| Year has no `budget_lines` | Empty-state cards in service-line/manning/budget sections; PDF generates with empty tables |
| `customer_contacts=[]` | "Contacts to be confirmed" placeholder line in Project Details |
| `scenario=revised` but no `initial` sibling | Change vs Initial section warns: "No initial scenario found — comparison unavailable" |
| Concurrent export click | Button disabled + spinner; second request rejected with toast "Already exporting" |
| PDF render error | On-screen toast "Export failed — see console"; route handler returns 500 with `console.error` log |
| `lang=both` + Arabic glyph missing in Lato | Font fallback chain → NotoSansArabic |
| `lang=ar` | Body + tables flipped to RTL via `direction="rtl"` on relevant `<View>`s; logo and watermarks remain LTR |

### 10.4 PDF metadata + audit

`<Document>` declares title/author/subject/keywords for proper PDF metadata in viewers. Every successful export inserts a `budget_report_exports` row keyed on (year_id, contract_id, mode, lang, exported_by, ts, user_agent).

### 10.5 Filename convention

```
{contract_name_slug}_{scenario}_Y{year_index}_{mode}_{lang}.pdf
```

Examples:
- `TRIO_initial_Y1_signoff_en.pdf`
- `City_Gate_revised_Y2_customer_ar.pdf`
- `AUC_initial_Y1_snapshot_both.pdf`

## 11. FM+ Brand Retrofit (bundled scope)

Scope choice **B**: bundle module-wide retrofit with this work. Phase split:

### Phase A — Brand Foundation (must precede Phase B & C)
1. `src/lib/fmplus/brand.ts` — token export.
2. `src/app/layout.tsx` — register Google Fonts (Lalezar, DM Serif Display, Lato) via `next/font/google`.
3. `src/app/globals.css` — add `@theme` block with FM+ tokens.
4. `public/fonts/` — drop in Lalezar / DM Serif Display / Lato TTF files (NotoSansArabic already there).
5. **Rebuild** `src/app/fmplus/_components/fmplus-logo.tsx` — geometric 4-quadrant `+` monogram per Asset 4. New `variant` prop.
6. **Update** `src/app/fmplus/_components/fmplus-hero.tsx` — swap amber tokens to fmplus-yellow/gold tokens. Eyebrow uses fmplus-gold; icon box uses fmplus-yellow/10 background; gradient blur uses fmplus-yellow → fmplus-gold.

### Phase B — Page retrofits (depends on Phase A)
1. `/fmplus` landing page — swap amber utility classes to fmplus-* tokens.
2. `/fmplus/financials` — already uses `<FmplusHero>` so inherits Phase A; swap inline amber tab strip → fmplus-yellow underline.
3. `/fmplus/financial/budget` — `BudgetTabStrip` swap amber → fmplus-yellow underline.
4. `public/brand/beithady/logo-fmplus.jpg` — leave file; remove references (component using it should switch to new `<FmplusLogo>`).

### Phase C — Project Report tab (depends on Phase A; can run parallel with Phase B)
The full new feature in §1–10 above.

### Sequencing

- Phase A is a single PR (foundation; no behavior change other than visual).
- Phase B and Phase C run in parallel after Phase A merges.
- Final PR ties everything together with a manual QA pass on all FM+ pages + 4 contracts × 4 modes × 3 languages.

## 12. Testing Strategy

```
src/lib/fmplus/budget/report/build-report.test.ts          ~10 tests (mode visibility, deltas, rollup)
src/lib/fmplus/budget/report/visibility.test.ts            ~5 tests (per-mode field strip)
src/lib/fmplus/budget/report/pdf-document.test.tsx         2 tests (snapshot the JSON tree per mode)
src/app/fmplus/_components/fmplus-logo.test.tsx            rendering + aspect ratio + variants
src/app/api/fmplus/budget/report/.../route.test.ts         auth gates, draft+customer block, content-type, audit log insert
src/app/fmplus/financial/budget/report/[contractId]/_components/report-export-dialog.test.tsx   UX: lang radio, filename preview
```

Total ~20 new tests. Existing 209 tests stay green.

### Manual QA checklist

- TRIO single-year → render all 4 modes × 3 languages → 12 PDFs visually inspected for layout, brand consistency, RTL handling.
- City Gate multi-year → confirm Contract Rollup page appears.
- AUC + Uptown EMAAR → no regressions.
- Customer mode + draft year → confirm export blocked.
- Customer mode + missing customer_logo → confirm placeholder renders + export proceeds.
- Phase B page retrofits → re-shoot screenshots of `/fmplus`, `/fmplus/financials`, all 9 budget tabs (light + dark mode).

## 13. Acceptance Criteria

- [ ] All 5 design sections implemented end-to-end.
- [ ] PDF renders correctly on TRIO Y1 (signoff mode, EN) at <2 MB and 7 pages.
- [ ] Customer mode visibility-stripped data contains zero `unit_cost`/`ctc_*`/`gp_*` fields anywhere in the JSON tree.
- [ ] Draft year + customer mode blocks export UI and route handler returns 403.
- [ ] Change vs Initial section appears for City Gate Y2 (which has revised scenario after we publish initial first).
- [ ] Contract Rollup page appears for City Gate (3 years), absent for TRIO/AUC/Uptown.
- [ ] Export audit row written for every successful download.
- [ ] FM+ brand applied consistently across `/fmplus/*` landing/financials/budget chrome (Phase B).
- [ ] `<FmplusLogo>` renders the geometric 4-quadrant monogram with correct 4.19:5.19 aspect ratio.
- [ ] All 4 brand color combos from guidelines work: black-on-yellow, yellow-on-white, white-on-black, grey-on-yellow.
- [ ] All ~20 new tests pass; existing 209 tests stay green.
- [ ] No TypeScript errors (`npx tsc --noEmit`).

## 14. References

- `FMPlus rebranding.pdf` 2025 brand guidelines — `C:/kareemhady/.claude/FMPLUS/Branding/`
- Brand assets — `C:/kareemhady/.claude/FMPLUS/Branding/Asset 2-6.png`
- Existing PDF pattern — `src/lib/fmplus/budget/exports/variance-pdf.tsx`
- Existing data builders — `src/lib/fmplus/budget/{variance.ts, portfolio.ts, mobilization.ts}`
- Brand-theme-anchor file — `src/lib/brand-theme.ts` (will be partially superseded by `src/lib/fmplus/brand.ts`)
- TRIO live data (test target) — `project_contracts.id=5`, `year_id=6`
- Multi-year test target — City Gate, `project_contracts.id=2` (3 years)
