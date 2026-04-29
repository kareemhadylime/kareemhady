'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  MessageCircle,
  AtSign,
  Phone,
  AlertTriangle,
  Check,
  Ban,
  Star,
  ExternalLink,
  Keyboard,
  X,
  Type as TypeIcon,
  Mic,
  Paperclip,
} from 'lucide-react';
import type { ChannelAvailability, ChannelTarget } from '@/lib/beithady/communication/channel-switch';

// Phase C.5 — Channel Switcher bar (U1) + No-info banner (U2) +
// Active-channel pill (U3) + Capability-matrix one-liner (improvement #12).
//
// Renders 4 buttons (WA Casual / WABA / Email / SMS) above the composer.
// Clicking a button:
//   - If available → updates URL ?ch=<target> + parent re-renders composer
//   - If unavailable but the reason is "no_phone" / "no_email" → flips
//     to a banner with a CRM 360° deep-link (improvement #6) and a
//     manual Revert button (Q8-c). The active channel does NOT change.
//   - If unavailable for provider/runtime reasons → button is disabled
//     with a tooltip explaining why (Q5-a).
//
// Keyboard shortcuts (improvement #11):
//   Alt+1 = WA Casual, Alt+2 = WABA, Alt+3 = Email, Alt+4 = SMS

type Props = {
  conversationId: string;
  guestId: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  homeChannel: 'guesty' | 'wa_cloud' | 'wa_casual';
  effectiveChannel: ChannelTarget;
  availability: ChannelAvailability[];
  preferredChannel: string | null;
  preferredSetAt: string | null;
  basePath: string;
  searchParams: { c?: string; switch_revert?: string; switch_hint?: string };
};

const TARGETS_ORDER: ChannelTarget[] = ['wa_casual', 'wa_cloud', 'guesty_email', 'guesty_sms'];

const TARGET_META: Record<ChannelTarget, { label: string; icon: typeof Bot; needs: 'phone' | 'email' | null }> = {
  wa_casual:        { label: 'WA Casual',  icon: MessageCircle, needs: 'phone' },
  wa_cloud:         { label: 'WABA',       icon: Bot,           needs: 'phone' },
  guesty_email:     { label: 'Email',      icon: AtSign,        needs: 'email' },
  guesty_sms:       { label: 'SMS',        icon: Phone,         needs: 'phone' },
  guesty_whatsapp:  { label: 'Guesty WA',  icon: MessageCircle, needs: 'phone' },
  email_standalone: { label: 'Email',      icon: AtSign,        needs: 'email' },
  sms_standalone:   { label: 'SMS',        icon: Phone,         needs: 'phone' },
};

export function ChannelSwitcher(props: Props) {
  const {
    conversationId,
    guestId,
    guestPhone,
    guestEmail,
    homeChannel,
    effectiveChannel,
    availability,
    preferredChannel,
    basePath,
    searchParams,
  } = props;

  const [pendingTarget, setPendingTarget] = useState<ChannelTarget | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // No-info banner — surfaces when URL has ?switch_revert=... after the
  // server action redirected back here, OR when the user just clicked a
  // local button that needs missing contact info (set via pendingTarget).
  const serverRevert = searchParams.switch_revert;
  const serverHint = searchParams.switch_hint;
  const localRevert = useMemo(() => {
    if (!pendingTarget) return null;
    const a = availability.find(x => x.target === pendingTarget);
    if (!a) return null;
    if (a.available) return null;
    return { reason: a.reason || 'unknown', hint: a.hint, target: pendingTarget };
  }, [pendingTarget, availability]);

  function navigateTo(target: ChannelTarget) {
    const a = availability.find(x => x.target === target);
    if (!a) return;
    if (!a.available) {
      // Surface the no-info banner without navigating away. The banner
      // includes a manual Revert (which just clears pendingTarget).
      setPendingTarget(target);
      return;
    }
    setPendingTarget(null);
    const url = new URL(window.location.href);
    url.searchParams.set('ch', target);
    if (searchParams.c) url.searchParams.set('c', searchParams.c);
    url.searchParams.delete('switch_revert');
    url.searchParams.delete('switch_hint');
    window.location.href = url.toString();
  }

  // Keyboard shortcuts (Alt+1..4) scoped to thread-pane focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx === -1) return;
      const target = TARGETS_ORDER[idx];
      if (!target) return;
      e.preventDefault();
      navigateTo(target);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, searchParams.c]);

  const activeAvail = availability.find(x => x.target === effectiveChannel) || null;

  return (
    <div className="space-y-2">
      {/* U3 + capability one-liner above the buttons */}
      <ActiveChannelPill
        target={effectiveChannel}
        availability={activeAvail}
        homeChannel={homeChannel}
        preferredChannel={preferredChannel}
      />

      <CapabilityMatrixLine availability={availability} />

      {/* U1 — Channel Switcher bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 font-semibold pr-1">
          Send via:
        </span>
        {TARGETS_ORDER.map((target, i) => {
          const a = availability.find(x => x.target === target);
          if (!a) return null;
          return (
            <ChannelButton
              key={target}
              target={target}
              availability={a}
              isActive={target === effectiveChannel}
              onClick={() => navigateTo(target)}
              shortcutHint={`Alt+${i + 1}`}
            />
          );
        })}
        <button
          type="button"
          onClick={() => setShowShortcuts(s => !s)}
          className="ml-auto text-[10px] inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          title="Show keyboard shortcuts"
        >
          <Keyboard size={12} />
          {showShortcuts ? 'Hide' : 'Shortcuts'}
        </button>
      </div>

      {showShortcuts && (
        <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-2">
          <span className="font-semibold">Keyboard:</span> <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700">Alt+1</kbd> WA Casual ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700">Alt+2</kbd> WABA ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700">Alt+3</kbd> Email ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700">Alt+4</kbd> SMS
        </div>
      )}

      {/* U2 — No-info banner. Server-side revert or client-side local. */}
      {(serverRevert || localRevert) && (
        <NoInfoBanner
          reason={serverRevert || localRevert?.reason || 'unknown'}
          hint={serverHint || localRevert?.hint}
          guestId={guestId}
          guestPhone={guestPhone}
          guestEmail={guestEmail}
          target={localRevert?.target}
          onRevert={() => {
            setPendingTarget(null);
            if (serverRevert) {
              const url = new URL(window.location.href);
              url.searchParams.delete('switch_revert');
              url.searchParams.delete('switch_hint');
              window.history.replaceState({}, '', url.toString());
            }
          }}
        />
      )}
    </div>
  );
  // Conversation ID is currently unused by the UI but reserved for the
  // upcoming "Remember for this conversation" checkbox state and audit.
  void conversationId;
}

