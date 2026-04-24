/**
 * Service Worker for AutoX Event Tracker
 * 
 * Enables offline functionality and PWA features.
 * Caches essential app resources for offline access.
 */

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = 'autox-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/index.css',
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => {
        console.log('[Service Worker] Caching essential resources');
        return cache.addAll(CACHE_URLS).catch(() => {
          // Ignore errors - some URLs may not exist during development
          console.log('[Service Worker] Some resources could not be cached');
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_VERSION) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network-first strategy: try network, fallback to cache if offline
self.addEventListener('fetch', (event: FetchEvent) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API calls to Convex - always fetch from network
  if (event.request.url.includes('/api/') || event.request.url.includes('convex.cloud')) {
    return;
  }

  event.respondWith(
    // Try to fetch from network first
    fetch(event.request)
      .then((response) => {
        // Don't cache non-2xx responses
        if (!response || response.status !== 200) {
          return response;
        }

        // Clone response before caching
        const responseToCache = response.clone();

        // Cache successful responses (except for Convex)
        if (!event.request.url.includes('convex.cloud')) {
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      })
      .catch(() => {
        // Network request failed - try cache
        console.log('[Service Worker] Network request failed, trying cache for:', event.request.url);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[Service Worker] Returning cached version:', event.request.url);
            return cachedResponse;
          }

          // If offline and no cache, return offline page or empty response
          console.log('[Service Worker] Offline and no cache available for:', event.request.url);
          return new Response('Offline - this resource is not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain',
            }),
          });
        });
      })
  );
});

// Background Sync - sync timing events when back online
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-timing-events') {
    event.waitUntil(syncTimingEvents());
  }
});

async function syncTimingEvents() {
  try {
    console.log('[Service Worker] Syncing timing events');
    // This will be triggered by the app when it detects connectivity
    // The app will handle the actual sync logic
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_TIMING_EVENTS',
      });
    });
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
  }
}

// Message handler for client-server communication
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
