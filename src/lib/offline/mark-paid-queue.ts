'use client';

import { openQueueDb, dbPut, dbGetAll, dbDelete, STORE_QUEUE } from './idb';

// Offline queue for owner Mark-Paid actions. When the network is down,
// the form intercepts submission, writes here, and registers a Background
// Sync tag so the SW drains it once back online. Each entry has a
// UUID idempotency key so duplicate replays are dedup'd server-side.

export type QueuedMarkPaid = {
  id: string;             // UUIDv4 = idempotency key
  reservationId: string;
  amountEgp: number;
  method: string;
  note: string | null;
  enqueuedAt: number;
};

export async function enqueueMarkPaid(item: Omit<QueuedMarkPaid, 'id' | 'enqueuedAt'>): Promise<string> {
  const id = uuid();
  const row: QueuedMarkPaid = { ...item, id, enqueuedAt: Date.now() };
  try {
    const db = await openQueueDb();
    await dbPut(db, STORE_QUEUE, [row]);
  } catch {
    /* ignore — caller still surfaced the queue toast */
  }
  // Register Background Sync if supported. iOS Safari doesn't, so we
  // also drain on the next 'online' event in foreground (see useFlushOnOnline).
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ('sync' in reg) await (reg as any).sync.register('mark-paid-queue');
    } catch {
      /* fall back to foreground drain */
    }
  }
  return id;
}

export async function listQueued(): Promise<QueuedMarkPaid[]> {
  try {
    const db = await openQueueDb();
    return await dbGetAll<QueuedMarkPaid>(db, STORE_QUEUE);
  } catch {
    return [];
  }
}

export async function dropQueued(id: string): Promise<void> {
  try {
    const db = await openQueueDb();
    await dbDelete(db, STORE_QUEUE, id);
  } catch {
    /* ignore */
  }
}

// Foreground drain — runs on 'online' events in pages that opt-in.
// Mirrors what the SW does, so iOS PWAs (no Background Sync) still work.
export async function flushQueueForeground(): Promise<{ sent: number; failed: number }> {
  const items = await listQueued();
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const res = await fetch('/api/boat-rental/owner/mark-paid-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok || res.status === 409) {
        await dropQueued(item.id);
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers — non-cryptographically random but unique enough.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
