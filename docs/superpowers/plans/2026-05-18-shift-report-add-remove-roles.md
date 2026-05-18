# Shift Reports — Add/Remove Verticals & Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-project vertical list and role list in FMPLUS Shift Reports fully editable via `+`/`×` controls in Settings, retiring the legacy "تفعيل" enable-vertical toggle and replacing "all 7 roles always shown" with "only the roles you added".

**Architecture:** Replace the convention that `config.verticals` always contains all 4 vertical keys (with `enabled: boolean`) and that every `VerticalConfig.roles` contains all master roles (pre-populated 0/0). After this change, presence in `config.verticals` = added; presence in `vc.roles` = added. Renderer (`computeShiftTotals` / `buildShiftReportHtml`) iterates the config's own keys instead of the global `SR_VERTICALS` master list, so WhatsApp summary and HTML report only reflect what the project actually contracted. Backward compatible: old saved configs carrying `enabled` and pre-populated roles still load; the next save normalizes the JSONB into the new shape.

**Tech Stack:** Next.js 16 (App Router, `src/` dir), React 19 (client components), TypeScript strict, Tailwind v4, Vitest (colocated `*.test.ts`), Supabase JSONB for config persistence — no DB migration needed.

**Spec:** [docs/superpowers/specs/2026-05-18-shift-report-add-remove-roles-design.md](../specs/2026-05-18-shift-report-add-remove-roles-design.md)

**Deployment:** Per repo CLAUDE.md, work happens directly on `main`. After all tasks pass: `git push origin main` triggers the GitHub → Vercel auto-deploy (production at `limeinc.vercel.app` / `app.limeinc.cc`).

---

## File Structure

Files created or modified by this plan:

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/lib/fmplus/shift-report/render.test.ts` | **Create** | Vitest coverage for `computeShiftTotals`, `buildShiftWAMessage`, `buildShiftReportHtml` with partial configs (only added roles). |
| `src/lib/fmplus/shift-report/render.ts` | Modify | `computeShiftTotals` and the inner role loop of `buildShiftReportHtml` iterate `Object.keys(vc.roles)` (via `v.roles.filter(r => r.key in vc.roles)`) and stop requiring `vc.enabled`. |
| `src/lib/fmplus/shift-report/types.ts` | Modify | Drop `enabled` from `VerticalConfig`. `defaultVerticalConfig()` returns `{}` (empty record). Add `newVerticalConfig()` factory `→ { shifts: [], roles: {} }`. |
| `src/app/fmplus/shift-report/[contractId]/_components/shift-report-module.tsx` | Modify | New handlers: `addVertical`, `removeVertical`, `addRole`, `removeRole`. Settings tab: vertical picker `<select>` + per-card `×` + per-vertical role picker `<select>` + per-row `×`. `toggleVertical` removed. `hasConfig` derivation updated. `ShiftSection` (Daily Report inner component): iterate `v.roles.filter(r => r.key in vc.roles)`; updated `activeVerts` filter. |

No changes to: `actions.ts` (DB upsert is shape-agnostic), the storage bucket, RLS, cron handlers, history view, the `/fmplus/shift-report/page.tsx` landing page, or `/fmplus/shift-report/[contractId]/page.tsx` server component.

---

## Task 1: Add Vitest coverage for renderer (TDD red)

**Files:**
- Create: `src/lib/fmplus/shift-report/render.test.ts`

The current renderer iterates `SR_VERTICALS` and always emits a row for every master role in the HTML report — even roles the project never added. We'll write tests that pin down the new behavior (only added roles render) before changing the implementation.

- [ ] **Step 1: Create the test file**

```ts
// src/lib/fmplus/shift-report/render.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildShiftReportHtml,
  buildShiftWAMessage,
  computeShiftTotals,
} from './render';
import type {
  ShiftReportConfig,
  ShiftReportData,
} from './types';

