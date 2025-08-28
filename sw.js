9// sw.js — EstimaPres PWA
// Coloca este archivo en la RAÍZ del sitio. Cambiá VERSION en cada deploy.
const VERSION = 'v1.3.0';
const CACHE_NAME = `estimapers-cache-${VERSION}`;
const APP_SHELL = [
  '/',               // SPA fallback
  '/index.html',
];

// --- utils
async function putInCache(req, resp) {
  const cache = await caches.open(CACHE_NAME);
  try { await cache.put(req, resp.clone()); } catch (_) {}
  return resp;
}
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) {
    // revalida en background
    fetch(req).then(r => putInCache(req, r)).catch(()=>{});
    return cached;
  }
  const resp = await fetch(req);
  return putInCache(req, resp);
}
async function networkFirst(req, fallbackUrl = '/index.html') {
  try {
    const resp = await fetch(req);
    return putInCache(req, resp);
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(fallbackUrl);
    return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// --- install
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

// --- activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // habilita navigation preload si está disponible
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch (_) {}
      }
      // limpia caches viejos
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// --- mensaje (para forzar update desde la app)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// --- fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Dejá pasar todo lo sensible a datos (Firestore / APIs) sin cachear
  const passthroughHosts = [
    'firestore.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'www.googleapis.com',
    'identitytoolkit.googleapis.com'
  ];
  if (passthroughHosts.includes(url.hostname)) return; // network-only

  // Navegación de SPA => network-first con fallback al index cacheado
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const preload = await event.preloadResponse;
      if (preload) return putInCache(req, preload);
      return networkFirst(req, '/index.html');
    })());
    return;
  }

  // Estáticos propios (misma origen): cache-first
  if (url.origin === self.location.origin &&
      /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Firebase CDN y Google Fonts: cache-first
  const cacheFirstHosts = [
    'www.gstatic.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];
  if (cacheFirstHosts.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Resto: stale-while-revalidate básico
  event.respondWith(cacheFirst(req));
});
```0
