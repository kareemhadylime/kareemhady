# Shift Reports — Per-project Add/Remove Verticals & Roles

Date: 2026-05-18
Module: FMPLUS / Shift Reports
Status: Design approved — pending spec review

## Problem

The Shift Reports Settings page currently shows **all 4 verticals** and, within each enabled vertical, **all of its master roles** as fixed rows (e.g. Security always renders 7 rows regardless of whether the project actually has a manager, motorcycle, jeep, wireless, etc.). For a project like City Gate that only contracts a subset of those roles, the Settings screen is cluttered and the Daily Report form forces the user to enter 0s for every irrelevant row, which then leak into the WhatsApp summary and the rendered HTML report.

The user wants the role list (and vertical list) to be **per-project**: only what's contracted shows up.

## Goal

Replace the fixed "all roles always present" model with explicit add/remove UI in Settings, mirrored everywhere the config is consumed.

- Each vertical card in Settings shows only the roles the user has added.
- A `+ إضافة دور` picker (filtered `<select>` of remaining roles in that vertical) adds a row.
- A small `×` at the end of each row removes the role from that project's config.
- The same pattern applies one level up: a `+ إضافة خدمة` picker adds a whole vertical, an `×` on the vertical-card header removes it. The legacy "تفعيل" toggle is retired.
- Daily Report tab, `computeShiftTotals`, `buildShiftWAMessage`, and `buildShiftReportHtml` all iterate the **config's own role keys** instead of the global `SR_VERTICALS` master list.

The 4-vertical master catalog (`SR_VERTICALS`) and per-vertical canonical role lists remain fixed and govern *what's available to pick* — they are no longer the per-project source of truth for *what renders*.

## Out of scope

- Custom role names (free-text). Picker is restricted to the master list per vertical.
- Adding new verticals beyond the existing 4 (security / cleaning / pest_control / landscape).
- Changing the morning/night shift selection model — still multi-select buttons per vertical.
- Adding a separate "Edit Project Owner" UI on the Shift Reports page. `project_contracts.customer` is the shared source of truth with Budgets/Project Hub at `/fmplus/financial/budget/projects/[contractId]`.
- Confirmation dialogs / undo toasts on `×`. Removal is instant; `+` brings it back.

## Picker UX detail

Both pickers (vertical and role) use native `<select>` elements for simplicity, RTL safety, and a11y:

- Render a small inline `<select>` next to the `+` label, with a placeholder option `<option value="" disabled selected>اختر…</option>` and one option per remaining item.
- `onChange` fires `addVertical(key)` / `addRole(v.key, roleKey)` and the picker resets to the placeholder.
- When the remaining list is empty, the entire `+` button + select is hidden.

## Orphaned in-session data on removal

When a user removes a role (or whole vertical) **after** typing actual headcounts into the Daily Report tab without submitting:

- The `report` React state (`ShiftReportData`) keeps the orphaned counts in memory — there's no cross-state cleanup.
- On submit, `submitShiftReport` and the three render helpers iterate **config-provided keys only**, so orphaned counts are silently dropped from the WhatsApp summary, the HTML report, and the persisted `fmplus_shift_reports.data` row.
- This is intentional — removing a role means "this isn't part of the contract", so its actual count shouldn't appear in the daily report. No warning prompt is needed.

## Schema

**No migration.** `fmplus_shift_report_configs.verticals` is already a JSONB column. The "every vertical key present with `enabled: false` and every role pre-populated at 0/0" was a frontend convention from `defaultVerticalConfig()`, never a DB constraint.

After this change:

- `ShiftReportConfig.verticals` keeps its `Partial<Record<VerticalKey, VerticalConfig>>` shape — but **presence of a key = added**, absence = not added. The `enabled` boolean is deprecated and removed from the type.
- `VerticalConfig.roles: Record<string, RolePlanned>` keeps its shape — but **presence of a role key = added**, absence = not added.
- Old saved configs (from before this change) load fine: their `enabled: false` flag is ignored on read, and any pre-populated `{morning: 0, night: 0}` role entries simply show up as added rows that the user can `×` to clean up. On the next save, normalization strips `enabled` from the JSONB.

## UX changes

### Settings tab

**Project info card** — unchanged (contract number + WhatsApp group).

**Vertical picker (new, top of verticals list)** — a `+ إضافة خدمة` button beside an inline `<select>` of verticals from `SR_VERTICALS` whose `key` isn't already in `Object.keys(config.verticals)`. Picking one adds the vertical with `{ shifts: [], roles: {} }` and reveals its card. When all 4 are added, the picker is hidden.

**Vertical card** (rendered for every key in `Object.keys(config.verticals)`, in `SR_VERTICALS` canonical order):
- Header: icon + Arabic name + `×` button (right-end in RTL) that calls `removeVertical(v.key)` and `delete`s the key from `config.verticals`.
- Shift toggles (Morning / Night) — unchanged.
- Roles section (only when at least one shift is selected):
  - Iterate `Object.keys(vc.roles)` ordered by canonical `SR_VERTICALS[v].roles` order.
  - Each row: label + morning/night number inputs (only for active shifts) + `×` button (row end). `×` calls `removeRole(v.key, roleKey)` and `delete`s the key from `vc.roles`.
  - Below the rows: `+ إضافة دور` button with an inline `<select>` of roles in `SR_VERTICALS[v].roles` whose key isn't in `Object.keys(vc.roles)`. Picking one inserts `{ morning: 0, night: 0 }` for that role.
  - When all roles are added, the role picker is hidden.

The legacy "✓ مفعّل / تفعيل" toggle button is removed.

### Daily Report tab