// A "City Gate-like" partial config: only Security, only morning shift,
// only 3 of the 7 master security roles added.
//
// Note: we use `as unknown as ShiftReportConfig['verticals']` here so the
// test file compiles both BEFORE Task 3 (when `VerticalConfig` still has the
// required `enabled` field) and AFTER (when it doesn't). The synthetic
// fixtures intentionally bypass the type so they can describe both states.
function partialConfig(): ShiftReportConfig {
  return {
    contractNumber: 'CON-2026-014',
    waGroup:        '120363TEST@g.us',
    verticals: {
      security: {
        shifts: ['morning'],
        roles: {
          manager:    { morning: 1 },
          supervisor: { morning: 2 },
          personnel:  { morning: 5 },
        },
      },
    } as unknown as ShiftReportConfig['verticals'],
  };
}

function emptyReport(): ShiftReportData {
  return {
    today_morning:     { security: { manager: 1, supervisor: 2, personnel: 4 } },
    yesterday_morning: { security: { manager: 1, supervisor: 1, personnel: 5 } },
    yesterday_night:   {},
  };
}

describe('computeShiftTotals (partial config)', () => {
  it('only counts roles that were added to the config', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const t    = computeShiftTotals(cfg.verticals, 'morning', data.today_morning);

    // planned = 1+2+5 = 8 (manager + supervisor + personnel only)
    // actual  = 1+2+4 = 7
    expect(t.planned).toBe(8);
    expect(t.actual).toBe(7);
    expect(t.hasData).toBe(true);
  });

  it('returns zero totals when the section shift is not in vc.shifts', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    // security only has morning; asking for night → 0/0
    const t = computeShiftTotals(cfg.verticals, 'night', data.yesterday_night);
    expect(t.planned).toBe(0);
    expect(t.actual).toBe(0);
    expect(t.hasData).toBe(false);
  });

  it('ignores legacy enabled:false from old configs (backward compat)', () => {
    // Old saved JSONB shape — `enabled` was the gate, but presence now means added.
    // Double-cast so this compiles both pre and post Task 3.
    const verticals = {
      security: {
        enabled: false,
        shifts:  ['morning'],
        roles:   { manager: { morning: 3 } },
      },
    } as unknown as ShiftReportConfig['verticals'];
    const data: ShiftReportData = {
      today_morning:     { security: { manager: 2 } },
      yesterday_morning: {},
      yesterday_night:   {},
    };
    const t = computeShiftTotals(verticals, 'morning', data.today_morning);
    expect(t.planned).toBe(3);
    expect(t.actual).toBe(2);
  });
});

describe('buildShiftReportHtml (partial config)', () => {
  it('renders rows only for roles present in the config', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const html = buildShiftReportHtml({ name: 'City Gate' }, cfg, data);

    // Added roles must appear
    expect(html).toContain('مدير الامن');
    expect(html).toContain('مشرف أمن');
    expect(html).toContain('فرد أمن');

    // Master-list roles NOT added must not appear
    expect(html).not.toContain('موتوسيكل');
    expect(html).not.toContain('سيارة الجيب');
    expect(html).not.toContain('اجهزة لاسلكية');
    expect(html).not.toContain('طوارئ');
  });

  it('omits verticals that are not in the config', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const html = buildShiftReportHtml({ name: 'City Gate' }, cfg, data);

    // Security shows up
    expect(html).toContain('الأمن');
    // Other 3 master verticals were never added — should not appear in the HTML body.
    expect(html).not.toContain('النظافة');
    expect(html).not.toContain('بيست كنترول');
    expect(html).not.toContain('لاندسكيب');
  });
});

describe('buildShiftWAMessage (partial config)', () => {
  it('reports totals that match the partial config (planned sums the 3 added roles)', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const msg  = buildShiftWAMessage({ name: 'City Gate' }, cfg, data);

    // Today morning: planned 8, actual 7
    expect(msg).toContain('الفعلي: *7*');
    expect(msg).toContain('التعاقدي: *8*');
    // Grand total: morning today (7/8) + morning yesterday (7/8) + night (0/0) = 14/16
    expect(msg).toContain('الفعلي: *14*');
    expect(msg).toContain('التعاقدي: *16*');
  });
});
```

- [ ] **Step 2: Run the test suite — confirm RED**

```bash
npm run test -- src/lib/fmplus/shift-report/render.test.ts
```

Expected: tests in `buildShiftReportHtml (partial config)` fail. The "renders rows only for roles present in the config" test will report that the HTML contains `موتوسيكل` (and the other master roles), because the current implementation emits every master role unconditionally. The "omits verticals that are not in the config" test may pass already (`vc?.enabled` is `undefined` for missing verticals, so the iteration skips them) — that's fine, we want it to keep passing. `computeShiftTotals` tests may also pass already because the `?.` chain on missing roles returns 0 — also fine.

The single failure we **need** to see is the HTML role-row emission test. Confirm that before moving to Task 2.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/lib/fmplus/shift-report/render.test.ts
git commit -m "test(shift-report): assert renderer only emits added roles (TDD red)"
```

