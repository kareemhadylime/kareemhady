import 'server-only';
import { getSetting, setSetting } from './settings';

// Phase C.5 follow-up — granular outbound kill switches.
//
// Replaces the single global `beithady_outbound_paused` flag with one
// switch per automation + one for manual inbox sending. Each automation
// gates at its entry point (action / cron / orchestrator) BEFORE
// invoking any send wrapper. The send wrappers themselves only check
// the manual flag (and only when called from a manual path — see the
// `mode` param on send-guesty.ts / send-wa-casual.ts / send-wa-cloud.ts).

// ---------------------------------------------------------------------
// Registry of all outbound automations + the manual switch.
// Adding a new automation: extend AUTOMATION_REGISTRY here, gate the
// entry point with `if (await isAutomationPaused(KEY)) return ...;`,
// and the settings UI picks it up automatically.
// ---------------------------------------------------------------------

export const AUTOMATION_REGISTRY = {
  ai_auto_reply: {
    settingKey: 'beithady_pause_ai_auto_reply',
    label: 'AI auto-reply',
    description:
      'AI auto-classifies inbound guest messages and sends a reply (or saves a suggestion) per Phase E. Disabling halts both auto-send AND suggestion generation.',
    category: 'communication',
    triggeredBy: 'inbound webhook',
  },
  pre_arrival: {
    settingKey: 'beithady_pause_pre_arrival',
    label: 'Pre-arrival templates',
    description:
      'Phase F pre-arrival WhatsApp dispatch — reservation reminders + check-in instructions sent in the days before arrival.',
    category: 'engagement',
    triggeredBy: 'cron beithady-pre-arrival',
  },
  csat_survey: {
    settingKey: 'beithady_pause_csat_survey',
    label: 'CSAT survey',
    description:
      'Phase F post-checkout CSAT WhatsApp survey to recently checked-out guests.',
    category: 'engagement',
    triggeredBy: 'cron beithady-csat-survey',
  },
  boarding_pass: {
    settingKey: 'beithady_pause_boarding_pass',
    label: 'Boarding pass auto-dispatch',
    description:
      'Phase F boarding-pass WhatsApp dispatch on the day of arrival. Boarding passes are still generated; only the WA send is paused.',
    category: 'engagement',
    triggeredBy: 'cron beithady-boarding-pass',
  },
  loyalty_notifications: {
    settingKey: 'beithady_pause_loyalty_notifications',
    label: 'Loyalty tier notifications',
    description:
      'Phase F loyalty tier-change WhatsApp notifications when a guest crosses into Bronze/Silver/Gold/Platinum.',
    category: 'engagement',
    triggeredBy: 'cron beithady-loyalty-tick',
  },
  upsell_offer: {
    settingKey: 'beithady_pause_upsell_offer',
    label: 'Upsell offers',
    description: 'Phase F upsell campaign WhatsApp dispatch.',
    category: 'engagement',
    triggeredBy: 'cron beithady-upsell-offer',
  },
  cancel_risk_reconfirm: {
    settingKey: 'beithady_pause_cancel_risk_reconfirm',
    label: 'Cancel-risk re-confirm',
    description:
      'K.2 cancellation-risk WhatsApp re-confirmation — fires from the operations cancel-risk page Re-confirm button (manual click) and the daily cancel-risk recompute.',
    category: 'operations',
    triggeredBy: 'manual click + cron beithady-operations-recompute',
  },
  morning_brief: {
    settingKey: 'beithady_pause_morning_brief',
    label: 'Morning Brief WA',
    description:
      'K.1 Daily Morning Brief WhatsApp distribution — Operations (Arabic) + Guest Relations + Finance briefs, all gated by this single switch.',
    category: 'reports',
    triggeredBy: 'cron beithady-morning-brief',
  },
  late_reply_digest: {
    settingKey: 'beithady_pause_late_reply_digest',
    label: 'Late-reply digest',
    description:
      'Phase C.2 late-reply digest WhatsApp to managers — surfaces conversations in SLA breach.',
    category: 'reports',
    triggeredBy: 'cron beithady-late-reply-digest (09:00 + 15:00 Cairo)',
  },
  vip_digest: {
    settingKey: 'beithady_pause_vip_digest',
    label: 'VIP digest',
    description:
      'Phase A VIP digest WhatsApp to managers — surfaces VIP arrivals + activity.',
    category: 'reports',
    triggeredBy: 'cron beithady-vip-digest (06:00 Cairo)',
  },
  daily_report_dispatch: {
    settingKey: 'beithady_pause_daily_report_dispatch',
    label: 'Daily report dispatch',
    description:
      'Beithady daily report WhatsApp distribution to operators (occupancy + revenue + alerts snapshot).',
    category: 'reports',
    triggeredBy: 'cron beithady-daily-report',
  },
  same_day_alerts: {
    settingKey: 'beithady_pause_same_day_alerts',
    label: 'Same-day booking alerts',
    description:
      'WhatsApp alert to GR + Ops + admins when a reservation is created today (after 09:00 Cairo) with check-in today. Fires from cron every 15 min during the active window (09:00–21:00 Cairo).',
    category: 'operations',
    triggeredBy: 'cron beithady-same-day-alerts',
  },
} as const;

export type AutomationKey = keyof typeof AUTOMATION_REGISTRY;

export const ALL_AUTOMATION_KEYS = Object.keys(AUTOMATION_REGISTRY) as AutomationKey[];

// Manual-outbound switch lives outside the registry (it gates a class
// of senders, not a single automation).
export const MANUAL_OUTBOUND_KEY = 'beithady_pause_manual_outbound';

// ---------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------

export async function isManualOutboundPaused(): Promise<boolean> {
  return getSetting<boolean>(MANUAL_OUTBOUND_KEY, false);
}

export async function isAutomationPaused(key: AutomationKey): Promise<boolean> {
  const reg = AUTOMATION_REGISTRY[key];
  if (!reg) return false;
  return getSetting<boolean>(reg.settingKey, false);
}

// Bulk-read variant for the settings UI — returns a map of key → paused.
export async function getAllPauseStates(): Promise<{
  manual: boolean;
  automations: Record<AutomationKey, boolean>;
}> {
  const manual = await isManualOutboundPaused();
  const entries = await Promise.all(
    ALL_AUTOMATION_KEYS.map(async (k) => [k, await isAutomationPaused(k)] as const),
  );
  const automations = Object.fromEntries(entries) as Record<AutomationKey, boolean>;
  return { manual, automations };
}

// ---------------------------------------------------------------------
// Write helpers — used by the Settings UI server action. Audited.
// ---------------------------------------------------------------------

export async function setManualOutboundPaused(
  paused: boolean,
  actorUserId: string,
): Promise<void> {
  await setSetting<boolean>(MANUAL_OUTBOUND_KEY, paused, {
    actorUserId,
    description: 'Manual inbox outbound kill switch (Phase C.5 follow-up).',
  });
}

export async function setAutomationPaused(
  key: AutomationKey,
  paused: boolean,
  actorUserId: string,
): Promise<void> {
  const reg = AUTOMATION_REGISTRY[key];
  if (!reg) throw new Error(`unknown_automation_key:${key}`);
  await setSetting<boolean>(reg.settingKey, paused, {
    actorUserId,
    description: `${reg.label} kill switch.`,
  });
}
