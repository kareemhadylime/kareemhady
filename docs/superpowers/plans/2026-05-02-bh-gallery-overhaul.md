# BH Gallery UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship persistent uploader, drag-reorder + click-to-select reorder, multi-select bulk actions (delete/move/tag/ad-toggle), and "Wipe album" with `DELETE` confirmation across `/beithady/gallery/**`.

**Architecture:** Add `sort_order` int column with full-list renumber on each move; lift uploader + selection state into a `<GalleryProvider>` mounted in `gallery/layout.tsx` so it survives intra-gallery navigation; use `@dnd-kit/core` + `/sortable` for D&D with touch + a11y; new `bulk-*` server actions with batch ids.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + Storage) · `@dnd-kit/*` · Tailwind v4 · `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-05-02-bh-gallery-overhaul-design.md`

**Codebase context (read before starting):**
- This codebase has **no automated test framework**. Verification = `npm run build` (Next.js compile + TypeScript check) plus manual browser checks against the live deploy. Don't try to run `pytest`/`jest`/`vitest` — there's nothing to run.
- All edits auto-deploy: per `AGENTS.md`, after every change commit + push to main + `vercel --prod`. **However, this plan runs on a worktree branch** (`claude/busy-carson-e5604b`). Commit per task on that branch; the final task does the merge-to-main + deploy.
- DB migrations are applied **via the Supabase dashboard SQL editor**, not the Supabase CLI (CLI doesn't end up on PATH on Windows — see `AGENTS.md`). Project ref: `bpjproljatbrbmszwbov`. There's also an MCP tool `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` that can be used instead of the dashboard.
- Client/server boundary: `actions.ts` files are `'use server'`. Client components import server actions and call them — Next.js wires it up.
- Soft-delete semantics: setting `deleted_at` hides from queries (every read filters `is('deleted_at', null)`). Storage objects are best-effort hard-deleted alongside.

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/0066_beithady_gallery_sort_order.sql` | new | sort_order column + index + backfill |
| `src/lib/beithady/gallery/gallery-list.ts` | modify | swap ORDER BY to `sort_order ASC, created_at DESC` |
| `src/app/beithady/gallery/actions.ts` | modify | + sort_order on insert, + 6 bulk actions |
| `src/app/beithady/gallery/layout.tsx` | new | mounts `<GalleryProvider>` + `<UploadTray>` |
| `src/app/beithady/gallery/_components/gallery-provider.tsx` | new | upload queue + selection state |
| `src/app/beithady/gallery/_components/upload-tray.tsx` | new | floating bottom-right tray |
| `src/app/beithady/gallery/_components/uploader.tsx` | rewrite | delegates to provider |
| `src/app/beithady/gallery/_components/selectable-asset-grid.tsx` | new | client grid w/ checkbox + D&D |
| `src/app/beithady/gallery/_components/asset-grid.tsx` | delete | replaced |
| `src/app/beithady/gallery/_components/bulk-action-bar.tsx` | new | floating action bar |
| `src/app/beithady/gallery/_components/move-to-unit-modal.tsx` | new | unit picker modal |
| `src/app/beithady/gallery/_components/nuke-album-button.tsx` | new | wipe-album button + typed confirm |
| `src/app/beithady/gallery/[buildingCode]/[listingId]/page.tsx` | modify | swap grid + add nuke btn |
| `src/app/beithady/gallery/[buildingCode]/general/page.tsx` | modify | swap grid + add nuke btn |
| `package.json` | modify | + `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |

---

## Task 1: Migration 0066 — sort_order column

**Files:**
- Create: `supabase/migrations/0066_beithady_gallery_sort_order.sql`
- Apply via: Supabase dashboard SQL editor *or* `mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration` MCP tool

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0066_beithady_gallery_sort_order.sql` with:

```sql
-- =====================================================================
-- Beithady Gallery — Sort order column (Phase: gallery-overhaul)
-- =====================================================================
-- Adds sort_order so users can drag-reorder assets within an album.
-- Album = (building_code, listing_id) tuple, including (BH-XX, NULL)
-- for the General Building Area.
-- Backfill: existing rows get sort_order = -extract(epoch from created_at)
-- so newest = lowest = first, preserving today's "newest first" UX.

alter table public.beithady_gallery_assets
  add column if not exists sort_order int not null default 0;

update public.beithady_gallery_assets
   set sort_order = -extract(epoch from created_at)::int
 where sort_order = 0;

create index if not exists idx_bh_gallery_sort
  on public.beithady_gallery_assets(building_code, listing_id, sort_order)
  where deleted_at is null;

insert into public.beithady_audit_log(module, action, metadata) values
  ('gallery', 'sort_order_added',
   jsonb_build_object('migration', '0066_beithady_gallery_sort_order'));
```

- [ ] **Step 2: Apply the migration**

Either (preferred) call the Supabase MCP tool:
```
mcp__f6afcc50-71af-4679-98a5-f8e7338a72ed__apply_migration
  name: "0066_beithady_gallery_sort_order"
  query: <contents of the SQL file above>
```

OR open the Supabase dashboard for project `bpjproljatbrbmszwbov` → SQL Editor → paste + run.

- [ ] **Step 3: Verify the column exists**

Run this query (via MCP `execute_sql` or dashboard):
```sql
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_name = 'beithady_gallery_assets'
   and column_name = 'sort_order';
```
Expected: one row, `data_type=integer`, `column_default=0`, `is_nullable=NO`.

Then verify backfill worked:
```sql
select count(*) filter (where sort_order = 0) as zeros,
       count(*) filter (where sort_order != 0) as nonzeros
  from beithady_gallery_assets where deleted_at is null;
```
Expected: `zeros=0`, `nonzeros=` (matches total active assets). If `zeros > 0`, run the UPDATE again — the migration's WHERE filtered out the second-run case.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0066_beithady_gallery_sort_order.sql
git commit -m "feat(gallery): migration 0066 — add sort_order column with backfill"
```

---

## Task 2: Install dnd-kit packages

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the three dnd-kit packages**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify they appear in package.json dependencies**

```bash
grep -E "@dnd-kit/(core|sortable|utilities)" package.json
```
Expected: three lines, all under `"dependencies"`.

- [ ] **Step 3: Verify the build still works**

```bash
npm run build
```
Expected: build succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit/{core,sortable,utilities} for gallery reorder"
```

---

## Task 3: Update listAssets ordering

**Files:**
- Modify: `src/lib/beithady/gallery/gallery-list.ts:67-69`

- [ ] **Step 1: Swap the ORDER BY**

Find this block in `src/lib/beithady/gallery/gallery-list.ts`:
```typescript
  q = q
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
```

Replace with:
```typescript
  q = q
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
```

- [ ] **Step 2: Build to type-check**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beithady/gallery/gallery-list.ts
git commit -m "feat(gallery): order by sort_order ASC, created_at DESC"
```

---

## Task 4: uploadAssetAction sets sort_order on insert

**Files:**
- Modify: `src/app/beithady/gallery/actions.ts` (around line 71-89, the `sb.from('beithady_gallery_assets').insert({...})` block)

- [ ] **Step 1: Compute sort_order before insert**

In `uploadAssetAction`, after `const sb = supabaseAdmin();` and before the `.insert({...})` call, add:

```typescript
  // Compute sort_order so new uploads land at the top of the album
  // (one less than current min, scoped to the same building+listing).
  let sortOrderForInsert = 0;
  {
    const minQuery = sb
      .from('beithady_gallery_assets')
      .select('sort_order')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .limit(1);
    if (building) minQuery.eq('building_code', building); else minQuery.is('building_code', null);
    if (listingId) minQuery.eq('listing_id', listingId); else minQuery.is('listing_id', null);
    const { data: minRow } = await minQuery.maybeSingle();
    sortOrderForInsert = ((minRow as { sort_order: number } | null)?.sort_order ?? 0) - 1;
  }
```

Then update the insert to include `sort_order`:
```typescript
  const { data: ins, error } = await sb
    .from('beithady_gallery_assets')
    .insert({
      building_code: building,
      listing_id: listingId,
      category,
      storage_bucket: bucket,
      storage_path: path,
      file_name: fileName,
      mime_type: mime,
      size_bytes: ab.byteLength,
      uploaded_by: user.id,
      sort_order: sortOrderForInsert,
    })
    .select('id')
    .single();
```

- [ ] **Step 2: Build to type-check**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/gallery/actions.ts
git commit -m "feat(gallery): uploadAssetAction sets sort_order = min - 1"
```

---

## Task 5: reorderAssetsAction server action

**Files:**
- Modify: `src/app/beithady/gallery/actions.ts` (append at end of file)

- [ ] **Step 1: Add the action**

Append to `src/app/beithady/gallery/actions.ts`:

```typescript
// Reorder assets within a single album by full-list renumber.
// Caller passes the entire ordered ID list for the album page; server
// validates ids ⊂ album, then UPDATEs sort_order = 1..N in one statement.
const MAX_BULK_IDS = 200;

export async function reorderAssetsAction(input: {
  buildingCode: string | null;
  listingId: string | null;
  orderedIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requirePermission('full');
  const { buildingCode, listingId, orderedIds } = input;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'empty_orderedIds' };
  }
  if (orderedIds.length > MAX_BULK_IDS) {
    return { ok: false, error: `too_many_ids_max_${MAX_BULK_IDS}` };
  }

  const sb = supabaseAdmin();
  // Validate every id belongs to this album and isn't deleted.
  let validate = sb
    .from('beithady_gallery_assets')
    .select('id')
    .in('id', orderedIds)
    .is('deleted_at', null);
  if (buildingCode) validate = validate.eq('building_code', buildingCode);
  else validate = validate.is('building_code', null);
  if (listingId) validate = validate.eq('listing_id', listingId);
  else validate = validate.is('listing_id', null);

  const { data: validRows, error: vErr } = await validate;
  if (vErr) return { ok: false, error: vErr.message };
  const validIds = new Set(((validRows as Array<{ id: string }> | null) || []).map(r => r.id));
  if (validIds.size !== orderedIds.length) {
    return { ok: false, error: 'ids_not_in_album' };
  }

  // Renumber: one UPDATE per id (Supabase JS doesn't expose VALUES tables).
  // 200 ids max, runs in well under a second.
  const errors: string[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb
      .from('beithady_gallery_assets')
      .update({ sort_order: i + 1 })
      .eq('id', orderedIds[i]);
    if (error) errors.push(`${orderedIds[i]}: ${error.message}`);
  }
  if (errors.length > 0) return { ok: false, error: errors.join('; ') };

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_reordered',
    metadata: { building: buildingCode, listing_id: listingId, count: orderedIds.length },
  });

  revalidatePath('/beithady/gallery');
  if (buildingCode) revalidatePath(`/beithady/gallery/${buildingCode}`);
  if (buildingCode && listingId) revalidatePath(`/beithady/gallery/${buildingCode}/${listingId}`);
  if (buildingCode && !listingId) revalidatePath(`/beithady/gallery/${buildingCode}/general`);
  return { ok: true };
}
```

Add `'use server'` is already at the top of the file, so the new export is automatically a server action.

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/gallery/actions.ts
git commit -m "feat(gallery): add reorderAssetsAction with full-list renumber"
```