---

## Task 2: Renderer iterates config keys (TDD green)

**Files:**
- Modify: `src/lib/fmplus/shift-report/render.ts` (`computeShiftTotals` at lines 26-45, `buildShiftReportHtml` at lines 131-155)

- [ ] **Step 1: Update `computeShiftTotals` to iterate added roles only**

Replace the body of `computeShiftTotals` (lines 26-45 in current file) with:

```ts
export function computeShiftTotals(
  vcfg: Partial<Record<VerticalKey, VerticalConfig>>,
  shiftKey: ShiftKey,
  shiftData: ShiftSectionData,
): ShiftTotals {
  let actual = 0;
  let planned = 0;
  SR_VERTICALS.forEach((v) => {
    const vc = vcfg[v.key];
    if (!vc) return;
    if (!vc.shifts.includes(shiftKey)) return;
    const vData = shiftData[v.key] ?? {};
    v.roles.forEach((role) => {
      if (!(role.key in vc.roles)) return;       // only added roles
      actual  += Number(vData[role.key]) || 0;
      planned += Number(vc.roles[role.key]?.[shiftKey]) || 0;
    });
  });
  const pct = planned > 0 ? Math.round((actual / planned) * 1000) / 10 : 0;
  return { actual, planned, pct, hasData: planned > 0 || actual > 0 };
}
```

Notable changes:
- `if (!vc?.enabled) return;` → `if (!vc) return;` (presence is the new gate).
- New `if (!(role.key in vc.roles)) return;` filter inside the inner loop.

- [ ] **Step 2: Update the inner role loop in `buildShiftReportHtml`**

In `buildShiftReportHtml`'s `shiftBlockHtml` closure (around lines 131-155), replace this block:

```ts
SR_VERTICALS.forEach((v) => {
  const vc = vcfg[v.key];
  if (!vc?.enabled || !vc.shifts.includes(shiftKey)) return;
  const vData = shiftData[v.key] ?? {};
  let vActual = 0, vPlanned = 0;
  v.roles.forEach((r) => {
    vActual  += Number(vData[r.key]) || 0;
    vPlanned += Number(vc.roles[r.key]?.[shiftKey]) || 0;
  });
  const vPct = vPlanned > 0 ? Math.round((vActual / vPlanned) * 1000) / 10 : 0;
  rowsHtml += `<tr class="vh"><td colspan="4">${v.icon} ${escapeHtml(v.nameAr)}` +
    `  <span class="vtot">(الفعلي ${vActual} / التعاقدي ${vPlanned} = ` +
    `<span class="${pctClass(vPct)}">${vPct.toFixed(1)}%</span>)</span></td></tr>`;
  v.roles.forEach((r) => {
    const actual  = Number(vData[r.key]) || 0;
    const planned = Number(vc.roles[r.key]?.[shiftKey]) || 0;
    const rPct    = planned > 0 ? Math.round((actual / planned) * 1000) / 10 : (actual > 0 ? 100 : 0);
    rowsHtml += '<tr>' +
      `<td>${escapeHtml(r.labelAr)}</td>` +
      `<td class="num">${actual}</td>` +
      `<td class="num">${planned}</td>` +
      `<td class="num ${pctClass(rPct)}">${planned > 0 ? rPct.toFixed(1) + '%' : '—'}</td>` +
      '</tr>';
  });
});
```

with:

