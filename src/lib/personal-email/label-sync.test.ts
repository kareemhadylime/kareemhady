import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  labelsList, labelsCreate, messagesBatchModify, messagesList, messagesGet,
  upsertLabel, fetchLabels,
} = vi.hoisted(() => ({
  labelsList: vi.fn(),
  labelsCreate: vi.fn(),
  messagesBatchModify: vi.fn(),
  messagesList: vi.fn(),
  messagesGet: vi.fn(),
  upsertLabel: vi.fn(),
  fetchLabels: vi.fn(),
}));

vi.mock('@/lib/gmail', async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    getGmailClientFromRefresh: vi.fn(async () => ({
      users: {
        labels: { list: labelsList, create: labelsCreate },
        messages: { batchModify: messagesBatchModify, list: messagesList, get: messagesGet },
      },
    })),
  };
});

vi.mock('./label-sync-db', () => ({
  upsertLabelMapping: upsertLabel,
  loadLabelMap: fetchLabels,
  ALL_LIME_LABEL_NAMES: [
    'Lime/ActionRequired','Lime/Security','Lime/Travel','Lime/Bills','Lime/Personal',
    'Lime/Newsletters','Lime/Notifications','Lime/Promotions','Lime/Spam',
  ],
}));

import { ensureLabelsForAccount, syncLabelChange } from './label-sync';

const fakeAccount = {
  id: 'acc-1',
  email: 'a@b.com',
  oauth_refresh_token_encrypted: 'enc',
};

beforeEach(() => {
  labelsList.mockReset(); labelsCreate.mockReset();
  messagesBatchModify.mockReset();
  upsertLabel.mockReset(); fetchLabels.mockReset();
});

describe('ensureLabelsForAccount', () => {
  it('creates a Lime/* label when missing', async () => {
    labelsList.mockResolvedValue({ data: { labels: [] } });
    labelsCreate.mockResolvedValue({ data: { id: 'Label_42', name: 'Lime/ActionRequired' } });
    await ensureLabelsForAccount(fakeAccount as any);
    expect(labelsCreate).toHaveBeenCalled();
    expect(upsertLabel).toHaveBeenCalledWith('acc-1', 'action_required', 'Label_42');
  });

  it('reuses an existing Lime/* label (idempotent)', async () => {
    // Seed every Lime/* label currently in CATEGORIES so the
    // idempotency test reflects a fully-provisioned account.
    labelsList.mockResolvedValue({
      data: { labels: [
        { id: 'Label_99',   name: 'Lime/ActionRequired' },
        { id: 'Label_100',  name: 'Lime/Security' },
        { id: 'Label_101',  name: 'Lime/Travel' },
        { id: 'Label_BANK', name: 'Lime/Banking' },
        { id: 'Label_102',  name: 'Lime/Bills' },
        { id: 'Label_103',  name: 'Lime/Personal' },
        { id: 'Label_BH',   name: 'Lime/Beithady' },
        { id: 'Label_FMP',  name: 'Lime/FMPlus' },
        { id: 'Label_KIKA', name: 'Lime/KIKA' },
        { id: 'Label_FB',   name: 'Lime/Facebook' },
        { id: 'Label_104',  name: 'Lime/Newsletters' },
        { id: 'Label_105',  name: 'Lime/Notifications' },
        { id: 'Label_106',  name: 'Lime/Promotions' },
        { id: 'Label_107',  name: 'Lime/Spam' },
      ] },
    });
    await ensureLabelsForAccount(fakeAccount as any);
    expect(labelsCreate).not.toHaveBeenCalled();
    expect(upsertLabel).toHaveBeenCalledWith('acc-1', 'action_required', 'Label_99');
  });
});

describe('syncLabelChange', () => {
  it('removes old + adds new in one batchModify', async () => {
    fetchLabels.mockResolvedValue({
      action_required: 'Label_AR',
      personal: 'Label_P',
    });
    await syncLabelChange(fakeAccount as any, 'msg-1', 'action_required', 'personal');
    expect(messagesBatchModify).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        ids: ['msg-1'],
        removeLabelIds: ['Label_AR'],
        addLabelIds: ['Label_P'],
      }),
    }));
  });

  it('skips when categories are equal', async () => {
    await syncLabelChange(fakeAccount as any, 'msg-1', 'personal', 'personal');
    expect(messagesBatchModify).not.toHaveBeenCalled();
  });
});
