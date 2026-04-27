import Link from 'next/link';
import { Bot, Mail, MessageCircle, Smartphone, ExternalLink, Phone, AtSign, Building2, BedDouble, Sparkles, CalendarPlus } from 'lucide-react';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import type { ThreadBundle } from '@/lib/beithady/communication/inbox';
import { SlaPill } from './sla-pill';
import { GuestyComposer } from './composer';
import { WaCasualComposer } from './wa-casual-composer';
import { SuggestionStrip, type Suggestion } from './suggestion-strip';

export type ThreadComposerHints = {
  send_error?: string;
  send_status?: string;
  fallback_url?: string;
  sent?: boolean;
};

export function ThreadPane({
  bundle,
  composerHints,
  pendingSuggestion,
}: {
  bundle: ThreadBundle | null;
  composerHints?: ThreadComposerHints;
  pendingSuggestion?: Suggestion | null;
}) {
  if (!bundle) {
    return (
      <div className="ix-card p-12 text-center text-sm text-slate-500 h-full flex items-center justify-center">
        <div>
          <MessageCircle size={28} className="mx-auto text-slate-300 mb-3" />
          Select a conversation to read the thread.
        </div>
      </div>
    );
  }
  const { header, messages } = bundle;
  return (
    <div className="ix-card flex flex-col h-full overflow-hidden">
      <ThreadHeader bundle={bundle} />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50 dark:bg-slate-900">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-12">
            No messages yet on this conversation.
          </div>
        ) : (
          messages.map(m => <Bubble key={m.id} m={m} />)
        )}
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-white dark:bg-slate-900">
        {pendingSuggestion && (
          <SuggestionStrip
            conversationId={header.id}
            suggestion={pendingSuggestion}
            channel={header.channel}
          />
        )}
        {header.channel === 'guesty' ? (
          <GuestyComposer
            conversationId={header.id}
            guestyExternalId={header.external_id}
            defaultModule={header.source && /airbnb|booking/.test(header.source) ? 'whatsapp' : 'whatsapp'}
            killSwitchOn={!!header.ai_kill_switch}
            initialError={composerHints?.send_error}
            initialStatus={composerHints?.send_status}
            initialFallbackUrl={composerHints?.fallback_url}
            initialSent={composerHints?.sent}
          />
        ) : header.channel === 'wa_casual' ? (
          <WaCasualComposer
            conversationId={header.id}
            killSwitchOn={!!header.ai_kill_switch}
            initialError={composerHints?.send_error}
            initialSent={composerHints?.sent}
          />
        ) : (
          <ComposerStub channel={header.channel} guestyExternalId={header.external_id} />
        )}
      </div>
    </div>
  );
}

