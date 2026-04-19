import { google } from 'googleapis';
import { decrypt } from './crypto';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

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
