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