// ----------------------------------------------------------------------
// U3 — Active-channel pill
// ----------------------------------------------------------------------
function ActiveChannelPill({
  target,
  availability,
  homeChannel,
  preferredChannel,
}: {
  target: ChannelTarget;
  availability: ChannelAvailability | null;
  homeChannel: 'guesty' | 'wa_cloud' | 'wa_casual';
  preferredChannel: string | null;
}) {
  const meta = TARGET_META[target];
  const Icon = meta.icon;
  const isCross = !targetMatchesHome(target, homeChannel);
  return (
    <div className="text-xs flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-700 text-white">
        <Icon size={11} />
        <span className="font-medium">Sending via:</span>
        <span>{meta.label}</span>
        {availability?.lastUsedAt && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-amber-300">
            <Star size={9} fill="currentColor" />
            {relativeTime(availability.lastUsedAt)}
          </span>
        )}
      </span>
      {isCross && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-200 border border-violet-200 dark:border-violet-800"
          title="Switched away from the conversation home channel"
        >
          🔀 Cross-channel
        </span>
      )}
      {preferredChannel === target && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
          title="This conversation remembers this channel as the default"
        >
          📌 Remembered
        </span>
      )}
    </div>
  );
}

function targetMatchesHome(target: ChannelTarget, home: 'guesty' | 'wa_cloud' | 'wa_casual'): boolean {
  if (home === 'guesty') return target === 'guesty_email' || target === 'guesty_sms' || target === 'guesty_whatsapp';
  if (home === 'wa_casual') return target === 'wa_casual';
  if (home === 'wa_cloud')  return target === 'wa_cloud';
  return false;
}

