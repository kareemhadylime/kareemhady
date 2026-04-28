import 'server-only';
import { getCredential, getProviderEnabled } from '../credentials';

// Shared Green-API WhatsApp client for Lime. Reads credentials from
// integration_credentials (provider='green') with env-var fallback —
// the boat-rental module is the first consumer, Beithady guest
// messaging can adopt the same util when ready.
//
// Green-API is a session-based unofficial WhatsApp gateway:
//   POST {apiUrl}/waInstance{idInstance}/sendMessage/{apiTokenInstance}
//   body: { chatId: '{digits}@c.us' | '{digits}@g.us', message: '...' }
//   resp: { idMessage: '...' }
// No webhook signing, no message templates. Failures don't throw —
// callers should treat delivery as best-effort and log on the
// notifications row for admin visibility.

export type SendWhatsAppInput = {
  to: string;          // digits only, E.164 without '+': '201234567890'
  message: string;     // plain text, newlines OK; no markdown rendering
  // Optional: route to group chat instead of 1-1
  groupId?: string;
};

export type SendWhatsAppResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; disabled?: boolean };

function normalizePhone(raw: string): string {
  // Green-API wants digits only. Strip +, spaces, dashes, parens.
  return (raw || '').replace(/[^0-9]/g, '');
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const enabled = await getProviderEnabled('green');
  if (!enabled) return { ok: false, error: 'green_api_disabled', disabled: true };

  const [apiUrl, idInstance, apiToken] = await Promise.all([
    getCredential('green', 'apiUrl'),
    getCredential('green', 'idInstance'),
    getCredential('green', 'apiTokenInstance'),
  ]);
  if (!apiUrl || !idInstance || !apiToken) {
    return { ok: false, error: 'green_api_not_configured', disabled: true };
  }

  const chatId = input.groupId
    ? `${normalizePhone(input.groupId)}@g.us`
    : `${normalizePhone(input.to)}@c.us`;

  const url = `${apiUrl.replace(/\/$/, '')}/waInstance${idInstance}/sendMessage/${apiToken}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: input.message }),
      // Green-API can be slow; cap at 15s so we don't block a request too long.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `http_${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { idMessage?: string };
    if (!json.idMessage) return { ok: false, error: 'no_message_id_in_response' };
    return { ok: true, providerMessageId: json.idMessage };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function isGreenApiPhoneValid(phone: string): boolean {
  const digits = normalizePhone(phone);
  // Minimum: country code + national number (~9 digits), max ~15 per E.164.
  return digits.length >= 9 && digits.length <= 15;
}

// ---- Phase C.3 extensions: media + voice + status -----------------

async function getGreenCreds(): Promise<
  | { ok: true; apiUrl: string; idInstance: string; apiToken: string }
  | { ok: false; error: string; disabled?: boolean }
> {
  const enabled = await getProviderEnabled('green');
  if (!enabled) return { ok: false, error: 'green_api_disabled', disabled: true };
  const [apiUrl, idInstance, apiToken] = await Promise.all([
    getCredential('green', 'apiUrl'),
    getCredential('green', 'idInstance'),
    getCredential('green', 'apiTokenInstance'),
  ]);
  if (!apiUrl || !idInstance || !apiToken) {
    return { ok: false, error: 'green_api_not_configured', disabled: true };
  }
  return { ok: true, apiUrl, idInstance, apiToken };
}

export type SendFileInput = {
  to: string;
  fileUrl: string;
  fileName: string;
  caption?: string;
};

// Sends any media (image/audio/video/document) to a WhatsApp number
// via Green-API's sendFileByUrl endpoint. Voice notes use this same
// endpoint with an audio/ogg URL — Green-API auto-detects voice mode
// when the file extension or mime hints OGG/Opus.
export async function sendWhatsAppFile(input: SendFileInput): Promise<SendWhatsAppResult> {
  const creds = await getGreenCreds();
  if (!creds.ok) return creds;
  const chatId = `${normalizePhone(input.to)}@c.us`;
  const url = `${creds.apiUrl.replace(/\/$/, '')}/waInstance${creds.idInstance}/sendFileByUrl/${creds.apiToken}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        urlFile: input.fileUrl,
        fileName: input.fileName,
        caption: input.caption || '',
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `http_${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { idMessage?: string };
    if (!json.idMessage) return { ok: false, error: 'no_message_id_in_response' };
    return { ok: true, providerMessageId: json.idMessage };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// Optional helper: returns Green-API instance state. Used by the
// settings card on /beithady/communication/wa-casual to show
// online/offline status without round-tripping a real send.
export async function getGreenInstanceState(): Promise<
  | { ok: true; stateInstance: string; raw: unknown }
  | { ok: false; error: string }
> {
  const creds = await getGreenCreds();
  if (!creds.ok) return { ok: false, error: creds.error };
  const url = `${creds.apiUrl.replace(/\/$/, '')}/waInstance${creds.idInstance}/getStateInstance/${creds.apiToken}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const json = (await res.json().catch(() => ({}))) as { stateInstance?: string };
    return { ok: true, stateInstance: json.stateInstance || 'unknown', raw: json };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// Set up the inbound webhook by storing a per-tenant slug + the URL on
// Green-API's side. Called from the admin Settings/Integrations page
// after the user saves credentials. Idempotent.
export async function configureGreenInboundWebhook(webhookUrl: string): Promise<
  | { ok: true; raw: unknown }
  | { ok: false; error: string }
> {
  const creds = await getGreenCreds();
  if (!creds.ok) return { ok: false, error: creds.error };
  const url = `${creds.apiUrl.replace(/\/$/, '')}/waInstance${creds.idInstance}/setSettings/${creds.apiToken}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl,
        incomingWebhook: 'yes',
        outgoingWebhook: 'yes',
        outgoingMessageWebhook: 'yes',
        outgoingAPIMessageWebhook: 'yes',
        stateWebhook: 'yes',
        statusInstanceWebhook: 'yes',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const json = await res.json().catch(() => ({}));
    return { ok: true, raw: json };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
