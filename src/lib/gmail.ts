import { google } from 'googleapis';
import { decrypt } from './crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  // Phase: payables email reports. New OAuth flows will grant send; old
  // tokens without this scope throw 403 on sendMessage — the action
  // surfaces that to the UI so the user can reconnect.
  'https://www.googleapis.com/auth/gmail.send',
];

export function getOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

export function getAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getGmailClientFromRefresh(refreshTokenEncrypted: string) {
  const refresh_token = decrypt(refreshTokenEncrypted);
  const client = getOAuthClient();
  client.setCredentials({ refresh_token });
  const { credentials } = await client.refreshAccessToken();
  client.setCredentials(credentials);
  return google.gmail({ version: 'v1', auth: client });
}

export async function getAuthorizingEmail(accessToken: string): Promise<string> {
  const client = getOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress!;
}

export async function fetchLast24hMetadata(refreshTokenEncrypted: string) {
  const gmail = await getGmailClientFromRefresh(refreshTokenEncrypted);
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'newer_than:1d -category:promotions -in:spam -in:trash',
    maxResults: 100,
  });
  const messages = listRes.data.messages || [];
  const details = await Promise.all(
    messages.map(m =>
      gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      })
    )
  );
  return details.map(r => r.data);
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractBody(payload: any): { html?: string; text?: string } {
  const out: { html?: string; text?: string } = {};
  function walk(part: any) {
    if (!part) return;
    const mime = part.mimeType || '';
    const data = part.body?.data;
    if (data) {
      if (mime === 'text/html' && !out.html) out.html = decodeB64Url(data);
      else if (mime === 'text/plain' && !out.text) out.text = decodeB64Url(data);
    }
    for (const child of part.parts || []) walk(child);
  }
  walk(payload);
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function gmailDateString(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

export type GmailSearchOpts = {
  fromContains?: string;
  subjectContains?: string;
  toContains?: string;
  afterIso?: string;
  beforeIso?: string;
  maxResults?: number;
};

export async function searchMessages(
  refreshTokenEncrypted: string,
  opts: GmailSearchOpts
): Promise<{ id: string; threadId: string }[]> {
  const gmail = await getGmailClientFromRefresh(refreshTokenEncrypted);
  const parts: string[] = ['-in:spam', '-in:trash'];
  if (opts.fromContains) parts.push(`from:${opts.fromContains}`);
  if (opts.subjectContains) parts.push(`subject:${opts.subjectContains}`);
  if (opts.toContains) parts.push(`to:${opts.toContains}`);
  if (opts.afterIso) {
    const d = new Date(opts.afterIso);
    d.setUTCDate(d.getUTCDate() - 1);
    parts.push(`after:${gmailDateString(d)}`);
  }
  if (opts.beforeIso) {
    const d = new Date(opts.beforeIso);
    d.setUTCDate(d.getUTCDate() + 1);
    parts.push(`before:${gmailDateString(d)}`);
  }
  const q = parts.join(' ');

  const collected: { id: string; threadId: string }[] = [];
  const cap = opts.maxResults ?? 200;
  let pageToken: string | undefined;
  while (collected.length < cap) {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: Math.min(100, cap - collected.length),
      pageToken,
    });
    const msgs = res.data.messages || [];
    for (const m of msgs) {
      if (m.id && m.threadId) collected.push({ id: m.id, threadId: m.threadId });
    }
    pageToken = res.data.nextPageToken || undefined;
    if (!pageToken) break;
  }
  return collected;
}

