'use client';
import { useState, useTransition } from 'react';
import { Plus, Trash2, Save, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import {
  type WaNotificationSettings,
  type NotificationGroup,
  type NotificationTemplate,
} from '@/lib/beithady/wa-reservation-notify';
import { saveNotificationSettingsAction } from './_actions';

// ── Message preview strings ───────────────────────────────────────────────────

const PREVIEW: Record<NotificationTemplate, string> = {
  full: `🏠 *New Reservation*
━━━━━━━━━━━━━━━
📲 Channel: Airbnb
🏢 Building: BH-26
🛏️ Unit: BH-26-204
👤 Guest: Mohammed Alsufyani
📱 Mobile: +966 50 123 4567
📅 8 May → 14 May 2026
🌙 6 nights
💰 Total: $960.00
📊 Rate/night: $160.00`,

  ops: `🏠 *New Reservation*
━━━━━━━━━━━━━━━
📲 Channel: Airbnb
🏢 Building: BH-26
🛏️ Unit: BH-26-204
👤 Guest: Mohammed Alsufyani
📱 Mobile: +966 50 123 4567
📅 8 May → 14 May 2026
🌙 6 nights`,
};

const TEMPLATE_LABELS: Record<NotificationTemplate, string> = {
  full: 'Full details (Admin & Guest Relations)',
  ops: 'Operations summary',
};

// ── Group card ────────────────────────────────────────────────────────────────

function GroupCard({
  group,
  onChange,
}: {
  group: NotificationGroup;
  onChange: (updated: NotificationGroup) => void;
}) {
  const [newPhone, setNewPhone] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  function addPhone() {
    const cleaned = newPhone.trim().replace(/\s/g, '');
    if (!cleaned) return;
    // Ensure E.164 style (start with +)
    const normalized = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    if (group.phones.includes(normalized)) { setNewPhone(''); return; }
    onChange({ ...group, phones: [...group.phones, normalized] });
    setNewPhone('');
  }

  function removePhone(phone: string) {
    onChange({ ...group, phones: group.phones.filter((p) => p !== phone) });
  }

  return (
    <div
      className="rounded-xl"
      style={{
        background: '#ffffff',
        border: group.enabled ? '2px solid var(--bh-gold)' : '1px solid var(--bh-mute)',
      }}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4 rounded-t-xl"
        style={{ background: 'var(--bh-cream)', borderBottom: '1px solid var(--bh-mute)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <MessageSquare size={16} style={{ color: 'var(--bh-gold)', flexShrink: 0 }} />
          <div className="min-w-0">
            <p
              className="font-semibold text-[14px] leading-tight"
              style={{ color: 'var(--bh-ink)', fontFamily: 'var(--bh-heading)' }}
            >
              {group.label}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--bh-steel)' }}>
              {TEMPLATE_LABELS[group.template]}
            </p>
          </div>
        </div>
        {/* Enable toggle */}
        <button
          type="button"
          onClick={() => onChange({ ...group, enabled: !group.enabled })}
          className="relative flex-shrink-0 h-6 w-11 rounded-full transition focus-visible:outline-none focus-visible:ring-2"
          style={{ background: group.enabled ? 'var(--bh-gold)' : 'var(--bh-mute)' }}
          aria-label={group.enabled ? 'Disable' : 'Enable'}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            style={{ left: group.enabled ? 'calc(100% - 1.375rem)' : '0.125rem' }}
          />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Phone number list */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2"
            style={{ color: 'var(--bh-steel)' }}>
            Recipients
          </p>
          {group.phones.length === 0 ? (
            <p className="text-[12px] italic" style={{ color: 'var(--bh-mute)' }}>
              No numbers added yet
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 mb-2">
              {group.phones.map((phone) => (
                <li
                  key={phone}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]"
                  style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)', color: 'var(--bh-ink)' }}
                >
                  {phone}
                  <button
                    type="button"
                    onClick={() => removePhone(phone)}
                    className="hover:opacity-70 focus-visible:outline-none"
                    aria-label={`Remove ${phone}`}
                  >
                    <Trash2 size={12} style={{ color: 'var(--bh-steel)' }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Add phone */}
          <div className="flex gap-2 mt-2">
            <input
              type="tel"
              placeholder="+201234567890"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPhone()}
              className="flex-1 rounded-lg border px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 min-w-0"
              style={{
                borderColor: 'var(--bh-mute)',
                background: 'var(--bh-cream)',
                color: 'var(--bh-ink)',
              }}
            />
            <button
              type="button"
              onClick={addPhone}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
              style={{ background: 'var(--bh-ink)', color: 'var(--bh-cream)' }}
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Message preview toggle */}
        <div>
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-medium transition hover:opacity-70 focus-visible:outline-none"
            style={{ color: 'var(--bh-steel)' }}
          >
            {previewOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {previewOpen ? 'Hide' : 'Preview'} message
          </button>
          {previewOpen && (
            <pre
              className="mt-2 rounded-lg px-4 py-3 text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{
                background: '#1a1a2e',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                border: '1px solid #2d2d44',
              }}
            >
              {PREVIEW[group.template]}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function NotificationsClient({
  initialSettings,
}: {
  initialSettings: WaNotificationSettings;
}) {
  const [settings, setSettings] = useState<WaNotificationSettings>(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateGroup(id: string, updated: NotificationGroup) {
    setSettings((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === id ? updated : g)),
    }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveNotificationSettingsAction(settings);
      if (result.ok) {
        setSavedAt(new Date().toLocaleTimeString());
      } else {
        setError(result.error ?? 'Save failed');
      }
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Info banner */}
      <div
        className="rounded-lg px-4 py-3 text-[12px]"
        style={{ background: '#eef3fb', color: 'var(--bh-ink)', border: '1px solid #c3d4f0' }}
      >
        <span className="font-semibold">How it works:</span> When a reservation is confirmed in
        Guesty, our webhook instantly fires a WhatsApp message to every number in each enabled
        group. Messages are formatted based on the group&apos;s role template.
      </div>

      {/* Group cards */}
      {settings.groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          onChange={(updated) => updateGroup(group.id, updated)}
        />
      ))}

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
          style={{ background: 'var(--bh-ink)', color: 'var(--bh-cream)' }}
        >
          <Save size={14} />
          {isPending ? 'Saving…' : 'Save settings'}
        </button>
        {savedAt && !error && (
          <span className="text-[12px]" style={{ color: 'var(--bh-steel)' }}>
            ✓ Saved at {savedAt}
          </span>
        )}
        {error && (
          <span className="text-[12px]" style={{ color: '#9a2828' }}>
            {error}
          </span>
        )}
      </div>

      {/* Note about webhook registration */}
      <p className="text-[11px]" style={{ color: 'var(--bh-steel)' }}>
        Note: Guesty must have the reservation webhook registered at{' '}
        <code
          className="rounded px-1 py-0.5 font-mono text-[10px]"
          style={{ background: '#f0ece0', color: 'var(--bh-ink)' }}
        >
          /api/webhooks/guesty/reservation
        </code>{' '}
        for real-time delivery. The every-4h sync cron does not trigger these notifications.
      </p>
    </div>
  );
}
