# Video Compression Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side video compression engine that auto-shrinks any video >50 MB to fit the Supabase Storage bucket cap, at the maximum quality possible for that size. Wire it into the Beithady gallery uploader as the first consumer.

**Architecture:** New module `src/lib/media/video-compress.ts` exporting `compressVideoToFit(file, opts)`. Uses `@ffmpeg/ffmpeg` v0.12 single-threaded WASM core, lazy-imported from `public/ffmpeg/` (self-hosted, ~30 MB, service-worker cached after first use). 2-pass H.264 ABR targeting `(maxBytes * 8 * 0.93 / duration) − 96 kbps audio`, with an auto-downscale ladder (1080p ≥ 2 Mbps, 720p 800k–2M, 480p < 800k). The gallery upload tray gets a new `'compressing'` job state.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Vitest + jsdom, `@ffmpeg/ffmpeg@^0.12`, `@ffmpeg/util@^0.12`, `@ffmpeg/core@^0.12` (single-threaded variant).

**Spec:** `docs/superpowers/specs/2026-05-15-video-compress-engine-design.md`

---

## File structure

**Added:**
- `src/lib/media/video-compress.ts` — public engine + exported pure helpers (`computeTargetBitrate`, `pickResolutionRung`)
- `src/lib/media/video-compress.test.ts` — unit tests for fast-path + pure helpers + error wrapping (ffmpeg mocked)
- `src/lib/media/probe-video.ts` — HTMLVideoElement metadata probe (returns duration / width / height); no unit test (jsdom doesn't load video metadata, smoke-tested via dev server)
- `public/ffmpeg/ffmpeg-core.js` — vendored from `node_modules/@ffmpeg/core/dist/umd/`
- `public/ffmpeg/ffmpeg-core.wasm` — vendored from same
- `public/ffmpeg/.gitkeep` — keep the directory tracked even if the binaries aren't (we ship them via the public/ static dir)

**Modified:**
- `package.json` — three new deps
- `src/app/beithady/gallery/_components/gallery-provider.tsx` — `UploadJob` gets `'compressing'` status + `compressPercent`; worker effect handles the new state
- `src/app/beithady/gallery/_components/upload-tray.tsx` — renders `compressing` jobs with a progress %
- `src/app/beithady/gallery/_components/uploader.tsx` — helper-text copy update

---

## Task 1: Vendor ffmpeg WASM + add npm deps

**Files:**
- Modify: `package.json`
- Create: `public/ffmpeg/ffmpeg-core.js` (binary copy from `node_modules/`)
- Create: `public/ffmpeg/ffmpeg-core.wasm` (binary copy from `node_modules/`)
- Create: `public/ffmpeg/.gitkeep`

- [ ] **Step 1: Install npm packages**

Run from `C:\kareemhady`:
```
npm install @ffmpeg/ffmpeg@^0.12 @ffmpeg/util@^0.12 @ffmpeg/core@^0.12
```

Expected: three packages added to `dependencies` in `package.json`. **Do not** install `@ffmpeg/core-mt` — multi-threaded core requires COOP/COEP headers which would break Google OAuth and Stripe flows.

- [ ] **Step 2: Verify the single-threaded core is on disk**

PowerShell:
```
Test-Path node_modules\@ffmpeg\core\dist\umd\ffmpeg-core.js
Test-Path node_modules\@ffmpeg\core\dist\umd\ffmpeg-core.wasm
```

Both should print `True`. If either is `False`, run `npm install @ffmpeg/core@^0.12` again — `@ffmpeg/core` is sometimes installed only as a transitive dep without the umd build.

- [ ] **Step 3: Copy WASM core into `public/ffmpeg/`**

PowerShell:
```
New-Item -ItemType Directory -Force -Path public\ffmpeg | Out-Null
Copy-Item node_modules\@ffmpeg\core\dist\umd\ffmpeg-core.js  public\ffmpeg\ffmpeg-core.js  -Force
Copy-Item node_modules\@ffmpeg\core\dist\umd\ffmpeg-core.wasm public\ffmpeg\ffmpeg-core.wasm -Force
"" | Out-File -Encoding ascii -NoNewline public\ffmpeg\.gitkeep
```

Expected: three files in `public/ffmpeg/`. The `.wasm` should be ~30 MB.

- [ ] **Step 4: Verify file sizes**

PowerShell:
```
Get-ChildItem public\ffmpeg | Select-Object Name, Length
```

Expected: `ffmpeg-core.wasm` is ~30 MB (29 000 000–31 000 000 bytes). `ffmpeg-core.js` is small (~150 KB). If `.wasm` is under 1 MB, you copied the wrong file.

- [ ] **Step 5: Commit**

```
git add package.json package-lock.json public/ffmpeg/
git commit -m "feat(media): vendor @ffmpeg WASM core for client-side video compression"
```

---

## Task 2: Create `src/lib/media/probe-video.ts`

**Files:**
- Create: `src/lib/media/probe-video.ts`

This module reads video metadata via the browser's native `HTMLVideoElement`. No unit test — jsdom doesn't load real video metadata, so this is smoke-tested via the dev server in Task 9.

- [ ] **Step 1: Create the file**

Path: `src/lib/media/probe-video.ts`

```typescript
export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
}

/**
 * Read duration + native dimensions of a video file via the browser's
 * HTMLVideoElement metadata API. Throws if the file can't be parsed
 * (corrupt video, unsupported codec, etc.).
 */
export function probeVideo(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();
      if (!durationSec || !width || !height) {
        reject(new Error('probe_failed: invalid metadata'));
        return;
      }
      resolve({ durationSec, width, height });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('probe_failed: video element error'));
    };

    video.src = url;
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```
npx tsc --noEmit
```

Expected: no errors. (This will also catch any path-alias issues.)

- [ ] **Step 3: Commit**

```
git add src/lib/media/probe-video.ts
git commit -m "feat(media): add probeVideo() — duration/dimension reader via HTMLVideoElement"
```

---

## Task 3: Create bitrate math + types in `video-compress.ts` (TDD)

**Files:**
- Create: `src/lib/media/video-compress.ts`
- Create: `src/lib/media/video-compress.test.ts`

The bitrate computation and resolution-rung picker are pure functions. Test-first.

- [ ] **Step 1: Write failing test for `computeTargetBitrate`**

Path: `src/lib/media/video-compress.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { computeTargetBitrate, pickResolutionRung } from './video-compress';

describe('computeTargetBitrate', () => {
  it('targets fit-to-size with 7% container headroom and 96kbps audio reserved', () => {
    const result = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 120 });
    // 50_000_000 * 8 * 0.93 / 120 = 3_100_000 total
    // minus 96_000 audio = 3_004_000 for video
    expect(result.totalBps).toBe(3_100_000);
    expect(result.videoBps).toBe(3_004_000);
  });

  it('handles short clips with high target bitrate', () => {
    const { videoBps } = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 30 });
    // 50e6 * 8 * 0.93 / 30 = 12_400_000 total → 12_304_000 video
    expect(videoBps).toBe(12_304_000);
  });

  it('handles long clips with very low target bitrate', () => {
    const { videoBps } = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 1800 });
    // 50e6 * 8 * 0.93 / 1800 ≈ 206_666 total → 110_666 video
    expect(videoBps).toBe(110_666);
  });

  it('floors fractional bitrates to integer kbps for ffmpeg compatibility', () => {
    const { videoBps } = computeTargetBitrate({ maxBytes: 50_000_000, durationSec: 73 });
    expect(Number.isInteger(videoBps)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts
```

Expected: FAIL with "Failed to resolve import './video-compress'" or similar.

- [ ] **Step 3: Create `video-compress.ts` skeleton with types and `computeTargetBitrate`**

Path: `src/lib/media/video-compress.ts`

```typescript
export type CompressProgress =
  | { phase: 'idle' }
  | { phase: 'loading-engine' }
  | { phase: 'probing' }
  | { phase: 'encoding'; pass: 1 | 2; percent: number }
  | { phase: 'done' };

export interface CompressOptions {
  maxBytes?: number;
  onProgress?: (p: CompressProgress) => void;
  signal?: AbortSignal;
}

export class VideoCompressError extends Error {
  constructor(message: string, public code: 'unsupported' | 'probe_failed' | 'encode_failed' | 'aborted' | 'engine_load_failed') {
    super(message);
    this.name = 'VideoCompressError';
  }
}

const DEFAULT_MAX_BYTES = 50_000_000;
const AUDIO_RESERVE_BPS = 96_000;
const CONTAINER_HEADROOM = 0.93;

export function computeTargetBitrate(args: {
  maxBytes: number;
  durationSec: number;
}): { totalBps: number; videoBps: number } {
  const totalBps = Math.floor((args.maxBytes * 8 * CONTAINER_HEADROOM) / args.durationSec);
  const videoBps = totalBps - AUDIO_RESERVE_BPS;
  return { totalBps, videoBps };
}

export function pickResolutionRung(_args: {
  videoBps: number;
  srcWidth: number;
  srcHeight: number;
}): { width: number; height: number } {
  throw new Error('not implemented');
}
```

- [ ] **Step 4: Run the test again to verify `computeTargetBitrate` passes**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts -t computeTargetBitrate
```

Expected: 4 tests pass.

- [ ] **Step 5: Write failing tests for `pickResolutionRung`**

Append to `src/lib/media/video-compress.test.ts`:

```typescript
describe('pickResolutionRung', () => {
  it('keeps source resolution at >= 2 Mbps (1080p source)', () => {
    const r = pickResolutionRung({ videoBps: 2_000_000, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  it('caps source resolution at 1080p when source is larger', () => {
    const r = pickResolutionRung({ videoBps: 5_000_000, srcWidth: 3840, srcHeight: 2160 });
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  it('drops to 720p between 800k and 2M', () => {
    const r = pickResolutionRung({ videoBps: 1_500_000, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 1280, height: 720 });
  });

  it('drops to 720p at the 800k boundary', () => {
    const r = pickResolutionRung({ videoBps: 800_000, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 1280, height: 720 });
  });

  it('drops to 480p below 800k', () => {
    const r = pickResolutionRung({ videoBps: 799_999, srcWidth: 1920, srcHeight: 1080 });
    expect(r).toEqual({ width: 854, height: 480 });
  });

  it('preserves aspect ratio for portrait video', () => {
    const r = pickResolutionRung({ videoBps: 1_500_000, srcWidth: 1080, srcHeight: 1920 });
    // 720 rung but portrait: height limited to 1280, width keeps aspect
    expect(r.width).toBeLessThanOrEqual(1280);
    expect(r.height).toBeLessThanOrEqual(1280);
    // aspect ratio ~= 9:16 preserved within 1px tolerance
    expect(Math.abs(r.width / r.height - 1080 / 1920)).toBeLessThan(0.01);
  });

  it('never upscales a tiny source', () => {
    const r = pickResolutionRung({ videoBps: 5_000_000, srcWidth: 640, srcHeight: 360 });
    expect(r).toEqual({ width: 640, height: 360 });
  });
});
```

- [ ] **Step 6: Run failing tests**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts -t pickResolutionRung
```

Expected: 7 FAIL with "not implemented".

- [ ] **Step 7: Implement `pickResolutionRung`**

Replace the stub in `src/lib/media/video-compress.ts`:

```typescript
export function pickResolutionRung(args: {
  videoBps: number;
  srcWidth: number;
  srcHeight: number;
}): { width: number; height: number } {
  const { videoBps, srcWidth, srcHeight } = args;

  // Pick the long-edge target based on bitrate budget.
  let targetLongEdge: number;
  if (videoBps >= 2_000_000) targetLongEdge = 1920;
  else if (videoBps >= 800_000) targetLongEdge = 1280;
  else targetLongEdge = 854;

  const srcLongEdge = Math.max(srcWidth, srcHeight);

  // Never upscale.
  const longEdge = Math.min(targetLongEdge, srcLongEdge);

  // Preserve aspect; force even dimensions (H.264 requirement).
  if (srcWidth >= srcHeight) {
    const width = makeEven(longEdge);
    const height = makeEven(Math.round((longEdge * srcHeight) / srcWidth));
    return { width, height };
  } else {
    const height = makeEven(longEdge);
    const width = makeEven(Math.round((longEdge * srcWidth) / srcHeight));
    return { width, height };
  }
}

function makeEven(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}
```

Note: the "720p portrait" test expects `width` to keep ~9:16 against `height` 1280, which the long-edge logic delivers.

- [ ] **Step 8: Run all tests in the file**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts
```

Expected: 11 tests pass (4 `computeTargetBitrate` + 7 `pickResolutionRung`).

- [ ] **Step 9: Commit**

```
git add src/lib/media/video-compress.ts src/lib/media/video-compress.test.ts
git commit -m "feat(media): video-compress bitrate math + resolution rung picker"
```

---

## Task 4: Add fast-path + error class to `compressVideoToFit` (TDD)

**Files:**
- Modify: `src/lib/media/video-compress.ts`
- Modify: `src/lib/media/video-compress.test.ts`

The fast-path returns the input File unchanged when no compression is needed (file ≤ cap OR non-video MIME). This is the most-frequently-hit branch and must be correct.

- [ ] **Step 1: Write failing tests for the fast-path**

Append to `src/lib/media/video-compress.test.ts`:

```typescript
import { compressVideoToFit, VideoCompressError } from './video-compress';

describe('compressVideoToFit fast-path', () => {
  it('returns the same File instance when file.size <= maxBytes', async () => {
    const small = new File([new Uint8Array(1_000_000)], 'small.mp4', { type: 'video/mp4' });
    const result = await compressVideoToFit(small);
    expect(result).toBe(small);
  });

  it('returns the same File instance for non-video MIMEs even when oversized', async () => {
    const big = new File([new Uint8Array(60_000_000)], 'huge.pdf', { type: 'application/pdf' });
    const result = await compressVideoToFit(big);
    expect(result).toBe(big);
  });

  it('honors a custom maxBytes', async () => {
    const file = new File([new Uint8Array(2_000_000)], 'clip.mp4', { type: 'video/mp4' });
    const result = await compressVideoToFit(file, { maxBytes: 3_000_000 });
    expect(result).toBe(file);
  });

  it('emits a done progress event on the fast-path', async () => {
    const file = new File([new Uint8Array(1_000)], 'tiny.mp4', { type: 'video/mp4' });
    const seen: string[] = [];
    await compressVideoToFit(file, { onProgress: (p) => seen.push(p.phase) });
    expect(seen).toContain('done');
  });
});

describe('VideoCompressError', () => {
  it('preserves code and name', () => {
    const err = new VideoCompressError('boom', 'encode_failed');
    expect(err.code).toBe('encode_failed');
    expect(err.name).toBe('VideoCompressError');
    expect(err.message).toBe('boom');
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts -t "fast-path"
```

Expected: 4 FAIL with "compressVideoToFit is not a function" or similar.

- [ ] **Step 3: Implement `compressVideoToFit` fast-path**

Append to `src/lib/media/video-compress.ts`:

```typescript
export async function compressVideoToFit(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const onProgress = opts.onProgress ?? (() => {});

  // Fast-path: already under cap, or not a video.
  const isVideo = (file.type || '').startsWith('video/');
  if (!isVideo || file.size <= maxBytes) {
    onProgress({ phase: 'done' });
    return file;
  }

  // Slow-path: actual transcoding. Implemented in Task 5.
  throw new VideoCompressError('not implemented', 'encode_failed');
}
```

- [ ] **Step 4: Run tests**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts
```

Expected: 16 tests pass (11 from Task 3 + 5 from Task 4).

- [ ] **Step 5: Commit**

```
git add src/lib/media/video-compress.ts src/lib/media/video-compress.test.ts
git commit -m "feat(media): compressVideoToFit fast-path + VideoCompressError class"
```

---

## Task 5: Implement ffmpeg transcoding path in `compressVideoToFit`

**Files:**
- Modify: `src/lib/media/video-compress.ts`
- Modify: `src/lib/media/video-compress.test.ts`

This is the real engine. We can't unit-test the actual encode in jsdom, so we mock `@ffmpeg/ffmpeg` and `./probe-video` and test the orchestration logic. The real transcoding is verified manually in Task 9.

- [ ] **Step 1: Write failing tests for the orchestrator (with mocks)**

First, change the top-of-file import line in `src/lib/media/video-compress.test.ts` from:

```typescript
import { describe, it, expect } from 'vitest';
```

to:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

Then append to the same file:

```typescript
vi.mock('./probe-video', () => ({
  probeVideo: vi.fn(),
}));

// Build a fake FFmpeg instance with the v0.12 API surface we use.
function makeFakeFFmpeg(opts: { runOutputBytes: number; throwOnExec?: boolean } = { runOutputBytes: 5_000_000 }) {
  const progressHandlers: Array<(e: { progress: number }) => void> = [];
  return {
    load: vi.fn(async () => undefined),
    on: vi.fn((event: string, handler: (e: { progress: number }) => void) => {
      if (event === 'progress') progressHandlers.push(handler);
    }),
    off: vi.fn(),
    writeFile: vi.fn(async () => undefined),
    readFile: vi.fn(async () => new Uint8Array(opts.runOutputBytes)),
    deleteFile: vi.fn(async () => undefined),
    exec: vi.fn(async () => {
      if (opts.throwOnExec) throw new Error('ffmpeg crashed');
      // Simulate halfway progress
      for (const h of progressHandlers) h({ progress: 0.5 });
      return 0;
    }),
    terminate: vi.fn(),
  };
}

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: vi.fn(() => makeFakeFFmpeg({ runOutputBytes: 5_000_000 })),
}));

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(async (f: File) => new Uint8Array(await f.arrayBuffer())),
  toBlobURL: vi.fn(async (url: string) => `blob:${url}`),
}));