export async function markMessagesAsRead(
  refreshTokenEncrypted: string,
  messageIds: string[]
): Promise<{ marked: number; errors: string[] }> {
  if (!messageIds.length) return { marked: 0, errors: [] };
  const gmail = await getGmailClientFromRefresh(refreshTokenEncrypted);
  const errors: string[] = [];
  let marked = 0;

  // Gmail batchModify accepts up to 1000 ids per call — chunk to be safe.
  const CHUNK = 1000;
  for (let i = 0; i < messageIds.length; i += CHUNK) {
    const chunk = messageIds.slice(i, i + CHUNK);
    try {
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: chunk,
          removeLabelIds: ['UNREAD'],
        },
      });
      marked += chunk.length;
    } catch (e: any) {
      // Fall back to per-message modify for this chunk so a single bad id
      // doesn't fail the whole batch. Serial to avoid rate-limit.
      for (const id of chunk) {
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });
          marked++;
        } catch (e2: any) {
          errors.push(`${id}: ${e2?.message || e2}`);
        }
      }
    }
  }
  return { marked, errors };
}

// RFC-2822-compliant HTML email send via Gmail API. Requires the
// gmail.send scope on the authorizing account. Callers catch the 403
// "insufficient scopes" error and surface a re-auth hint to the user.
export async function sendHtmlEmail(
  refreshTokenEncrypted: string,
  params: { to: string; subject: string; html: string; fromEmail?: string }
): Promise<{ id: string | null | undefined }> {
  const gmail = await getGmailClientFromRefresh(refreshTokenEncrypted);
  const from = params.fromEmail || 'me';
  // Build the MIME message. base64url encoding per Gmail API spec.
  const mime = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.html,
  ].join('\r\n');
  const raw = Buffer.from(mime, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  return { id: res.data.id };
}

// Encode non-ASCII subjects per RFC-2047 so Gmail renders them correctly.
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  const b64 = Buffer.from(s, 'utf-8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

// Multipart MIME helper for HTML email + a single PDF attachment.
// Used by the Beithady daily report to deliver the A4 PDF inline.
export async function sendHtmlEmailWithAttachment(
  refreshTokenEncrypted: string,
  params: {
    to: string;
    subject: string;
    html: string;
    fromEmail?: string;
    attachment: { filename: string; contentType: string; bytes: Buffer };
  }
): Promise<{ id: string | null | undefined }> {
  const gmail = await getGmailClientFromRefresh(refreshTokenEncrypted);
  const from = params.fromEmail || 'me';
  const boundary = '__beithady_pdf_boundary_' + Date.now().toString(36);

  // Quoted-printable encoding would be safer for HTML body, but Gmail
  // accepts 7bit + base64-attachment fine here. Body is pure ASCII /
  // UTF-8; we'll mark the part as utf-8 + base64 to avoid 8-bit-line-
  // length pitfalls.
  const htmlB64 = Buffer.from(params.html, 'utf-8').toString('base64');
  const attachB64 = params.attachment.bytes.toString('base64');
  // Split base64 into 76-char lines per RFC 2045 to keep MTAs happy.
  const wrap76 = (s: string): string => s.replace(/(.{76})/g, '$1\r\n');

  const mime = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(htmlB64),
    '',
    `--${boundary}`,
    `Content-Type: ${params.attachment.contentType}; name="${params.attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${params.attachment.filename}"`,
    '',
    wrap76(attachB64),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const raw = Buffer.from(mime, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  return { id: res.data.id };
}

export async function fetchEmailFull(
  refreshTokenEncrypted: string,
  gmailMessageId: string
): Promise<{ subject: string; from: string; bodyText: string; receivedIso: string | null }> {
  const gmail = await getGmailClientFromRefresh(refreshTokenEncrypted);
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMessageId,
    format: 'full',
  });
  const payload: any = res.data.payload || {};
  const headers = Object.fromEntries(
    (payload.headers || []).map((h: any) => [(h.name || '').toLowerCase(), h.value])
  );
  const { html, text } = extractBody(payload);
  const bodyText = text || (html ? htmlToText(html) : '');
  const internalMs = res.data.internalDate ? Number(res.data.internalDate) : NaN;
  const receivedIso = Number.isFinite(internalMs)
    ? new Date(internalMs).toISOString()
    : null;
  return {
    subject: headers.subject || '',
    from: headers.from || '',
    bodyText,
    receivedIso,
  };
}
