import { google } from 'googleapis';
import { decrypt } from './crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
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

export async function markMessagesAsRead(
  refreshTokenEncrypted: string,
  messageIds: string[]
): Promise<{ marked: number; errors: string[] }> {
  if (!messageIds.length) return { marked: 0, errors: [] };
  const gmail = await getGmailClientFromRefresh(refreshTokenEncrypted);
  const errors: string[] = [];
  let marked = 0;
  await Promise.all(
    messageIds.map(async id => {
      try {
        await gmail.users.messages.modify({
          userId: 'me',
          id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
        marked++;
      } catch (e: any) {
        errors.push(`${id}: ${e?.message || e}`);
      }
    })
  );
  return { marked, errors };
}

export async function fetchEmailFull(
  refreshTokenEncrypted: string,
  gmailMessageId: string
): Promise<{ subject: string; from: string; bodyText: string }> {
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
  return {
    subject: headers.subject || '',
    from: headers.from || '',
    bodyText,
  };
}
