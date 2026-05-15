# Video Compression Engine — Design Spec

**Date:** 2026-05-15
**Author:** kareemhady + Claude
**Status:** Draft, awaiting user review

## Goal

Add a client-side video compression engine to the Lime Investments dashboard so that any video uploaded through the app **always fits the 50 MB bucket cap** without the user thinking about it. Quality is maximized for the chosen target size. Files already under 50 MB pass through unchanged.

First consumer: the Beithady gallery uploader (the immediate pain point — `BH73-005.mp4` @ 60.2 MB was rejected by Supabase Storage). The engine is generic so other uploaders (boat receipts, ad creatives, anywhere else video is accepted) can opt in later.

## Non-goals

- No audio-only file handling (separate code path; the engine returns input unchanged for non-video MIMEs).
- No transcoding for *delivery* quality (e.g. building HLS variants for gallery playback). That is a future concern.
- No server-side compression fallback. If the client can't run WASM ffmpeg (unsupported browser), the upload errors as it does today.
- No editing UI (trim, crop, rotate). Scope is "shrink to fit" only.
- No raising the bucket cap. The 50 MB cap stays as the system invariant.

## Architecture

```
                   ┌─────────────────────────────────┐
                   │ src/lib/media/video-compress.ts │   ← engine (reusable)
                   │                                 │
                   │  compressVideoToFit(file, opts) │
                   │    1. fast-path if size ≤ cap   │
                   │    2. probe duration            │
                   │    3. compute target bitrate    │
                   │    4. pick resolution rung      │
                   │    5. 2-pass H.264 + AAC        │
                   │    6. return new File           │
                   └────────────┬────────────────────┘
                                │  dynamic import (lazy)
                                ▼
                   ┌─────────────────────────────────┐
                   │   @ffmpeg/ffmpeg @ 0.12.x       │
                   │   single-threaded WASM core     │
                   │   served from /public/ffmpeg/   │
                   └─────────────────────────────────┘

  Consumer:  src/app/beithady/gallery/_components/gallery-provider.tsx
             enqueueUpload() — adds `compressing` job state before existing upload
```

### Engine module

**File:** `src/lib/media/video-compress.ts` (new)

```ts
export type CompressProgress =
  | { phase: 'idle' }
  | { phase: 'loading-engine' }        // ffmpeg WASM downloading
  | { phase: 'probing' }                // ffprobe-equivalent metadata read
  | { phase: 'encoding'; pass: 1 | 2; percent: number }
  | { phase: 'done' };

export interface CompressOptions {
  maxBytes?: number;                    // default 50_000_000
  onProgress?: (p: CompressProgress) => void;
  signal?: AbortSignal;
}

export async function compressVideoToFit(
  file: File,
  opts?: CompressOptions
): Promise<File>;
```

