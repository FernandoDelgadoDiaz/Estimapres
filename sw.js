// sw.js (service worker "neutral")
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
// No interceptamos nada: todo va directo a la red (sin caché)
self.addEventListener('fetch', () => {});