import Link from 'next/link';
import { Bot, Mail, MessageCircle, Smartphone, ExternalLink, Phone, AtSign, Building2, BedDouble, Sparkles, CalendarPlus, Type, Mic, Paperclip, Check, Ban, Image as ImageIcon, FileQuestion } from 'lucide-react';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import type { ThreadBundle } from '@/lib/beithady/communication/inbox';
import {
  getAvailableChannels,
  homeChannelToDefaultTarget,
  hoursSinceLastInbound,
  type ChannelTarget,
  type ChannelAvailability,
} from '@/lib/beithady/communication/channel-switch';
import { SlaPill } from './sla-pill';
import { GuestyComposer } from './composer';
import { WaCasualComposer } from './wa-casual-composer';
import { ChannelSwitcher } from './channel-switcher';
import { SwitchComposer } from './switch-composer';
import { SuggestionStrip, type Suggestion } from './suggestion-strip';
import { ReservationStatusChip } from './reservation-status-chip';
import { ReservationMiniTimeline } from './reservation-mini-timeline';
import { GuestHistoryBadge } from './guest-history-badge';
import { NoReservationFallback } from './no-reservation-fallback';
import { ArchivedBanner } from './archived-banner';
import { AutoScrollThread } from './auto-scroll-thread';
import { InternalNotesPanel } from './internal-notes-panel';
import { ResolveButton } from './resolve-button';
import { MediaPlaceholder } from './media-placeholder';
import type { Template, TemplateContext } from '@/lib/beithady/communication/templates-shared';

export type ThreadComposerHints = {
  send_error?: string;
  send_status?: string;
  fallback_url?: string;
  sent?: boolean;
  // Phase C.5 — channel switcher round-trip
  switch_revert?: string;
  switch_hint?: string;
  selected_target?: ChannelTarget;
  return_path?: string;
};