**Contract:**
- If `file.size <= maxBytes` OR `file.type` does not start with `video/`, return the *same* `File` instance — no work, no progress callbacks beyond `phase:'done'`.
- Otherwise return a new `File` with name `<basename>-compressed.mp4` (always `.mp4` output, since H.264/AAC is the universally compatible target).
- On `AbortSignal`, throw `DOMException('Aborted', 'AbortError')` — caller is responsible for cleanup.
- On hard failure (browser doesn't support WASM, ffmpeg crashes, encode timeout), throw a typed `VideoCompressError` so the UI can show a meaningful message.

### Compression algorithm

**Target bitrate math** (chosen so the output exactly fits `maxBytes`):

```
target_total_bps = (maxBytes * 8 * 0.93) / duration_seconds
                                  ↑
                            7% headroom for MP4 container overhead

target_video_bps = target_total_bps - 96_000   // AAC audio reserved at 96 kbps mono/stereo
```

**Resolution rung selection** (auto-downscale only when needed):

| Computed `target_video_bps` | Output resolution | Rationale |
|---|---|---|
| ≥ 2 000 000 | Keep source resolution (cap at 1920×1080) | Plenty of bits, no scaling artifacts |
| 800 000 – 2 000 000 | 1280×720 | 1080p at <2 Mbps looks soft; 720p is sharper |
| 400 000 – 800 000 | 854×480 | Below ~800 kbps even 720p falls apart |
| < 400 000 | 854×480 | Lowest rung; just do it (user chose "always fit") |

Aspect ratio is preserved via `scale='min(W,iw)':-2'` (force even height).

**Encoder settings:**

```
Pass 1:  -c:v libx264 -preset medium -b:v <target_video_bps> -pass 1
         -an -f null /dev/null
Pass 2:  -c:v libx264 -preset medium -b:v <target_video_bps> -pass 2
         -c:a aac -b:a 96k -movflags +faststart -pix_fmt yuv420p
         -vf "scale=<W>:-2"   (only if downscaling)
         out.mp4
```

- `-preset medium` balances WASM encode speed (slower presets are *very* slow in WASM) with compression efficiency.
- 2-pass ABR hits the size target precisely; CRF would overshoot for short videos and undershoot for long ones given our hard ceiling.
- `+faststart` puts the moov atom at the front so the gallery <video> tag can begin playback before full download — matters for the public-facing gallery page.

### Lazy loading of WASM

- `@ffmpeg/ffmpeg` and the WASM core (~30 MB) are **dynamically imported** the first time `compressVideoToFit` is called with a >50 MB file. Users who never upload an oversized video pay zero bundle cost.
- Core files (`ffmpeg-core.js`, `ffmpeg-core.wasm`, `ffmpeg-core.worker.js`) are **self-hosted** at `public/ffmpeg/`, not loaded from a CDN. Reasons:
  1. The CDN-hosted core requires CORS headers we'd otherwise need to proxy.
  2. The service worker (already present at `/sw.js`) caches them on first use → second-and-later videos start compressing instantly.
  3. No third-party trust dependency for production uploads.
- Files come from `node_modules/@ffmpeg/core/dist/umd/` and are copied to `public/ffmpeg/` by a one-time setup step (no build-time copy job needed — they're static).
- We use the **single-threaded core** (`@ffmpeg/core`, not `@ffmpeg/core-mt`). This means we do **not** need `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers, which would break the existing Google OAuth popup and Stripe redirect flows. Single-threaded is ~2-3× slower than multi-threaded but does not require any cross-origin isolation.

### Integration into the gallery uploader

**File touched:** `src/app/beithady/gallery/_components/gallery-provider.tsx`

Job lifecycle today:  `queued → uploading → done | error`

Job lifecycle after this change:  `queued → [compressing] → uploading → done | error`

The `compressing` state is **only** entered for jobs where `file.type.startsWith('video/')` AND `file.size > 50_000_000`. All other jobs skip straight to `uploading` exactly as today.

When a job enters `compressing`:
1. The provider calls `compressVideoToFit(job.file, { onProgress, signal })`.
2. `onProgress` updates `job.compressPercent` so the upload tray shows e.g. `"Compressing 73%"`.
3. On success, `job.file` is replaced by the returned File and the job transitions to `uploading`. The existing signed-URL flow takes it from there.
4. On error, the job moves to `error` with a friendly message (`"Could not compress this video. Try a shorter clip."`).
5. On cancel (user clicks X in the tray), the AbortController fires; the partial output is discarded.

**No changes** to:
- `src/app/beithady/gallery/actions.ts` (server actions stay identical)
- Supabase Storage bucket configuration (the 50 MB cap remains)
- The signed-URL upload path
- The post-upload AI labeling pipeline

### UI updates

**File touched:** `src/app/beithady/gallery/_components/upload-tray.tsx`.

- Add a third progress bar state. Existing states show `"Uploading 42%"`; new state shows `"Compressing 73%"` with a different colored bar (slate vs blue, to be confirmed against the existing palette).
- Add a one-line subtitle on the uploader drop zone when a compression has happened in the current session: `"Large videos are automatically compressed to fit."` — confirms to the user *why* the upload took longer.

**File touched:** `src/app/beithady/gallery/_components/uploader.tsx`

- Update the helper text on line 95. Current: `50MB max · JPG/PNG/WEBP/HEIC + MP4/WEBM · AI labels in ~2 min`. New: `JPG/PNG/WEBP/HEIC + MP4/WEBM · large videos auto-compressed · AI labels in ~2 min`.

### Error handling

| Failure | UX |
|---|---|
| Browser doesn't support WASM/Web Workers (very old Safari, etc.) | Job moves to `error` with `"Your browser can't compress video. Use Chrome/Edge/Safari 16+."` |
| ffmpeg crashes mid-encode | Job moves to `error` with `"Compression failed. Try again or use a different format."`; original file is *not* uploaded. |
| User cancels via tray X button | Job removed cleanly; AbortController signals ffmpeg; no partial upload. |
| Compressed result *still* >50 MB (should be impossible given the math, but defend anyway) | Re-run with one rung lower on the resolution ladder; if 480p still overshoots, error with `"This video is unusually difficult to compress. Trim it and try again."` |
| WASM core fetch fails (network / 404) | Job moves to `error` with `"Compression engine unavailable. Reload and try again."` |

### Testing

- Unit tests live next to the module (`src/lib/media/video-compress.test.ts`), Vitest.
- **Mock the ffmpeg module entirely** — we are not running actual encoding in tests (vitest runs in jsdom, ffmpeg WASM is not viable there). The tests verify:
  - Files ≤ `maxBytes` and non-video files are returned unchanged (the "fast path").
  - The bitrate math: given `(maxBytes=50e6, durationSec=120)` we produce the expected target_video_bps.
  - The resolution rung selection at each boundary (1 999 999 → 720p; 2 000 000 → keep; 799 999 → 480p; 800 000 → 720p).
  - AbortSignal cancellation flow rejects with `AbortError`.
  - File MIME / extension on the output is `video/mp4` / `.mp4` regardless of input.
- Manual smoke test plan recorded in the implementation plan, run against the real gallery with a known oversized clip before the PR is considered done.

## Deferred / out of scope

- **Phone capture quality detection.** iPhones often record HEVC at very high bitrates. We don't special-case them; the engine just transcodes everything to H.264.
- **HEIC / HEIF photos.** Tangentially related, but those are images, not video. Out of scope for this engine.
- **Pre-flight duration warning.** The user explicitly said "always fit 50MB, max quality at that size" — no warnings, no asks. A 30-min phone video will become 480p at ~200 kbps and that is fine.
- **Server-side fallback.** No.
- **Multi-threaded WASM core.** Would require COOP/COEP, which threatens existing OAuth flows. The 2-3× speed cost is acceptable for the bandwidth and bundle isolation we gain.

## Files added / modified

**Added:**
- `src/lib/media/video-compress.ts` — engine
- `src/lib/media/video-compress.test.ts` — unit tests
- `public/ffmpeg/ffmpeg-core.js` (binary, vendored)
- `public/ffmpeg/ffmpeg-core.wasm` (binary, vendored)
- `public/ffmpeg/ffmpeg-core.worker.js` (binary, vendored)
- `docs/superpowers/specs/2026-05-15-video-compress-engine-design.md` (this file)

**Modified:**
- `package.json` — add `@ffmpeg/ffmpeg` + `@ffmpeg/core` (and optional `@ffmpeg/util`) deps
- `src/app/beithady/gallery/_components/gallery-provider.tsx` — add `compressing` job state, invoke engine
- `src/app/beithady/gallery/_components/uploader.tsx` — helper-text copy update
- `src/app/beithady/gallery/_components/upload-tray.tsx` — render the new `compressing` state with a progress bar
- `next.config.ts` (only if needed) — confirm `/ffmpeg/*` is served with correct MIME for `.wasm`

## Rollout

Direct push to `main` → Vercel auto-deploy, per CLAUDE.md standing authorization. No feature flag — the change is additive (a new job state, behavior identical for files ≤50 MB) and trivially revertable by a single commit if anything goes wrong.

## Open questions

None. The user confirmed "option 1 — just do it silently" for the long-video edge case. Ready for review.
