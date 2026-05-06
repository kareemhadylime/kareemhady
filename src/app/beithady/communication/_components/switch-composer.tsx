'use client';
import { useState } from 'react';
import { Sparkles, Check, Ban, ExternalLink, AlertCircle, Send } from 'lucide-react';
import { sendMessageWithSwitchAction } from '../actions';
import { ContactValidatorPill } from './channel-switcher';
import type { ChannelTarget } from '@/lib/beithady/communication/channel-switch';

// Phase C.5 — cross-channel composer.
// Used by thread-pane when effectiveChannel diverges from the
// conversation home channel (e.g., Airbnb thread switched to WA Casual).
// Posts to sendMessageWithSwitchAction with target_channel + body +
// optional backup_target + remember.

const MAX_LEN = 5000;

const TARGET_LABEL: Record<ChannelTarget, string> = {
  wa_casual:        'WA Casual',
  wa_cloud:         'WABA',
  guesty_email:     'Email',
  guesty_sms:       'SMS',
  guesty_whatsapp:  'Guesty WhatsApp',
  email_standalone: 'Email',
  sms_standalone:   'SMS',
};

export function SwitchComposer({
  conversationId,
  effectiveChannel,
  returnPath,
  initialError,
  initialStatus,
  initialFallbackUrl,
  initialSent,
  killSwitchOn,
  guestPhone,
  guestEmail,
  wabaBlocked,
  hasAttachmentSupport,
}: {
  conversationId: string;
  effectiveChannel: ChannelTarget;
  returnPath: string;
  initialError?: string;
  initialStatus?: string;
  initialFallbackUrl?: string;
  initialSent?: boolean;
  killSwitchOn: boolean;
  guestPhone: string | null;
  guestEmail: string | null;
  wabaBlocked: boolean;
  hasAttachmentSupport: boolean;
}) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const remaining = MAX_LEN - body.length;
  const tooLong = remaining < 0;
  const hasError = !!initialError;
  const showSent = initialSent && !hasError;
  const sendDisabled = wabaBlocked || tooLong || !body.trim() || submitting;

  // Improvement #10 default backup target: Email backs up phone-based,
  // WA Casual backs up email-based.
  const defaultBackup: ChannelTarget =
    effectiveChannel === 'guesty_email' || effectiveChannel === 'email_standalone'
      ? 'wa_casual'
      : 'guesty_email';

  // Improvement #4 — template-aware warning. SMS (text-only) drops
  // attachments + media. We don't see attachments here yet (the
  // template picker isn't wired into the cross-channel composer),
  // but warn when channel doesn't support them and body looks like
  // a placeholder-substituted template.
  //
  // Audit fix H-A14: previously matched on plain `{` / `}}` / `[[`
  // characters anywhere in the body — false-positive on guests asking
  // about JSON syntax, code snippets, schedule notations like
  // "{building}", etc. Tightened to require BOTH an opening AND a
  // closing token of the same kind, implying a real placeholder pair.
  const hasCurly = /\{[a-z_][\w.-]*\}/i.test(body);
  const hasMustache = /\{\{[\s\S]+?\}\}/.test(body);
  const hasSquare = /\[\[[\s\S]+?\]\]/.test(body);
  const templateLike = hasCurly || hasMustache || hasSquare;
  const showAttachmentDropWarning = templateLike && !hasAttachmentSupport;

  return (
    <form
      action={sendMessageWithSwitchAction}
      onSubmit={() => setSubmitting(true)}
      className="space-y-2"
    >
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="target_channel" value={effectiveChannel} />
      <input type="hidden" name="return_path" value={returnPath} />

      {hasError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800 p-3 text-xs flex items-start gap-2">
          <Ban size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-rose-700 dark:text-rose-200">
              Send failed via switched channel
              {initialStatus ? ` · status ${initialStatus}` : ''}
            </div>
            <div className="text-rose-600 dark:text-rose-300 mt-0.5">{initialError}</div>
            {initialFallbackUrl && (
              <a
                href={initialFallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ix-btn-secondary text-xs mt-2 inline-flex"
              >
                <ExternalLink size={12} /> Fallback link
              </a>
            )}
          </div>
        </div>
      )}

      {showSent && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-2 text-xs text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
          <Check size={12} /> Sent successfully via {TARGET_LABEL[effectiveChannel]}.
        </div>
      )}

      {killSwitchOn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-200 flex items-center gap-2">
          <Sparkles size={12} /> AI auto-reply OFF for this conversation. Manual reply only.
        </div>
      )}

      {showAttachmentDropWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-[11px] text-amber-700 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Heads-up:</span> {TARGET_LABEL[effectiveChannel]} does not support attachments —
            any media referenced in this template will not be delivered.
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-300">
        <span className="uppercase tracking-wide font-semibold">Validating:</span>
        <ContactValidatorPill contact={guestPhone} field="phone" />
        <ContactValidatorPill contact={guestEmail} field="email" />
      </div>

      <textarea
        name="body"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={`Type your reply (sending via ${TARGET_LABEL[effectiveChannel]})…`}
        rows={4}
        className="ix-input w-full resize-y"
        maxLength={MAX_LEN + 200}
        required
      />

      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <label
          className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer"
          title="Persists this channel as the conversation default for future replies."
        >
          <input type="checkbox" name="remember" />
          Remember for this conversation
        </label>
        <label
          className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer"
          title="Multi-channel send: adds a second outbound row via the listed channel as a redundancy backup. Improvement #10."
        >
          <input type="checkbox" name="backup_target" value={defaultBackup} />
          + Send {TARGET_LABEL[defaultBackup]} backup
        </label>
        <span className={tooLong ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
          {remaining.toLocaleString()} chars left
        </span>
        <button
          type="submit"
          disabled={sendDisabled}
          className="ix-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={13} />
          {submitting ? 'Sending…' : `Send via ${TARGET_LABEL[effectiveChannel]}`}
        </button>
      </div>
    </form>
  );
}
