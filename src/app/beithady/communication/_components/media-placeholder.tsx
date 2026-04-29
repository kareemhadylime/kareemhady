'use client';
import { useState, useEffect } from 'react';
import { Image as ImageIcon, FileQuestion, Loader2, AlertTriangle, FileText, Volume2 } from 'lucide-react';

// Phase Q.4 follow-up V3 — inline media loader for empty-body Guesty
// messages. Click "Load original" → fetches the actual post + attachments
// from our /api/beithady/communication/guesty-post route (which uses the
// service-account OAuth token, so it works regardless of the calling
// user's Guesty UI permissions).

type FetchedAttachment = {
  url: string;
  name?: string;
  mime?: string;
  kind: 'image' | 'file' | 'audio' | 'video';
};

type FetchResult = {
  ok: true;
  post: {
    id: string | null;
    body: string;
    bodyHtml: string | null;
    module: string | null;
    type: string | null;
    createdAt: string | null;
    attachments: FetchedAttachment[];
  };
  // V3 sets note='no matching post...' when the click landed on a message
  // whose timestamp doesn't match anything in Guesty's thread. In that case
  // post.id will be null and attachments will be empty.
  note?: string;
} | {
  ok: false;
  error: string;
};

export function MediaPlaceholder({
  conversationId,
  sentAt,
  inbound,
  moduleKey,
}: {
  conversationId: string | null;
  sentAt: string | null;
  inbound: boolean;
  moduleKey: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [data, setData] = useState<Extract<FetchResult, { ok: true }>['post'] | null>(null);
  const [serverNote, setServerNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAirbnb = /airbnb/i.test(moduleKey);
  const isBooking = /booking/i.test(moduleKey);
  const label = isAirbnb
    ? 'Airbnb media or rich card'
    : isBooking
      ? 'Booking.com media or rich card'
      : 'Media message';

  async function load() {
    if (!conversationId) {
      setState('error');
      setErrorMsg('No conversation id available');
      return;
    }
    setState('loading');
    try {
      const params = new URLSearchParams({ conversationId });
      if (sentAt) params.set('sentAt', sentAt);
      const res = await fetch(`/api/beithady/communication/guesty-post?${params.toString()}`);
      const json = (await res.json()) as FetchResult;
      if (!json.ok) {
        setState('error');
        setErrorMsg(json.error || 'fetch_failed');
        return;
      }
      setData(json.post);
      setServerNote(json.note || null);
      setState('loaded');
    } catch (e) {
      setState('error');
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  // --- Already loaded → render media inline ---
  if (state === 'loaded' && data) {
    const imgs = data.attachments.filter(a => a.kind === 'image');
    const audios = data.attachments.filter(a => a.kind === 'audio');
    const others = data.attachments.filter(a => a.kind !== 'image' && a.kind !== 'audio');

    if (data.attachments.length === 0 && !data.bodyHtml && !data.body) {
      // Either:
      // (a) V3 returned post.id=null with note='no matching post...' —
      //     this message has no Guesty-side post (likely a status-only
      //     event the user clicked but there's nothing to load)
      // (b) V3 found the post but it has no body/attachments — likely
      //     an Airbnb structured card whose content lives only in
      //     Guesty's UI rendering layer
      const noPostMatch = data.id === null && !!serverNote;
      const isAirbnbCard = isAirbnb;
      const isBookingCard = isBooking;
      return (
        <div className={`rounded-lg border-2 border-dashed px-3 py-2.5 space-y-1.5 ${
          inbound
            ? 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/40'
            : 'border-slate-400/50 bg-slate-600/40'
        }`}>
          <div className={`text-xs font-medium ${inbound ? 'text-slate-700 dark:text-slate-200' : 'text-white'}`}>
            {noPostMatch
              ? 'No media on this message'
              : isAirbnbCard
                ? 'Airbnb-native structured card'
                : isBookingCard
                  ? 'Booking.com structured event'
                  : 'Channel-native structured message'}
          </div>
          <div className={`text-[11px] ${inbound ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300'}`}>
            {noPostMatch
              ? 'This message has no corresponding post in Guesty\'s thread (typically a system event with no rendered body — read receipts, status flips, etc.). Nothing to load.'
              : isAirbnbCard
                ? 'Likely a flight-info card, verification request, or co-traveller info. Airbnb embeds the content directly in their app — neither Guesty\'s webhook nor API exposes the rendered card to third parties.'
                : isBookingCard
                  ? 'Likely a reservation event (modification, cancellation, cohort change). Booking.com embeds the content; the Guesty API only sees an empty shell.'
                  : 'The channel rendered structured content that Guesty\'s API doesn\'t expose.'}
          </div>
          {!noPostMatch && (
            <div className={`text-[11px] mt-1.5 ${inbound ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300'}`}>
              <span className="font-semibold">Workaround:</span> view this thread on the original {isAirbnbCard ? 'Airbnb' : isBookingCard ? 'Booking.com' : 'channel'} hosting dashboard, where the card renders natively.
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {imgs.length > 0 && (
          <div className={imgs.length > 1 ? 'grid grid-cols-2 gap-1.5' : ''}>
            {imgs.map((a, i) => (
              <ImageWithFallback
                key={i}
                src={a.url}
                name={a.name}
                inbound={inbound}
              />
            ))}
          </div>
        )}
        {audios.map((a, i) => (
          <audio key={i} src={a.url} controls className="max-w-full" />
        ))}
        {others.map((a, i) => (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-xs underline ${inbound ? 'text-slate-700 dark:text-slate-200' : 'text-white'}`}
          >
            <FileText size={11} /> {a.name || 'attachment'}
          </a>
        ))}
        {data.body && (
          <div className="whitespace-pre-wrap text-sm">{data.body}</div>
        )}
        {!data.body && data.bodyHtml && (
          <div
            className="text-sm prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
          />
        )}
      </div>
    );
  }

  // --- Idle / loading / error states ---
  return (
    <button
      type="button"
      onClick={load}
      disabled={state === 'loading'}
      className={`w-full text-left rounded-lg border-2 border-dashed px-3 py-2.5 transition ${
        state === 'error'
          ? 'border-rose-300 dark:border-rose-700 bg-rose-50/40 dark:bg-rose-950/30'
          : inbound
            ? 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800'
            : 'border-slate-400/50 bg-slate-600/40 hover:bg-slate-600/60'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`shrink-0 mt-0.5 ${
          state === 'error' ? 'text-rose-600' : inbound ? 'text-slate-500' : 'text-slate-300'
        }`}>
          {state === 'loading'
            ? <Loader2 size={16} className="animate-spin" />
            : state === 'error'
              ? <AlertTriangle size={16} />
              : isAirbnb || isBooking
                ? <ImageIcon size={16} />
                : <FileQuestion size={16} />}
        </div>
        <div className="text-sm flex-1 min-w-0">
          <div className={`font-medium ${inbound ? 'text-slate-700 dark:text-slate-200' : 'text-white'}`}>
            {state === 'error' ? 'Failed to load original' : label}
          </div>
          <div className={`text-[11px] mt-0.5 ${
            state === 'error'
              ? 'text-rose-600 dark:text-rose-300'
              : inbound ? 'text-slate-500' : 'text-slate-300'
          }`}>
            {state === 'loading'
              ? 'Fetching from Guesty…'
              : state === 'error'
                ? errorMsg || 'Unknown error · click to retry'
                : 'Body not delivered by webhook · click to load original'}
          </div>
        </div>
        {state === 'idle' && (
          <Volume2
            size={11}
            className={`shrink-0 mt-1 opacity-0`}
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}

// Loads an image via fetch (so we can check the response status before
// committing to a broken-image render). On 2xx, swaps to a blob URL and
// renders <img>. On non-2xx (e.g. proxy 502 because Guesty's API doesn't
// expose attachment signing), falls back to a clear "couldn't load"
// card instead of the browser's broken-image icon.
function ImageWithFallback({
  src,
  name,
  inbound,
}: {
  src: string;
  name?: string;
  inbound: boolean;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Probe the proxy on mount; render image only if 2xx. Avoids the
  // browser's broken-image icon when the proxy returns 502.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    fetch(src)
      .then(async r => {
        if (cancelled) return;
        if (!r.ok) {
          setFailed(true);
          return;
        }
        const blob = await r.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  if (failed) {
    return (
      <div className={`rounded-lg border-2 border-dashed px-3 py-2.5 text-xs ${
        inbound
          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
          : 'border-amber-400/50 bg-amber-600/30 text-white'
      }`}>
        <div className="font-medium">Couldn't load original media</div>
        <div className="text-[11px] mt-1 opacity-80">
          Guesty stores guest-uploaded photos on a private CDN with short-lived signed URLs that their integration API doesn't expose to third parties. To view this photo, open the conversation in Guesty's web app where the URL is signed by their UI on demand.
        </div>
      </div>
    );
  }
  if (!blobUrl) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-3 inline-flex items-center gap-2 text-xs text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Loading {name || 'image'}…
      </div>
    );
  }
  return (
    <a href={blobUrl} target="_blank" rel="noopener noreferrer" title={name || 'image'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={blobUrl}
        alt={name || 'image'}
        className="rounded-lg max-w-full max-h-[280px] object-cover border border-slate-200 dark:border-slate-700"
      />
    </a>
  );
}