function ThreadHeader({ bundle }: { bundle: ThreadBundle }) {
  const h = bundle.header;
  // Direct-booking deep-link per Plan v0.3 Q14 — opens Guesty's
  // reservation create modal pre-filtered to this listing. Guesty
  // doesn't expose a deterministic create URL, but the inbox URL puts
  // the agent one click away from the "New reservation" panel.
  const guestyInboxLink = h.channel === 'guesty'
    ? `https://app.guesty.com/inbox/${h.external_id}`
    : null;
  const directBookingLink = guestyInboxLink ? `${guestyInboxLink}?action=createReservation` : null;
  return (
    <div className="border-b border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold truncate">{h.guest_full_name || h.guest_email || h.guest_phone || 'Unknown guest'}</h2>
            <SlaPill bucket={h.sla_bucket} ageSeconds={h.sla_age_seconds} />
            {h.source && (
              <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {h.source.replace('2', '')}
              </span>
            )}
            {h.guest_id && (
              <Link
                href={`/emails/beithady/crm/${h.guest_id}`}
                className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 inline-flex items-center gap-1 hover:underline"
              >
                CRM 360° <ExternalLink size={10} />
              </Link>
            )}
            {h.ai_kill_switch && (
              <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200">
                AI off
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
            {h.guest_email && (
              <span className="inline-flex items-center gap-1"><AtSign size={11} /> {h.guest_email}</span>
            )}
            {h.guest_phone && (
              <span className="inline-flex items-center gap-1"><Phone size={11} /> {h.guest_phone}</span>
            )}
            {h.building_code && (
              <span className="inline-flex items-center gap-1"><Building2 size={11} /> {h.building_code}</span>
            )}
            {h.listing_nickname && (
              <span className="inline-flex items-center gap-1"><BedDouble size={11} /> {h.listing_nickname}</span>
            )}
          </div>
        </div>
        {directBookingLink && (
          <a
            href={directBookingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ix-btn-secondary text-xs whitespace-nowrap"
            title="Open Guesty reservation create — direct booking, no API write"
          >
            <CalendarPlus size={13} /> Create booking
          </a>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ThreadBundle['messages'][number] }) {
  const inbound = m.direction === 'inbound';
  const tone = inbound
    ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    : 'bg-slate-700 text-white border-slate-700';
  const channel = m.channel;
  const ChIcon = channel === 'guesty' ? Mail : channel === 'wa_cloud' ? Bot : Smartphone;

  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] rounded-2xl border px-4 py-2 shadow-sm ${tone}`}>
        <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wide font-semibold mb-1 ${inbound ? 'text-slate-500' : 'text-slate-300'}`}>
          <ChIcon size={11} />
          {(m.module_type || channel).toUpperCase()}
          {m.from_full_name && <span className="opacity-70">· {m.from_full_name}</span>}
          {m.is_automatic && (
            <span className={`inline-flex items-center gap-1 ${inbound ? 'text-violet-600' : 'text-violet-200'}`}>
              <Sparkles size={10} /> auto
            </span>
          )}
          {m.template_name && (
            <span className="opacity-70">· tpl:{m.template_name}</span>
          )}
        </div>
        {m.module_subject && (
          <div className={`text-xs font-semibold mb-1 ${inbound ? 'text-slate-600' : 'text-slate-200'}`}>
            {m.module_subject}
          </div>
        )}
        <Attachments attachments={m.attachments} inbound={inbound} />
        <div className="whitespace-pre-wrap text-sm">{m.body || <em className="opacity-60">(empty)</em>}</div>
        <div className={`text-[10px] mt-1 ${inbound ? 'text-slate-400' : 'text-slate-300'}`}>
          {fmtCairoDateTime(m.sent_at || m.created_at)}
        </div>
      </div>
    </div>
  );
}

function Attachments({ attachments, inbound }: { attachments: unknown; inbound: boolean }) {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) return null;
  return (
    <div className="space-y-2 mb-2">
      {(attachments as Array<Record<string, unknown>>).map((a, i) => {
        const url = typeof a.downloadUrl === 'string' ? a.downloadUrl : null;
        const type = typeof a.type === 'string' ? a.type : 'file';
        const name = typeof a.fileName === 'string' ? a.fileName : '';
        const mime = typeof a.mimeType === 'string' ? a.mimeType : '';
        if (!url) return null;
        if (type === 'voice' || type === 'audio' || mime.startsWith('audio/')) {
          return <audio key={i} src={url} controls className="max-w-full" />;
        }
        if (type === 'image' || mime.startsWith('image/')) {
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={url} alt={name || 'image'} className="rounded-lg max-w-[240px] max-h-[240px] object-cover" />;
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-xs underline ${inbound ? 'text-slate-700' : 'text-white'}`}
          >
            📎 {name || 'attachment'}
          </a>
        );
      })}
    </div>
  );
}

function ComposerStub({ channel, guestyExternalId }: { channel: string; guestyExternalId: string }) {
  const guestyDeepLink = channel === 'guesty'
    ? `https://app.guesty.com/inbox/${guestyExternalId}`
    : null;

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <Sparkles size={12} className="text-yellow-600" />
        Reply composer ships in Phase C.2 (Guesty POST endpoint probe + Green-API media + WABA template send + AI auto-reply integration).
      </div>
      {guestyDeepLink && (
        <a
          href={guestyDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="ix-btn-secondary inline-flex"
        >
          <ExternalLink size={14} /> Reply in Guesty
        </a>
      )}
    </div>
  );
}
