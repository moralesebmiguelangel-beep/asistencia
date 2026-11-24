/* Service worker: guarda la aplicación para abrirla sin internet. */
const VERSION = 'asistencia-v1.1.0';
const ARCHIVOS = ['./', 'index.html', 'app.js', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'horario.html', 'horario.webmanifest', 'icons/horario-192.png', 'icons/horario-512.png', 'icons/horario-apple.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'activar') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // la sincronización con Google no pasa por la caché
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
