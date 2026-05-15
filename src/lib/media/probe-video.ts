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
