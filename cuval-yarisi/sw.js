// Çevrimdışı oynama: önce önbellek, yoksa ağ (indirilenler önbelleğe yazılır)
const CACHE = 'cuval-yarisi-v4';
const CORE = ['./', 'index.html', 'css/style.css', 'js/main.js', 'js/assets.js', 'js/audio.js', 'js/config.js',
  'js/fx.js', 'js/people.js', 'js/racer.js', 'js/world.js', 'js/characters.js', 'js/racerModel.js', 'js/proc/sdf.js', 'js/proc/shapes.js', 'js/proc/worker.js',
  'vendor/meshoptimizer/meshopt_simplifier.module.js', 'vendor/three/three.module.js',
  'vendor/three/addons/loaders/GLTFLoader.js', 'vendor/three/addons/loaders/RGBELoader.js',
  'vendor/three/addons/utils/BufferGeometryUtils.js', 'manifest.webmanifest', 'icons/icon.svg', 'assets/audio/tema.mp3'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
