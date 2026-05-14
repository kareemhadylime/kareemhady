## 2026-05-14 Task 3: Beithady HR Types File (hr-types.ts)

**Status:** DONE

**Completed:**
- Created `src/lib/beithady/hr/hr-types.ts` — pure types + enum constants, zero imports
- 9 const enums with their label records:
  - `DEPARTMENTS` (13 values: executive, finance, reservations, ...) + `DEPARTMENT_LABELS`
  - `JOB_ROLES` (15 values: owner_director, manager, ...) + `JOB_ROLE_LABELS`
  - `EMPLOYEE_STATUSES` (5 values: on_job, probation, ...) + `STATUS_LABELS`
  - `BUILDING_CODES` (6 values: BH-26, BH-73, ...) + `BUILDING_LABELS`
  - `CONTRACT_TYPES` (permanent, fixed_term, hourly)
  - `PAYMENT_METHODS` (bank, cash)
  - `EVENT_TYPES` (6 audit events)
- 3 DB row shapes: `HrEmployee`, `HrContract`, `HrEvent`, `HrEmployeeRow` (joined view)
- 3 form input shapes: `PersonalInfoInput`, `ContractInput`
- 2 import shapes: `ImportRow`, `ImportPreviewResult`
- TypeScript strict mode: **no errors** (verified with `npx tsc --noEmit`)
- Committed: `b9840c1` — "feat(hr): create hr-types.ts with shared TypeScript types + enums (Task 2, Sprint 1)"

**Files Changed:**
- `src/lib/beithady/hr/hr-types.ts` (new, 213 lines)

**Next:** Task 4 (HR DB actions layer) — awaits this types foundation.

---

## 2026-05-14 Task 2: Live Meta Insights on Campaign Detail Page

**Status:** DONE

**Completed:**
- Added `fetchMetaCampaignInsights(campaignId, token)` to `src/lib/beithady/ads/meta-client.ts`
  - Calls `GET /{campaign_id}/insights?fields=spend,impressions,clicks,reach,cpm,cpc,ctr&date_preset=lifetime`
  - Returns `MetaInsightsSnapshot` with all metrics as typed numbers (Meta sends strings)
  - Zeroed snapshot for brand-new campaigns with no data yet
- Updated `src/app/beithady/ads/campaigns/[id]/page.tsx`
  - Now fetches insights in parallel with the existing status batch using `Promise.all`
  - Added "⚡ Live from Meta" card below the header KPI row, above the daily sparkline
  - Shows spend, impressions, clicks, reach + optional CPM/CPC/CTR if available
  - Labelled clearly as direct Meta API (not our daily cron) with fetch timestamp
  - Graceful empty state when campaign has no spend yet
- Fixed pre-existing TS2322 errors in `meta-recommendation-appliers.ts` (ok: boolean → proper literal guard)
- Committed as `c1c23f6`, pushed to main, auto-deployed via GitHub → Vercel

**Files Changed:**
- `src/lib/beithady/ads/meta-client.ts` — added `fetchMetaCampaignInsights`, `MetaInsightsSnapshot`
- `src/app/beithady/ads/campaigns/[id]/page.tsx` — parallel insights fetch, new card
- `src/lib/beithady/ads/meta-recommendation-appliers.ts` — TS fix

**Next pending tasks:**
1. CTWA (Click-to-WhatsApp) boost — still blocked on BH015 FB Page ↔ WABA link
2. Google Ads account setup (original deferred request)

---

## 2026-05-14 Task 1: Beithady HR Module — Database Migration

**Status:** DONE

**Completed:**
- Created `supabase/migrations/0080_hr_team_members.sql` with 4 tables and 1 helper function:
  - `hr_employees` — core employee identity with status, department, position, job_role
  - `hr_employee_contracts` — contract versions (permanent, fixed_term, hourly) with salary history
  - `hr_employee_events` — immutable audit timeline (hired, status_change, salary_change, building_transfer, role_change, terminated)
  - `hr_salary_access` — salary visibility tiers (gating logic for Sprint 3)
  - `hr_employee_seq` sequence backing BH-NNN company IDs
  - `generate_hr_company_id()` PL/pgSQL function

**Applied to:** Supabase project `bpjproljatbrbmszwbov` (eu-central-1, Lime Investments)

**Verification:**
- All 4 tables created: hr_employee_contracts, hr_employee_events, hr_employees, hr_salary_access (verified via info_schema)
- Function `generate_hr_company_id` exists (verified via pg_proc)
- Committed to main: `be9a179`

**Concerns:**
- `hr-photos` Supabase Storage bucket (needed for Sprint 1, Task 9) must be manually created via Supabase dashboard → Storage → New bucket "hr-photos" (private)

**Files Changed:**
- `C:\kareemhady\supabase\migrations\0080_hr_team_members.sql` (new, 100 lines)

**Next:** Task 2 (HR API endpoints) — awaits this migration foundation.

---

## 2026-05-14 — Small Fix: Add Missing created_by Fields to HR Types

**Task:** The DB schema has `created_by uuid references accounts(id)` on both `hr_employees` and `hr_employee_contracts` tables, but the TypeScript types were missing this field.

**Completed:**
- ✅ Added `created_by: string | null;` to `HrEmployee` type (after `updated_at`)
- ✅ Added `created_by: string | null;` to `HrContract` type (after `created_at`)
- ✅ TypeScript verification: `npx tsc --noEmit` — no errors
- ✅ Committed: `f3197cd` — "fix(hr): add missing created_by field to HrEmployee + HrContract types"

**Files Changed:**
- `src/lib/beithady/hr/hr-types.ts` (2 insertions)

---

## 2026-05-14 — HR Migrations Fix (Rename + Post-Migration Fixes)

**Task:** Fix two issues with the Beithady HR migration:
1. Rename `0080_hr_team_members.sql` → `0123_hr_team_members.sql` (was incorrectly numbered)
2. Create `0124_hr_employees_fixes.sql` with trigger + constraints

**Completed:**
- ✅ Renamed migration file via `git mv` (tracked as rename in git)
- ✅ Created `0124_hr_employees_fixes.sql` with:
  - `hr_employees_touch_updated()` trigger to auto-update `updated_at` on every UPDATE
  - Three non-negative check constraints on `hr_employee_contracts`:
    - `chk_transport_allowance_gte0`
    - `chk_travel_allowance_gte0`
    - `chk_fixed_bonus_gte0`
  - Helpful comment documenting active-contract invariant (NULL = active)
- ✅ Applied migration to Supabase project `bpjproljatbrbmszwbov` via MCP
- ✅ Verified: 1 trigger + 3 constraints exist in production schema
- ✅ Committed both changes: `d5dbfab` — "fix(hr): rename migration 0080→0123, add updated_at trigger + allowance constraints (0124)"
- ✅ Pushed to origin/main (auto-deployed to Vercel production)

**Files Changed:**
- `supabase/migrations/0123_hr_team_members.sql` (renamed from 0080)
- `supabase/migrations/0124_hr_employees_fixes.sql` (new, 28 lines)

**Verification Results:**
- Trigger `hr_employees_touch` exists on table `hr_employees` ✓
- All three allowance constraints exist and active ✓
- Migration applied successfully to production schema ✓