```ts
SR_VERTICALS.forEach((v) => {
  const vc = vcfg[v.key];
  if (!vc || !vc.shifts.includes(shiftKey)) return;
  const addedRoles = v.roles.filter((r) => r.key in vc.roles);
  if (addedRoles.length === 0) return;
  const vData = shiftData[v.key] ?? {};
  let vActual = 0, vPlanned = 0;
  addedRoles.forEach((r) => {
    vActual  += Number(vData[r.key]) || 0;
    vPlanned += Number(vc.roles[r.key]?.[shiftKey]) || 0;
  });
  const vPct = vPlanned > 0 ? Math.round((vActual / vPlanned) * 1000) / 10 : 0;
  rowsHtml += `<tr class="vh"><td colspan="4">${v.icon} ${escapeHtml(v.nameAr)}` +
    `  <span class="vtot">(الفعلي ${vActual} / التعاقدي ${vPlanned} = ` +
    `<span class="${pctClass(vPct)}">${vPct.toFixed(1)}%</span>)</span></td></tr>`;
  addedRoles.forEach((r) => {
    const actual  = Number(vData[r.key]) || 0;
    const planned = Number(vc.roles[r.key]?.[shiftKey]) || 0;
    const rPct    = planned > 0 ? Math.round((actual / planned) * 1000) / 10 : (actual > 0 ? 100 : 0);
    rowsHtml += '<tr>' +
      `<td>${escapeHtml(r.labelAr)}</td>` +
      `<td class="num">${actual}</td>` +
      `<td class="num">${planned}</td>` +
      `<td class="num ${pctClass(rPct)}">${planned > 0 ? rPct.toFixed(1) + '%' : '—'}</td>` +
      '</tr>';
  });
});
```

Notable changes:
- `vc?.enabled` requirement dropped — presence-only.
- `const addedRoles = v.roles.filter((r) => r.key in vc.roles);` precomputed and used for both the vertical-totals row and the role rows.
- Empty-vertical fast-path: if a vertical was added but has no roles for this shift, the section drops it entirely instead of emitting an empty header row.

- [ ] **Step 3: Run the tests — confirm GREEN**

```bash
npm run test -- src/lib/fmplus/shift-report/render.test.ts
```

Expected: all tests pass. If any still fail, do not move on — fix the renderer until they do.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fmplus/shift-report/render.ts
git commit -m "feat(shift-report): renderer iterates added roles only, drops enabled gate"
```

---

## Task 3: Update types — drop `enabled`, simplify defaults

**Files:**
- Modify: `src/lib/fmplus/shift-report/types.ts`

This task changes the `VerticalConfig` type. Doing so will surface TypeScript errors in `shift-report-module.tsx` (which still references `vc.enabled`, calls `toggleVertical`, etc.) — those are fixed in Task 4. Don't try to run `npm run build` between Task 3 and Task 4; it will be transiently broken.

- [ ] **Step 1: Drop `enabled` from `VerticalConfig`**

In `src/lib/fmplus/shift-report/types.ts`, replace:

```ts
export interface VerticalConfig {
  enabled: boolean;
  shifts:  ShiftKey[];
  roles:   Record<string, RolePlanned>;
}
```

with:

```ts
export interface VerticalConfig {
  shifts: ShiftKey[];
  roles:  Record<string, RolePlanned>;
}
```

- [ ] **Step 2: Replace `defaultVerticalConfig()`; add `newVerticalConfig()`**

Replace the existing `defaultVerticalConfig` function (currently lines 79-87):

```ts
export function defaultVerticalConfig(): Record<VerticalKey, VerticalConfig> {
  const out = {} as Record<VerticalKey, VerticalConfig>;
  SR_VERTICALS.forEach((v) => {
    const roles: Record<string, RolePlanned> = {};
    v.roles.forEach((r) => { roles[r.key] = { morning: 0, night: 0 }; });
    out[v.key] = { enabled: false, shifts: [], roles };
  });
  return out;
}
```

with:

```ts
/** Default for a fresh, unconfigured project — no verticals added yet. */
export function defaultVerticalConfig(): Partial<Record<VerticalKey, VerticalConfig>> {
  return {};
}

/** Factory for a newly-added vertical (used by the Settings tab add-vertical handler). */
export function newVerticalConfig(): VerticalConfig {
  return { shifts: [], roles: {} };
}
```

- [ ] **Step 3: Verify the file compiles in isolation**

Run a TS check on just `types.ts` and its direct test importer:

```bash
npx tsc --noEmit src/lib/fmplus/shift-report/types.ts src/lib/fmplus/shift-report/render.ts src/lib/fmplus/shift-report/render.test.ts
```

Expected: no errors. (We do not run a full `npm run build` here — the component still references the removed `enabled` field and `defaultVerticalConfig`'s old shape; Task 4 fixes that.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/fmplus/shift-report/types.ts
git commit -m "refactor(shift-report): drop VerticalConfig.enabled, add newVerticalConfig"
```