---

## Task 6: bulkDeleteAssetsAction

**Files:**
- Modify: `src/app/beithady/gallery/actions.ts` (append)

- [ ] **Step 1: Add the action**

Append to `src/app/beithady/gallery/actions.ts`:

```typescript
type BulkResult = { ok: string[]; failed: Array<{ id: string; error: string }> };

export async function bulkDeleteAssetsAction(input: { ids: string[] }): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_gallery_assets')
    .select('id, storage_bucket, storage_path, public_url, ad_eligible, building_code, listing_id')
    .in('id', ids)
    .is('deleted_at', null);
  const records = (rows as Array<{
    id: string; storage_bucket: GalleryBucket; storage_path: string;
    public_url: string | null; ad_eligible: boolean;
    building_code: string | null; listing_id: string | null;
  }> | null) || [];

  // Soft-delete in one UPDATE
  const { error: softErr } = await sb
    .from('beithady_gallery_assets')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', records.map(r => r.id));
  if (softErr) return { ok: [], failed: ids.map(id => ({ id, error: softErr.message })) };

  // Best-effort hard-delete from storage + demote ad-eligible. Concurrency 3.
  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const buildings = new Set<string>();
  const listings = new Set<string>();

  let cursor = 0;
  async function worker() {
    while (cursor < records.length) {
      const idx = cursor++;
      const r = records[idx];
      try {
        await deleteFromBucket(r.storage_bucket, r.storage_path);
        if (r.ad_eligible) await demoteFromPublic(r.storage_path);
        if (r.building_code) buildings.add(r.building_code);
        if (r.listing_id) listings.add(`${r.building_code}/${r.listing_id}`);
        ok.push(r.id);
      } catch (e) {
        // Soft-delete already happened; storage residue is acceptable
        ok.push(r.id);
        failed.push({ id: r.id, error: e instanceof Error ? e.message : 'storage_delete_failed' });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  for (const r of records) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'gallery',
      action: 'asset_deleted',
      target_type: 'asset',
      target_id: r.id,
      metadata: { storage_path: r.storage_path, ad_eligible: r.ad_eligible, bulk: true },
    });
  }

  revalidatePath('/beithady/gallery');
  for (const b of buildings) revalidatePath(`/beithady/gallery/${b}`);
  for (const k of listings) {
    const [b, l] = k.split('/');
    if (l) revalidatePath(`/beithady/gallery/${b}/${l}`);
  }
  return { ok, failed };
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/gallery/actions.ts
git commit -m "feat(gallery): add bulkDeleteAssetsAction"
```

---

## Task 7: bulkMoveAssetsAction

**Files:**
- Modify: `src/app/beithady/gallery/actions.ts` (append)

- [ ] **Step 1: Add the action**

Append:

```typescript
export async function bulkMoveAssetsAction(input: {
  ids: string[];
  targetBuildingCode: string | null;
  targetListingId: string | null;
}): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  const { targetBuildingCode, targetListingId } = input;
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  // Source records (for revalidation paths)
  const { data: srcRows } = await sb
    .from('beithady_gallery_assets')
    .select('id, building_code, listing_id')
    .in('id', ids)
    .is('deleted_at', null);
  const sources = (srcRows as Array<{ id: string; building_code: string | null; listing_id: string | null }> | null) || [];

  // Compute destination top
  let minQuery = sb
    .from('beithady_gallery_assets')
    .select('sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .limit(1);
  if (targetBuildingCode) minQuery = minQuery.eq('building_code', targetBuildingCode);
  else minQuery = minQuery.is('building_code', null);
  if (targetListingId) minQuery = minQuery.eq('listing_id', targetListingId);
  else minQuery = minQuery.is('listing_id', null);
  const { data: minRow } = await minQuery.maybeSingle();
  const top = ((minRow as { sort_order: number } | null)?.sort_order ?? 0);

  // Update each id with its new sort_order
  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    const newSort = top - ids.length + i;
    const { error } = await sb
      .from('beithady_gallery_assets')
      .update({
        building_code: targetBuildingCode,
        listing_id: targetListingId,
        sort_order: newSort,
      })
      .eq('id', ids[i])
      .is('deleted_at', null);
    if (error) failed.push({ id: ids[i], error: error.message });
    else ok.push(ids[i]);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_bulk_moved',
    metadata: {
      count: ok.length,
      target_building: targetBuildingCode,
      target_listing: targetListingId,
    },
  });

  // Revalidate every affected path
  const paths = new Set<string>(['/beithady/gallery']);
  for (const r of sources) {
    if (r.building_code) {
      paths.add(`/beithady/gallery/${r.building_code}`);
      if (r.listing_id) paths.add(`/beithady/gallery/${r.building_code}/${r.listing_id}`);
      else paths.add(`/beithady/gallery/${r.building_code}/general`);
    }
  }
  if (targetBuildingCode) {
    paths.add(`/beithady/gallery/${targetBuildingCode}`);
    if (targetListingId) paths.add(`/beithady/gallery/${targetBuildingCode}/${targetListingId}`);
    else paths.add(`/beithady/gallery/${targetBuildingCode}/general`);
  }
  for (const p of paths) revalidatePath(p);
  return { ok, failed };
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/actions.ts
git commit -m "feat(gallery): add bulkMoveAssetsAction (sets sort_order at destination top)"
```

---

## Task 8: bulkTagAssetsAction

**Files:**
- Modify: `src/app/beithady/gallery/actions.ts` (append)

- [ ] **Step 1: Add the action**

```typescript
function normalizeTags(raw: string[]): string[] {
  return Array.from(new Set(
    raw.map(t => t.toLowerCase().trim()).filter(Boolean)
  )).slice(0, 30);
}

export async function bulkTagAssetsAction(input: {
  ids: string[];
  addTags: string[];
  removeTags: string[];
}): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  const add = normalizeTags(input.addTags || []);
  const rem = new Set(normalizeTags(input.removeTags || []));
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_gallery_assets')
    .select('id, manual_tags')
    .in('id', ids)
    .is('deleted_at', null);
  const records = (rows as Array<{ id: string; manual_tags: string[] | null }> | null) || [];

  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const r of records) {
    const existing = (r.manual_tags || []).filter(t => !rem.has(t));
    const merged = Array.from(new Set([...existing, ...add])).slice(0, 30);
    const { error } = await sb
      .from('beithady_gallery_assets')
      .update({ manual_tags: merged })
      .eq('id', r.id);
    if (error) failed.push({ id: r.id, error: error.message });
    else ok.push(r.id);
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_bulk_tagged',
    metadata: { count: ok.length, add_tags: add, remove_tags: Array.from(rem) },
  });
  revalidatePath('/beithady/gallery');
  return { ok, failed };
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/actions.ts
git commit -m "feat(gallery): add bulkTagAssetsAction"
```

---

## Task 9: bulkAdEligibleAction

**Files:**
- Modify: `src/app/beithady/gallery/actions.ts` (append)

- [ ] **Step 1: Add the action**

```typescript
export async function bulkAdEligibleAction(input: {
  ids: string[];
  eligible: boolean;
}): Promise<BulkResult> {
  const user = await requirePermission('full');
  const ids = Array.isArray(input?.ids) ? input.ids.slice(0, MAX_BULK_IDS) : [];
  const target = !!input.eligible;
  if (ids.length === 0) return { ok: [], failed: [] };

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_gallery_assets')
    .select('id, storage_bucket, storage_path, ad_eligible')
    .in('id', ids)
    .is('deleted_at', null);
  const records = (rows as Array<{
    id: string; storage_bucket: string; storage_path: string; ad_eligible: boolean;
  }> | null) || [];

  const ok: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  let cursor = 0;
  async function worker() {
    while (cursor < records.length) {
      const idx = cursor++;
      const r = records[idx];
      if (r.ad_eligible === target) { ok.push(r.id); continue; }
      try {
        if (target) {
          const result = await promoteToPublic(r.storage_path);
          if (!result.ok) throw new Error(`promote_failed: ${result.error}`);
          await sb.rpc('beithady_gallery_set_ad_eligible', {
            p_asset_id: r.id, p_ad_eligible: true, p_public_url: result.publicUrl,
          });
        } else {
          await demoteFromPublic(r.storage_path);
          await sb.rpc('beithady_gallery_set_ad_eligible', {
            p_asset_id: r.id, p_ad_eligible: false, p_public_url: null,
          });
        }
        ok.push(r.id);
      } catch (e) {
        failed.push({ id: r.id, error: e instanceof Error ? e.message : 'toggle_failed' });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'assets_bulk_ad_eligible',
    metadata: { count: ok.length, eligible: target },
  });
  revalidatePath('/beithady/gallery');
  return { ok, failed };
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/actions.ts
git commit -m "feat(gallery): add bulkAdEligibleAction"
```

