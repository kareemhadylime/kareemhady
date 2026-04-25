/*
 * Service worker for the Lime app (whole-app scope).
 *
 *   - Network-first for HTML navigations, falling back to /offline.html
 *     when offline.
 *   - Cache-first for /_next/static/* (immutable, hashed URLs) and our
 *     own /icons/* + /manifest.webmanifest.
 *   - /api/* is always passed through to the network. The Mark-Paid
 *     offline queue uses Background Sync (replay endpoint) — never
 *     cached responses.
 *   - skipWaiting + clients.claim so updates roll out on next page load.
 *
 * Bump CACHE_VERSION manually when this file changes — old caches are
 * dropped on activation.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `lime-static-${CACHE_VERSION}`;
const HTML_CACHE = `lime-html-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  '/offline.html',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/favicon.svg',
  '/manifest.webmanifest',
];

const QUEUE_DB = 'lime-mark-paid-queue';
const QUEUE_STORE = 'queue';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== STATIC_CACHE && n !== HTML_CACHE)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never intercept API routes — let the network handle, success or fail.
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  // Cache-first for hashed Next.js static assets (immutable).
  if (sameOrigin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Cache-first for our manifest + icons.
  if (
    sameOrigin &&
    (url.pathname.startsWith('/icons/') ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/favicon.ico')
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Cross-origin (Supabase Storage signed URLs etc.) — default fetch, no caching.
  if (!sameOrigin) return;

  // Navigation / HTML — network-first, fallback to offline page.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstHtml(req));
    return;
  }

  // Anything else — try network, fall back to cache (best-effort).
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    // No fallback for static assets.
    throw e;
  }
}

async function networkFirstHtml(req) {
  const htmlCache = await caches.open(HTML_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) htmlCache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await htmlCache.match(req);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response(
      '<h1>Offline</h1><p>You are offline and this page isn\'t cached.</p>',
      { headers: { 'Content-Type': 'text/html' }, status: 503 }
    );
  }
}

// ---- Background Sync queue replay ----
//
// The client-side queue (lib/offline/mark-paid-queue.ts) writes pending
// requests to IndexedDB store 'lime-mark-paid-queue'.queue and registers
// a sync tag. When the browser fires the sync, we replay each queued
// request against /api/boat-rental/owner/mark-paid-replay with its
// idempotency key. Server-side dedup ensures double-fires are safe.

self.addEventListener('sync', (event) => {
  if (event.tag === 'mark-paid-queue') {
    event.waitUntil(drainMarkPaidQueue());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'mark-paid-flush') {
    event.waitUntil(drainMarkPaidQueue());
  }
});

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function drainMarkPaidQueue() {
  let db;
  try {
    db = await openQueueDB();
  } catch {
    return;
  }
  const items = await new Promise((resolve) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });

  for (const item of items) {
    try {
      const res = await fetch('/api/boat-rental/owner/mark-paid-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok || res.status === 409 /* already exists / idempotency match */) {
        await new Promise((resolve) => {
          const tx = db.transaction(QUEUE_STORE, 'readwrite');
          tx.objectStore(QUEUE_STORE).delete(item.id);
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => resolve(undefined);
        });
      }
    } catch {
      // Network error — leave in queue, sync will retry.
    }
  }
}