// ----------------------------------------------------------------------
// Capability matrix one-liner (improvement #12)
// ----------------------------------------------------------------------
function CapabilityMatrixLine({ availability }: { availability: ChannelAvailability[] }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 flex items-center gap-2 flex-wrap">
      <span className="font-semibold pr-1">Available:</span>
      {TARGETS_ORDER.map(target => {
        const a = availability.find(x => x.target === target);
        if (!a) return null;
        const meta = TARGET_META[target];
        return (
          <span
            key={target}
            className={`inline-flex items-center gap-1 ${
              a.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400 dark:text-slate-500 line-through'
            }`}
            title={a.hint || a.reason || (a.available ? 'Ready' : '')}
          >
            {meta.label} {a.available ? <Check size={10} /> : <Ban size={10} />}
          </span>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------
// U1 — Channel button
// ----------------------------------------------------------------------
function ChannelButton({
  target,
  availability,
  isActive,
  onClick,
  shortcutHint,
}: {
  target: ChannelTarget;
  availability: ChannelAvailability;
  isActive: boolean;
  onClick: () => void;
  shortcutHint: string;
}) {
  const meta = TARGET_META[target];
  const Icon = meta.icon;

  // Provider-down or unsupported → button is disabled (no click).
  // Missing-contact-info → button is *clickable* (so the no-info banner
  // can show with the CRM deep-link), but visually hinted as unavailable.
  const isMissingInfo = availability.reason === 'no_phone' || availability.reason === 'no_email';
  const isProviderDown =
    availability.reason === 'provider_disabled' ||
    availability.reason === 'green_offline' ||
    availability.reason === 'invalid_phone' ||
    availability.reason === 'wrong_home_channel' ||
    availability.reason === 'unknown_target';

  const disabled = isProviderDown && !availability.available;

  // Indicator dot color — improvement #1 live availability badge.
  const dotClass = availability.available
    ? 'bg-emerald-500'
    : isMissingInfo
      ? 'bg-rose-500'
      : 'bg-slate-400';

  const tooltip = availability.hint
    || (availability.available ? `Send via ${meta.label} · ${shortcutHint}` : (availability.reason || 'unavailable'));

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition border ${
        isActive
          ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
          : disabled
            ? 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-800 cursor-not-allowed'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden />
      <Icon size={12} />
      <span className="font-medium">{meta.label}</span>
      {availability.lastUsedAt && availability.available && (
        <span className="text-[9px] inline-flex items-center gap-0.5 text-amber-500">
          <Star size={8} fill="currentColor" />
          {relativeTime(availability.lastUsedAt)}
        </span>
      )}
      {availability.costHint && availability.available && (
        <span
          className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
          title={availability.costHint}
        >
          $
        </span>
      )}
    </button>
  );
}

// ----------------------------------------------------------------------
// U2 — No-info banner
// ----------------------------------------------------------------------
function NoInfoBanner({
  reason,
  hint,
  guestId,
  guestPhone,
  guestEmail,
  target,
  onRevert,
}: {
  reason: string;
  hint?: string;
  guestId: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  target?: ChannelTarget;
  onRevert: () => void;
}) {
  const fieldNeeded =
    reason === 'no_phone' ? 'phone'
    : reason === 'no_email' ? 'email'
    : null;

  const friendlyMessage =
    reason === 'no_phone' ? 'No phone number on file for this guest.'
    : reason === 'no_email' ? 'No email address on file for this guest.'
    : reason === 'provider_disabled' ? 'Provider not configured in Settings → Integrations.'
    : reason === 'green_offline' ? 'Green-API instance is offline.'
    : reason === 'invalid_phone' ? "Guest's phone number is not in valid E.164 format."
    : reason === 'wrong_home_channel' ? 'This channel is not supported for this conversation type.'
    : reason === 'conversation_not_found' ? 'Conversation could not be loaded.'
    : 'Channel unavailable.';

  const crmHref = guestId
    ? `/beithady/crm/${guestId}${fieldNeeded ? `?focus=${fieldNeeded}` : ''}`
    : null;

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-xs flex items-start gap-2">
      <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <div className="text-amber-900 dark:text-amber-100">
          <span className="font-semibold">Channel reverted.</span>{' '}
          {friendlyMessage}
          {hint && <span className="block mt-1 text-amber-700 dark:text-amber-300 italic">{hint}</span>}
        </div>
        <div className="text-[11px] text-amber-700 dark:text-amber-300 space-x-3">
          {guestPhone && <span>📞 {guestPhone}</span>}
          {guestEmail && <span>✉️ {guestEmail}</span>}
          {!guestPhone && fieldNeeded === 'phone' && <span className="opacity-70">(no phone)</span>}
          {!guestEmail && fieldNeeded === 'email' && <span className="opacity-70">(no email)</span>}
        </div>
        <div className="flex items-center gap-2">
          {crmHref && fieldNeeded && (
            <a
              href={crmHref}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              <ExternalLink size={11} /> Add {fieldNeeded} in CRM 360°
            </a>
          )}
          <button
            type="button"
            onClick={onRevert}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-amber-700 text-white hover:bg-amber-800"
          >
            <X size={11} /> Revert to original channel
          </button>
        </div>
      </div>
      <span className="sr-only">{target}</span>
    </div>
  );
}

// ----------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// Re-exported for use by the validator pills in composer (improvement #5).
export function isValidEmail(s: string | null): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
export function isValidE164(s: string | null): boolean {
  if (!s) return false;
  const digits = s.replace(/[^0-9]/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

// Component-rendered validator pills shown next to the active-channel
// pill — improvement #5.
export function ContactValidatorPill({
  contact,
  field,
}: {
  contact: string | null;
  field: 'phone' | 'email';
}) {
  if (!contact) return null;
  const valid = field === 'phone' ? isValidE164(contact) : isValidEmail(contact);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
        valid
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
      }`}
      title={valid ? 'Valid format' : 'Invalid format — guest may not receive the message'}
    >
      {valid ? <Check size={9} /> : <Ban size={9} />}
      {field === 'phone' ? 'phone' : 'email'}
    </span>
  );
}

// Visual capability hints reused inline (icons exported for the
// composer-side template-aware warnings, improvement #4).
export const CapabilityIcons = { TypeIcon, Mic, Paperclip };