export async function ThreadPane({
  bundle,
  composerHints,
  pendingSuggestion,
  templates,
  templateContext,
}: {
  bundle: ThreadBundle | null;
  composerHints?: ThreadComposerHints;
  pendingSuggestion?: Suggestion | null;
  templates?: Template[];
  templateContext?: TemplateContext;
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
  // R.4 — first message after our last reply is the agent's "next to read"
  // visual anchor. If there's no outbound at all, the first inbound is it.
  const lastOutboundAt = header.last_outbound_at;
  const firstUnreadId = (() => {
    for (const m of messages) {
      if (m.direction !== 'inbound') continue;
      const ts = m.sent_at || m.created_at;
      if (!lastOutboundAt || (ts && ts > lastOutboundAt)) return m.id;
    }
    return null;
  })();
  const returnTo = `/beithady/communication/unified?c=${header.id}`;

  // Phase C.5 — Channel switcher state
  // Smart default precedence (improvement #3):
  //   1. URL ?ch override (selected_target prop set by parent page from searchParams)
  //   2. Persisted preferred_outbound_channel (Q3 "Remember")
  //   3. Home channel + source heuristic
  const switchCtx = {
    conversationId: header.id,
    homeChannel: header.channel,
    externalId: header.external_id,
    source: header.source,
    guestId: header.guest_id,
    guestPhone: header.guest_phone,
    guestEmail: header.guest_email,
  };
  const availability = await getAvailableChannels(switchCtx);
  const persistedTarget = (header.preferred_outbound_channel || null) as ChannelTarget | null;
  const homeDefault = homeChannelToDefaultTarget(header.channel, header.source);
  const requestedTarget = composerHints?.selected_target || null;
  const effectiveChannel: ChannelTarget = requestedTarget || persistedTarget || homeDefault;
  // Last-inbound-at across any transport for the WABA 24h-window banner.
  const lastInboundIso = header.last_inbound_at || null;
  const hoursSinceInbound = hoursSinceLastInbound(lastInboundIso);
  const wabaOutsideWindow = effectiveChannel === 'wa_cloud' && (hoursSinceInbound === null || hoursSinceInbound > 24);
  const returnPath = composerHints?.return_path || '/beithady/communication/unified';

  return (
    <div className="ix-card flex flex-col h-full overflow-hidden">
      <ThreadHeader bundle={bundle} />

      <InternalNotesPanel
        conversationId={header.id}
        notes={bundle.notes}
        returnTo={returnTo}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50 dark:bg-slate-900">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-12">
            No messages yet on this conversation.
          </div>
        ) : (
          <>
            {messages.map(m => (
              <Bubble
                key={m.id}
                m={m}
                guestyExternalId={header.channel === 'guesty' ? header.external_id : null}
                guestPhone={header.guest_phone}
                guestName={header.guest_full_name}
                guestEmail={header.guest_email}
              />
            ))}
            <div data-thread-tail={header.id} aria-hidden />
          </>
        )}
        <AutoScrollThread conversationId={header.id} firstUnreadId={firstUnreadId} />
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-white dark:bg-slate-900">
        {/* R.2 — when archived, replace composer with restore banner. */}
        {header.archived_at ? (
          <ArchivedBanner header={header} returnTo={archiveReturnTo(header.id)} />
        ) : (
          <>
            {pendingSuggestion && (
              <SuggestionStrip
                conversationId={header.id}
                suggestion={pendingSuggestion}
                channel={header.channel}
              />
            )}

            {/* Phase C.5 — Channel switcher bar (replaces the legacy static
                ChannelCapabilityHint). */}
            <ChannelSwitcher
              conversationId={header.id}
              guestId={header.guest_id}
              guestPhone={header.guest_phone}
              guestEmail={header.guest_email}
              homeChannel={header.channel}
              effectiveChannel={effectiveChannel}
              availability={availability}
              preferredChannel={persistedTarget}
              preferredSetAt={header.preferred_outbound_set_at}
              basePath={returnPath}
              searchParams={{
                c: header.id,
                switch_revert: composerHints?.switch_revert,
                switch_hint: composerHints?.switch_hint,
              }}
            />

            {wabaOutsideWindow && (
              <WabaOutsideWindowBanner hoursSince={hoursSinceInbound} />
            )}

            <EffectiveChannelComposer
              effectiveChannel={effectiveChannel}
              homeChannel={header.channel}
              header={header}
              composerHints={composerHints}
              templates={templates}
              templateContext={templateContext}
              returnPath={returnPath}
              persistedTarget={persistedTarget}
              availability={availability}
              wabaBlocked={wabaOutsideWindow}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Build a return-to URL for archive-banner restore actions. Restoring
// from inside a month-detail view should kick the user back to the
// active inbox so the restored conversation lands where they expect.
function archiveReturnTo(_conversationId: string): string {
  return '/beithady/communication/unified';
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
                href={`/beithady/crm/${h.guest_id}`}
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
          {/* Q.1 — Reservation status chip + guest history.
              When a reservation is linked → status chip + mini-timeline
              When no reservation linked → fallback chip to search Guesty */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {h.reservation_id ? (
              <ReservationStatusChip reservation={bundle.reservation} hasReservationId={true} />
            ) : (
              <NoReservationFallback header={h} />
            )}
            <GuestHistoryBadge stats={bundle.guestStats} />
          </div>
          <div className="mt-1.5">
            <ReservationMiniTimeline reservation={bundle.reservation} />
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
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
        <div className="flex flex-col gap-2 items-end shrink-0">
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
          {/* Q.4 #5 — Resolve / Re-open button */}
          {!h.archived_at && (
            <ResolveButton
              conversationId={h.id}
              resolvedAt={h.resolved_at}
              resolvedReason={h.resolved_reason}
              returnTo={`/beithady/communication/unified?c=${h.id}`}
              inHouseWarning={false}
            />
          )}
        </div>
      </div>
      {h.resolved_at && (
        <div className="text-[10px] text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
          <span className="font-semibold uppercase">Resolved</span>
          <span>· {h.resolved_reason || 'resolved'}</span>
          <span>· {fmtCairoDateTime(h.resolved_at)}</span>
        </div>
      )}
    </div>
  );
}

// Channels that send Airbnb/Booking-native structured cards or guest
// photo uploads where Guesty's webhook delivers `body: ""`. We render a
// clickable placeholder that probes Guesty's API on click. Tightened to
// airbnb/booking only — empty WhatsApp/SMS/Email messages are typically
// delivery receipts, not media-bearing.
const MEDIA_LIKELY_MODULES = new Set([
  'airbnb', 'airbnb2', 'bookingCom', 'booking.com', 'booking',
]);

function bodyIsEffectivelyEmpty(body: string | null | undefined): boolean {
  if (!body) return true;
  return body.replace(/\s+/g, '').length === 0;
}

function hasNoLocalAttachments(attachments: unknown): boolean {
  if (!attachments) return true;
  if (!Array.isArray(attachments)) return true;
  return attachments.length === 0;
}

function Bubble({
  m,
  guestyExternalId,
}: {
  m: ThreadBundle['messages'][number];
  guestyExternalId: string | null;
  // Kept on the prop signature (legacy) — no longer used since the
  // placeholder fetches via Guesty Open API instead of deep-linking.
  guestPhone?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
}) {
  const inbound = m.direction === 'inbound';
  // 3 visual lanes: inbound (guest, white-on-left), manual outbound
  // (BH staff typed, dark slate), auto outbound (Guesty template /
  // automation, cyan-tinted with dashed border so it's visually
  // distinct from real human replies).
  const isAutoOutbound = !inbound && m.is_automatic;
  const tone = inbound
    ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    : isAutoOutbound
      ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-950 dark:text-cyan-100 border-cyan-300 dark:border-cyan-700 border-dashed'
      : 'bg-slate-700 text-white border-slate-700';
  const channel = m.channel;
  const ChIcon = channel === 'guesty' ? Mail : channel === 'wa_cloud' ? Bot : Smartphone;

  // Phase Q.4 follow-up — placeholder for media/rich-card messages whose
  // body Guesty doesn't deliver via webhook.
  //
  // V1 used /inbox/<conversation_id> deep-link → Guesty 403'd
  // V2 used /inbox?search=<phone> → Guesty also 403'd for restricted roles
  // V3 (this) — fetches the original post + attachments from Guesty Open
  // API server-side via our service-account token. Bypasses the user's
  // Guesty UI permissions entirely. Renders the actual image inline.
  const moduleKey = (m.module_type || '').toLowerCase();
  const looksLikeMedia =
    bodyIsEffectivelyEmpty(m.body) &&
    hasNoLocalAttachments(m.attachments) &&
    MEDIA_LIKELY_MODULES.has(moduleKey);

  return (
    <div data-thread-msg-id={m.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] rounded-2xl border px-4 py-2 shadow-sm ${tone}`}>
        <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wide font-semibold mb-1 ${
          inbound ? 'text-slate-500'
            : isAutoOutbound ? 'text-cyan-700 dark:text-cyan-300'
            : 'text-slate-300'
        }`}>
          <ChIcon size={11} />
          {(m.module_type || channel).toUpperCase()}
          {/* Sender label: prefer the explicit name, fall back to a
              friendly identifier for Guesty system messages so the row
              doesn't appear orphaned (Guesty auto-emails like "NEW
              BOOKING from …" arrive with from_full_name=null). */}
          {m.from_full_name
            ? <span className="opacity-70">· {m.from_full_name}</span>
            : (channel === 'guesty' && m.is_automatic)
              ? <span className="opacity-70">· Guesty (system)</span>
              : null}
          {m.is_automatic && (
            isAutoOutbound
              ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cyan-200/80 dark:bg-cyan-800/80 text-cyan-900 dark:text-cyan-100 text-[9px] font-bold tracking-wider">
                  <Sparkles size={9} /> AUTO
                </span>
              : <span className={`inline-flex items-center gap-1 ${inbound ? 'text-violet-600' : 'text-violet-200'}`}>
                  <Sparkles size={10} /> auto
                </span>
          )}
          {!m.is_automatic && !inbound && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-600 dark:bg-slate-500 text-white text-[9px] font-bold tracking-wider">
              MANUAL
            </span>
          )}
          {m.template_name && (
            <span className="opacity-70">· tpl:{m.template_name}</span>
          )}
        </div>
        {m.module_subject && (
          <div className={`text-xs font-semibold mb-1 ${
            inbound ? 'text-slate-600'
              : isAutoOutbound ? 'text-cyan-800 dark:text-cyan-200'
              : 'text-slate-200'
          }`}>
            {m.module_subject}
          </div>
        )}
        <Attachments attachments={m.attachments} inbound={inbound} />
        {looksLikeMedia ? (
          <MediaPlaceholder
            conversationId={guestyExternalId}
            sentAt={m.sent_at || m.created_at}
            inbound={inbound}
            moduleKey={moduleKey}
          />
        ) : (
          <div className="whitespace-pre-wrap text-sm">
            {m.body || <em className="opacity-60">(empty)</em>}
          </div>
        )}
        <div className={`text-[10px] mt-1 ${
          inbound ? 'text-slate-400'
            : isAutoOutbound ? 'text-cyan-700/70 dark:text-cyan-300/70'
            : 'text-slate-300'
        }`}>
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
        if (type === 'video' || mime.startsWith('video/')) {
          return (
            <video
              key={i}
              src={url}
              controls
              playsInline
              preload="metadata"
              className="rounded-lg max-w-[280px] max-h-[280px] bg-black"
            />
          );
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

// Capability matrix per user spec:
//   Airbnb (via Guesty)     → text + attachments  (Airbnb does not support voice)
//   Booking.com (via Guesty)→ text + attachments
//   SMS (via Guesty)        → text only
//   Email (via Guesty)      → text + attachments  (no voice)
//   WhatsApp (via Guesty)   → text + voice + attachments
//   wa_casual (Green-API)   → text + voice + attachments  (currently only one with full upload pipe)
//   wa_cloud (WABA)         → text + voice + attachments  (when WABA configured)
function channelCaps(channel: string, source: string | null): { text: boolean; voice: boolean; attach: boolean; note: string } {
  const src = (source || '').toLowerCase();
  if (channel === 'wa_casual') return { text: true, voice: true, attach: true, note: 'Green-API · text · voice · attachments' };
  if (channel === 'wa_cloud')  return { text: true, voice: true, attach: true, note: 'WABA · text · voice · attachments (template-gated outside 24h window)' };
  if (channel === 'guesty') {
    if (src.includes('sms'))      return { text: true, voice: false, attach: false, note: 'SMS · text only' };
    if (src.includes('email'))    return { text: true, voice: false, attach: true,  note: 'Email · text + attachments' };
    if (src.includes('airbnb'))   return { text: true, voice: false, attach: true,  note: 'Airbnb · text + attachments (voice not supported)' };
    if (src.includes('booking'))  return { text: true, voice: false, attach: true,  note: 'Booking.com · text + attachments' };
    if (src.includes('whatsapp')) return { text: true, voice: true,  attach: true,  note: 'WhatsApp via Guesty · text · voice · attachments' };
    return { text: true, voice: false, attach: true, note: 'Guesty · text + attachments' };
  }
  return { text: true, voice: false, attach: false, note: 'Text only' };
}

function ChannelCapabilityHint({ channel, source }: { channel: string; source: string | null }) {
  const caps = channelCaps(channel, source);
  // Voice + attach upload pipes are only fully wired for wa_casual today.
  // Other channels show the spec but the capability is informational
  // until the corresponding sender is implemented.
  const voiceLive = channel === 'wa_casual';
  const attachLive = channel === 'wa_casual';
  return (
    <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-medium flex items-center gap-2 flex-wrap">
      <span>This channel supports:</span>
      <CapBadge icon={<Type size={10} />} label="Text" allowed={caps.text} live />
      <CapBadge icon={<Mic size={10} />} label="Voice" allowed={caps.voice} live={voiceLive} />
      <CapBadge icon={<Paperclip size={10} />} label="Attachments" allowed={caps.attach} live={attachLive} />
    </div>
  );
}

function CapBadge({ icon, label, allowed, live }: { icon: React.ReactNode; label: string; allowed: boolean; live: boolean }) {
  if (!allowed) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 line-through" title={`${label} not supported on this channel`}>
        {icon} {label} <Ban size={10} />
      </span>
    );
  }
  if (!live) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title={`${label} allowed by channel — sender not yet wired (Phase C.4)`}>
        {icon} {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title={`${label} live`}>
      {icon} {label} <Check size={10} />
    </span>
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

// =====================================================================
// Phase C.5 — composer router driven by effectiveChannel
// =====================================================================
function EffectiveChannelComposer(props: {
  effectiveChannel: ChannelTarget;
  homeChannel: 'guesty' | 'wa_cloud' | 'wa_casual';
  header: ThreadBundle['header'];
  composerHints?: ThreadComposerHints;
  templates?: Template[];
  templateContext?: TemplateContext;
  returnPath: string;
  persistedTarget: ChannelTarget | null;
  availability: ChannelAvailability[];
  wabaBlocked: boolean;
}) {
  const { effectiveChannel, homeChannel, header, composerHints, templates, templateContext, returnPath, persistedTarget, availability, wabaBlocked } = props;

  // When sending via the conversation's home channel, route to the
  // existing native composer for the cleanest UX (no extra forms).
  // When effectiveChannel diverges from home OR the home channel is
  // wa_cloud (no native composer yet), route through the unified switch
  // composer that posts to sendMessageWithSwitchAction.
  const isHomeNativePath =
    (homeChannel === 'guesty' && (effectiveChannel === 'guesty_email' || effectiveChannel === 'guesty_sms' || effectiveChannel === 'guesty_whatsapp')) ||
    (homeChannel === 'wa_casual' && effectiveChannel === 'wa_casual');

  if (isHomeNativePath && homeChannel === 'guesty') {
    // Only pass an explicit module hint when the user EXPLICITLY chose
    // a sub-channel (via ?ch URL param or persisted preference). When
    // neither is set we leave defaultModule undefined so the composer
    // derives the module from the conversation source — Airbnb threads
    // route via 'airbnb2', Booking via 'bookingCom', etc., instead of
    // force-dropping every reply through WhatsApp.
    const explicitlyChosen = !!composerHints?.selected_target || !!persistedTarget;
    const moduleHint = explicitlyChosen
      ? (effectiveChannel === 'guesty_email' ? 'email'
        : effectiveChannel === 'guesty_sms' ? 'sms'
        : 'whatsapp')
      : undefined;
    return (
      <GuestyComposer
        conversationId={header.id}
        guestyExternalId={header.external_id}
        defaultModule={moduleHint}
        killSwitchOn={!!header.ai_kill_switch}
        initialError={composerHints?.send_error}
        initialStatus={composerHints?.send_status}
        initialFallbackUrl={composerHints?.fallback_url}
        initialSent={composerHints?.sent}
        channelSource={header.source || null}
        templates={templates}
        templateContext={templateContext}
        buildingCode={header.building_code}
      />
    );
  }
  if (isHomeNativePath && homeChannel === 'wa_casual') {
    return (
      <WaCasualComposer
        conversationId={header.id}
        killSwitchOn={!!header.ai_kill_switch}
        initialError={composerHints?.send_error}
        initialSent={composerHints?.sent}
        templates={templates}
        templateContext={templateContext}
        buildingCode={header.building_code}
      />
    );
  }

  // Cross-channel path: render the unified switch composer.
  const targetAvail = availability.find(x => x.target === effectiveChannel) || null;
  return (
    <SwitchComposer
      conversationId={header.id}
      effectiveChannel={effectiveChannel}
      returnPath={returnPath}
      initialError={composerHints?.send_error}
      initialStatus={composerHints?.send_status}
      initialFallbackUrl={composerHints?.fallback_url}
      initialSent={composerHints?.sent}
      killSwitchOn={!!header.ai_kill_switch}
      guestPhone={header.guest_phone}
      guestEmail={header.guest_email}
      wabaBlocked={wabaBlocked}
      hasAttachmentSupport={!!targetAvail?.attachmentsSupported}
    />
  );
  // Unused fields silenced for now — homeChannel + persistedTarget reserved
  // for future composer-level UX (e.g., showing the home label inline).
  void homeChannel; void persistedTarget;
}

function WabaOutsideWindowBanner({ hoursSince }: { hoursSince: number | null }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-2 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
      <Sparkles size={12} className="text-amber-600 shrink-0 mt-0.5" />
      <div>
        <span className="font-semibold">Outside the WABA 24h customer-service window</span>
        {hoursSince !== null && (
          <span className="ml-1 opacity-80">(last inbound {Math.round(hoursSince)}h ago)</span>
        )}
        . Pre-approved templates only — Send is disabled until a template is selected. (Template picker ships with Phase C.4.)
      </div>
    </div>
  );
}
