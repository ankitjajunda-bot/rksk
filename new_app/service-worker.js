// ============================================================================
// service-worker.js — Offline Caching & Background Sync
// ============================================================================

const CACHE_NAME = 'octaneflow-v2-cache-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/core/db.js',
  './js/core/error_tracker.js',
  './js/core/sanitize.js',
  './js/core/sync_queue.js',
  './js/engine/math_engine.js',
  './js/engine/stock_engine.js',
  './js/engine/rebuild_engine.js',
  './js/engine/ledger_engine.js',
  './js/auth/auth.js',
  './js/auth/mfa.js',
  './js/sync/supabase.js',
  './js/sync/sync_manager.js',
  './js/utils/helpers.js',
  './js/utils/validators.js',
  './js/utils/recovery.js',
  './js/ui/dashboard.js',
  './js/ui/ledger.js',
  './js/ui/approvals.js',
  './js/ui/employee.js',
  './js/ui/settings.js',
  './manifest.json'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Cache-first with network fallback
self.addEventListener('fetch', (event) => {
  // Skip Supabase API requests (always go to network)
  if (event.request.url.includes('supabase.co') || event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cache hit but also update cache in background
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse;
      }

      // No cache hit: go to network
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Background Sync (when supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC' });
        });
      })
    );
  }
});
