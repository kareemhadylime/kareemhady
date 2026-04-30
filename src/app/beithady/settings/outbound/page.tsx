import { PowerOff, Power, AlertTriangle, MessageCircle, Bot, Megaphone, Calendar, Star, Gift, ShieldAlert, Sun, Crown, BarChart3, Inbox } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  AUTOMATION_REGISTRY,
  ALL_AUTOMATION_KEYS,
  getAllPauseStates,
  type AutomationKey,
} from '@/lib/beithady/automations';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { toggleOutboundFlagAction } from './actions';

export const dynamic = 'force-dynamic';

// Per-automation icon mapping. Falls back to Megaphone.
const AUTOMATION_ICONS: Record<AutomationKey, React.ComponentType<{ size?: number; className?: string }>> = {
  ai_auto_reply: Bot,
  pre_arrival: Calendar,
  csat_survey: Star,
  boarding_pass: Calendar,
  loyalty_notifications: Gift,
  upsell_offer: Megaphone,
  cancel_risk_reconfirm: ShieldAlert,
  morning_brief: Sun,
  late_reply_digest: BarChart3,
  vip_digest: Crown,
  daily_report_dispatch: BarChart3,
};

const CATEGORY_LABEL: Record<string, string> = {
  communication: 'Communication',
  engagement: 'Guest engagement',
  operations: 'Operations',
  reports: 'Reports & digests',
};

const CATEGORY_ORDER = ['communication', 'engagement', 'operations', 'reports'];

export default async function OutboundKillSwitchesPage() {
  // Admin-only per ADMIN_ONLY_SETTINGS_SUBTABS — but we still gate at the
  // permission level so role: admin OR is_admin both work.
  await requireBeithadyPermission('settings', 'read');

  const state = await getAllPauseStates();
  const totalPaused = (state.manual ? 1 : 0) + Object.values(state.automations).filter(Boolean).length;
  const totalSwitches = 1 + ALL_AUTOMATION_KEYS.length;

  // Group automations by category for the UI.
  const byCategory: Record<string, AutomationKey[]> = {};
  for (const key of ALL_AUTOMATION_KEYS) {
    const cat = AUTOMATION_REGISTRY[key].category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(key);
  }

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/beithady/settings' },
      { label: 'Outbound kill switches' },
    ]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Settings"
        title="Outbound kill switches"
        subtitle="Granular controls — independently pause manual inbox sending and each automation. Each toggle is audited; flipping affects real guest messaging immediately."
      />

      <div className={`ix-card p-4 mb-4 ${totalPaused > 0 ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30' : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30'}`}>
        <div className="flex items-center gap-3">
          {totalPaused === 0 ? (
            <Power size={20} className="text-emerald-600 dark:text-emerald-300" />
          ) : (
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-300" />
          )}
          <div className="flex-1">
            <div className="font-semibold">
              {totalPaused === 0
                ? 'All outbound channels active'
                : `${totalPaused} of ${totalSwitches} switches paused`}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {totalPaused === totalSwitches
                ? 'Every outbound path is currently paused — no messages will go out.'
                : totalPaused === 0
                ? 'Manual inbox sending and every automation is enabled. Real messages will be delivered.'
                : 'Some paths are paused. Review each toggle below before flipping.'}
            </div>
          </div>
        </div>
      </div>

      {/* Manual inbox switch — featured at top */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Inbox</h2>
        <SwitchRow
          target="manual"
          icon={Inbox}
          label="Manual inbox sending"
          description="Pauses outbound sends triggered by an agent typing in the inbox composer (Guesty / WA Casual / channel switcher). When paused, agents see Send failed · status 503 · manual_outbound_paused."
          paused={state.manual}
          tone="rose"
        />
      </section>

      {CATEGORY_ORDER.map(cat => {
        const keys = byCategory[cat];
        if (!keys || keys.length === 0) return null;
        return (
          <section key={cat} className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              {CATEGORY_LABEL[cat] || cat}
            </h2>
            <div className="space-y-2">
              {keys.map(key => {
                const reg = AUTOMATION_REGISTRY[key];
                const Icon = AUTOMATION_ICONS[key] || Megaphone;
                return (
                  <SwitchRow
                    key={key}
                    target={key}
                    icon={Icon}
                    label={reg.label}
                    description={reg.description}
                    triggeredBy={reg.triggeredBy}
                    paused={state.automations[key]}
                    tone="slate"
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-6 flex items-start gap-2">
        <MessageCircle size={11} className="mt-0.5 shrink-0" />
        <span>
          Each flip writes a settings audit row (visible in Settings → Audit) capturing actor, before/after, and timestamp.
          The legacy <code>beithady_outbound_paused</code> flag is no longer checked but kept in <code>beithady_settings</code> for history.
        </span>
      </div>
    </BeithadyShell>
  );
}

function SwitchRow({
  target,
  icon: Icon,
  label,
  description,
  triggeredBy,
  paused,
  tone,
}: {
  target: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
  triggeredBy?: string;
  paused: boolean;
  tone: 'rose' | 'slate';
}) {
  const next = paused ? 'off' : 'on';
  const verb = paused ? 'Resume' : 'Pause';
  const tonClass = paused
    ? 'border-rose-200 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/20'
    : 'border-slate-200 dark:border-slate-700';
  void tone;
  return (
    <div className={`ix-card p-4 flex items-start gap-3 border ${tonClass}`}>
      <Icon size={18} className={paused ? 'text-rose-600 dark:text-rose-300 mt-0.5 shrink-0' : 'text-slate-500 dark:text-slate-400 mt-0.5 shrink-0'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{label}</span>
          {paused ? (
            <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-200">
              Paused
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200">
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{description}</p>
        {triggeredBy && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
            triggered by: {triggeredBy}
          </p>
        )}
      </div>
      <form action={toggleOutboundFlagAction}>
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className={paused ? 'ix-btn-primary text-xs whitespace-nowrap' : 'ix-btn-secondary text-xs whitespace-nowrap'}
        >
          {paused ? <Power size={12} /> : <PowerOff size={12} />}
          {verb}
        </button>
      </form>
    </div>
  );
}
