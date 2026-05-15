// src/app/beithady/gallery/youtube/_components/ai-assist-button.tsx
'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export type AIGenerated = {
  title: string;
  description: string;
  tags: string[];
  language: string;
};

async function captureMidFrame(videoSource: File | string): Promise<string> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.src = typeof videoSource === 'string' ? videoSource : URL.createObjectURL(videoSource);

  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error('video_load_failed'));
  });

  video.currentTime = Math.min(video.duration / 2, video.duration - 0.1);
  await new Promise<void>((res, rej) => {
    video.onseeked = () => res();
    video.onerror = () => rej(new Error('seek_failed'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')!.drawImage(video, 0, 0);
  if (typeof videoSource !== 'string') URL.revokeObjectURL(video.src);
  return canvas.toDataURL('image/jpeg', 0.7);
}

export function AIAssistButton({
  videoSource,
  templateId,
  buildingCode,
  isShorts,
  userBrief,
  onGenerated,
  generateAction,
}: {
  videoSource: File | string | null;
  templateId: string;
  buildingCode: string | null;
  isShorts: boolean;
  userBrief: string;
  onGenerated: (m: AIGenerated) => void;
  generateAction: (input: {
    template_id: string;
    building_code: string | null;
    is_shorts: boolean;
    user_brief: string;
    midpoint_frame_dataurl: string;
  }) => Promise<AIGenerated | { error: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const disabled = !videoSource || !templateId || busy;

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={disabled}
        className="ix-btn-secondary text-xs disabled:opacity-50"
        onClick={async () => {
          if (!videoSource) return;
          setBusy(true);
          setError(null);
          try {
            const frame = await captureMidFrame(videoSource);
            const result = await generateAction({
              template_id: templateId,
              building_code: buildingCode,
              is_shorts: isShorts,
              user_brief: userBrief,
              midpoint_frame_dataurl: frame,
            });
            if ('error' in result) {
              setError(result.error);
            } else {
              onGenerated(result);
              setHasGenerated(true);
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={12} />
        {busy ? 'Generating…' : hasGenerated ? 'Regenerate metadata' : 'Generate metadata from video'}
      </button>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">AI assist failed: {error}. Fill manually below.</p>}
    </div>
  );
}
