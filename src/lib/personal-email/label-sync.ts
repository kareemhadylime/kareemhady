import { getGmailClientFromRefresh } from '@/lib/gmail';
import { CATEGORIES } from './categories';
import type { CategorySlug } from './types';
import { upsertLabelMapping, loadLabelMap, ALL_LIME_LABEL_NAMES } from './label-sync-db';

type Account = {
  id: string;
  email: string;
  oauth_refresh_token_encrypted: string;
};

// Ensure each enabled category has a Gmail label in this account.
// Idempotent: re-run after reconnect to repair any missing mappings.
export async function ensureLabelsForAccount(account: Account): Promise<void> {
  const gmail = await getGmailClientFromRefresh(account.oauth_refresh_token_encrypted);
  const existing = await gmail.users.labels.list({ userId: 'me' });
  const byName = new Map<string, string>();
  for (const l of existing.data.labels ?? []) {
    if (l.name && l.id) byName.set(l.name, l.id);
  }

  for (const cat of CATEGORIES) {
    const found = byName.get(cat.gmailLabelName);
    if (found) {
      await upsertLabelMapping(account.id, cat.slug, found);
      continue;
    }
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: cat.gmailLabelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    if (!created.data.id) throw new Error(`label_create_returned_no_id: ${cat.gmailLabelName}`);
    await upsertLabelMapping(account.id, cat.slug, created.data.id);
  }
}

export async function syncLabelChange(
  account: Account,
  gmailMessageId: string,
  oldCat: CategorySlug | null,
  newCat: CategorySlug,
): Promise<void> {
  if (oldCat === newCat) return;
  const map = await loadLabelMap(account.id);
  const addId = map[newCat];
  if (!addId) throw new Error(`no_label_for_category: ${newCat}`);
  const removeIds = oldCat && map[oldCat] ? [map[oldCat]!] : [];

  const gmail = await getGmailClientFromRefresh(account.oauth_refresh_token_encrypted);
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: [gmailMessageId],
      removeLabelIds: removeIds,
      addLabelIds: [addId],
    },
  });
}

// Removes every Lime/* label from every message that has one, and
// then deletes the labels themselves. Used by the disconnect flow.
export async function removeAllLimeLabels(account: Account): Promise<{ removed: number }> {
  const gmail = await getGmailClientFromRefresh(account.oauth_refresh_token_encrypted);
  const list = await gmail.users.labels.list({ userId: 'me' });
  const ours = (list.data.labels ?? []).filter(l => ALL_LIME_LABEL_NAMES.includes(l.name ?? ''));

  let removed = 0;
  for (const lab of ours) {
    if (!lab.id) continue;
    // Strip from messages — paginated, batchModify caps at 1000 ids per call.
    let pageToken: string | undefined;
    do {
      const msgs = await gmail.users.messages.list({
        userId: 'me', labelIds: [lab.id], maxResults: 500, pageToken,
      });
      const ids = (msgs.data.messages ?? []).map(m => m.id!).filter(Boolean);
      if (ids.length) {
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: { ids, removeLabelIds: [lab.id] },
        });
        removed += ids.length;
      }
      pageToken = msgs.data.nextPageToken ?? undefined;
    } while (pageToken);
    // Then drop the label itself.
    await gmail.users.labels.delete({ userId: 'me', id: lab.id });
  }
  return { removed };
}
