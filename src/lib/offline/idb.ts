'use client';

// Tiny IndexedDB wrapper used by the offline cache + Mark-Paid queue.
// No dependency — keeps bundle size minimal. Two tiny stores live in
// the 'lime-app' database: 'bookings' (cached read data) and 'queue'
// (pending Mark-Paid actions). The queue store is also opened from
// public/sw.js with the same name so SW background sync can drain it.

const DB_NAME_APP = 'lime-app';
const DB_VERSION_APP = 1;
const DB_NAME_QUEUE = 'lime-mark-paid-queue';
const DB_VERSION_QUEUE = 1;

export const STORE_BOOKINGS = 'bookings';
export const STORE_QUEUE = 'queue';

function openDb(name: string, version: number, stores: string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-idb'));
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of stores) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openAppDb(): Promise<IDBDatabase> {
  return openDb(DB_NAME_APP, DB_VERSION_APP, [STORE_BOOKINGS]);
}

export function openQueueDb(): Promise<IDBDatabase> {
  return openDb(DB_NAME_QUEUE, DB_VERSION_QUEUE, [STORE_QUEUE]);
}

export function dbPut<T extends { id: string | number }>(
  db: IDBDatabase,
  store: string,
  rows: T[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    for (const r of rows) s.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function dbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => resolve((r.result as T[]) || []);
    r.onerror = () => resolve([]);
  });
}

export function dbDelete(db: IDBDatabase, store: string, id: string | number): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function dbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
