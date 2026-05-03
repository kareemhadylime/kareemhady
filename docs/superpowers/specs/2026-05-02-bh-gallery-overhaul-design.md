# BH Gallery UX Overhaul — Design Spec

**Date:** 2026-05-02
**Author:** Kareem Hady (via Claude brainstorming session)
**Status:** Approved (chat) → ready for implementation plan
**Scope:** `/beithady/gallery/**` — Beit Hady property gallery
**Migration:** `0066_beithady_gallery_sort_order.sql`

---

## 1. Problem statement

Three issues with the current gallery (`src/app/beithady/gallery/**`):

1. **Upload queue dies on navigation.** The uploader (`_components/uploader.tsx`) is a client component with local React state. When the user queues 30 files at BH-26-001 and then clicks into BH-26-002 to start a parallel upload, the BH-26-001 page unmounts and its in-flight uploads are killed.
2. **No reordering.** Assets are sorted strictly by `created_at desc`. The user can't promote a hero photo to position 1 nor curate the gallery order.
3. **No multi-select / bulk operations.** Only single-asset delete exists (`deleteAssetAction`). Tedious to clean up a wrong-unit upload, retag a session, or wipe an album.

## 2. Goals

- Make uploads survive intra-`/beithady/gallery/**` navigation.
- Let the user drag-and-drop OR click-and-button-move tiles to reorder.
- Multi-select tiles for bulk delete, bulk move-to-unit, bulk tag, bulk ad-eligible toggle.
- One-click "wipe everything in this album" with a typed confirmation.

## 3. Non-goals (explicitly out of scope)

- Cross-tab realtime sync (single-admin assumption holds).
- Hard-delete UI — soft-delete via `deleted_at` is the whole story.
- Surfacing the `beithady_gallery_albums` table in UX — stays infrastructure-only.
- Bulk AI re-label.
- Pagination > 200 in one bulk op (server caps each call at 200 ids).
- Bulk operations on `/documents`, `/brand-library`, `/ad-creatives` routes — this overhaul is the unit + general-area pages only.

## 4. Decisions made during brainstorming

| # | Question | Decision |
|---|----------|----------|
| Q1 | Reorder UX | Both: drag-and-drop **and** click-to-select-then-move buttons |
| Q2 | Multi-select capability scope | Delete + Move-to-unit + Bulk tag + Bulk ad-eligible toggle |
| Q3 | "Delete all in album" scope | Per-unit + General-Building-Area pages; type literal `DELETE` to confirm |
| Q4 | Persistent uploader scope | Gallery-section tray — provider mounted in `gallery/layout.tsx` so it persists across `/beithady/gallery/**` navigation, dies if user leaves the gallery section |
| Q5 | Upload concurrency | Parallel with limit = 3 |
| Q6 | Cover photo behavior | First-in-order = cover (no separate "pin" concept) |

## 5. Architecture

**Approach: dnd-kit + batch server actions.**

- D&D library: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (~13 KB gzipped). Provides touch, keyboard, and screen-reader support out of the box.
- Sort key: integer `sort_order` column with full-list renumber on each move. At 30-50 assets per album, renumbering all in one UPDATE is trivial.
- Bulk ops: one server action per op (`bulkDeleteAssetsAction`, etc.) that takes an array of ids — keeps roundtrips low.

**Rejected alternatives:**
- Native HTML5 D&D (no dep) — brittle cross-browser, poor touch UX, manual a11y.
- Fractional indexing for `sort_order` — elegant but unneeded at our scale.
- Supabase Realtime sync — overkill for single-tenant 5-mailbox tool.

## 6. Data model

### 6.1 New migration `supabase/migrations/0066_beithady_gallery_sort_order.sql`

