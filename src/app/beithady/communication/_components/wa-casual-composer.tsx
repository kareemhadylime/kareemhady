'use client';
import { useState, useTransition } from 'react';
import { Send, Paperclip, AlertTriangle, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { sendWaCasualMessageAction, sendWaCasualVoiceAction } from '../actions';
import { VoiceRecorder } from './voice-recorder';
import { TemplatePicker } from './template-picker';
import { AttachmentMenu } from './attachment-menu';
import type { Template, TemplateContext } from '@/lib/beithady/communication/templates-shared';

const MAX_LEN = 4000;

export function WaCasualComposer({
  conversationId,
  killSwitchOn,
  initialError,
  initialSent,
  templates,
  templateContext,
  buildingCode,
}: {
  conversationId: string;
  killSwitchOn: boolean;
  initialError?: string;
  initialSent?: boolean;
  templates?: Template[];
  templateContext?: TemplateContext;
  buildingCode?: string | null;
}) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [unresolvedVars, setUnresolvedVars] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const blockSendForUnresolved = unresolvedVars.length > 0 && body.includes('{');
  const remaining = MAX_LEN - body.length;
  const tooLong = remaining < 0;
  const hasError = !!initialError;
  const showSent = initialSent && !hasError;

  async function onVoiceSend({ blob, mime, durationSec }: { blob: Blob; mime: string; durationSec: number }) {
    setVoiceSending(true);
    setVoiceError(null);
    try {
      const buf = await blob.arrayBuffer();
      const fd = new FormData();
      fd.append('conversation_id', conversationId);
      fd.append('mime', mime);
      fd.append('duration', String(durationSec));
      fd.append('audio', new Blob([buf], { type: mime }), `voice-${Date.now()}.${mime.includes('ogg') ? 'ogg' : 'webm'}`);
      startTransition(async () => {
        try {
          await sendWaCasualVoiceAction(fd);
        } catch (e) {
          setVoiceError(e instanceof Error ? e.message : 'send_failed');
        } finally {
          setVoiceSending(false);
        }
      });
    } catch (e) {
      setVoiceSending(false);
      setVoiceError(e instanceof Error ? e.message : 'voice_prep_failed');
    }
  }

  return (
    <div className="space-y-2">
      {hasError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800 p-3 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-rose-700 dark:text-rose-200">Send failed</div>
            <div className="text-rose-600 dark:text-rose-300 mt-0.5">{initialError}</div>
          </div>
        </div>
      )}
      {showSent && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-2 text-xs text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
          <Send size={12} /> Sent via WhatsApp.
        </div>
      )}
      {voiceError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
          Voice send failed: {voiceError}
        </div>
      )}
      {killSwitchOn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-200 flex items-center gap-2">
          <Sparkles size={12} /> AI auto-reply OFF for this conversation.
        </div>
      )}

      <form action={sendWaCasualMessageAction} onSubmit={() => setSubmitting(true)} className="space-y-2">
        <input type="hidden" name="conversation_id" value={conversationId} />
        <textarea
          name="body"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Reply on WhatsApp Casual…"
          rows={3}
          className="ix-input w-full resize-y"
          maxLength={MAX_LEN + 200}
        />
        {blockSendForUnresolved && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <div>
              Resolve template variables first: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">{unresolvedVars.map(v => `{${v}}`).join(' ')}</code>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <VoiceRecorder onSend={onVoiceSend} disabled={voiceSending} />
            {voiceSending && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Loader2 size={11} className="animate-spin" /> uploading voice…
              </span>
            )}
            <AttachmentMenu
              conversationId={conversationId}
              channel="wa_casual"
              buildingCode={buildingCode || null}
              caption={body}
            />
            {templates && templates.length > 0 && templateContext && (
              <TemplatePicker
                templates={templates}
                channel="wa_casual"
                source={null}
                context={templateContext}
                onInsert={(text, unresolved) => {
                  setBody(text);
                  setUnresolvedVars(unresolved);
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${tooLong ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
              {remaining.toLocaleString()} chars
            </span>
            <button
              type="submit"
              disabled={!body.trim() || tooLong || submitting || blockSendForUnresolved}
              className="ix-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function FileAttachButton({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setError('File exceeds 20MB');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('conversation_id', conversationId);
      fd.append('mime', f.type || 'application/octet-stream');
      fd.append('file_name', f.name);
      fd.append('file', f);
      await sendWaCasualVoiceAction(fd);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'upload_failed');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <label
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 ${disabled || busy ? 'opacity-50 cursor-not-allowed' : ''}`}
      title="Attach file"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
      <input type="file" className="hidden" onChange={onChange} disabled={disabled || busy} />
      {error && <span className="absolute text-[10px] text-rose-600">{error}</span>}
    </label>
  );
}