---

## Task 4: Settings & Daily Report — add/remove UI

**Files:**
- Modify: `src/app/fmplus/shift-report/[contractId]/_components/shift-report-module.tsx`

This is the biggest change. We're (a) updating `hasConfig`, (b) replacing `toggleVertical` with `addVertical` + `removeVertical`, (c) adding `addRole` + `removeRole`, (d) rewriting the Settings tab vertical-cards loop, and (e) updating `ShiftSection`.

- [ ] **Step 1: Update imports**

At the top of the file (lines 1-23), the imports already include `SR_VERTICALS`, `AR_DAYS`, `defaultReportData`, `formatDate`, `ShiftReportConfig`, `ShiftReportData`, `SectionKey`, `ShiftKey`, `VerticalKey`, `VerticalConfig`. Add `newVerticalConfig`:

```ts
import {
  SR_VERTICALS,
  AR_DAYS,
  defaultReportData,
  formatDate,
  newVerticalConfig,
  type ShiftReportConfig,
  type ShiftReportData,
  type SectionKey,
  type ShiftKey,
  type VerticalKey,
  type VerticalConfig,
} from '@/lib/fmplus/shift-report/types';
```

- [ ] **Step 2: Update `hasConfig` derivation**

At line 34, replace:

```ts
const hasConfig = Object.values(initialConfig.verticals ?? {}).some((v) => v?.enabled);
```

with:

```ts
const hasConfig = Object.keys(initialConfig.verticals ?? {}).length > 0;
```

- [ ] **Step 3: Replace `toggleVertical` with `addVertical` + `removeVertical` and add `addRole` + `removeRole`**

Find the existing `toggleVertical` function (around lines 72-79) and the `toggleShift` function right after it. Replace `toggleVertical` (the entire function) with the following four handlers. Keep `toggleShift`, `setPlanned`, and `setRoleCount` exactly as they are.

```ts
function addVertical(vert: VerticalKey) {
  setConfig((prev) => {
    if (prev.verticals?.[vert]) return prev;
    return {
      ...prev,
      verticals: { ...(prev.verticals ?? {}), [vert]: newVerticalConfig() },
    };
  });
}

function removeVertical(vert: VerticalKey) {
  setConfig((prev) => {
    const next = { ...(prev.verticals ?? {}) };
    delete next[vert];
    return { ...prev, verticals: next };
  });
}

function addRole(vert: VerticalKey, roleKey: string) {
  setConfig((prev) => {
    const verticals = { ...(prev.verticals ?? {}) };
    const vc = verticals[vert];
    if (!vc) return prev;
    if (roleKey in vc.roles) return prev;
    verticals[vert] = {
      ...vc,
      roles: { ...vc.roles, [roleKey]: { morning: 0, night: 0 } },
    };
    return { ...prev, verticals };
  });
}

function removeRole(vert: VerticalKey, roleKey: string) {
  setConfig((prev) => {
    const verticals = { ...(prev.verticals ?? {}) };
    const vc = verticals[vert];
    if (!vc) return prev;
    const nextRoles = { ...vc.roles };
    delete nextRoles[roleKey];
    verticals[vert] = { ...vc, roles: nextRoles };
    return { ...prev, verticals };
  });
}
```

- [ ] **Step 4: Replace the Settings tab vertical-cards block**

Find the Settings tab's verticals loop (currently `{SR_VERTICALS.map((v) => { … })}` around lines 339-446) and replace it entirely with the block below. The Project info card immediately above it (contract number + WA group inputs, lines 302-336) is unchanged.