```sql
-- =====================================================================
-- Beithady Gallery — Sort order column
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

### 6.2 Ordering rule

`ORDER BY sort_order ASC, created_at DESC` (the second key is a tiebreaker for fresh uploads that share `sort_order` momentarily).

### 6.3 Sort-order assignment on insert

New uploads land at the **top** of the album (preserves current "newest first" feel):

```sql
sort_order := coalesce((
  select min(sort_order) - 1
    from beithady_gallery_assets
   where building_code IS NOT DISTINCT FROM $building
     and listing_id IS NOT DISTINCT FROM $listing
     and deleted_at is null
), 0)
```

### 6.4 Sort-order assignment on bulk move

Moved assets land at the **top** of the destination album (same rule as upload).

## 7. Components

All new components live under `src/app/beithady/gallery/_components/`.

### 7.1 `gallery-provider.tsx` — context provider (new)

Client component. Owns three pieces of state:

```ts
type UploadJob = {
  id: string;             // client-side uuid
  file: File;
  building: string | null;
  listingId: string | null;
  category: 'photo' | 'video' | 'document' | 'brand_asset' | 'ad_creative';
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  startedAt?: number;
};

type GalleryContextValue = {
  // Upload tray
  jobs: UploadJob[];
  enqueueUpload: (files: File[], target: { building: string|null; listingId: string|null; category?: UploadJob['category'] }) => void;
  cancelJob: (id: string) => void;
  clearFinished: () => void;

  // Selection
  selection: Set<string>;          // asset ids
  selectionAlbum: { building: string|null; listingId: string|null } | null;
  toggleSelected: (id: string, album: { building: string|null; listingId: string|null }) => void;
  selectRange: (anchorId: string, targetId: string, idsInOrder: string[]) => void;
  selectAll: (ids: string[], album: { building: string|null; listingId: string|null }) => void;
  clearSelection: () => void;
};
```

**Selection scope rule:** selection clears whenever the album changes (different `building`/`listingId`). This prevents selecting tiles from BH-26-001 then accidentally bulk-moving across mismatched albums.

**Concurrency:** internal `pLimit(3)`-style worker. New jobs enter `queued` status, the worker promotes them to `uploading` when a slot frees.

### 7.2 `gallery/layout.tsx` — new layout file (new)

Wraps all `/beithady/gallery/**` routes. Renders `<GalleryProvider>` + `<UploadTray>`. The provider state survives intra-gallery navigation but is torn down when the user leaves the section.

### 7.3 `upload-tray.tsx` — floating tray (new)

Bottom-right fixed pill. Two states:

- **Collapsed:** small pill `↑ 8 uploading · BH-26-001` (or `↑ 8 · 2 albums` if mixed). Click to expand.
- **Expanded:** vertical list of jobs grouped by `(building, listingId)`. Each row: filename, target unit, progress chip, cancel ✕. Header has `Clear finished` and `Collapse`.

Auto-collapses 30 seconds after the last job hits `done` if the user hasn't interacted.

### 7.4 `uploader.tsx` — refactored (rewrite)

Drops local `jobs` state. Delegates to `provider.enqueueUpload()`. Otherwise UI is identical (drop zone + unit picker for building-page case + accept attrs).

### 7.5 `selectable-asset-grid.tsx` — new (replaces `asset-grid.tsx`)

Client component. Receives `assets: GalleryAsset[]` and pre-resolved URLs as props (parent server component still mints signed URLs once at request time — keeps the URL minting logic where it is).

Rendering:
- Wraps the grid in `<DndContext>` and `<SortableContext>` from dnd-kit.
- Each tile uses `useSortable({ id: asset.id })` for transform + listeners.
- On hover: a checkbox appears in the top-left corner of the tile.
- Click on the checkbox area = `provider.toggleSelected(id, album)`. Shift+click = `provider.selectRange(anchor, target, idsInOrder)`.
- Click anywhere else on the tile = navigate to `?asset=<id>` (current detail-modal behavior).
- When `provider.selection.size > 0`: tile shows a thicker outline + selection-count chip on top-right.
- Drag begins:
  - If the dragged tile is selected → drag the **group** (ghost shows count "5 photos"); on drop, all selected ids reorder together.
  - If not selected → single-tile drag.
- On drop: client computes `orderedIds[]`, calls `reorderAssetsAction({ buildingCode, listingId, orderedIds })` with optimistic UI.

The old server-component `asset-grid.tsx` is deleted; URL resolution moves to a small server helper used by the page that passes URLs as props.

### 7.6 `bulk-action-bar.tsx` — floating action bar (new)

Bottom-center fixed bar. Visible when `provider.selection.size > 0` and the route's album matches `selectionAlbum`. Layout (left → right):

- `N selected` count
- `← →` nudge one position
- `⤴ ⤵` move to start / end
- `Insert before…` opens a tile picker overlay
- `Move to unit…` opens `<MoveToUnitModal>`
- `Tag…` opens a tag-input modal (add + remove tags)
- `Mark ad-eligible` / `Demote from ads` (label toggles based on whether all selected are currently eligible)
- `Delete N` opens confirm modal
- `Clear`

### 7.7 `nuke-album-button.tsx` — new

Top-right of unit + general-area pages. Renders a small `Wipe album` button. On click, opens a modal:

```
Delete all 47 photos in BH-26-001?
This soft-deletes every asset in this folder.
Type DELETE to confirm.
[                ]
[ Cancel ]  [ Delete all ]   ← disabled until input === 'DELETE'
```

On confirm, calls `nukeAlbumAction({ buildingCode, listingId, confirmation: 'DELETE' })`.

### 7.8 `move-to-unit-modal.tsx` — new

Modal that lists every active unit in the same building (and a "General Building Area" entry). Single-select. Confirm calls `bulkMoveAssetsAction({ ids, targetBuildingCode, targetListingId })`.

## 8. Server actions (in `src/app/beithady/gallery/actions.ts`)

All require `gallery:full` permission, all audit-logged, all cap at 200 ids per call. Plain async functions (no FormData wrapping) — called from the client provider via the `'use server'` boundary.

### 8.1 `uploadAssetAction(formData)` — modified

After insert, sets `sort_order` to `min(sort_order) - 1` for the album using a single SQL expression (RPC or direct query). Otherwise unchanged.

### 8.2 `reorderAssetsAction({ buildingCode, listingId, orderedIds })` — new

```ts
// 1. Validate ids ⊂ album (every id must have matching building_code + listing_id and not be deleted).
// 2. UPDATE … FROM (VALUES (id, position), …) renumbers sort_order = 1..N in one statement.
// 3. recordAudit (action='assets_reordered', metadata={album, count})
// 4. revalidatePath for building + listing (or general).
```

### 8.3 `bulkDeleteAssetsAction({ ids })` — new

```ts
// 1. Soft-delete: UPDATE … SET deleted_at=now() WHERE id = ANY($1)
// 2. For each id with ad_eligible: demoteFromPublic(storage_path) — concurrency=3
// 3. For each id: deleteFromBucket(storage_bucket, storage_path) — best effort, concurrency=3
// 4. One audit row per id.
// 5. revalidatePath for affected buildings/listings (deduped).
// Returns { ok: string[], failed: { id, error }[] }
```

### 8.4 `bulkMoveAssetsAction({ ids, targetBuildingCode, targetListingId })` — new

```ts
// 1. Compute destination top: min(sort_order) in target album, default 0.
// 2. UPDATE building_code, listing_id, sort_order = (top - count + i) where i is the index.
// 3. Single statement using FROM (VALUES …) for sort_order assignment.
// 4. Audit + revalidate source + destination paths.
```

### 8.5 `bulkTagAssetsAction({ ids, addTags, removeTags })` — new

```ts
// addTags/removeTags pre-normalised (lowercase, trimmed, deduped, ≤ 30 entries each).
// UPDATE manual_tags = array(
//   SELECT DISTINCT t FROM unnest(manual_tags || $addTags) t WHERE t <> ALL($removeTags)
// )
// Cap final array at 30 entries (matches existing retagAssetAction limit).
// Audit + revalidate.
```

### 8.6 `bulkAdEligibleAction({ ids, eligible })` — new

```ts
// For each id:
//   if eligible && !current.ad_eligible: promoteToPublic(storage_path) → public_url
//   if !eligible && current.ad_eligible: demoteFromPublic(storage_path)
//   Then call beithady_gallery_set_ad_eligible RPC.
// Concurrency = 3 against storage.
// Returns { ok, failed }. Audit per id.
```

### 8.7 `nukeAlbumAction({ buildingCode, listingId, confirmation })` — new

```ts
// 1. if confirmation !== 'DELETE' throw new Error('confirmation_required')
// 2. SELECT id from beithady_gallery_assets WHERE building_code IS NOT DISTINCT FROM $1
//    AND listing_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL.
// 3. If count > 200, process in chunks of 200 (server-side; client only sees one call).
// 4. Delegate each chunk to bulkDeleteAssetsAction.
// 5. Audit (action='album_nuked', metadata={album, count}).
```

## 9. Data flow

### 9.1 Reorder (drag-and-drop)

1. User drags tile from index 3 to index 0.
2. `<SortableContext>` `onDragEnd` handler fires.
3. Client computes new `orderedIds[]` (use `arrayMove` from dnd-kit utilities).
4. Optimistic: provider updates a local `optimisticOrder` map → grid re-renders in new order immediately.
5. Call `reorderAssetsAction`.
6. On success: `revalidatePath` re-fetches RSC; client clears optimistic.
7. On error: revert optimistic → toast.

### 9.2 Reorder (click-to-select-then-move)

1. User clicks 5 checkboxes.
2. User clicks `⤴ Move to start` in `<BulkActionBar>`.
3. Client: pull selected ids out of current order, prepend to the front, compute `orderedIds[]`.
4. Same as 9.1 step 4 onwards.

### 9.3 Bulk move to another unit

1. User selects 5 tiles in BH-26-001.
2. Clicks `Move to unit…` → `<MoveToUnitModal>` → picks BH-26-002.
3. Calls `bulkMoveAssetsAction`.
4. On success: `revalidatePath` for BH-26-001 + BH-26-002.
5. Selection clears (album mismatch after move).

### 9.4 Persistent upload across navigation

1. User drops 30 files at `/beithady/gallery/BH-26/BH-26-001`.
2. Uploader calls `provider.enqueueUpload(files, { building: 'BH-26', listingId: 'BH-26-001' })`.
3. Provider creates 30 `UploadJob` records, the worker promotes 3 to `uploading`.
4. User clicks into `/beithady/gallery/BH-26/BH-26-002` (intra-section navigation).
5. `<GalleryProvider>` is mounted in `gallery/layout.tsx` → state survives.
6. `<UploadTray>` still renders, jobs continue in flight.
7. User drops 10 more files at BH-26-002 → enqueued alongside; tray groups by target.
8. Each completed upload triggers `revalidatePath` for its target album, so when the user navigates to that album, the grid is fresh.
9. 30s after the last `done`, tray collapses to pill.

### 9.5 Nuke album

1. User clicks `Wipe album` on `/beithady/gallery/BH-26/BH-26-001`.
2. Modal opens with current asset count.
3. User types `DELETE` → button enables.
4. Click → `nukeAlbumAction`.
5. Server selects all non-deleted ids in that album, soft-deletes in chunks of 200, demotes ad-eligible, purges storage best-effort.
6. `revalidatePath` → grid renders empty state.

## 10. Error handling

| Failure | Behavior |
|---------|----------|
| Upload error | Job status = `error`, retry button per row, count visible in pill |
| Reorder error | Optimistic UI reverts, toast `Reorder failed — try again` |
| Bulk action partial failure | Server returns `{ok[], failed[]}`. Toast shows counts. Failed ids stay selected so user can retry |
| Nuke confirmation typo | Button stays disabled, no server call |
| Provider state lost (user leaves `/beithady/gallery/**`) | Pending uploads are cancelled, `done` ones already committed. Acceptable per Q4-B |
| Concurrency overflow (storage 429) | Single-job retry once with 1s backoff; if still failing, mark `error` |

## 11. Permissions

All new server actions require `gallery:full` (matching the existing `requirePermission('full')` helper). Read-only users see no checkboxes, no drag handles, no nuke button, no bulk action bar.

## 12. Audit log entries

| Action key | Metadata |
|------------|----------|
| `assets_reordered` | `{album, count}` |
| `assets_bulk_deleted` | `{count, ids: string[]}` |
| `assets_bulk_moved` | `{count, source_album, target_album}` |
| `assets_bulk_tagged` | `{count, add_tags, remove_tags}` |
| `assets_bulk_ad_eligible` | `{count, eligible}` |
| `album_nuked` | `{album, count}` |

## 13. Testing plan (manual)

1. **Upload persistence:** drop 30 photos at BH-26-001, immediately click into BH-26-002. Tray pill shows `↑ 30 · 1 album`. Drop 10 more at BH-26-002 → tray shows two groups. All 40 finish. Navigate back to BH-26-001 → grid shows the 30. Navigate to `/beithady/communication` → tray dies (acceptable per Q4-B).
2. **Drag reorder:** open BH-26-001 grid, drag tile at index 5 to index 0. Refresh page → it's at index 0.
3. **Group drag:** select 3 tiles, drag any one of them to index 0 → all 3 move together preserving their relative order.
4. **Click-to-move:** select 5 tiles, click `⤴` → they jump to the front.
5. **Bulk delete:** select 4 tiles, click `Delete 4`, confirm. Tiles vanish. DB shows `deleted_at` set.
6. **Bulk move:** select 5 tiles in BH-26-001, click `Move to unit…`, pick BH-26-002. Selection clears, navigating to BH-26-002 shows them at the top.
7. **Bulk tag:** select 6 tiles, add tag `hero_shot`. DB shows `manual_tags` updated for all 6.
8. **Bulk ad-eligible:** select 4 tiles (none currently ad-eligible), click `Mark ad-eligible`. All 4 mirror to public bucket; toggle now reads `Demote from ads`.
9. **Nuke album:** click `Wipe album` on a unit with 47 assets. Type `DEL` → button disabled. Type `DELETE` → button enabled. Confirm. Grid empty. DB shows 47 rows with `deleted_at`.
10. **Range select:** click checkbox on tile A, shift+click checkbox on tile F → A through F all selected (5 tiles).
11. **Sort-order DB invariant:** after any reorder, `select sort_order from beithady_gallery_assets where listing_id='BH-26-001' and deleted_at is null order by sort_order` shows 1..N with no gaps.
12. **First-in-order = cover:** drag a photo to position 1, navigate to `/beithady/gallery/BH-26`. The unit-folder card cover updates to that photo.

## 14. Files touched

| Path | Action |
|------|--------|
| `supabase/migrations/0066_beithady_gallery_sort_order.sql` | new |
| `src/app/beithady/gallery/layout.tsx` | new |
| `src/app/beithady/gallery/_components/gallery-provider.tsx` | new |
| `src/app/beithady/gallery/_components/upload-tray.tsx` | new |
| `src/app/beithady/gallery/_components/selectable-asset-grid.tsx` | new |
| `src/app/beithady/gallery/_components/bulk-action-bar.tsx` | new |
| `src/app/beithady/gallery/_components/nuke-album-button.tsx` | new |
| `src/app/beithady/gallery/_components/move-to-unit-modal.tsx` | new |
| `src/app/beithady/gallery/_components/uploader.tsx` | rewrite (delegate to provider) |
| `src/app/beithady/gallery/_components/asset-grid.tsx` | delete (replaced by selectable-asset-grid) |
| `src/app/beithady/gallery/actions.ts` | + 6 bulk actions, modify upload to set sort_order |
| `src/lib/beithady/gallery/gallery-list.ts` | change ORDER BY to `sort_order ASC, created_at DESC` |
| `src/app/beithady/gallery/[buildingCode]/[listingId]/page.tsx` | swap grid, add nuke button |
| `src/app/beithady/gallery/[buildingCode]/general/page.tsx` | same |
| `package.json` | + `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |

## 15. Dependencies (npm)

- `@dnd-kit/core` (latest)
- `@dnd-kit/sortable` (latest)
- `@dnd-kit/utilities` (latest)

Combined gzipped size ~13 KB. No transitive runtime risks.

## 16. Rollout

- One PR / one commit chain, deployed via the project's standard auto-deploy flow (commit → push to main → `vercel --prod`, per `AGENTS.md`).
- Migration `0066` runs first via Supabase dashboard SQL editor (per `AGENTS.md` note about Windows + Supabase CLI on PATH).
- No feature flag — single-tenant tool, in-place upgrade is fine.

## 17. Future extensions (not in this spec)

- Bulk AI re-label (reconsider after user has used the bar for a while).
- Surface albums table in UX (group-by-album dimension on the building page).
- Cross-tab realtime if multiple admins start working the same album.
- Hard-delete cleanup job that purges rows with `deleted_at < now() - interval '30 days'`.
