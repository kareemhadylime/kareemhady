'use client';
import { useState } from 'react';
import { Send, ExternalLink, AlertTriangle, Sparkles, AtSign, MessageCircle, Phone, AlertCircle, Home, BookOpen } from 'lucide-react';
import { sendGuestyMessageAction } from '../actions';
import { TemplatePicker } from './template-picker';
import { AttachmentMenu } from './attachment-menu';
import type { Template, TemplateContext } from '@/lib/beithady/communication/templates-shared';

// Reply composer for Guesty conversations. Submits via the server
// action which calls Guesty POST and falls back to a deep-link if the
// tier doesn't permit POST.
//
// Module routing (2026-04-30 fix): for source-native channels (Airbnb,
// Booking) the default module is the source itself ('airbnb2',
// 'bookingCom') so messages land in the platform's in-app inbox rather
// than getting force-routed through WhatsApp. Override chips offer
// WhatsApp / Email / SMS as alternative sub-channels.

type ChannelHint = 'whatsapp' | 'email' | 'sms' | 'airbnb2' | 'bookingCom';

const MAX_LEN = 4000;

function deriveDefaultModule(src: string): ChannelHint {
  const s = src.toLowerCase();
  if (s.includes('airbnb')) return 'airbnb2';
  if (s.includes('booking')) return 'bookingCom';
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('email')) return 'email';
  if (s.includes('sms')) return 'sms';
  // Direct / manual / unknown → WhatsApp is still the safest default
  // (covers most direct-booking flows where the guest provided a phone).
  return 'whatsapp';
}

export function GuestyComposer({
  conversationId,
  guestyExternalId,
  defaultModule,
  killSwitchOn,
  initialError,
  initialStatus,
  initialFallbackUrl,
  initialSent,
  channelSource,
  templates,
  templateContext,
  buildingCode,
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
   *  Drives the default module + which override chips render. */
  channelSource?: string | null;
  templates?: Template[];
  templateContext?: TemplateContext;
  buildingCode?: string | null;
}) {
  const src = (channelSource || '').toLowerCase();
  const sourceDefault = deriveDefaultModule(src);
  const isAirbnbThread = src.includes('airbnb');
  const isBookingThread = src.includes('booking');
  // SMS module hint is irrelevant on Airbnb / Booking / WhatsApp threads —
  // those don't have an SMS sub-channel inside Guesty.
  const showSmsChip = !isAirbnbThread && !isBookingThread;
  const [body, setBody] = useState('');
  const [moduleHint, setModuleHint] = useState<ChannelHint>(defaultModule || sourceDefault);
  const [submitting, setSubmitting] = useState(false);
  const [unresolvedVars, setUnresolvedVars] = useState<string[]>([]);

  const remaining = MAX_LEN - body.length;
  const tooLong = remaining < 0;
  const hasError = !!initialError;
  const showSent = initialSent && !hasError;
  const blockSendForUnresolved = unresolvedVars.length > 0 && body.includes('{');

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

      <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
        <span className="font-semibold uppercase tracking-wide">Channel hint</span>
        {isAirbnbThread && (
          <ChannelChip
            icon={Home}
            label="Airbnb in-app"
            value="airbnb2"
            current={moduleHint}
            onChange={setModuleHint}
          />
        )}
        {isBookingThread && (
          <ChannelChip
            icon={BookOpen}
            label="Booking.com"
            value="bookingCom"
            current={moduleHint}
            onChange={setModuleHint}
          />
        )}
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

      {blockSendForUnresolved && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <div>
            Resolve template variables first: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">{unresolvedVars.map(v => `{${v}}`).join(' ')}</code>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <AttachmentMenu
            conversationId={conversationId}
            channel="guesty"
            buildingCode={buildingCode || null}
            caption={body}
            module={moduleHint}
          />
          {templates && templates.length > 0 && templateContext && (
            <TemplatePicker
              templates={templates}
              channel="guesty"
              source={channelSource || null}
              context={templateContext}
              onInsert={(text, unresolved) => {
                setBody(text);
                setUnresolvedVars(unresolved);
              }}
            />
          )}
        </div>
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
          disabled={!body.trim() || tooLong || submitting || blockSendForUnresolved}
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