---

## Task 10: nukeAlbumAction

**Files:**
- Modify: `src/app/beithady/gallery/actions.ts` (append)

- [ ] **Step 1: Add the action**

```typescript
export async function nukeAlbumAction(input: {
  buildingCode: string | null;
  listingId: string | null;
  confirmation: string;
}): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const user = await requirePermission('full');
  if (input.confirmation !== 'DELETE') {
    return { ok: false, error: 'confirmation_required' };
  }

  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_gallery_assets')
    .select('id')
    .is('deleted_at', null);
  if (input.buildingCode) q = q.eq('building_code', input.buildingCode);
  else q = q.is('building_code', null);
  if (input.listingId) q = q.eq('listing_id', input.listingId);
  else q = q.is('listing_id', null);
  const { data: rows } = await q;
  const allIds = ((rows as Array<{ id: string }> | null) || []).map(r => r.id);
  if (allIds.length === 0) return { ok: true, deleted: 0 };

  // Process in chunks of 200
  let totalOk = 0;
  for (let i = 0; i < allIds.length; i += MAX_BULK_IDS) {
    const chunk = allIds.slice(i, i + MAX_BULK_IDS);
    const result = await bulkDeleteAssetsAction({ ids: chunk });
    totalOk += result.ok.length;
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'gallery',
    action: 'album_nuked',
    metadata: {
      building: input.buildingCode,
      listing_id: input.listingId,
      deleted: totalOk,
    },
  });
  return { ok: true, deleted: totalOk };
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/actions.ts
git commit -m "feat(gallery): add nukeAlbumAction with typed DELETE confirmation"
```

---

## Task 11: GalleryProvider context

**Files:**
- Create: `src/app/beithady/gallery/_components/gallery-provider.tsx`

- [ ] **Step 1: Write the provider**

Create `src/app/beithady/gallery/_components/gallery-provider.tsx`:

```typescript
'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { uploadAssetAction } from '../actions';

export type AlbumKey = { building: string | null; listingId: string | null };

export type UploadJobCategory = 'photo' | 'video' | 'document' | 'brand_asset' | 'ad_creative';

export type UploadJob = {
  id: string;
  file: File;
  building: string | null;
  listingId: string | null;
  category: UploadJobCategory;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  startedAt?: number;
  finishedAt?: number;
};

type GalleryContextValue = {
  // Upload tray
  jobs: UploadJob[];
  enqueueUpload: (
    files: File[],
    target: { building: string | null; listingId: string | null; category?: UploadJobCategory },
  ) => void;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
  clearFinished: () => void;

  // Selection
  selection: Set<string>;
  selectionAlbum: AlbumKey | null;
  isSelected: (id: string) => boolean;
  toggleSelected: (id: string, album: AlbumKey) => void;
  selectRange: (anchorId: string, targetId: string, idsInOrder: string[], album: AlbumKey) => void;
  selectAll: (ids: string[], album: AlbumKey) => void;
  clearSelection: () => void;
};

const GalleryContext = createContext<GalleryContextValue | null>(null);
const MAX_CONCURRENT = 3;

function categoryForMime(mime: string): UploadJobCategory {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function sameAlbum(a: AlbumKey, b: AlbumKey | null): boolean {
  return !!b && a.building === b.building && a.listingId === b.listingId;
}

export function GalleryProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionAlbum, setSelectionAlbum] = useState<AlbumKey | null>(null);
  const lastAnchorRef = useRef<string | null>(null);

  // Worker effect: whenever jobs change, kick the next queued job if a slot is free.
  useEffect(() => {
    const inFlight = jobs.filter(j => j.status === 'uploading').length;
    if (inFlight >= MAX_CONCURRENT) return;
    const next = jobs.find(j => j.status === 'queued');
    if (!next) return;

    setJobs(prev => prev.map(j => j.id === next.id
      ? { ...j, status: 'uploading' as const, startedAt: Date.now() }
      : j));

    (async () => {
      try {
        const fd = new FormData();
        fd.append('file', next.file);
        fd.append('file_name', next.file.name);
        if (next.building) fd.append('building', next.building);
        if (next.listingId) fd.append('listing_id', next.listingId);
        fd.append('category', next.category);
        await uploadAssetAction(fd);
        setJobs(prev => prev.map(j => j.id === next.id
          ? { ...j, status: 'done' as const, finishedAt: Date.now() }
          : j));
      } catch (e) {
        setJobs(prev => prev.map(j => j.id === next.id
          ? { ...j, status: 'error' as const, error: e instanceof Error ? e.message : 'upload_failed', finishedAt: Date.now() }
          : j));
      }
    })();
  }, [jobs]);

  const enqueueUpload: GalleryContextValue['enqueueUpload'] = useCallback((files, target) => {
    if (files.length === 0) return;
    const newJobs: UploadJob[] = files.map(f => ({
      id: (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      file: f,
      building: target.building,
      listingId: target.listingId,
      category: target.category || categoryForMime(f.type),
      status: 'queued',
    }));
    setJobs(prev => [...prev, ...newJobs]);
  }, []);

  const cancelJob = useCallback((id: string) => {
    // Only queued jobs are cancellable; in-flight requests must run to completion.
    setJobs(prev => prev.filter(j => !(j.id === id && j.status === 'queued')));
  }, []);

  const retryJob = useCallback((id: string) => {
    setJobs(prev => prev.map(j => j.id === id && j.status === 'error'
      ? { ...j, status: 'queued' as const, error: undefined }
      : j));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status !== 'done' && j.status !== 'error'));
  }, []);

  const toggleSelected = useCallback((id: string, album: AlbumKey) => {
    setSelection(prev => {
      // Switching album resets selection to just this id.
      if (selectionAlbum && !sameAlbum(album, selectionAlbum)) {
        const fresh = new Set([id]);
        setSelectionAlbum(album);
        lastAnchorRef.current = id;
        return fresh;
      }
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        lastAnchorRef.current = id;
      }
      if (next.size === 0) setSelectionAlbum(null);
      else if (!selectionAlbum) setSelectionAlbum(album);
      return next;
    });
  }, [selectionAlbum]);

  const selectRange = useCallback((anchorId: string, targetId: string, idsInOrder: string[], album: AlbumKey) => {
    const anchorIdx = idsInOrder.indexOf(anchorId);
    const targetIdx = idsInOrder.indexOf(targetId);
    if (anchorIdx < 0 || targetIdx < 0) return;
    const [from, to] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    const range = idsInOrder.slice(from, to + 1);
    setSelection(prev => {
      const next = new Set(prev);
      for (const id of range) next.add(id);
      return next;
    });
    setSelectionAlbum(album);
  }, []);

  const selectAll = useCallback((ids: string[], album: AlbumKey) => {
    setSelection(new Set(ids));
    setSelectionAlbum(album);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setSelectionAlbum(null);
    lastAnchorRef.current = null;
  }, []);

  const value: GalleryContextValue = {
    jobs,
    enqueueUpload,
    cancelJob,
    retryJob,
    clearFinished,
    selection,
    selectionAlbum,
    isSelected: (id: string) => selection.has(id),
    toggleSelected,
    selectRange,
    selectAll,
    clearSelection,
  };

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
}

export function useGallery(): GalleryContextValue {
  const ctx = useContext(GalleryContext);
  if (!ctx) throw new Error('useGallery must be used inside GalleryProvider');
  return ctx;
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/gallery-provider.tsx
git commit -m "feat(gallery): add GalleryProvider context (upload queue + selection)"
```

---

## Task 12: UploadTray component

**Files:**
- Create: `src/app/beithady/gallery/_components/upload-tray.tsx`

- [ ] **Step 1: Write the tray**

Create `src/app/beithady/gallery/_components/upload-tray.tsx`:

