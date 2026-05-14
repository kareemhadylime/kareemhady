# Head Count Estimator — Design Spec
**Date:** 2026-05-13  
**Module:** BH Analytics → Head Count Estimator  
**Route:** `/beithady/analytics/headcount`  
**Status:** Approved — ready for implementation planning

---

## 1. Purpose

A calculator that tells Beithady operations how many Housekeeping (HK) staff and Security guards to hire for a target month, based on last month's actual check-in data with an optional projection multiplier.

Staff are hired monthly. The module outputs a week-by-week breakdown so the team can see peak demand and hire confidently for it.

---

## 2. Scope

**In scope:**
- Housekeeping headcount estimation (Tab 1)
- Security headcount estimation (Tab 2)
- Buildings: BH-26, BH-73, BH-435, BH-OKAT (staff pool shared across all four — adjacent buildings)

**Out of scope:**
- Actual scheduling / rostering
- Payroll / cost calculation
- DXB properties (excluded from Egypt ops)
- Other Beithady boutique properties (GOUNA, NEWCAI, MG) — can be added later

---

## 3. Entry Point

A new tile is added to the analytics hub launcher at `/beithady/analytics`:

```
Title:       Head Count Estimator
Description: Project HK & Security staffing needs based on last month's
             check-ins — weekly breakdown, peak-driven monthly hire recommendation.
Icon:        Users (lucide-react)
Accent:      teal
Badge:       New
```

---

## 4. Navigation

Link-based tab nav component at `src/app/beithady/analytics/headcount/_components/hc-tabs.tsx`, following the same pattern as `fnb-tabs.tsx` (usePathname active detection, border-bottom indicator).

| Tab | Label | Route |
|-----|-------|-------|
| 1 | Housekeeping | `/beithady/analytics/headcount` |
| 2 | Security | `/beithady/analytics/headcount/security` |

---

## 5. Architecture — Approach B (Server data + client calculator)

```
Server component (page.tsx)
  └── Queries Supabase for last month's reservations
  └── Aggregates into HKBaseData (checkins by unit type/building/week/day)
  └── Passes as prop to client component

Client component (hk-calculator.tsx)
  └── Receives HKBaseData (static, never re-fetched)
  └── Holds all user inputs in React state
  └── Recalculates HC synchronously on every input change
  └── Renders: Input Panel → Actuals Summary → Dashboard → Weekly Table
```

Re-fetching only happens on hard page reload. No API route needed for the calculator itself.

---

## 6. Housekeeping Tab

### 6.1 Data Shape (Server → Client)

```ts
type UnitTypeCounts = {
  studio: number;
  oneBR: number;
  twoBR: number;
  threeBR: number;
  fourBR: number;
};

type DayData = {
  date: string;                  // "2026-04-03"
  building: 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OKAT';
  checkins: UnitTypeCounts;
  stayIns: number;               // occupied units not checking in or out
  sameDayRollovers: number;      // units with same-day checkout + check-in
};

type HKBaseData = {
  month: string;                 // "April 2026"
  weeks: { week: 1 | 2 | 3 | 4; days: DayData[] }[];
  totalCheckins: UnitTypeCounts; // portfolio total for last month
  totalRollovers: number;
  avgStayInsPerDay: number;
};
```

Week boundaries: W1 = days 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–end of month.

### 6.2 User Inputs

```ts
type HKInputs = {
  multiplier: number;            // default 1.0, step 0.1
  buildings: {
    [key in 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OKAT']: {
      generalAreaHrsPerDay: number;   // user-input, no default
      nightShiftHKs: number;         // user-input, no default
    };
  };
};
```

**Multiplier presets strip:** Quick-apply buttons `×1.5 ×2 ×2.5 ×3` beside the multiplier field. Clicking sets the input value instantly.

**Projected total label:** Below multiplier field, live-updating: `"116 checkins last month → 232 projected"`.

### 6.3 Last Month Actuals Summary

Read-only reference table displayed between the input panel and calculator output. Updates only on page load (not on multiplier change — it shows actuals, not projections).

Columns: Building | Studio | 1BR | 2BR | 3BR | 4BR | Total Checkins | Rollovers | Avg Stay-ins/day  
Rows: BH-26, BH-73, BH-435, BH-OKAT, **Total**

### 6.4 Calculation Engine

All logic runs synchronously in the client on every input change.

**Pooling:** `DayData` is structured per building per day. Before running steps 1–10, sum all buildings for each calendar date to get a single portfolio-level row per day. Staff pool is shared across BH-26, BH-73, BH-435, BH-OKAT.

**Per day (portfolio-level, after summing across buildings):**