- `ShiftSection` iterates `Object.keys(vc.roles)` (in canonical order) instead of `SR_VERTICALS[v].roles`.
- If a vertical has zero added roles for the section's shift, drop its mini-header for that section.
- The "لا توجد خدمات مفعّلة لهذه الوردية" empty state still triggers when no vertical contributes any role for the shift.
- `activeVerts` filter changes from `vc?.enabled && vc.shifts.includes(shiftKey)` to `vc && vc.shifts.includes(shiftKey) && Object.keys(vc.roles).length > 0`.

### History tab

Unchanged.

## Renderer changes (server-side report)

[src/lib/fmplus/shift-report/render.ts](../../../src/lib/fmplus/shift-report/render.ts):

- `computeShiftTotals(section, config)` — replace `SR_VERTICALS.forEach(v => v.roles.forEach(...))` iteration with `Object.entries(config.verticals).forEach(([vKey, vc]) => Object.keys(vc.roles).forEach(...))`. Skip verticals whose `shifts` don't include the section's shift.
- `buildShiftWAMessage(...)` — same iteration source. Skips empty verticals automatically.
- `buildShiftReportHtml(...)` — same. The detailed HTML report only shows tables for added roles, never the master list's untouched rows.

These changes ensure the WhatsApp summary and the rendered HTML report match exactly what was filled in on the Daily Report tab.

## Type changes

[src/lib/fmplus/shift-report/types.ts](../../../src/lib/fmplus/shift-report/types.ts):

```ts
// Before
export interface VerticalConfig {
  enabled: boolean;
  shifts:  ShiftKey[];
  roles:   Record<string, RolePlanned>;
}

// After
export interface VerticalConfig {
  shifts: ShiftKey[];
  roles:  Record<string, RolePlanned>;
}
```

`defaultVerticalConfig()` becomes a thin helper that returns `{}` for new configs (empty record of verticals). The per-vertical default factory:

```ts
export function newVerticalConfig(): VerticalConfig {
  return { shifts: [], roles: {} };
}
```

`hasConfig` derivation in [shift-report-module.tsx:34](../../../src/app/fmplus/shift-report/[contractId]/_components/shift-report-module.tsx#L34) changes from:

```ts
const hasConfig = Object.values(initialConfig.verticals ?? {}).some((v) => v?.enabled);
```

to:

```ts
const hasConfig = Object.keys(initialConfig.verticals ?? {}).length > 0;
```

## Backward compatibility

On load, the page server-component does no transformation — old configs pass through. The client component:
- Ignores `enabled` (it's no longer in the type; old JSONB carries it harmlessly).
- Renders any `vc.roles` key that exists, even if it was pre-populated by the old `defaultVerticalConfig()` at 0/0.

On save, the new `saveShiftReportConfig` serializes only the new shape — `enabled` is gone, only added verticals and roles persist. Old projects effectively migrate themselves the first time someone hits "حفظ الإعدادات".

## Files touched

1. **[src/lib/fmplus/shift-report/types.ts](../../../src/lib/fmplus/shift-report/types.ts)**
   - Remove `enabled` from `VerticalConfig`.
   - `defaultVerticalConfig()` → empty object.
   - Add `newVerticalConfig()` helper.
2. **[src/app/fmplus/shift-report/[contractId]/_components/shift-report-module.tsx](../../../src/app/fmplus/shift-report/[contractId]/_components/shift-report-module.tsx)**
   - New handlers: `addVertical(key)`, `removeVertical(key)`, `addRole(vert, roleKey)`, `removeRole(vert, roleKey)`.
   - Settings tab: vertical picker, per-card `×`, role picker, per-row `×`. Retire the `toggleVertical` button.
   - `ShiftSection`: iterate `Object.keys(vc.roles)` ordered by canonical role order; drop empty verticals.
   - `hasConfig` derivation updated.
3. **[src/lib/fmplus/shift-report/render.ts](../../../src/lib/fmplus/shift-report/render.ts)**
   - All three render helpers iterate the config's own keys.
4. **`src/lib/fmplus/shift-report/render.test.ts`** *(new)*
   - Vitest coverage: a config with only `security: { roles: { manager, supervisor, personnel } }` and morning shift → `computeShiftTotals` returns just those 3 rows; `buildShiftWAMessage` lists only them; `buildShiftReportHtml` HTML contains only those role labels.

No server-action or migration changes.

## Verification

After implementation:
- Open `/fmplus/shift-report/<contractId>` for City Gate.
- Add Security with morning shift, add only manager / supervisor / personnel roles, set planned counts.
- Daily Report tab renders only those 3 rows under "اليوم — الصباحية" and "أمس — الصباحية"; the night section drops Security entirely.
- Fill actuals, submit. WhatsApp summary references manager / supervisor / personnel only. Detailed HTML report at the public Supabase Storage URL contains those rows only.
- Reopen Settings → click `×` on supervisor → row disappears → save → re-open page → supervisor is gone. Click `+ إضافة دور` → pick supervisor → row reappears with `0/0` defaults.

## Risks

- **Old configs auto-clean on first save.** Acceptable: the module shipped today (commit `c583b4ba`); near-zero existing data. Worst case: a user re-clicks "حفظ الإعدادات" and the `enabled: false` flag is dropped from their JSONB.
- **Renderer skipping unconfigured roles.** This is the *intent* — the report now reflects what the project contracts, not the master list. No risk of accidentally hiding data: any role with a non-zero submitted count is by definition one that was added (since unadded roles can't have inputs).
- **`+ إضافة دور` picker UX.** Inline `<select>` keeps the bundle and a11y simple; no custom dropdown component needed. RTL-friendly out of the box.
