/* Service worker: guarda la aplicación para abrirla sin internet. */
const VERSION = 'asistencia-v2.3.1';
const ARCHIVOS = ['./', 'index.html', 'app.js', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'horario.html', 'horario.webmanifest'];
// Los iconos del horario se guardan aparte: si alguno falta, la actualización no se bloquea.
const OPCIONALES = ['horario-192.png', 'horario-512.png', 'horario-apple.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' evita copias viejas guardadas por el navegador o por GitHub al actualizar
  const fresco = u => new Request(u, { cache: 'reload' });
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(fresco)).then(() => Promise.all(OPCIONALES.map(u => c.add(fresco(u)).catch(() => {}))))));
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
