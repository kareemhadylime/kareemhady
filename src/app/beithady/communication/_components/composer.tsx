'use client';
import { useState } from 'react';
import { Send, ExternalLink, AlertTriangle, Sparkles, AtSign, MessageCircle, Phone } from 'lucide-react';
import { sendGuestyMessageAction } from '../actions';

// Reply composer for Guesty conversations. Text-only for Phase C.2;
// attachments + voice land in C.3. Submits via the server action which
// calls Guesty POST and falls back to a deep-link if the tier doesn't
// permit POST.

type ChannelHint = 'whatsapp' | 'email' | 'sms';

const MAX_LEN = 4000;

export function GuestyComposer({
  conversationId,
  guestyExternalId,
  defaultModule = 'whatsapp',
  killSwitchOn,
  initialError,
  initialStatus,
  initialFallbackUrl,
  initialSent,
  channelSource,
}: {
  conversationId: string;
  guestyExternalId: string;
  defaultModule?: ChannelHint;
  killSwitchOn: boolean;
  initialError?: string;
  initialStatus?: string;
  initialFallbackUrl?: string;
  initialSent?: boolean;
  /** Source of the underlying conversation (airbnb / booking.com / etc.).
   *  Used to gate which module-hint chips are shown — e.g. Airbnb / Booking
   *  conversations have no SMS module so we hide that chip. */
  channelSource?: string | null;
}) {
  const src = (channelSource || '').toLowerCase();
  // SMS module hint is irrelevant on Airbnb / Booking / WhatsApp threads —
  // those don't have an SMS sub-channel inside Guesty.
  const showSmsChip = !src.includes('airbnb') && !src.includes('booking');
  const [body, setBody] = useState('');
  const [moduleHint, setModuleHint] = useState<ChannelHint>(defaultModule);
  const [submitting, setSubmitting] = useState(false);

  const remaining = MAX_LEN - body.length;
  const tooLong = remaining < 0;
  const hasError = !!initialError;
  const showSent = initialSent && !hasError;

  return (
    <form
      action={sendGuestyMessageAction}
      className="space-y-2"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="conversation_id" value={conversationId} />

      {hasError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800 p-3 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-rose-700 dark:text-rose-200">
              Send failed{initialStatus ? ` · status ${initialStatus}` : ''}
            </div>
            <div className="text-rose-600 dark:text-rose-300 mt-0.5">{initialError}</div>
            {initialFallbackUrl && (
              <a
                href={initialFallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ix-btn-secondary text-xs mt-2 inline-flex"
              >
                <ExternalLink size={12} /> Reply in Guesty (fallback)
              </a>
            )}
          </div>
        </div>
      )}

      {showSent && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 p-2 text-xs text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
          <Send size={12} /> Sent successfully via Guesty.
        </div>
      )}

      {killSwitchOn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-200 flex items-center gap-2">
          <Sparkles size={12} /> AI auto-reply is OFF for this conversation. Manual reply only.
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wide">Channel hint</span>
        <ChannelChip
          icon={MessageCircle}
          label="WhatsApp"
          value="whatsapp"
          current={moduleHint}
          onChange={setModuleHint}
        />
        <ChannelChip
          icon={AtSign}
          label="Email"
          value="email"
          current={moduleHint}
          onChange={setModuleHint}
        />
        {showSmsChip && (
          <ChannelChip
            icon={Phone}
            label="SMS"
            value="sms"
            current={moduleHint}
            onChange={setModuleHint}
          />
        )}
        <input type="hidden" name="module" value={moduleHint} />
      </div>

      <textarea
        name="body"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Type your reply…"
        rows={4}
        className="ix-input w-full resize-y"
        maxLength={MAX_LEN + 200}
        required
      />

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs flex items-center gap-3">
          <span className={tooLong ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
            {remaining.toLocaleString()} chars left
          </span>
          <a
            href={`https://app.guesty.com/inbox/${guestyExternalId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink size={11} /> Open in Guesty
          </a>
        </div>
        <button
          type="submit"
          disabled={!body.trim() || tooLong || submitting}
          className="ix-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={14} />
          {submitting ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

function ChannelChip({
  icon: Icon,
  label,
  value,
  current,
  onChange,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: ChannelHint;
  current: ChannelHint;
  onChange: (v: ChannelHint) => void;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
        selected
          ? 'bg-slate-700 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}