```tsx
{/* Vertical picker — visible while there are still unadded verticals */}
{SR_VERTICALS.some((v) => !((config.verticals ?? {})[v.key])) && (
  <div className="ix-card p-3 flex items-center gap-3 flex-wrap">
    <span className="text-xs font-semibold text-fmplus-gold dark:text-fmplus-yellow">
      + إضافة خدمة
    </span>
    <select
      value=""
      onChange={(e) => {
        const val = e.target.value as VerticalKey | '';
        if (val) addVertical(val);
        e.currentTarget.selectedIndex = 0;
      }}
      className="ix-input text-sm flex-1 min-w-[160px]"
    >
      <option value="" disabled>اختر خدمة…</option>
      {SR_VERTICALS
        .filter((v) => !((config.verticals ?? {})[v.key]))
        .map((v) => (
          <option key={v.key} value={v.key}>{v.icon} {v.nameAr}</option>
        ))}
    </select>
  </div>
)}

{/* Vertical cards (canonical order) */}
{SR_VERTICALS
  .filter((v) => (config.verticals ?? {})[v.key])
  .map((v) => {
    const vc = (config.verticals ?? {})[v.key] as VerticalConfig;
    const unaddedRoles = v.roles.filter((r) => !(r.key in vc.roles));
    return (
      <div
        key={v.key}
        className="ix-card p-4 border-fmplus-gold/50 dark:border-fmplus-yellow/50"
      >
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-bold text-fmplus-gold dark:text-fmplus-yellow">
            {v.icon} {v.nameAr}
          </span>
          <button
            type="button"
            onClick={() => removeVertical(v.key)}
            aria-label={`حذف ${v.nameAr}`}
            className="text-base leading-none px-2 py-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            ×
          </button>
        </div>

        {/* Shift toggles */}
        <div className="flex gap-2 mb-3">
          {(['morning', 'night'] as ShiftKey[]).map((sk) => {
            const ar = sk === 'morning' ? 'الصباحية' : 'المسائية';
            const active = vc.shifts.includes(sk);
            return (
              <button
                key={sk}
                type="button"
                onClick={() => toggleShift(v.key, sk)}
                className={
                  'text-xs font-medium px-3 py-1 rounded border transition ' +
                  (active
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 text-indigo-700 dark:text-indigo-300 font-bold'
                    : 'border-slate-300 dark:border-slate-600 text-slate-500 hover:border-slate-400')
                }
              >
                {sk === 'morning' ? '🌅' : '🌙'} {ar}
              </button>
            );
          })}
        </div>

        {/* Roles section (only when at least one shift is selected) */}
        {vc.shifts.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              الأعداد التعاقدية (مخطط):
            </div>
            <div className="space-y-1">
              {v.roles
                .filter((role) => role.key in vc.roles)
                .map((role) => {
                  const rVals = vc.roles[role.key] ?? {};
                  return (
                    <div
                      key={role.key}
                      className="flex items-center gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                    >
                      <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                        {role.labelAr}
                      </span>
                      {vc.shifts.includes('morning') && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500">ص</span>
                          <input
                            type="number"
                            min={0}
                            value={rVals.morning ?? 0}
                            onChange={(e) => setPlanned(v.key, role.key, 'morning', e.target.value)}
                            className="ix-input w-14 text-sm text-center"
                          />
                        </div>
                      )}
                      {vc.shifts.includes('night') && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500">م</span>
                          <input
                            type="number"
                            min={0}
                            value={rVals.night ?? 0}
                            onChange={(e) => setPlanned(v.key, role.key, 'night', e.target.value)}
                            className="ix-input w-14 text-sm text-center"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRole(v.key, role.key)}
                        aria-label={`حذف ${role.labelAr}`}
                        className="text-base leading-none px-2 py-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
            </div>

            {/* Role picker — only when there are still unadded roles for this vertical */}
            {unaddedRoles.length > 0 && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-fmplus-gold dark:text-fmplus-yellow">
                  + إضافة دور
                </span>
                <select
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) addRole(v.key, val);
                    e.currentTarget.selectedIndex = 0;
                  }}
                  className="ix-input text-sm flex-1 min-w-[160px]"
                >
                  <option value="" disabled>اختر دور…</option>
                  {unaddedRoles.map((r) => (
                    <option key={r.key} value={r.key}>{r.labelAr}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    );
  })}
```

- [ ] **Step 5: Update `ShiftSection` (Daily Report) iteration**

Find the `ShiftSection` function (lines 479-539). Two changes inside it:

(a) Replace the `activeVerts` filter (around lines 481-484):

```ts
const activeVerts = SR_VERTICALS.filter((v) => {
  const vc = vcfg[v.key];
  return vc?.enabled && vc.shifts.includes(shiftKey);
});
```

