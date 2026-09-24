/* Pencere service worker — uygulama kabuğunu önbelleğe alır, API/medya her zaman ağdan gelir. */
const VERSION = 'pencere-v1';
const SHELL = ['/', '/app.css', '/app.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/media') return;

  // Önce önbellek, arkada güncelle (stale-while-revalidate)
  const key = e.request.mode === 'navigate' ? '/' : e.request;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(key);
      const net = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
