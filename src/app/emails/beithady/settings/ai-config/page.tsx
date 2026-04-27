import { Sparkles, Save } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getAiConfidenceThreshold, isAiAutoReplyEnabled, isVipDigestEnabled } from '@/lib/beithady/settings';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { saveAiConfigAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function BeithadyAiConfigPage() {
  // Settings sub-tab is gated at category level; full edit requires
  // 'full' on settings (manager/admin). Read-only viewers still see
  // the values but the form re-checks on submit.
  await requireBeithadyPermission('settings', 'read');

  const [threshold, autoEnabled, vipDigest] = await Promise.all([
    getAiConfidenceThreshold(),
    isAiAutoReplyEnabled(),
    isVipDigestEnabled(),
  ]);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'AI configuration' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · AI"
        title="AI configuration"
        subtitle="Phase E owns the model and prompts. These switches configure WHEN auto-replies fire and HOW they're audited."
      />

      <form action={saveAiConfigAction} className="ix-card p-6 space-y-6 max-w-2xl">
        <div className="space-y-2">
          <label className="block text-sm font-semibold flex items-center gap-2">
            <Sparkles size={14} className="text-yellow-600" />
            Confidence threshold
          </label>
          <p className="text-xs text-slate-500">
            Inbound messages classified at or above this confidence trigger an
            auto-send. Below it, the AI suggestion is shown to the agent in the
            composer instead. Default: 0.85.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              name="confidence_threshold"
              min={0}
              max={1}
              step={0.05}
              defaultValue={threshold}
              className="flex-1"
            />
            <code className="text-sm tabular-nums w-16 text-right">{threshold.toFixed(2)}</code>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="auto_reply_enabled"
              defaultChecked={autoEnabled}
              className="w-5 h-5"
            />
            <span className="text-sm font-semibold">Auto-reply master switch</span>
          </label>
          <p className="text-xs text-slate-500 pl-8">
            When off, every channel falls back to suggest-only regardless of
            confidence. Use as the global kill-switch in case of an AI incident.
          </p>
        </div>

        <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="vip_digest_enabled"
              defaultChecked={vipDigest}
              className="w-5 h-5"
            />
            <span className="text-sm font-semibold">Daily VIP digest</span>
          </label>
          <p className="text-xs text-slate-500 pl-8">
            Every morning at 09:00 Cairo, admins and managers receive a digest
            of all auto-sent replies on VIP-tagged conversations from the past
            24h. Each entry has a one-click revert/apologize button.
          </p>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <button type="submit" className="ix-btn-primary">
            <Save size={14} />
            Save configuration
          </button>
        </div>
      </form>
    </BeithadyShell>
  );
}
