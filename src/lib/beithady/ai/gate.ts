import 'server-only';
import { HIGH_RISK_CLASSIFICATIONS, type Classification } from './classify';

// Decision rule for the AI auto-reply pipeline. Reads the live
// thresholds from beithady_settings (Phase A seeds them) and per-
// conversation kill-switch (Phase C.2 wires it). VIP/loyalty awareness
// added Phase E.

export type GateInput = {
  classification: Classification;
  confidence: number;
  channel: 'guesty' | 'wa_cloud' | 'wa_casual';
  threshold: number;            // from beithady_settings.ai_confidence_threshold
  globalEnabled: boolean;       // beithady_settings.ai_auto_reply_enabled
  killSwitchOn: boolean;        // beithady_conversations.ai_kill_switch
  guestVip: boolean;
  guestLoyaltyTier: string | null;
  hasSuggestedReply: boolean;
};

export type Decision =
  | 'auto_sent'                // will be sent right now
  | 'suggested_only'           // staged for agent review
  | 'killed_by_switch'         // per-conversation kill-switch
  | 'killed_low_confidence'    // below threshold
  | 'killed_vip_review'        // VIP guest, agent must approve
  | 'killed_disabled'          // global master switch off
  | 'killed_classification'    // high-risk class never auto-sends
  | 'error';                   // pipeline failure (matches DB constraint)

export function gateDecision(input: GateInput): { decision: Decision; reason: string } {
  if (!input.hasSuggestedReply) {
    return { decision: 'suggested_only', reason: 'no_suggested_reply' };
  }
  if (!input.globalEnabled) {
    return { decision: 'killed_disabled', reason: 'global_kill_switch' };
  }
  if (input.killSwitchOn) {
    return { decision: 'killed_by_switch', reason: 'conversation_kill_switch' };
  }
  // Auto-send is OFF for Guesty Airbnb threads by default — Airbnb
  // policy risk on automated content is too high. Comment notes this
  // as a Plan v0.3 §C.4 decision; opt-in per-conversation later.
  if (input.channel === 'guesty') {
    return { decision: 'suggested_only', reason: 'guesty_default_suggest_only' };
  }
  if (HIGH_RISK_CLASSIFICATIONS.has(input.classification)) {
    return { decision: 'killed_classification', reason: `high_risk_${input.classification}` };
  }
  if (input.guestVip || input.guestLoyaltyTier === 'platinum') {
    // Platinum/VIP threads auto-send if confidence is very high (≥ 0.90)
    // AND classification is not high-risk (covered above), but also
    // appear in the daily VIP digest for admin oversight.
    if (input.confidence < Math.max(input.threshold, 0.9)) {
      return { decision: 'killed_vip_review', reason: 'vip_threshold_not_met' };
    }
  }
  if (input.confidence < input.threshold) {
    return { decision: 'killed_low_confidence', reason: `below_${input.threshold}` };
  }
  return { decision: 'auto_sent', reason: 'all_gates_passed' };
}
