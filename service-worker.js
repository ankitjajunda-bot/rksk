// ============================================================
// OctaneFlow Service Worker
// Strategy:
//   - App Shell (HTML/CSS/JS/Icons) → Cache First, update in background
//   - Google Fonts                  → Cache First (stale-while-revalidate)
//   - Everything else               → Network First, fallback to cache
// ============================================================

const CACHE_NAME     = 'octaneflow-v10';
const FONT_CACHE     = 'octaneflow-fonts-v1';

// Detect base path automatically — works on localhost AND GitHub Pages /octaneflow/
const BASE = self.registration.scope.replace(/\/$/, '');

// Files that make up the app shell — always cached offline
const APP_SHELL = [
  BASE + '/index.html',
  BASE + '/app.js',
  BASE + '/styles.css',
  BASE + '/favicon.png',
  BASE + '/apple-touch-icon.png',
  BASE + '/manifest.json',
  BASE + '/service-worker.js',
  BASE + '/icons/icon-72x72.png',
  BASE + '/icons/icon-96x96.png',
  BASE + '/icons/icon-128x128.png',
  BASE + '/icons/icon-144x144.png',
  BASE + '/icons/icon-152x152.png',
  BASE + '/icons/icon-192x192.png',
  BASE + '/icons/icon-384x384.png',
  BASE + '/icons/icon-512x512.png',
];


// ---- Install: cache the app shell ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ---- Activate: clean up old caches ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())  // take control of all open tabs
  );
});

// ---- Fetch: serve from cache or network ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Fonts — stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event.request, FONT_CACHE));
    return;
  }

  // App Shell files — cache first
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else — network first, fallback to cache
  event.respondWith(networkFirst(event.request));
});

// ---- Push Notifications ----
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'OctaneFlow Alert', {
      body:    data.body    || '',
      icon:    '/icons/icon-192x192.png',
      badge:   '/icons/icon-72x72.png',
      tag:     data.tag     || 'octaneflow',
      data:    data.url     || '/',
      vibrate: [200, 100, 200],
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data || '/');
    })
  );
});

// ---- Background Sync (for offline data submissions) ----
self.addEventListener('sync', event => {
  if (event.tag === 'octaneflow-sync') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Placeholder — will be wired to pending queue when backend is added
  console.log('[SW] Background sync triggered');
}

// ============================================================
// Cache Strategy Helpers
// ============================================================

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource not cached', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}