with:

```ts
const activeVerts = SR_VERTICALS.filter((v) => {
  const vc = vcfg[v.key];
  return vc
    && vc.shifts.includes(shiftKey)
    && Object.keys(vc.roles).length > 0;
});
```

(b) In the same function, replace the role iteration (around lines 514-533):

```tsx
{v.roles.map((role) => {
  const planned = vc.roles[role.key]?.[shiftKey] ?? 0;
  return (
    <div
      key={role.key}
      className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
    >
      <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{role.labelAr}</span>
      <span className="text-[10px] text-slate-500 mx-2">(مخطط: {planned})</span>
      <input
        type="number"
        min={0}
        value={sData[role.key] ?? 0}
        onChange={(e) => onChange(section, v.key, role.key, e.target.value)}
        className="ix-input w-16 text-sm text-center"
      />
    </div>
  );
})}
```

with:

```tsx
{v.roles
  .filter((role) => role.key in vc.roles)
  .map((role) => {
    const planned = vc.roles[role.key]?.[shiftKey] ?? 0;
    return (
      <div
        key={role.key}
        className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
      >
        <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{role.labelAr}</span>
        <span className="text-[10px] text-slate-500 mx-2">(مخطط: {planned})</span>
        <input
          type="number"
          min={0}
          value={sData[role.key] ?? 0}
          onChange={(e) => onChange(section, v.key, role.key, e.target.value)}
          className="ix-input w-16 text-sm text-center"
        />
      </div>
    );
  })}
```

The rest of `ShiftSection` (the wrapper `<div>`, the `activeVerts.length === 0` empty state, the per-vertical mini-header) is unchanged. Because `activeVerts` now requires `Object.keys(vc.roles).length > 0`, verticals with no added roles auto-drop from each shift section, and if no vertical qualifies the existing "لا توجد خدمات مفعّلة" empty state shows.

- [ ] **Step 6: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. Common pitfalls to watch for:
- An unused `toggleVertical` import or leftover reference — remove it.
- An unused `VerticalConfig` import — keep it, it's used in the new code (`as VerticalConfig` cast).
- `setReport` / `setPlanned` / `setRoleCount` signatures should be untouched.

If the typecheck reports anything else, fix it before continuing.

- [ ] **Step 7: Run the test suite (still green)**

```bash
npm run test
```

Expected: all tests pass, including the renderer tests added in Task 1.

- [ ] **Step 8: Commit**

```bash
git add src/app/fmplus/shift-report/[contractId]/_components/shift-report-module.tsx
git commit -m "feat(shift-report): per-project +/× add/remove for verticals and roles"
```

---

## Task 5: Manual verification in dev

**Files:** none — runtime smoke test.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait for "Ready" / port 3000 announcement.

- [ ] **Step 2: Open the City Gate Shift Reports page**

