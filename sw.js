/**
 * Service Worker for AutoX Event Tracker
 *
 * Strategy:
 *  - HTML navigation requests: network-only (never cached), so the app shell
 *    is always fresh.
 *  - JS/CSS/image assets: network-first with cache fallback for offline support.
 *    Vite fingerprints these filenames so cached copies are always correct.
 *  - Convex API calls: bypassed entirely (handled by Convex SDK).
 *
 * When a new SW is installed it immediately takes control (skipWaiting +
 * clients.claim), then posts SW_UPDATED so every open tab reloads and picks
 * up the latest code automatically.
 */

// autox-v0.0.0-1777302883180 is replaced at build time by the Vite plugin in vite.config.ts.
// During `vite dev` the plugin inserts a timestamp so every dev-server restart
// also gets a fresh cache key.
const CACHE_VERSION = 'autox-v0.0.0-1777302883180';

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', () => {
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(names.map((name) => name !== CACHE_VERSION && caches.delete(name)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) =>
          clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }))
        )
      )
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Convex API / WebSocket traffic
  if (url.hostname.includes('convex.cloud') || url.pathname.startsWith('/api/')) return;

  // HTML navigation: always network, fall back to cache only when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Static assets (JS/CSS/images): network-first, cache as offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) =>
          cached ||
          new Response('Offline - resource unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          })
        )
      )
  );
});

// ── Messages from the app ─────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
