/* EstimaPres SW v6 – limpio y estable */
const CACHE_NAME = 'estimapres-v6';
const APP_SHELL = [
  '/',               // raíz
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico'
];

/* Helpers */
async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreVary: true, ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  const cache = await caches.open(CACHE_NAME);
  cache.put(req, res.clone()).catch(()=>{});
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone()).catch(()=>{});
    return res;
  } catch (e) {
    const cached = await caches.match(req, { ignoreVary: true, ignoreSearch: true });
    if (cached) return cached;
    // Si es navegación y no hay red, devolvemos el shell
    if (req.mode === 'navigate') return caches.match('/index.html');
    throw e;
  }
}

/* Install */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* Activate */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
      );
      await self.clients.claim();
    })()
  );
});

/* Fetch */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // No interceptar páginas especiales
  if (url.protocol === 'chrome-extension:' || url.origin === 'null') return;

  // Rutas propias: cache-first (HTML/CSS/JS/imágenes)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Google Fonts: cache-first
  const cacheFirstHosts = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
  if (cacheFirstHosts.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Servicios de Firebase: network-first para no servir datos viejos
  const networkFirstHosts = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebaseinstallations.googleapis.com'
  ];
  if (networkFirstHosts.includes(url.hostname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Resto: cache-first por defecto
  event.respondWith(cacheFirst(req));
});

/* Mensaje opcional para forzar update desde la app */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
