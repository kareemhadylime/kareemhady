import 'server-only';
import { getProviderEnabled } from '@/lib/credentials';

// Phase C.5 — WABA (Meta WhatsApp Business Cloud) send stub.
// Real send pipeline lands in Phase C.4. Until then this returns 501
// so the channel-switcher can offer the button as visible-but-disabled
// while keeping a fail-soft path if a user bypasses the gate.

export type SendWaCloudArgs = {
  beithadyConversationId: string;
  body: string;
  fileUrl?: string;
  fileName?: string;
  fileMime?: string;
  templateName?: string;
  templateLang?: string;
  templateVariables?: Record<string, string>;
  agentUserId: string | null;
  agentDisplayName?: string | null;
};

export type SendWaCloudResult =
  | { ok: true; messageId: string; providerMessageId: string }
  | { ok: false; status: number; error: string };

export async function sendWaCloudMessage(_args: SendWaCloudArgs): Promise<SendWaCloudResult> {
  const enabled = await getProviderEnabled('meta_waba');
  if (!enabled) return { ok: false, status: 501, error: 'waba_not_yet_provisioned' };
  return { ok: false, status: 501, error: 'waba_send_not_implemented_yet' };
}

export async function isWaCloudReady(): Promise<boolean> {
  return getProviderEnabled('meta_waba');
}
