/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Hızlı açılış ve çevrimdışı okuma:
//  - Uygulama dosyaları (JS/CSS/simgeler) önbellekten anında gelir.
//  - Sayfalar önce ağdan istenir; ağ yoksa en son görülen hâli gösterilir.
//  - /api istekleri ve giriş (Cloudflare Access) yönlendirmeleri asla önbelleğe alınmaz.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const STATIC_CACHE = `eg-static-${version}`;
const PAGE_CACHE = 'eg-pages';
const STATIC_ASSETS = new Set([...build, ...files]);

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll([...STATIC_ASSETS]))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('eg-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;

  if (STATIC_ASSETS.has(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(req)));
    return;
  }

  // Sayfalar ve sayfa verileri: önce ağ, olmazsa önbellek
  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic' && !res.redirected) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<body style="font-family:system-ui;background:#0d1016;color:#eeebe4;padding:32px">' +
            '<h2>Çevrimdışısınız</h2><p>Bu sayfa daha önce açılmadığı için önbellekte yok. Bağlantı gelince yeniden deneyin.</p>',
          { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }
    })(),
  );
});
