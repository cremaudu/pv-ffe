// Coquille hors ligne : réseau d'abord, cache en secours (les données API ne sont pas mises en cache ici).
const C = 'pv-ffe-v2';
const SHELL = ['/', '/app.js', '/config.js', '/style.css', '/manifest.webmanifest', '/icon.svg', '/logo.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(C).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