```
STEP 1 — TURNOVER HK-HOURS
  Small units (Studio + 1BR):  checkins × multiplier × 1 hr × 1 HK
  Large units (2BR + 3BR + 4BR): checkins × multiplier × 1 hr × 2 HKs

STEP 2 — STAY-IN HK-HOURS
  stayIns × multiplier × 5% × 1 hr × 1 HK

STEP 3 — GENERAL AREAS HOURS
  Sum of generalAreaHrsPerDay across all buildings (user input, no multiplier applied)

STEP 4 — TOTAL DAY-SHIFT HK-HOURS
  = STEP 1 + STEP 2 + STEP 3

STEP 5 — DAY-SHIFT HKs (baseline)
  = ceil(STEP 4 ÷ 8)   [8-hr day shift]

STEP 6 — ROLLOVER PEAK OVERRIDE  (11 AM–3 PM window = 4 hrs)
  Rollover HK-hours = (studio/1BR rollovers × 1) + (2BR+ rollovers × 2), all × multiplier
  Peak HKs needed   = ceil(rollover HK-hours ÷ 4)
  Final day HKs     = max(STEP 5, STEP 6)
  → Override flag   = true when STEP 6 > STEP 5

STEP 7 — NIGHT-SHIFT HKs
  = sum of nightShiftHKs across all buildings (user input)

STEP 8 — TOTAL HKs
  = Final day HKs + STEP 7

STEP 9 — SUPERVISORS
  = ceil(STEP 8 ÷ 10)

STEP 10 — COVERAGE FACTOR (rotating 1 day off/week per person)
  Day HKs to hire     = ceil(Final day HKs × 7 ÷ 6)
  Night HKs to hire   = ceil(STEP 7 × 7 ÷ 6)
  Supervisors to hire = ceil(STEP 9 × 7 ÷ 6)
  Grand total to hire = Day hire + Night hire + Supervisor hire
```

**Distinction:**
- "On shift" = number needed working on any given day (what the weekly table shows)
- "To hire" = on-shift × 7/6, rounded up (what the KPI cards and monthly recommendation show — the actionable number)

**Weekly aggregation:** Take the **peak day** within each week as the week's HC requirement.

**Monthly recommendation:** Peak week's on-shift day HKs → apply coverage factor → hire number.

### 6.5 Output Layout

Layout is **stacked vertically** (top to bottom):

```
1. KPI Cards Row (4 cards)
2. Charts Row (bar chart left | staff composition right)
3. Weekly Breakdown Table (full width)
```

**KPI Cards:**
| Card | On-Shift Value | To-Hire Value | Color |
|------|---------------|---------------|-------|
| Day HKs (Peak) | peak week day HKs | ceil(on-shift × 7/6) | teal |
| Night HKs | sum across buildings | ceil(on-shift × 7/6) | sky |
| Supervisors | ceil(total ÷ 10) | ceil(on-shift × 7/6) | slate |
| Grand Total | sum of on-shift | sum of to-hire | amber |

Each card shows two numbers: `On Shift: X` (small label) and `To Hire: Y` (large, prominent — the actionable number).

**Charts row (two columns):**
- **Left — Week-by-week bar chart** (recharts `BarChart`): 4 bars (W1–W4), x-axis = week label, y-axis = day HKs needed. Peak week bar highlighted in amber.
- **Right — Staff composition** (horizontal proportional bars): Day HKs / Night HKs / Supervisors as segments of total, with count labels.

**Weekly breakdown table:**

| Week | Checkins (proj.) | Rollovers | Stay-in HK-hrs | Areas HK-hrs | Total HK-hrs | Day HKs | Override | Night HKs | Supervisors |
|------|-----------------|-----------|----------------|--------------|--------------|---------|----------|-----------|-------------|
| W1 (1–7) | … | … | … | … | … | … | — | … | … |
| W2 (8–14) | … | … | … | … | … | … | ⚠️ | … | … |
| W3 (15–21) | … | … | … | … | … | … | — | … | … |
| W4 (22–end) | … | … | … | … | … | … | — | … | … |
| **Monthly** | **total** | **total** | **total** | **total** | **total** | **MAX** | | **fixed** | **MAX** |

⚠️ Override tooltip: `"X same-day rollovers require Y concurrent HKs in the 11 AM–3 PM window (overrides daily average of Z)"`

**Assumption footnotes (below table):**
- Multiplier ×N applied to checkins, rollovers, and stay-ins. General areas hours are fixed.
- 5% stay-in rate applied to projected occupied units.
- Table shows on-shift numbers. KPI cards show hire numbers (×7/6 coverage factor, 1 day off/week per person, rotating).
- Monthly hire = peak week day HKs → coverage factor applied. Night HKs = sum of per-building inputs → coverage factor applied.