import { probeVideo } from './probe-video';

describe('compressVideoToFit transcoding path', () => {
  beforeEach(() => {
    vi.mocked(probeVideo).mockReset();
  });

  it('returns a new File when input exceeds maxBytes', async () => {
    vi.mocked(probeVideo).mockResolvedValue({ durationSec: 120, width: 1920, height: 1080 });
    const big = new File([new Uint8Array(60_000_000)], 'huge.mp4', { type: 'video/mp4' });
    const result = await compressVideoToFit(big);
    expect(result).not.toBe(big);
    expect(result.name).toBe('huge-compressed.mp4');
    expect(result.type).toBe('video/mp4');
    expect(result.size).toBe(5_000_000); // from fake ffmpeg
  });

  it('emits phase progression: loading-engine → probing → encoding → done', async () => {
    vi.mocked(probeVideo).mockResolvedValue({ durationSec: 120, width: 1920, height: 1080 });
    const big = new File([new Uint8Array(60_000_000)], 'x.mp4', { type: 'video/mp4' });
    const phases: string[] = [];
    await compressVideoToFit(big, { onProgress: (p) => phases.push(p.phase) });
    expect(phases[0]).toBe('loading-engine');
    expect(phases).toContain('probing');
    expect(phases).toContain('encoding');
    expect(phases[phases.length - 1]).toBe('done');
  });

  it('wraps a probe failure as VideoCompressError(probe_failed)', async () => {
    vi.mocked(probeVideo).mockRejectedValue(new Error('no codec'));
    const big = new File([new Uint8Array(60_000_000)], 'x.mp4', { type: 'video/mp4' });
    await expect(compressVideoToFit(big)).rejects.toMatchObject({
      name: 'VideoCompressError',
      code: 'probe_failed',
    });
  });

  it('respects AbortSignal before starting', async () => {
    vi.mocked(probeVideo).mockResolvedValue({ durationSec: 120, width: 1920, height: 1080 });
    const big = new File([new Uint8Array(60_000_000)], 'x.mp4', { type: 'video/mp4' });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(compressVideoToFit(big, { signal: ctrl.signal })).rejects.toMatchObject({
      code: 'aborted',
    });
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts -t "transcoding path"
```

Expected: 4 FAIL with "not implemented" error.

- [ ] **Step 3: Implement the transcoding path**

Replace the body of `compressVideoToFit` in `src/lib/media/video-compress.ts` with the full version. The complete file should now be:

```typescript
import { probeVideo } from './probe-video';

export type CompressProgress =
  | { phase: 'idle' }
  | { phase: 'loading-engine' }
  | { phase: 'probing' }
  | { phase: 'encoding'; pass: 1 | 2; percent: number }
  | { phase: 'done' };

export interface CompressOptions {
  maxBytes?: number;
  onProgress?: (p: CompressProgress) => void;
  signal?: AbortSignal;
}

export class VideoCompressError extends Error {
  constructor(message: string, public code: 'unsupported' | 'probe_failed' | 'encode_failed' | 'aborted' | 'engine_load_failed') {
    super(message);
    this.name = 'VideoCompressError';
  }
}

const DEFAULT_MAX_BYTES = 50_000_000;
const AUDIO_RESERVE_BPS = 96_000;
const CONTAINER_HEADROOM = 0.93;

export function computeTargetBitrate(args: {
  maxBytes: number;
  durationSec: number;
}): { totalBps: number; videoBps: number } {
  const totalBps = Math.floor((args.maxBytes * 8 * CONTAINER_HEADROOM) / args.durationSec);
  const videoBps = totalBps - AUDIO_RESERVE_BPS;
  return { totalBps, videoBps };
}

export function pickResolutionRung(args: {
  videoBps: number;
  srcWidth: number;
  srcHeight: number;
}): { width: number; height: number } {
  const { videoBps, srcWidth, srcHeight } = args;
  let targetLongEdge: number;
  if (videoBps >= 2_000_000) targetLongEdge = 1920;
  else if (videoBps >= 800_000) targetLongEdge = 1280;
  else targetLongEdge = 854;

  const srcLongEdge = Math.max(srcWidth, srcHeight);
  const longEdge = Math.min(targetLongEdge, srcLongEdge);

  if (srcWidth >= srcHeight) {
    const width = makeEven(longEdge);
    const height = makeEven(Math.round((longEdge * srcHeight) / srcWidth));
    return { width, height };
  } else {
    const height = makeEven(longEdge);
    const width = makeEven(Math.round((longEdge * srcWidth) / srcHeight));
    return { width, height };
  }
}

function makeEven(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}

export async function compressVideoToFit(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const onProgress = opts.onProgress ?? (() => {});
  const signal = opts.signal;

  // Fast-path.
  const isVideo = (file.type || '').startsWith('video/');
  if (!isVideo || file.size <= maxBytes) {
    onProgress({ phase: 'done' });
    return file;
  }

  if (signal?.aborted) {
    throw new VideoCompressError('aborted', 'aborted');
  }

  // 1. Load ffmpeg WASM (lazy).
  onProgress({ phase: 'loading-engine' });
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

  let ffmpeg: InstanceType<typeof FFmpeg>;
  try {
    ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
    });
  } catch (e) {
    throw new VideoCompressError(
      `engine_load_failed: ${e instanceof Error ? e.message : String(e)}`,
      'engine_load_failed',
    );
  }

  if (signal?.aborted) {
    ffmpeg.terminate?.();
    throw new VideoCompressError('aborted', 'aborted');
  }

  // 2. Probe the video for duration + dimensions.
  onProgress({ phase: 'probing' });
  let meta: { durationSec: number; width: number; height: number };
  try {
    meta = await probeVideo(file);
  } catch (e) {
    ffmpeg.terminate?.();
    throw new VideoCompressError(
      `probe_failed: ${e instanceof Error ? e.message : String(e)}`,
      'probe_failed',
    );
  }

  if (signal?.aborted) {
    ffmpeg.terminate?.();
    throw new VideoCompressError('aborted', 'aborted');
  }

  // 3. Compute target bitrate + resolution.
  const { videoBps } = computeTargetBitrate({ maxBytes, durationSec: meta.durationSec });
  const { width, height } = pickResolutionRung({
    videoBps,
    srcWidth: meta.width,
    srcHeight: meta.height,
  });
  const needsScale = width !== meta.width || height !== meta.height;

  // 4. Two-pass encode.
  const inputName = 'in' + extOf(file.name);
  const outputName = 'out.mp4';
  const passLog = 'ffmpeg2pass';

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    let currentPass: 1 | 2 = 1;
    const handleProgress = ({ progress }: { progress: number }) => {
      onProgress({
        phase: 'encoding',
        pass: currentPass,
        percent: Math.max(0, Math.min(100, Math.round(progress * 100))),
      });
    };
    ffmpeg.on('progress', handleProgress);

    const baseArgs = [
      '-y',
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-b:v', String(videoBps),
      '-pix_fmt', 'yuv420p',
    ];
    if (needsScale) {
      baseArgs.push('-vf', `scale=${width}:${height}`);
    }

    // Pass 1: video-only, no output file.
    currentPass = 1;
    onProgress({ phase: 'encoding', pass: 1, percent: 0 });
    await ffmpeg.exec([
      ...baseArgs,
      '-pass', '1',
      '-passlogfile', passLog,
      '-an',
      '-f', 'null',
      'NUL',
    ]);

    if (signal?.aborted) throw new VideoCompressError('aborted', 'aborted');

    // Pass 2: write final mp4.
    currentPass = 2;
    onProgress({ phase: 'encoding', pass: 2, percent: 0 });
    await ffmpeg.exec([
      ...baseArgs,
      '-pass', '2',
      '-passlogfile', passLog,
      '-c:a', 'aac',
      '-b:a', String(AUDIO_RESERVE_BPS),
      '-movflags', '+faststart',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const bytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : (data as Uint8Array);

    // Clean up scratch files; ignore errors.
    for (const f of [inputName, outputName, `${passLog}-0.log`, `${passLog}-0.log.mbtree`]) {
      try { await ffmpeg.deleteFile(f); } catch { /* ignore */ }
    }
    ffmpeg.terminate?.();

    onProgress({ phase: 'done' });
    const outName = baseName(file.name) + '-compressed.mp4';
    return new File([bytes], outName, { type: 'video/mp4', lastModified: Date.now() });
  } catch (e) {
    ffmpeg.terminate?.();
    if (e instanceof VideoCompressError) throw e;
    throw new VideoCompressError(
      `encode_failed: ${e instanceof Error ? e.message : String(e)}`,
      'encode_failed',
    );
  }
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i) : '.mp4';
}

function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(0, i) : name;
}
```

- [ ] **Step 4: Run all tests in the file**

Run:
```
npx vitest run src/lib/media/video-compress.test.ts
```

Expected: 20 tests pass (16 from earlier + 4 new transcoding tests).

- [ ] **Step 5: Make sure the rest of the suite still passes**

Run:
```
npm run test
```

Expected: all existing project tests still pass; no regressions.

- [ ] **Step 6: Commit**

```
git add src/lib/media/video-compress.ts src/lib/media/video-compress.test.ts
git commit -m "feat(media): compressVideoToFit transcoding path — 2-pass H.264 ABR with auto-downscale"
```

---

## Task 6: Wire `'compressing'` state into `gallery-provider.tsx`

**Files:**
- Modify: `src/app/beithady/gallery/_components/gallery-provider.tsx`

The provider gets a new job status and a `compressPercent` field. The existing worker effect picks up `'queued'` jobs and runs them through compression (if applicable) before uploading.

- [ ] **Step 1: Update the `UploadJob` type and concurrency counting**

In `src/app/beithady/gallery/_components/gallery-provider.tsx`, replace the `UploadJob` type definition (lines 14–24) with:

```typescript
export type UploadJob = {
  id: string;
  file: File;
  building: string | null;
  listingId: string | null;
  category: UploadJobCategory;
  status: 'queued' | 'compressing' | 'uploading' | 'done' | 'error';
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  compressPercent?: number; // 0–100 when status === 'compressing'
};
```

- [ ] **Step 2: Update the worker effect to handle compression**

Replace the worker `useEffect` block (lines 78–130) with:

```typescript
  useEffect(() => {
    const inFlight = jobs.filter(j => j.status === 'uploading' || j.status === 'compressing').length;
    if (inFlight >= MAX_CONCURRENT) return;
    const next = jobs.find(j => j.status === 'queued');
    if (!next) return;

    const isVideo = (next.file.type || '').startsWith('video/');
    const needsCompress = isVideo && next.file.size > 50_000_000;

    // Move to the right starting state.
    setJobs(prev => prev.map(j => j.id === next.id
      ? { ...j, status: needsCompress ? 'compressing' as const : 'uploading' as const, startedAt: Date.now(), compressPercent: needsCompress ? 0 : undefined }
      : j));

    (async () => {
      try {
        let fileToUpload = next.file;

        if (needsCompress) {
          const { compressVideoToFit } = await import('@/lib/media/video-compress');
          fileToUpload = await compressVideoToFit(next.file, {
            onProgress: (p) => {
              if (p.phase === 'encoding') {
                // Smooth two-pass progress: pass 1 = 0–50%, pass 2 = 50–100%.
                const overall = p.pass === 1 ? p.percent / 2 : 50 + p.percent / 2;
                setJobs(prev => prev.map(j => j.id === next.id
                  ? { ...j, compressPercent: Math.round(overall) }
                  : j));
              }
            },
          });
          // Transition to uploading.
          setJobs(prev => prev.map(j => j.id === next.id
            ? { ...j, status: 'uploading' as const, compressPercent: undefined, file: fileToUpload }
            : j));
        }

        const mime = fileToUpload.type || 'application/octet-stream';
        const signed = await signGalleryUploadAction({
          fileName: fileToUpload.name,
          mime,
          building: next.building,
          listingId: next.listingId,
          category: next.category,
        });
        if (!signed.ok) throw new Error(`sign_failed: ${signed.error}`);

        const sb = supabaseBrowser();
        const { error: upErr } = await sb.storage
          .from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, fileToUpload, {
            contentType: mime,
            upsert: false,
          });
        if (upErr) throw new Error(`storage_upload_failed: ${upErr.message}`);

        const reg = await registerGalleryUploadAction({
          path: signed.path,
          bucket: signed.bucket,
          fileName: fileToUpload.name,
          mime,
          sizeBytes: fileToUpload.size,
          building: next.building,
          listingId: next.listingId,
          category: next.category,
        });
        if (!reg.ok) throw new Error(`register_failed: ${reg.error}`);

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
```

- [ ] **Step 3: Run TypeScript check**

Run:
```
npx tsc --noEmit
```

Expected: no errors. (TypeScript will catch any places where `UploadJob['status']` is exhaustively switched and now misses `'compressing'`.)

- [ ] **Step 4: Run the full test suite**

Run:
```
npm run test
```

Expected: all tests pass. No tests touch the provider directly, so this is just a regression check.

- [ ] **Step 5: Commit**

```
git add src/app/beithady/gallery/_components/gallery-provider.tsx
git commit -m "feat(gallery): add 'compressing' job state, invoke video-compress engine for >50MB videos"
```

---

## Task 7: Render `'compressing'` state in `upload-tray.tsx`

**Files:**
- Modify: `src/app/beithady/gallery/_components/upload-tray.tsx`

The tray currently renders four states (queued / uploading / done / error). Add a fifth: `compressing`, showing `"Compressing 73%"` with a slate-colored progress bar.

- [ ] **Step 1: Import a sparkle/zap icon for the compressing state**

In `src/app/beithady/gallery/_components/upload-tray.tsx`, replace the lucide-react import on line 3 with:

```typescript
import { Upload, ChevronUp, ChevronDown, X, RotateCw, Loader2, CheckCircle2, AlertTriangle, FileVideo } from 'lucide-react';
```

`FileVideo` will denote the compressing state — it visually distinguishes it from the blue uploading spinner.

- [ ] **Step 2: Update the active/inFlight counts to include compressing**

Replace lines 20–24:

```typescript
  const total = jobs.length;
  const inFlight = jobs.filter(j => j.status === 'uploading').length;
  const compressing = jobs.filter(j => j.status === 'compressing').length;
  const queued = jobs.filter(j => j.status === 'queued').length;
  const errors = jobs.filter(j => j.status === 'error').length;
  const active = inFlight + queued + compressing;
  const allDone = total > 0 && active === 0;
```

- [ ] **Step 3: Update the per-job row to render the compressing state**

Replace the per-job row (current lines 88–110) with:

```typescript
                    {list.map(j => (
                      <div key={j.id} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="flex-1 truncate" title={j.file.name}>
                          {j.file.name}
                          {j.status === 'compressing' && (
                            <span className="ml-1 text-[10px] text-slate-500">
                              · compressing {j.compressPercent ?? 0}%
                            </span>
                          )}
                        </span>
                        <span className="text-slate-400 tabular-nums text-[10px] w-14 text-right">
                          {(j.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <span className="w-6 text-right">
                          {j.status === 'queued' && <span className="text-slate-400 text-[10px]">…</span>}
                          {j.status === 'compressing' && <FileVideo size={11} className="inline text-amber-500 animate-pulse" />}
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
```

- [ ] **Step 4: Update the header to mention compression in the active count**

Replace line 64:

```typescript
              <span className="text-xs font-semibold">
                {active > 0
                  ? compressing > 0
                    ? `Processing ${active} of ${total}`
                    : `Uploading ${active} of ${total}`
                  : `${total} ${total === 1 ? 'job' : 'jobs'}`}
              </span>
```

- [ ] **Step 5: Run TypeScript check**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run tests**

Run:
```
npm run test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```
git add src/app/beithady/gallery/_components/upload-tray.tsx
git commit -m "feat(gallery): render 'compressing' job state with percent in upload tray"
```

---

## Task 8: Update uploader helper text

**Files:**
- Modify: `src/app/beithady/gallery/_components/uploader.tsx`

- [ ] **Step 1: Update the helper-text line**

In `src/app/beithady/gallery/_components/uploader.tsx`, change line 95 from:

```typescript
          50MB max · JPG/PNG/WEBP/HEIC + MP4/WEBM · AI labels in ~2 min
```

to:

```typescript
          JPG/PNG/WEBP/HEIC + MP4/WEBM · large videos auto-compressed · AI labels in ~2 min
```

- [ ] **Step 2: Run TypeScript check**

Run:
```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/app/beithady/gallery/_components/uploader.tsx
git commit -m "feat(gallery): update uploader helper text to reflect auto-compression"
```

---

## Task 9: Manual smoke test on the dev server

**No file changes — verification only.**

Manual end-to-end test against a real >50 MB video. This is the only way to verify the actual ffmpeg WASM path; unit tests can't run real ffmpeg in jsdom.

- [ ] **Step 1: Confirm WASM files are accessible from the dev server**

Start dev server:
```
npm run dev
```

Wait for the server to come up on http://localhost:3000.

In a second shell, confirm the WASM core is served correctly:
```
curl -sI http://localhost:3000/ffmpeg/ffmpeg-core.wasm
```

Expected: HTTP 200 and `Content-Type: application/wasm` (or `application/octet-stream` — both work, Next.js serves correct MIME by file extension).

- [ ] **Step 2: Test the upload flow with a real oversized video**

Pick a real test file. The known-bad case is `C:\Users\karee\Videos\Captures\Lime Investments Dashboard - Google Chrome 2026-05-15 09-21-14.mp4` (94 MB at 2288×1440, mentioned in SESSION_HANDOFF.md). Or any other video >50 MB the user has handy.

1. Open http://localhost:3000/beithady/gallery/BH-73/BH73-3BR-C-005 (or any building/listing URL).
2. Drop the >50 MB video onto the uploader.
3. Watch the upload tray (bottom-right corner). Expected sequence:
   - Job appears with status `compressing` and an amber `FileVideo` icon
   - "Compressing 0% → 50% → 100%" updates over the encode duration (a few minutes for big videos)
   - Status flips to `uploading` (blue spinner)
   - Status flips to `done` (green checkmark)
4. Refresh the gallery page; the video appears as a new asset.

- [ ] **Step 3: Verify the uploaded file is under 50 MB**

In the Supabase dashboard → Storage → `beithady-gallery-private` bucket, find the just-uploaded file (path ends with the recently-uploaded asset's UUID or filename). Its size should be ≤ 50 MB.

Alternatively in the running app, open the asset detail and check the `size_bytes` field in the asset row.

- [ ] **Step 4: Verify a small video still uses the fast-path (no compression)**

Drop a video < 50 MB into the same uploader. The job should go directly to `uploading` (blue spinner), no `compressing` step. Verifies fast-path correctness.

- [ ] **Step 5: Confirm no regressions on image uploads**

Drop a normal JPG/PNG. It should upload exactly as before (no `compressing` state, no ffmpeg load).

- [ ] **Step 6: Hand off to user for QA**

If anything in steps 2–5 didn't work, STOP and report the issue. Do not deploy.

If all steps passed, proceed to Task 10.

---

## Task 10: Deploy to production

Per CLAUDE.md standing authorization: this is a forward-only deploy, no flag, no approval needed. The change is additive (new job state) and trivially revertable.

- [ ] **Step 1: Make sure all commits from this branch are pushed**

```
git status
```

Expected: `nothing to commit, working tree clean`.

```
git log origin/main..HEAD --oneline
```

Expected: shows the 7 commits from this plan (or none if already pushed). If non-empty:

```
git fetch origin main --quiet
git rebase origin/main
git push origin HEAD:main
```

If push is rejected (concurrent commit from another worktree), re-fetch and rebase, then push again.

- [ ] **Step 2: Confirm the GitHub → Vercel auto-deploy fired**

```
gh run list --limit 3
```

Or watch the Vercel dashboard for the new deployment on the production `kareemhady` / `limeinc.vercel.app` project.

- [ ] **Step 3: Belt-and-suspenders explicit deploy**

```
vercel --prod --yes
```

Note: from a worktree this hits a sandbox project — that's expected and harmless. The real prod deploy already shipped via the GitHub integration.

- [ ] **Step 4: Smoke-test production**

Visit https://app.limeinc.cc/beithady/gallery/BH-73/BH73-3BR-C-005 in a fresh browser session (or incognito to bypass cached service worker). Drop a small video and a >50 MB video. Verify the same flow that worked locally.

If anything is broken in production, the revert is a single commit:
```
git revert <commit-sha-range>
git push origin main
```

- [ ] **Step 5: Update SESSION_HANDOFF.md**

Append a new entry summarizing:
- What shipped (engine + gallery integration)
- Production smoke test result
- Any deferred follow-ups (other uploaders not yet wired)

Commit and push.

---

## Notes for the executor

- **All file paths use POSIX separators in the plan**, but the dev environment is Windows. The Bash tool runs Git Bash, so `npx ...` etc. work. Use PowerShell for PowerShell-specific syntax (the `Copy-Item` in Task 1).
- **Don't skip a TDD red step.** Several tasks require running the failing test before writing the implementation. The skill enforces this — it catches bad test design.
- **Don't add unrelated cleanup.** The gallery-provider has some patterns you might be tempted to refactor (e.g. the `(async () => { ... })()` IIFE inside `useEffect`). Don't. Keep the diff minimal.
- **The 50 MB constant lives in two places** by design: as the literal in `gallery-provider.tsx` (the trigger threshold) and as `DEFAULT_MAX_BYTES` in `video-compress.ts` (the encoder target). They're semantically distinct — the bucket-cap is owned by Supabase config, the encoder default is a sensible engine default. Don't try to unify them.
- **WASM files in `public/ffmpeg/`** count as ~30 MB checked into git. That's the cost of self-hosting; per the design spec it's the right tradeoff (no third-party CDN, service-worker cacheable, no CORS surprises).
- **If `vercel --prod --yes` from a worktree returns a `*-08d4ef.vercel.app` URL** with cron errors, that's the sandbox project — CLAUDE.md "Deploy" section covers this. Real prod went out via GitHub.
