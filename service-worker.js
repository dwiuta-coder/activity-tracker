/* ============================================
   PULSE — Service Worker v2
   Cache-first for local, network-first for Firebase
   ============================================ */

const CACHE_NAME = 'pulse-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/dashboard.js',
  '/ai-summary.js',
  '/manifest.json'
];

// Domains that should always go to network (Firebase, auth, etc.)
const NETWORK_ONLY_DOMAINS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'apis.google.com',
  'www.googleapis.com',
  'firebasestorage.googleapis.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(() => {
        console.log('Caching skipped (likely file:// protocol)');
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // Network-only for Firebase and auth domains
  const url = new URL(request.url);
  if (NETWORK_ONLY_DOMAINS.some(d => url.hostname.includes(d))) {
    return; // Let the browser handle it normally
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;

        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, clone);
        });

        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
