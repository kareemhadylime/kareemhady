'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';

// In-browser voice recorder using MediaRecorder. Encodes to webm/ogg
// (whichever the browser supports best); the server uploads to
// Supabase Storage and forwards the public URL to Green-API which
// renders it as a voice note in WhatsApp.
//
// Client component — no SSR. Calls the parent's onSend callback with
// the captured blob + mime + duration when the user hits Send.

export type VoiceRecorderProps = {
  disabled?: boolean;
  onSend: (input: { blob: Blob; mime: string; durationSec: number }) => void | Promise<void>;
};

function pickMimeType(): { mime: string; ext: string } {
  const candidates = [
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/mp4', ext: 'm4a' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
      return c;
    }
  }
  return { mime: 'audio/webm', ext: 'webm' };
}

export function VoiceRecorder({ disabled, onSend }: VoiceRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'sending'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { mime } = pickMimeType();

  useEffect(() => {
    return () => {
      if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    if (state !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mime });
        setBlob(finalBlob);
        const url = URL.createObjectURL(finalBlob);
        setPreviewUrl(url);
        setState('preview');
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };
      rec.start(250);
      mediaRef.current = rec;
      startedAtRef.current = Date.now();
      setDuration(0);
      tickRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      setState('recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mic_access_failed');
    }
  }

  function stop() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setDuration(0);
    setState('idle');
  }

  async function send() {
    if (!blob) return;
    setState('sending');
    // Audit fix H-E6: pre-fix immediately called discard() after onSend,
    // wiping the audio preview before parent confirmed delivery. If the
    // parent's send failed, the operator had nothing to retry — they
    // had to re-record from scratch. Now we keep the preview alive
    // and let the parent's success/error path drive the unmount via
    // the new key={header.id} fix in PR1 (parent remounts on conv
    // switch / on `?sent=1`). Operator can still click Discard
    // manually if they want to scrap the recording.
    try {
      await onSend({ blob, mime, durationSec: duration });
    } catch {
      // Parent should surface the error; we revert state so the
      // operator can hit Send again or Discard.
      setState('preview');
      return;
    }
    // Successful send — clear local preview.
    discard();
  }

  if (state === 'idle') {
    // Audit fix H-E5: render error in idle state too. Pre-fix the
    // mic-permission-denied error string lived only in the
    // recording/preview branches, so the operator who denied
    // permission saw a non-functional mic button with no explanation.
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          title="Record voice note"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
        >
          <Mic size={16} />
        </button>
        {error && (
          <span className="text-[11px] text-rose-600 dark:text-rose-300 max-w-[200px] truncate" title={error}>
            Mic: {error}
          </span>
        )}
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-200 text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        Recording · {fmtDuration(duration)}
        <button
          type="button"
          onClick={stop}
          className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-600 text-white hover:bg-rose-700"
          title="Stop"
        >
          <Square size={10} fill="currentColor" />
        </button>
      </div>
    );
  }

  // preview / sending
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm">
      {previewUrl && <audio src={previewUrl} controls className="h-8 max-w-[200px]" />}
      <span className="text-xs text-slate-500">{fmtDuration(duration)}</span>
      <button
        type="button"
        onClick={discard}
        disabled={state === 'sending'}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 hover:bg-rose-100 dark:bg-slate-700 dark:hover:bg-rose-900 text-slate-700 dark:text-slate-200"
        title="Discard"
      >
        <Trash2 size={11} />
      </button>
      <button
        type="button"
        onClick={send}
        disabled={state === 'sending'}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        title="Send voice note"
      >
        {state === 'sending' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