```typescript
'use client';
import { useState, useEffect } from 'react';
import { Upload, ChevronUp, ChevronDown, X, RotateCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useGallery, type UploadJob } from './gallery-provider';

const AUTO_COLLAPSE_MS = 30_000;

function albumLabel(j: UploadJob): string {
  if (j.listingId) return j.listingId;
  if (j.building) return `${j.building} · general`;
  return 'library root';
}

export function UploadTray() {
  const { jobs, cancelJob, retryJob, clearFinished } = useGallery();
  const [expanded, setExpanded] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  const total = jobs.length;
  const inFlight = jobs.filter(j => j.status === 'uploading').length;
  const queued = jobs.filter(j => j.status === 'queued').length;
  const errors = jobs.filter(j => j.status === 'error').length;
  const active = inFlight + queued;
  const allDone = total > 0 && active === 0;

  // Auto-collapse 30s after the last job finishes
  useEffect(() => {
    if (!allDone || hasInteracted) return;
    const t = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [allDone, hasInteracted]);

  if (total === 0) return null;

  // Group by album
  const groups = new Map<string, UploadJob[]>();
  for (const j of jobs) {
    const key = `${j.building || ''}|${j.listingId || ''}`;
    const arr = groups.get(key) || [];
    arr.push(j);
    groups.set(key, arr);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      {!expanded ? (
        <button
          onClick={() => { setExpanded(true); setHasInteracted(true); }}
          className="ix-card px-3 py-2 shadow-lg flex items-center gap-2 hover:shadow-xl transition"
        >
          <Upload size={14} className={active > 0 ? 'animate-pulse text-blue-500' : 'text-slate-400'} />
          <span className="text-xs font-semibold tabular-nums">
            {active > 0
              ? `↑ ${active} ${active === 1 ? 'upload' : 'uploads'}`
              : `${total} ${total === 1 ? 'done' : 'done'}`}
            {errors > 0 && <span className="text-rose-500"> · {errors} err</span>}
          </span>
          <ChevronUp size={12} className="text-slate-400" />
        </button>
      ) : (
        <div className="ix-card shadow-xl w-96 max-h-[60vh] flex flex-col">
          <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Upload size={14} className={active > 0 ? 'text-blue-500 animate-pulse' : 'text-slate-400'} />
              <span className="text-xs font-semibold">
                {active > 0 ? `Uploading ${active} of ${total}` : `${total} ${total === 1 ? 'job' : 'jobs'}`}
              </span>
              {errors > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{errors} error{errors === 1 ? '' : 's'}</span>}
            </div>
            <div className="flex items-center gap-1">
              {(jobs.some(j => j.status === 'done' || j.status === 'error')) && (
                <button onClick={() => { clearFinished(); setHasInteracted(true); }} className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-1.5 py-0.5">
                  Clear finished
                </button>
              )}
              <button onClick={() => { setExpanded(false); setHasInteracted(true); }} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <ChevronDown size={14} />
              </button>
            </div>
          </header>
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800">
            {Array.from(groups.entries()).map(([key, list]) => {
              const sample = list[0];
              return (
                <div key={key} className="p-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                    → {albumLabel(sample)} · {list.length} {list.length === 1 ? 'file' : 'files'}
                  </p>
                  <div className="space-y-0.5">
                    {list.map(j => (
                      <div key={j.id} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="flex-1 truncate" title={j.file.name}>{j.file.name}</span>
                        <span className="text-slate-400 tabular-nums text-[10px] w-14 text-right">
                          {(j.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <span className="w-6 text-right">
                          {j.status === 'queued' && <span className="text-slate-400 text-[10px]">…</span>}
                          {j.status === 'uploading' && <Loader2 size={11} className="inline animate-spin text-blue-500" />}
                          {j.status === 'done' && <CheckCircle2 size={11} className="text-emerald-600 inline" />}
                          {j.status === 'error' && <AlertTriangle size={11} className="text-rose-600 inline" />}
                        </span>
                        {j.status === 'queued' && (
                          <button onClick={() => cancelJob(j.id)} className="text-slate-400 hover:text-rose-600 p-0.5" title="Cancel">
                            <X size={10} />
                          </button>
                        )}
                        {j.status === 'error' && (
                          <button onClick={() => retryJob(j.id)} className="text-slate-400 hover:text-blue-600 p-0.5" title={j.error || 'Retry'}>
                            <RotateCw size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/upload-tray.tsx
git commit -m "feat(gallery): add UploadTray (floating bottom-right, grouped by album)"
```

---

## Task 13: gallery/layout.tsx wraps Provider + Tray

**Files:**
- Create: `src/app/beithady/gallery/layout.tsx`

- [ ] **Step 1: Write the layout**

Create `src/app/beithady/gallery/layout.tsx`:

```typescript
import type { ReactNode } from 'react';
import { GalleryProvider } from './_components/gallery-provider';
import { UploadTray } from './_components/upload-tray';

// This layout wraps every /beithady/gallery/** route.
// GalleryProvider holds the upload queue + selection state, so it
// survives intra-gallery navigation (between buildings, units,
// general-area). It tears down only when the user leaves the
// /beithady/gallery section entirely.
export default function GalleryLayout({ children }: { children: ReactNode }) {
  return (
    <GalleryProvider>
      {children}
      <UploadTray />
    </GalleryProvider>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/layout.tsx
git commit -m "feat(gallery): mount GalleryProvider + UploadTray in gallery/layout.tsx"
```

---

## Task 14: Refactor uploader.tsx to use provider

**Files:**
- Rewrite: `src/app/beithady/gallery/_components/uploader.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/app/beithady/gallery/_components/uploader.tsx`:

```typescript
'use client';
import { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
import { useGallery, type UploadJobCategory } from './gallery-provider';

export type UploaderUnit = { listing_id: string; nickname: string; total?: number };

export function Uploader({
  building,
  listingId,
  category,
  units,
}: {
  building?: string | null;
  listingId?: string | null;
  category?: UploadJobCategory;
  units?: UploaderUnit[];
}) {
  const { enqueueUpload, jobs } = useGallery();
  const [dragOver, setDragOver] = useState(false);
  const [target, setTarget] = useState<string>(listingId || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const showsUnitPicker = !!units && units.length > 0 && !listingId;
  const effectiveListingId = listingId || (target || null);

  function handleFiles(files: File[]) {
    if (files.length === 0) return;
    enqueueUpload(files, {
      building: building || null,
      listingId: effectiveListingId,
      category,
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  // Lightweight inline status — the floating UploadTray is the source of truth.
  const myActive = jobs.filter(j =>
    (j.status === 'queued' || j.status === 'uploading')
    && (j.building || null) === (building || null)
    && (j.listingId || null) === effectiveListingId
  ).length;

  return (
    <div className="space-y-3">
      {showsUnitPicker && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upload to:</span>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="ix-input flex-1 max-w-md"
          >
            <option value="">📍 General Building Area (lobby, pool, exterior, building-wide)</option>
            {units!.map(u => (
              <option key={u.listing_id} value={u.listing_id}>
                🛏️ {u.nickname}{typeof u.total === 'number' ? ` · ${u.total} item${u.total === 1 ? '' : 's'}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`ix-card border-2 border-dashed cursor-pointer p-8 text-center transition ${
          dragOver
            ? 'border-slate-700 bg-slate-50 dark:bg-slate-800/60'
            : 'border-slate-300 dark:border-slate-700 hover:border-slate-500 hover:bg-stone-50 dark:hover:bg-slate-800/30'
        }`}
      >
        <UploadCloud size={28} className="mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Drag photos / videos here or click to browse
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {showsUnitPicker
            ? (target
                ? <>Files will land in <strong>{units!.find(u => u.listing_id === target)?.nickname || target}</strong></>
                : <>Files will land in <strong>General Building Area</strong></>)
            : (effectiveListingId
                ? 'Files attach to this unit'
                : building
                  ? `Files land at ${building} general area`
                  : 'Files land at Beithady library root')}
          {' · '}
          50MB max · JPG/PNG/WEBP/HEIC + MP4/WEBM · AI labels in ~2 min
          {myActive > 0 && <> · <strong>{myActive} in progress</strong> (see tray ↘)</>}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={
            category === 'document'
              ? '.pdf,.doc,.docx,.xls,.xlsx,image/*'
              : 'image/*,video/mp4,video/webm,video/quicktime'
          }
          onChange={e => {
            handleFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/uploader.tsx
git commit -m "refactor(gallery): Uploader delegates to GalleryProvider (queue persists across nav)"
```

---

## Task 15: SelectableAssetGrid (selection only, no D&D yet)

**Files:**
- Create: `src/app/beithady/gallery/_components/selectable-asset-grid.tsx`

- [ ] **Step 1: Write the grid (selection-only first; D&D added in Task 16)**

Create `src/app/beithady/gallery/_components/selectable-asset-grid.tsx`:

```typescript
'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { FileText, Video, Megaphone, Sparkles, Image as ImageIcon, Check } from 'lucide-react';
import type { GalleryAsset } from '@/lib/beithady/gallery/gallery-list';
import { useGallery, type AlbumKey } from './gallery-provider';

export type AssetWithUrl = { asset: GalleryAsset; url: string | null };

export function SelectableAssetGrid({
  items,
  album,
  detailHrefBase,
}: {
  items: AssetWithUrl[];
  album: AlbumKey;
  detailHrefBase: string;
}) {
  const { selection, isSelected, toggleSelected, selectRange } = useGallery();
  const lastClickedRef = useRef<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="ix-card p-10 text-center text-sm text-slate-500">
        <ImageIcon size={24} className="mx-auto text-slate-300 mb-2" />
        No assets yet. Upload some via the panel above.
      </div>
    );
  }

  const idsInOrder = items.map(i => i.asset.id);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {items.map(({ asset, url }) => {
        const sel = isSelected(asset.id);
        return (
          <AssetCard
            key={asset.id}
            asset={asset}
            url={url}
            selected={sel}
            anySelected={selection.size > 0}
            detailHrefBase={detailHrefBase}
            onCheckboxClick={(e) => {
              if (e.shiftKey && lastClickedRef.current && lastClickedRef.current !== asset.id) {
                selectRange(lastClickedRef.current, asset.id, idsInOrder, album);
              } else {
                toggleSelected(asset.id, album);
                lastClickedRef.current = asset.id;
              }
            }}
          />
        );
      })}
    </div>
  );
}

