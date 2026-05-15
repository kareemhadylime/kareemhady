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