In a browser, navigate to `http://localhost:3000/fmplus/shift-report/<contractId>` for the City Gate contract. (If you don't know the contract ID, the landing page at `/fmplus/shift-report` lists them — click "City Gate".)

The Settings tab should open by default if the project has no config yet, or you can click into it.

- [ ] **Step 3: Smoke-test the Settings UI**

Verify each of the following:

| Action | Expected |
|--------|----------|
| Open Settings on a project with no config yet | No vertical cards visible. A `+ إضافة خدمة` row sits above where the cards would be, with a `<select>` placeholder "اختر خدمة…". |
| Pick "🛡️ الأمن" from the vertical picker | A Security card appears with morning/night shift toggles and an empty roles area. Picker stays visible but Security is no longer in its dropdown options. |
| Click the morning shift toggle | Roles area expands. `+ إضافة دور` appears with a `<select>` of all 7 master roles. |
| Pick "مدير الامن" | A row appears with `0` morning input and `×` button. Picker still has the other 6 roles. |
| Set morning planned to `1`, add supervisor (`2`), add personnel (`5`) | Three rows visible. Picker now lists 4 remaining roles. |
| Click `×` on supervisor | Row disappears instantly. Picker now shows 5 roles (supervisor is back in the picker list). |
| Re-add supervisor, leave value at 0 | Row reappears with `0`. No `enabled` state in the UI. |
| Click `×` on the Security card header | Security card disappears. Vertical picker now lists all 4 verticals again. |
| Re-add Security, re-add morning, re-add the 3 roles, fill in values, click "حفظ الإعدادات" | Toast "✓ تم حفظ الإعدادات" appears; module switches to the Report tab. |

- [ ] **Step 4: Smoke-test the Daily Report tab**

| Action | Expected |
|--------|----------|
| Open Report tab after the save in Step 3 | "اليوم — الصباحية" and "أمس — الصباحية" sections each show **only** the Security vertical with the 3 added roles. "أمس — المسائية" section says "لا توجد خدمات مفعّلة لهذه الوردية" (no night shift configured). |
| Type actual counts (e.g. 1/2/4 for today, 1/1/5 for yesterday morning) | Numbers stick. |
| Click "إرسال تقرير الوردية" | Toast confirms send (or graceful WA error if the test WA group isn't reachable). The detailed HTML report URL — if WA succeeded — should open to a page that shows only the 3 added Security roles in each rendered shift, **no** rows for موتوسيكل / سيارة الجيب / etc. |
| Switch to History tab | The submitted report appears with today's date. Click "فتح التفاصيل" → opens the HTML report at the Supabase Storage URL → again, only the 3 added roles render. |

If anything in Step 3 or Step 4 doesn't match the expected behavior, stop and debug before continuing.

- [ ] **Step 5: Smoke-test backward compatibility against a legacy config**

If any project has an existing config saved before this change (run `select contract_id, verticals from fmplus_shift_report_configs limit 5;` via Supabase SQL Editor to find one), open its Shift Reports page and verify:

- The Settings tab renders without crashes. Old configs with `enabled: false` show their verticals as added cards (with all the pre-populated roles), so the user may see more rows than they expect — they can `×` them down to a clean set.
- Clicking "حفظ الإعدادات" persists the new shape (no `enabled` field). Re-running `select verticals from fmplus_shift_report_configs where contract_id = X;` after save should show clean JSONB.

If no legacy configs exist yet, skip this step.

- [ ] **Step 6: Stop the dev server**

Hit `Ctrl+C` in the dev-server terminal.

---

## Task 6: Build, push, deploy

**Files:** none.

- [ ] **Step 1: Full production build**

```bash
npm run build
```

Expected: build succeeds with no TS errors. (There is no `lint` script per CLAUDE.md.)

If the build fails, fix the issue and re-run before moving on. Common fix-up causes: stale type imports, an unhandled case in the new pickers' `<select>` handlers.

- [ ] **Step 2: Verify git state**

```bash
git status --short
```

Expected: clean working tree (all commits from Tasks 1–4 are already in). If `SESSION_HANDOFF.md` is dirty (because of session-end hooks during implementation), commit it separately first with `git commit -m "docs(session): shift report add/remove roles implementation"`.

- [ ] **Step 3: Rebase and push to main**

```bash
git fetch origin main
git rebase origin/main
git push origin main
```

Expected: push succeeds. If `rebase` reports conflicts, resolve them and continue (`git rebase --continue`).

The GitHub → Vercel integration auto-deploys to production at `limeinc.vercel.app` / `app.limeinc.cc` within a minute or two. Per repo CLAUDE.md, no manual `vercel --prod` is required from main.

- [ ] **Step 4: Verify production**

Wait ~90 seconds for the Vercel deploy. Then in a browser open `https://app.limeinc.cc/fmplus/shift-report/<contractId>` (or the same URL on `limeinc.vercel.app`). Verify:

- Settings tab loads.
- A vertical picker is visible if the project has no config (or below the cards if some verticals are added).
- Clicking `×` on a role row removes it.
- Clicking `×` on a vertical card removes the whole card.

If production looks correct, the rollout is complete.

---

## Verification summary

After Task 6:
- All Vitest tests pass (`npm run test`).
- Production build succeeds (`npm run build`).
- Dev-server manual smoke covers: add/remove vertical, add/remove role, save, daily report shows only added roles, submit produces an HTML report that contains only added rows.
- Production deploy reachable and behaving the same.
- No schema migrations; `fmplus_shift_report_configs.verticals` continues to store JSONB and naturally migrates to the new shape on next save.