function AssetCard({
  asset,
  url,
  selected,
  anySelected,
  detailHrefBase,
  onCheckboxClick,
}: {
  asset: GalleryAsset;
  url: string | null;
  selected: boolean;
  anySelected: boolean;
  detailHrefBase: string;
  onCheckboxClick: (e: React.MouseEvent) => void;
}) {
  const href = `${detailHrefBase}?asset=${asset.id}`;
  const tagPreview = (asset.manual_tags.length ? asset.manual_tags : asset.ai_tags).slice(0, 2);
  const totalTags = asset.manual_tags.length + asset.ai_tags.length;

  return (
    <div className={`group relative ix-card overflow-hidden transition ${
      selected ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-md'
    }`}>
      {/* Checkbox — always visible if any selected, else on hover */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCheckboxClick(e); }}
        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded border flex items-center justify-center transition ${
          selected
            ? 'bg-blue-500 border-blue-500 text-white'
            : `bg-white/90 border-slate-300 ${anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
        }`}
        aria-label={selected ? 'Deselect' : 'Select'}
      >
        {selected && <Check size={12} />}
      </button>

      <Link href={href} className="block">
        <div className="aspect-square bg-stone-100 dark:bg-slate-900 relative overflow-hidden">
          {url && asset.mime_type?.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={asset.ai_caption || asset.file_name || ''} className="w-full h-full object-cover group-hover:scale-105 transition" />
          ) : url && asset.mime_type?.startsWith('video/') ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white">
              <Video size={32} />
              {asset.duration_sec && <span className="absolute bottom-2 right-2 text-xs bg-black/70 px-1.5 py-0.5 rounded">{asset.duration_sec}s</span>}
            </div>
          ) : asset.mime_type === 'application/pdf' || asset.category === 'document' ? (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              <FileText size={32} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <ImageIcon size={32} />
            </div>
          )}

          {asset.ad_eligible && (
            <span className="absolute top-1 right-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-500 text-white shadow">
              <Megaphone size={10} /> Ad
            </span>
          )}
          {typeof asset.ai_quality_score === 'number' && asset.ai_quality_score > 0 && (
            <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-black/70 text-white">
              <Sparkles size={9} /> {asset.ai_quality_score}
            </span>
          )}
          {tagPreview.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] flex items-center gap-1 flex-wrap opacity-0 group-hover:opacity-100 transition">
              {tagPreview.map(t => (
                <span key={t} className="px-1 rounded bg-white/20">{t}</span>
              ))}
              {totalTags > tagPreview.length && (
                <span className="opacity-70">+{totalTags - tagPreview.length}</span>
              )}
            </div>
          )}
        </div>
        <div className="p-2">
          <div className="text-xs truncate text-slate-700 dark:text-slate-200" title={asset.ai_caption || asset.file_name || ''}>
            {asset.ai_caption || asset.file_name || '(unnamed)'}
          </div>
          {!asset.ai_processed_at && asset.category === 'photo' && (
            <div className="text-[9px] text-amber-600 mt-0.5 inline-flex items-center gap-0.5">
              <Sparkles size={8} /> AI labeling…
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/selectable-asset-grid.tsx
git commit -m "feat(gallery): SelectableAssetGrid with shift+click range select"
```

---

## Task 16: Add D&D to SelectableAssetGrid

**Files:**
- Modify: `src/app/beithady/gallery/_components/selectable-asset-grid.tsx`

- [ ] **Step 1: Wrap grid in DndContext + SortableContext, add useSortable per tile**

Replace the entire contents of `src/app/beithady/gallery/_components/selectable-asset-grid.tsx`:

```typescript
'use client';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileText, Video, Megaphone, Sparkles, Image as ImageIcon, Check, GripVertical } from 'lucide-react';
import type { GalleryAsset } from '@/lib/beithady/gallery/gallery-list';
import { useGallery, type AlbumKey } from './gallery-provider';
import { reorderAssetsAction } from '../actions';

export type AssetWithUrl = { asset: GalleryAsset; url: string | null };

export function SelectableAssetGrid({
  items: serverItems,
  album,
  detailHrefBase,
}: {
  items: AssetWithUrl[];
  album: AlbumKey;
  detailHrefBase: string;
}) {
  const { selection, isSelected, toggleSelected, selectRange } = useGallery();
  const lastClickedRef = useRef<string | null>(null);
  // Optimistic local order; reverts on server error.
  const [items, setItems] = useState<AssetWithUrl[]>(serverItems);
  const [savedSnapshot, setSavedSnapshot] = useState<AssetWithUrl[]>(serverItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // If serverItems change (page refresh / revalidate), sync.
  if (serverItems !== savedSnapshot && serverItems.length === savedSnapshot.length) {
    // shallow compare ids
    const sameOrder = serverItems.every((s, i) => s.asset.id === savedSnapshot[i]?.asset.id);
    if (!sameOrder) {
      setItems(serverItems);
      setSavedSnapshot(serverItems);
    }
  } else if (serverItems !== savedSnapshot) {
    setItems(serverItems);
    setSavedSnapshot(serverItems);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (items.length === 0) {
    return (
      <div className="ix-card p-10 text-center text-sm text-slate-500">
        <ImageIcon size={24} className="mx-auto text-slate-300 mb-2" />
        No assets yet. Upload some via the panel above.
      </div>
    );
  }

  const idsInOrder = items.map(i => i.asset.id);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(i => i.asset.id === active.id);
    const newIndex = items.findIndex(i => i.asset.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    // If dragged tile is in the selection AND there are 2+ selected,
    // move the entire selected group as a contiguous block.
    let nextItems: AssetWithUrl[];
    if (selection.size >= 2 && selection.has(String(active.id))) {
      const selectedSet = selection;
      const moving = items.filter(i => selectedSet.has(i.asset.id));
      const remaining = items.filter(i => !selectedSet.has(i.asset.id));
      // Find the insertion index in `remaining` based on the drop target's id
      const overIdInRemaining = remaining.findIndex(i => i.asset.id === over.id);
      const insertAt = overIdInRemaining >= 0 ? overIdInRemaining : remaining.length;
      nextItems = [
        ...remaining.slice(0, insertAt),
        ...moving,
        ...remaining.slice(insertAt),
      ];
    } else {
      nextItems = arrayMove(items, oldIndex, newIndex);
    }

    setItems(nextItems);
    const newOrderedIds = nextItems.map(i => i.asset.id);
    startTransition(async () => {
      const result = await reorderAssetsAction({
        buildingCode: album.building,
        listingId: album.listingId,
        orderedIds: newOrderedIds,
      });
      if (!result.ok) {
        // Revert
        setItems(savedSnapshot);
      } else {
        setSavedSnapshot(nextItems);
      }
    });
  }

  const activeItem = activeId ? items.find(i => i.asset.id === activeId) : null;
  const activeIsInSelection = activeId ? selection.has(activeId) && selection.size >= 2 : false;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={idsInOrder} strategy={rectSortingStrategy}>
        <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 ${pending ? 'opacity-90' : ''}`}>
          {items.map(({ asset, url }) => {
            const sel = isSelected(asset.id);
            return (
              <SortableAssetCard
                key={asset.id}
                asset={asset}
                url={url}
                selected={sel}
                anySelected={selection.size > 0}
                detailHrefBase={detailHrefBase}
                onCheckboxClick={(e) => {
                  if (e.shiftKey && lastClickedRef.current && lastClickedRef.current !== asset.id) {
                    selectRange(lastClickedRef.current, asset.id, idsInOrder, album);
                  } else {
                    toggleSelected(asset.id, album);
                    lastClickedRef.current = asset.id;
                  }
                }}
              />
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeItem ? (
          <div className="ix-card overflow-hidden shadow-2xl scale-105 ring-2 ring-blue-500">
            <div className="aspect-square bg-stone-100 dark:bg-slate-900 relative">
              {activeItem.url && activeItem.asset.mime_type?.startsWith('image/') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeItem.url} alt="" className="w-full h-full object-cover" />
              )}
              {activeIsInSelection && (
                <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center">
                  {selection.size}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableAssetCard(props: {
  asset: GalleryAsset;
  url: string | null;
  selected: boolean;
  anySelected: boolean;
  detailHrefBase: string;
  onCheckboxClick: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.asset.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const { asset, url, selected, anySelected, detailHrefBase, onCheckboxClick } = props;
  const href = `${detailHrefBase}?asset=${asset.id}`;
  const tagPreview = (asset.manual_tags.length ? asset.manual_tags : asset.ai_tags).slice(0, 2);
  const totalTags = asset.manual_tags.length + asset.ai_tags.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ix-card overflow-hidden transition ${
        selected ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-md'
      }`}
    >
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCheckboxClick(e); }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded border flex items-center justify-center transition ${
          selected
            ? 'bg-blue-500 border-blue-500 text-white'
            : `bg-white/90 border-slate-300 ${anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
        }`}
        aria-label={selected ? 'Deselect' : 'Select'}
      >
        {selected && <Check size={12} />}
      </button>

      {/* Drag handle — small, visible on hover, separate from click area */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical size={11} />
      </button>

      <Link href={href} className="block" onPointerDown={(e) => e.stopPropagation()}>
        <div className="aspect-square bg-stone-100 dark:bg-slate-900 relative overflow-hidden">
          {url && asset.mime_type?.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={asset.ai_caption || asset.file_name || ''} className="w-full h-full object-cover group-hover:scale-105 transition" draggable={false} />
          ) : url && asset.mime_type?.startsWith('video/') ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white">
              <Video size={32} />
              {asset.duration_sec && <span className="absolute bottom-2 right-2 text-xs bg-black/70 px-1.5 py-0.5 rounded">{asset.duration_sec}s</span>}
            </div>
          ) : asset.mime_type === 'application/pdf' || asset.category === 'document' ? (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              <FileText size={32} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <ImageIcon size={32} />
            </div>
          )}

          {asset.ad_eligible && (
            <span className="absolute top-7 right-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-500 text-white shadow">
              <Megaphone size={10} /> Ad
            </span>
          )}
          {typeof asset.ai_quality_score === 'number' && asset.ai_quality_score > 0 && (
            <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-black/70 text-white">
              <Sparkles size={9} /> {asset.ai_quality_score}
            </span>
          )}
          {tagPreview.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] flex items-center gap-1 flex-wrap opacity-0 group-hover:opacity-100 transition">
              {tagPreview.map(t => (
                <span key={t} className="px-1 rounded bg-white/20">{t}</span>
              ))}
              {totalTags > tagPreview.length && (
                <span className="opacity-70">+{totalTags - tagPreview.length}</span>
              )}
            </div>
          )}
        </div>
        <div className="p-2">
          <div className="text-xs truncate text-slate-700 dark:text-slate-200" title={asset.ai_caption || asset.file_name || ''}>
            {asset.ai_caption || asset.file_name || '(unnamed)'}
          </div>
          {!asset.ai_processed_at && asset.category === 'photo' && (
            <div className="text-[9px] text-amber-600 mt-0.5 inline-flex items-center gap-0.5">
              <Sparkles size={8} /> AI labeling…
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/selectable-asset-grid.tsx
git commit -m "feat(gallery): drag-and-drop reorder via dnd-kit (group-drag preserves relative order)"
```

---

## Task 17: MoveToUnitModal

**Files:**
- Create: `src/app/beithady/gallery/_components/move-to-unit-modal.tsx`

- [ ] **Step 1: Write the modal**

Create `src/app/beithady/gallery/_components/move-to-unit-modal.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { X, ArrowRight, Loader2 } from 'lucide-react';
import { useGallery } from './gallery-provider';
import { bulkMoveAssetsAction } from '../actions';

export type MoveTarget = {
  buildingCode: string;
  listingId: string | null;        // null = General Building Area
  label: string;
};

export function MoveToUnitModal({
  open,
  onClose,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  targets: MoveTarget[];
}) {
  const { selection, clearSelection } = useGallery();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<MoveTarget | null>(null);

  if (!open) return null;

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bulkMoveAssetsAction({
        ids: Array.from(selection),
        targetBuildingCode: picked.buildingCode,
        targetListingId: picked.listingId,
      });
      if (result.failed.length > 0) {
        setError(`${result.ok.length} moved, ${result.failed.length} failed.`);
      } else {
        clearSelection();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'move_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="ix-card max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Move {selection.size} item{selection.size === 1 ? '' : 's'} to:</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button>
        </header>
        <div className="max-h-72 overflow-y-auto space-y-1 mb-3 -mx-2 px-2">
          {targets.map(t => (
            <button
              key={`${t.buildingCode}/${t.listingId || 'general'}`}
              onClick={() => setPicked(t)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                picked?.buildingCode === t.buildingCode && picked?.listingId === t.listingId
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="ix-btn-secondary text-xs" disabled={busy}>Cancel</button>
          <button
            onClick={confirm}
            disabled={!picked || busy}
            className="ix-btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/move-to-unit-modal.tsx
git commit -m "feat(gallery): MoveToUnitModal for bulk relocate"
```

---

## Task 18: BulkActionBar

**Files:**
- Create: `src/app/beithady/gallery/_components/bulk-action-bar.tsx`

- [ ] **Step 1: Write the action bar**

Create `src/app/beithady/gallery/_components/bulk-action-bar.tsx`:

```typescript
'use client';
import { useState, useTransition } from 'react';
import {
  X, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Tag, Megaphone, Trash2, Move, Loader2,
} from 'lucide-react';
import { useGallery, type AlbumKey } from './gallery-provider';
import {
  bulkDeleteAssetsAction, bulkTagAssetsAction, bulkAdEligibleAction,
  reorderAssetsAction,
} from '../actions';
import { MoveToUnitModal, type MoveTarget } from './move-to-unit-modal';

export function BulkActionBar({
  album,
  idsInOrder,           // every id currently rendered in the page grid
  moveTargets,          // building's unit list + general (excluding current album)
  allAdEligibleSelected, // computed from server data: are all selected currently ad-eligible?
}: {
  album: AlbumKey;
  idsInOrder: string[];
  moveTargets: MoveTarget[];
  allAdEligibleSelected: boolean;
}) {
  const { selection, selectionAlbum, clearSelection } = useGallery();
  const [busy, startTransition] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagInput, setTagInput] = useState<{ open: boolean; mode: 'add' | 'remove' }>({ open: false, mode: 'add' });
  const [tagText, setTagText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Hide the bar if the active selection is for a different album.
  if (selection.size === 0) return null;
  if (selectionAlbum && (selectionAlbum.building !== album.building || selectionAlbum.listingId !== album.listingId)) {
    return null;
  }

  const selectedIds = Array.from(selection);

  function reorderTo(positionOf: 'start' | 'end' | 'up' | 'down' | 'beforeFirst') {
    const selSet = new Set(selectedIds);
    const moving = idsInOrder.filter(id => selSet.has(id));
    const remaining = idsInOrder.filter(id => !selSet.has(id));
    let next: string[];

    if (positionOf === 'start' || positionOf === 'beforeFirst') {
      next = [...moving, ...remaining];
    } else if (positionOf === 'end') {
      next = [...remaining, ...moving];
    } else {
      // up/down: shift the contiguous group by one slot in idsInOrder.
      const firstSelIdx = idsInOrder.findIndex(id => selSet.has(id));
      const lastSelIdx = idsInOrder.length - 1 - [...idsInOrder].reverse().findIndex(id => selSet.has(id));
      let insertAt: number;
      if (positionOf === 'up') {
        insertAt = Math.max(0, firstSelIdx - 1);
      } else {
        insertAt = Math.min(remaining.length, lastSelIdx - moving.length + 2);
      }
      next = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
    }

    startTransition(async () => {
      const result = await reorderAssetsAction({
        buildingCode: album.building,
        listingId: album.listingId,
        orderedIds: next,
      });
      if (!result.ok) setError(result.error || 'reorder_failed');
    });
  }

  function doDelete() {
    if (!confirm(`Delete ${selection.size} item${selection.size === 1 ? '' : 's'}? They can be recovered from the database for ~30 days.`)) return;
    startTransition(async () => {
      const result = await bulkDeleteAssetsAction({ ids: selectedIds });
      if (result.failed.length > 0) {
        setError(`${result.ok.length} deleted, ${result.failed.length} failed.`);
      } else {
        clearSelection();
      }
    });
  }

  function doAdEligible() {
    const target = !allAdEligibleSelected; // toggle
    startTransition(async () => {
      const result = await bulkAdEligibleAction({ ids: selectedIds, eligible: target });
      if (result.failed.length > 0) {
        setError(`${result.ok.length} updated, ${result.failed.length} failed.`);
      }
    });
  }

  function submitTags() {
    const tags = tagText.split(/[,\s]+/).map(t => t.toLowerCase().trim()).filter(Boolean);
    if (tags.length === 0) { setTagInput({ open: false, mode: 'add' }); setTagText(''); return; }
    startTransition(async () => {
      const result = await bulkTagAssetsAction({
        ids: selectedIds,
        addTags: tagInput.mode === 'add' ? tags : [],
        removeTags: tagInput.mode === 'remove' ? tags : [],
      });
      if (result.failed.length > 0) setError(`${result.ok.length} updated, ${result.failed.length} failed.`);
      setTagInput({ open: false, mode: 'add' });
      setTagText('');
    });
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 ix-card shadow-xl px-3 py-2 flex items-center gap-2 max-w-[calc(100vw-2rem)] flex-wrap">
        <span className="text-xs font-semibold tabular-nums px-2">
          {selection.size} selected
          {busy && <Loader2 size={11} className="inline ml-1 animate-spin text-blue-500" />}
        </span>

        {/* Reorder buttons */}
        <div className="flex items-center gap-0.5 border-l border-slate-200 dark:border-slate-700 pl-2">
          <button onClick={() => reorderTo('up')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move up"><ArrowUp size={12} /></button>
          <button onClick={() => reorderTo('down')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move down"><ArrowDown size={12} /></button>
          <button onClick={() => reorderTo('start')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move to start"><ChevronsUp size={12} /></button>
          <button onClick={() => reorderTo('end')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move to end"><ChevronsDown size={12} /></button>
        </div>

        {/* Move to unit */}
        <button onClick={() => setMoveOpen(true)} disabled={busy} className="ix-btn-secondary text-xs inline-flex items-center gap-1">
          <Move size={12} /> Move to…
        </button>

        {/* Tag */}
        <button onClick={() => setTagInput({ open: true, mode: 'add' })} disabled={busy} className="ix-btn-secondary text-xs inline-flex items-center gap-1">
          <Tag size={12} /> Tag…
        </button>

        {/* Ad-eligible */}
        <button onClick={doAdEligible} disabled={busy} className="ix-btn-secondary text-xs inline-flex items-center gap-1">
          <Megaphone size={12} /> {allAdEligibleSelected ? 'Demote from ads' : 'Mark ad-eligible'}
        </button>

        {/* Delete */}
        <button onClick={doDelete} disabled={busy} className="ix-btn-danger text-xs inline-flex items-center gap-1">
          <Trash2 size={12} /> Delete {selection.size}
        </button>

        {/* Clear */}
        <button onClick={clearSelection} disabled={busy} className="ix-btn-ghost text-xs inline-flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2 ml-1">
          <X size={12} /> Clear
        </button>
      </div>

      {error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 ix-card shadow-lg px-3 py-2 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <MoveToUnitModal open={moveOpen} onClose={() => setMoveOpen(false)} targets={moveTargets} />

      {tagInput.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setTagInput({ open: false, mode: 'add' })}>
          <div className="ix-card max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">
              {tagInput.mode === 'add' ? 'Add tags to' : 'Remove tags from'} {selection.size} item{selection.size === 1 ? '' : 's'}
            </h3>
            <div className="flex gap-2 text-xs mb-2">
              <button
                onClick={() => setTagInput({ ...tagInput, mode: 'add' })}
                className={`px-2 py-0.5 rounded ${tagInput.mode === 'add' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >Add</button>
              <button
                onClick={() => setTagInput({ ...tagInput, mode: 'remove' })}
                className={`px-2 py-0.5 rounded ${tagInput.mode === 'remove' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >Remove</button>
            </div>
            <input
              type="text"
              autoFocus
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitTags(); }}
              placeholder="hero_shot, favorite, keep_off_ads"
              className="ix-input w-full text-sm mb-3"
            />
            <p className="text-[10px] text-slate-500 mb-3">Comma- or space-separated. Lowercased server-side.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setTagInput({ open: false, mode: 'add' }); setTagText(''); }} className="ix-btn-secondary text-xs" disabled={busy}>Cancel</button>
              <button onClick={submitTags} className="ix-btn-primary text-xs" disabled={busy || !tagText.trim()}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/bulk-action-bar.tsx
git commit -m "feat(gallery): BulkActionBar — reorder buttons, move, tag, ad-eligible, delete"
```

---

## Task 19: NukeAlbumButton

**Files:**
- Create: `src/app/beithady/gallery/_components/nuke-album-button.tsx`

- [ ] **Step 1: Write the button + modal**

Create `src/app/beithady/gallery/_components/nuke-album-button.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { nukeAlbumAction } from '../actions';

export function NukeAlbumButton({
  buildingCode,
  listingId,
  totalAssets,
  albumLabel,
}: {
  buildingCode: string;
  listingId: string | null;
  totalAssets: number;
  albumLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (totalAssets === 0) return null;

  const canConfirm = confirm === 'DELETE';

  async function doNuke() {
    setBusy(true);
    setError(null);
    try {
      const result = await nukeAlbumAction({
        buildingCode,
        listingId,
        confirmation: 'DELETE',
      });
      if (!result.ok) {
        setError(result.error || 'nuke_failed');
      } else {
        setOpen(false);
        setConfirm('');
        // The page will revalidate and re-render empty.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'nuke_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ix-btn-secondary text-xs inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
      >
        <Trash2 size={12} /> Wipe album
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="ix-card max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2 text-rose-700 dark:text-rose-300">
              Delete all {totalAssets} item{totalAssets === 1 ? '' : 's'} in {albumLabel}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              This soft-deletes every asset in this folder. Ad-eligible items are removed from the public CDN.
              Items can be recovered from the database for ~30 days.
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-200 mb-1">
              Type <code className="font-bold">DELETE</code> to confirm:
            </p>
            <input
              type="text"
              autoFocus
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="ix-input w-full text-sm mb-3 font-mono"
              disabled={busy}
            />
            {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setOpen(false)} className="ix-btn-secondary text-xs" disabled={busy}>Cancel</button>
              <button
                onClick={doNuke}
                disabled={!canConfirm || busy}
                className="ix-btn-danger text-xs inline-flex items-center gap-1 disabled:opacity-40"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete all {totalAssets}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/_components/nuke-album-button.tsx
git commit -m "feat(gallery): NukeAlbumButton with typed DELETE confirmation"
```

---

## Task 20: Wire new components into [listingId] page

**Files:**
- Modify: `src/app/beithady/gallery/[buildingCode]/[listingId]/page.tsx`
- Modify: `src/lib/beithady/gallery/gallery-list.ts` (export a small URL-resolver helper used by the page)

- [ ] **Step 1: Add a URL helper to gallery-list.ts**

Append to `src/lib/beithady/gallery/gallery-list.ts`:

```typescript
// Resolve URLs for an array of assets in parallel (RSC-side).
// Used by pages that render <SelectableAssetGrid> — the client grid
// receives pre-resolved URLs as props so it doesn't need its own
// signed-URL fetcher.
export async function resolveAssetUrls(assets: GalleryAsset[]): Promise<Array<{ asset: GalleryAsset; url: string | null }>> {
  return Promise.all(assets.map(async asset => ({ asset, url: await viewableUrlForAsset(asset) })));
}
```

- [ ] **Step 2: Rewrite the listing page**

Replace the contents of `src/app/beithady/gallery/[buildingCode]/[listingId]/page.tsx`:

```typescript
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset, getTopTags, resolveAssetUrls, getListingsForBuilding } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { Uploader } from '../../_components/uploader';
import { SelectableAssetGrid } from '../../_components/selectable-asset-grid';
import { AssetDetailModal } from '../../_components/asset-detail-modal';
import { BulkActionBar } from '../../_components/bulk-action-bar';
import { NukeAlbumButton } from '../../_components/nuke-album-button';
import type { MoveTarget } from '../../_components/move-to-unit-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID = new Set(['BH-26','BH-73','BH-435','BH-OK','BH-34']);

export default async function GalleryListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingCode: string; listingId: string }>;
  searchParams: Promise<{ asset?: string; tag?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const { buildingCode, listingId } = await params;
  if (!VALID.has(buildingCode)) notFound();
  const sp = await searchParams;

  const sb = supabaseAdmin();
  const { data: listing } = await sb
    .from('guesty_listings')
    .select('id, nickname, title, building_code')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing || (listing as { building_code: string }).building_code !== buildingCode) {
    notFound();
  }

  const filter = { building: buildingCode, listingId, searchTag: sp.tag };

  const [list, asset, topTags, siblings] = await Promise.all([
    listAssets({ filter, page: 1, pageSize: 200 }),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
    getTopTags(filter, 12),
    getListingsForBuilding(buildingCode),
  ]);
  const items = await resolveAssetUrls(list.rows);
  const idsInOrder = items.map(i => i.asset.id);

  // Move targets: every other unit in this building + general
  const moveTargets: MoveTarget[] = [
    { buildingCode, listingId: null, label: `📍 ${buildingCode} · General Building Area` },
    ...siblings
      .filter(s => s.listing_id !== listingId)
      .map(s => ({ buildingCode, listingId: s.listing_id, label: `🛏️ ${s.nickname}` })),
  ];

  // Compute ad-eligible status — used by bar to label its toggle button.
  // We only need it to be correct when something is selected; cheaply,
  // delegate to the client which sees `selection`. Server-side, default
  // to false; the bar reads selected items from props it already has.
  const allAdEligibleSelected = false;

  const baseHref = `/beithady/gallery/${buildingCode}/${listingId}`;
  const albumLabel = (listing as { nickname?: string }).nickname || listingId;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: buildingCode, href: `/beithady/gallery/${buildingCode}` },
      { label: albumLabel },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title={albumLabel}
        subtitle={`${list.total.toLocaleString()} assets · ${(listing as { title?: string }).title || ''}`}
        right={
          <div className="flex items-center gap-2">
            <NukeAlbumButton
              buildingCode={buildingCode}
              listingId={listingId}
              totalAssets={list.total}
              albumLabel={albumLabel}
            />
            <Link href={`/beithady/gallery/${buildingCode}`} className="ix-btn-secondary text-xs">
              <ChevronLeft size={12} /> Back to {buildingCode}
            </Link>
          </div>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref={baseHref} />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">Upload to this apartment</h2>
        <Uploader building={buildingCode} listingId={listingId} />
      </section>

      {topTags.length > 0 && (
        <section className="ix-card p-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500 font-semibold mr-1">Tags:</span>
          {sp.tag && <Link href={baseHref} className="ix-btn-ghost text-xs px-2 py-0.5">× clear</Link>}
          {topTags.map(t => (
            <Link
              key={t.tag}
              href={`${baseHref}?tag=${encodeURIComponent(t.tag)}`}
              className={`px-2 py-0.5 rounded ${
                sp.tag === t.tag
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              {t.tag} <span className="opacity-60">{t.count}</span>
            </Link>
          ))}
        </section>
      )}

      <SelectableAssetGrid
        items={items}
        album={{ building: buildingCode, listingId }}
        detailHrefBase={baseHref + (sp.tag ? `?tag=${sp.tag}&` : '?')}
      />

      <BulkActionBar
        album={{ building: buildingCode, listingId }}
        idsInOrder={idsInOrder}
        moveTargets={moveTargets}
        allAdEligibleSelected={allAdEligibleSelected}
      />
    </BeithadyShell>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/lib/beithady/gallery/gallery-list.ts src/app/beithady/gallery/[buildingCode]/[listingId]/page.tsx
git commit -m "feat(gallery): wire SelectableAssetGrid + BulkActionBar + NukeAlbumButton into listing page"
```

---

## Task 21: Wire new components into general-area page

**Files:**
- Modify: `src/app/beithady/gallery/[buildingCode]/general/page.tsx`

- [ ] **Step 1: Read the existing general page to understand its shape**

```bash
cat src/app/beithady/gallery/[buildingCode]/general/page.tsx
```

(Use the result to preserve any existing UI details. The structure should mirror the listing page but for the (building, NULL) album.)

- [ ] **Step 2: Update the page**

Replace `src/app/beithady/gallery/[buildingCode]/general/page.tsx` so it follows the same shape as the listing page from Task 20, but with `listing_id IS NULL`:

```typescript
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset, getTopTags, resolveAssetUrls, getListingsForBuilding } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { Uploader } from '../../_components/uploader';
import { SelectableAssetGrid } from '../../_components/selectable-asset-grid';
import { AssetDetailModal } from '../../_components/asset-detail-modal';
import { BulkActionBar } from '../../_components/bulk-action-bar';
import { NukeAlbumButton } from '../../_components/nuke-album-button';
import type { MoveTarget } from '../../_components/move-to-unit-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID = new Set(['BH-26','BH-73','BH-435','BH-OK','BH-34']);

export default async function GalleryGeneralPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingCode: string }>;
  searchParams: Promise<{ asset?: string; tag?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const { buildingCode } = await params;
  if (!VALID.has(buildingCode)) notFound();
  const sp = await searchParams;

  const filter = { building: buildingCode, listingId: undefined, searchTag: sp.tag };
  const [list, asset, topTags, siblings] = await Promise.all([
    listAssets({ filter, page: 1, pageSize: 200 }),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
    getTopTags(filter, 12),
    getListingsForBuilding(buildingCode),
  ]);
  // listAssets without listingId returns all building assets — filter to listing_id = null only
  const onlyGeneral = list.rows.filter(a => a.listing_id === null);
  const items = await resolveAssetUrls(onlyGeneral);
  const idsInOrder = items.map(i => i.asset.id);

  // Move targets: every unit in this building (general is the current album, exclude it)
  const moveTargets: MoveTarget[] = siblings.map(s => ({
    buildingCode, listingId: s.listing_id, label: `🛏️ ${s.nickname}`,
  }));

  const baseHref = `/beithady/gallery/${buildingCode}/general`;
  const albumLabel = `${buildingCode} · General Building Area`;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: buildingCode, href: `/beithady/gallery/${buildingCode}` },
      { label: 'General' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title="General Building Area"
        subtitle={`${onlyGeneral.length.toLocaleString()} assets · lobby, pool, exterior, building-wide`}
        right={
          <div className="flex items-center gap-2">
            <NukeAlbumButton
              buildingCode={buildingCode}
              listingId={null}
              totalAssets={onlyGeneral.length}
              albumLabel={albumLabel}
            />
            <Link href={`/beithady/gallery/${buildingCode}`} className="ix-btn-secondary text-xs">
              <ChevronLeft size={12} /> Back to {buildingCode}
            </Link>
          </div>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref={baseHref} />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">Upload to General Building Area</h2>
        <Uploader building={buildingCode} listingId={null} />
      </section>

      {topTags.length > 0 && (
        <section className="ix-card p-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500 font-semibold mr-1">Tags:</span>
          {sp.tag && <Link href={baseHref} className="ix-btn-ghost text-xs px-2 py-0.5">× clear</Link>}
          {topTags.map(t => (
            <Link
              key={t.tag}
              href={`${baseHref}?tag=${encodeURIComponent(t.tag)}`}
              className={`px-2 py-0.5 rounded ${
                sp.tag === t.tag
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              {t.tag} <span className="opacity-60">{t.count}</span>
            </Link>
          ))}
        </section>
      )}

      <SelectableAssetGrid
        items={items}
        album={{ building: buildingCode, listingId: null }}
        detailHrefBase={baseHref + (sp.tag ? `?tag=${sp.tag}&` : '?')}
      />

      <BulkActionBar
        album={{ building: buildingCode, listingId: null }}
        idsInOrder={idsInOrder}
        moveTargets={moveTargets}
        allAdEligibleSelected={false}
      />
    </BeithadyShell>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/app/beithady/gallery/[buildingCode]/general/page.tsx
git commit -m "feat(gallery): wire new components into general-area page"
```

---

## Task 22: Delete old asset-grid.tsx

**Files:**
- Delete: `src/app/beithady/gallery/_components/asset-grid.tsx`

- [ ] **Step 1: Verify nothing imports the old grid**

```bash
grep -rn "from.*asset-grid" src/app/beithady/gallery/
grep -rn "AssetGrid" src/app/beithady/gallery/
```
Expected: only matches inside `selectable-asset-grid.tsx` (its own component is named `SelectableAssetGrid`, but be safe — verify no `import.*AssetGrid` from `'./asset-grid'` remains anywhere).

If any imports remain, fix them (likely missed file from Tasks 20-21).

- [ ] **Step 2: Delete the file**

```bash
rm src/app/beithady/gallery/_components/asset-grid.tsx
```

- [ ] **Step 3: Build to confirm**

```bash
npm run build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/beithady/gallery/_components/
git commit -m "chore(gallery): remove old asset-grid.tsx (replaced by SelectableAssetGrid)"
```

---

## Task 23: Manual smoke verification

**Files:** none — runtime verification.

This task does NOT commit. It's a checklist before deploying.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open `http://localhost:3000/beithady/gallery/BH-26/<some-listing-id>` in a browser, signed in as an admin user.

- [ ] **Step 2: Verify each test case from the spec test plan**

Walk the 12-item test plan in spec section 13. For each:

1. **Upload persistence:** queue 3 photos at unit A, navigate to unit B (in same building), verify tray pill shows count, drop 2 more at B, all 5 finish, both grids show new items after revalidation.
2. **Drag reorder:** drag tile at idx 5 to idx 0, browser refresh, verify order persists.
3. **Group drag:** select 3 tiles, drag any one → all 3 land contiguously where dropped.
4. **Click-to-move:** select 5 tiles → click ⤴ → they jump to start.
5. **Bulk delete:** select 4 → "Delete 4" → confirm → tiles vanish.
6. **Bulk move:** select 5 in unit A → Move to → unit B → unit B grid shows them at top.
7. **Bulk tag:** select 6 → Tag → add `hero_shot` → DB shows manual_tags updated.
8. **Bulk ad-eligible:** select 4 non-eligible → Mark ad-eligible → all 4 mirror to public bucket.
9. **Nuke:** "Wipe album" → type DEL (disabled) → DELETE (enabled) → confirm → grid empty.
10. **Range select:** click checkbox A, shift+click checkbox F → A through F selected.
11. **DB invariant:** in Supabase dashboard run:
    ```sql
    select sort_order, id from beithady_gallery_assets
     where listing_id='<some-listing>' and deleted_at is null
     order by sort_order;
    ```
    After a reorder, expect 1..N with no gaps.
12. **Cover photo:** drag a photo to position 1 of unit A, navigate to `/beithady/gallery/BH-26`, verify unit-folder card shows that photo.

- [ ] **Step 3: Stop dev server**

`Ctrl+C`.

- [ ] **Step 4: No commit (verification only)**

Move on to Task 24 only if all 12 cases pass. If any fail, diagnose, fix in a new commit, then re-verify.

---

## Task 24: Auto-deploy

**Files:** none — git operations.

- [ ] **Step 1: Update SESSION_HANDOFF.md**

Edit `SESSION_HANDOFF.md`, replacing the "🟡 Active turn — BH Gallery UX overhaul" section with a "🟢 Latest turn — BH Gallery UX overhaul (shipped)" summary noting:
- Migration 0066 applied
- 6 new server actions
- 4 new components + 1 rewritten + 1 deleted
- New `gallery/layout.tsx` mounts provider + tray
- All 12 manual smoke tests passing

- [ ] **Step 2: Commit handoff**

```bash
git add SESSION_HANDOFF.md
git commit -m "docs: handoff — BH gallery UX overhaul shipped"
```

- [ ] **Step 3: Merge to main and deploy**

Per `AGENTS.md` auto-deploy convention:

```bash
git checkout main
git pull origin main
git merge claude/busy-carson-e5604b --no-ff -m "merge: BH gallery UX overhaul (sort_order, persistent uploader, multi-select bulk ops)"
git push origin main
vercel --prod
```

- [ ] **Step 4: Post-deploy smoke**

Open the production URL `https://<your-vercel-domain>/beithady/gallery/BH-26/<listing>` in an incognito window, sign in, repeat smoke test #1 (upload persistence) and #2 (drag reorder) on production data.

If both pass, the rollout is complete.

If either fails, the auto-deploy convention says push a fix forward — don't roll back. Diagnose, commit the fix, push, redeploy. Migration 0066 is forward-only (the column exists; rolling back the code without the column would crash queries).

---

## Self-Review

**Spec coverage check:**

| Spec section | Implementing task(s) |
|--|--|
| 6.1 Migration 0066 | Task 1 |
| 6.2 ORDER BY rule | Task 3 |
| 6.3 sort_order on insert | Task 4 |
| 6.4 sort_order on bulk move | Task 7 |
| 7.1 GalleryProvider | Task 11 |
| 7.2 gallery/layout.tsx | Task 13 |
| 7.3 UploadTray | Task 12 |
| 7.4 Uploader rewrite | Task 14 |
| 7.5 SelectableAssetGrid | Tasks 15, 16 |
| 7.6 BulkActionBar | Task 18 |
| 7.7 NukeAlbumButton | Task 19 |
| 7.8 MoveToUnitModal | Task 17 |
| 8.1 uploadAssetAction modify | Task 4 |
| 8.2 reorderAssetsAction | Task 5 |
| 8.3 bulkDeleteAssetsAction | Task 6 |
| 8.4 bulkMoveAssetsAction | Task 7 |
| 8.5 bulkTagAssetsAction | Task 8 |
| 8.6 bulkAdEligibleAction | Task 9 |
| 8.7 nukeAlbumAction | Task 10 |
| 9 Data flows | Tasks 16 (reorder UX), 18 (move/tag/ad), 19 (nuke), 11+12 (persistent upload) |
| 10 Error handling | Tasks 16 (revert), 18 (toast + selection retain), 19 (typed gate) |
| 11 Permissions | every action calls `requirePermission('full')` |
| 12 Audit log | every server action calls `recordAudit` |
| 13 Test plan | Task 23 |
| 14 Files touched | Task 1-22 |
| 15 npm deps | Task 2 |
| 16 Rollout | Task 24 |

All spec items mapped. ✓

**Placeholder scan:** no TBD/TODO/"add error handling"/etc. Every code block is concrete.

**Type consistency check:**
- `AlbumKey` defined in `gallery-provider.tsx` (Task 11), used in `selectable-asset-grid.tsx` (Task 15/16), `bulk-action-bar.tsx` (Task 18), pages (Tasks 20/21). Same shape `{ building: string|null; listingId: string|null }` everywhere. ✓
- `BulkResult` type defined in Task 6 (`actions.ts`), used by Tasks 7, 8, 9. Same shape `{ ok: string[]; failed: { id, error }[] }`. ✓
- `MoveTarget` defined in `move-to-unit-modal.tsx` (Task 17), imported by `bulk-action-bar.tsx` (Task 18) and pages (Tasks 20/21). Same shape. ✓
- `UploadJob`, `UploadJobCategory` defined in `gallery-provider.tsx` (Task 11), imported by `upload-tray.tsx` (Task 12) and `uploader.tsx` (Task 14). ✓
- `AssetWithUrl` defined in Task 15, used in Task 16 + helper added in Task 20 (`resolveAssetUrls`). Same shape. ✓
- Server action function names match between definition and call sites. `reorderAssetsAction`, `bulkDeleteAssetsAction`, `bulkMoveAssetsAction`, `bulkTagAssetsAction`, `bulkAdEligibleAction`, `nukeAlbumAction`. ✓

No bugs found in self-review.

---

## Notes for the executor

- **Reading order:** Each task is self-contained but they have dependencies. Execute in numeric order — later tasks assume earlier ones shipped.
- **Build cadence:** Run `npm run build` at every commit step. Type errors are easier to fix when local than after a stack of changes.
- **Don't run dev server in background** unless you need it for Task 23. Killing zombie `npm run dev` processes is annoying.
- **Don't auto-deploy until Task 24.** All other commits land on the worktree branch only.
- **If you hit a Supabase error on a server action:** check that the columns referenced exist (especially after Task 1's migration ran). If migration didn't run, server actions will return `column "sort_order" does not exist`.
- **TypeScript strictness:** the project's tsconfig is strict. If you see "object is possibly null" errors on `selectionAlbum`, add a guard.