---

## 7. Security Tab

### 7.1 Concept

A pure roster planner. No occupancy math. The user defines security posts per building, assigns shifts, and the system totals bodies needed.

### 7.2 Inputs — Per Building

Each building gets a card containing an editable posts table:

| Post Name (free text) | Day Shift (9–5) | Night Shift (5–1AM) | 24hr |
|-----------------------|-----------------|---------------------|------|
| Entrance Guard        | 1               | 1                   | —    |
| Roving Patrol         | 1               | 1                   | —    |
| CCTV Room             | —               | —                   | 1    |
| **Building Total**    | 2               | 2                   | 1×2  |

- Rows are user-editable (add / delete)
- Post names are free text; no defaults pre-populated (fully blank, user configures)
- Day and Night are separate headcount inputs
- 24hr post = 2 bodies (one per shift); shown as `×2` in building total row
- Optional supervisor toggle: apply `1 supervisor per 10 guards` rule (matches HK convention)

### 7.3 Output Layout (stacked, same pattern as HK tab)

**KPI Cards:**
| Card | On-Shift | To-Hire | Note |
|------|----------|---------|------|
| Day Guards | sum day posts | ceil(×7/6) | |
| Night Guards | sum night posts | ceil(×7/6) | |
| 24hr Posts | count ×2 bodies | ceil(×7/6) | |
| Grand Total | all on-shift | all to-hire | actionable number |

Same coverage factor (×7/6) applied to security — rotating 1 day off/week per person.

**Charts row:**
- **Left — Per-building stacked bar** (recharts): Each building = one bar, stacked Day / Night / 24hr segments
- **Right — Portfolio split** (horizontal bars): Day Guards / Night Guards / 24hr Bodies

**Table:**
Full breakdown — Building × Post × Shift with body counts.

---

## 8. File Structure

```
src/app/beithady/analytics/headcount/
  page.tsx                          # HK tab — server component, fetches HKBaseData
  security/
    page.tsx                        # Security tab — client only, no server data needed
  _components/
    hc-tabs.tsx                     # Tab nav (HK / Security)
    hk-calculator.tsx               # HK client component (inputs + calc + output)
    hk-actuals-table.tsx            # Last-month actuals read-only table
    hk-weekly-table.tsx             # Weekly breakdown table
    hk-dashboard.tsx                # KPI cards + charts
    security-calculator.tsx         # Security client component
    security-building-card.tsx      # Per-building posts table (add/remove rows)
    security-dashboard.tsx          # Security KPI cards + charts

src/lib/beithady/hc-estimator.ts   # Server-side aggregation: query Supabase → HKBaseData
```

---

## 9. Data Query

`src/lib/beithady/hc-estimator.ts` queries `guesty_reservations` (or equivalent synced table). Two queries are needed:

**Query A — checkins & rollovers (last month only):**
```sql
SELECT check_in_date, check_out_date, building_code, listing_type
FROM guesty_reservations
WHERE
  check_in_date >= <first day of last month>
  AND check_in_date < <first day of current month>
  AND status NOT IN ('cancelled', 'declined')
ORDER BY check_in_date
```

**Query B — stay-ins (all active reservations overlapping last month):**
```sql
SELECT check_in_date, check_out_date, building_code, listing_type
FROM guesty_reservations
WHERE
  check_in_date < <first day of current month>   -- started before month end
  AND check_out_date > <first day of last month>  -- still active during last month
  AND status NOT IN ('cancelled', 'declined')
```

From raw rows, derive:
- `checkins` — count Query A rows grouped by check_in_date + building + listing_type
- `stayIns` — for each calendar date in last month: count Query B rows where check_in_date < date AND check_out_date > date, grouped by building (excludes the check-in and check-out day itself)
- `sameDayRollovers` — for each listing in Query A: if another Query B reservation ends on the same day this one starts, it's a rollover; count per date + building

---

## 10. Open Questions / Assumptions

| # | Assumption | Risk if wrong |
|---|------------|---------------|
| 1 | Stay-in units use 1 HK × 1 hr regardless of unit size | Low — 5% rate is small; can refine later |
| 2 | Rollover unit type split mirrors overall portfolio mix | Low — same day rollovers are a subset |
| 3 | BH-OKAT reservations exist in same Supabase `guesty_reservations` table with building_code = 'BH-OKAT' | Medium — verify table coverage before coding |
| 4 | 9 AM–5 PM = 8 productive hours (no break deduction) | Low — conservative assumption favors over-staffing |
| 5 | Security posts table starts blank (user configures from scratch) | Low — confirmed in design |
