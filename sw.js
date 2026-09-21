/* Marcapáginas — service worker
   Guarda la app en el dispositivo para que abra sin internet.
   Estrategia: primero lo guardado, y se actualiza en segundo plano
   (los cambios se ven en la siguiente apertura). */
const CACHE = 'marcapaginas-v1';   // súbele el número al publicar cambios grandes
const FONTS = 'marcapaginas-fuentes';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(req, cacheName, fallbackUrl) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || (fallbackUrl ? cache.match(fallbackUrl) : undefined));
      return hit ? { hit, network } : { network };
    })
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  e.respondWith(
    staleWhileRevalidate(req, isFont ? FONTS : CACHE, req.mode === 'navigate' ? './index.html' : null)
      .then(({ hit, network }) => {
        if (hit) { e.waitUntil(network); return hit; }
        return network;
      })
  );
});
