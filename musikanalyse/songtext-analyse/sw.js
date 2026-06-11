// Service Worker – macht die Songtext-Analyse als Web-App installierbar und
// die eigenen Dateien offline verfügbar. Fremde Abrufe (genius.com / Vermittler)
// werden NICHT abgefangen, damit die Live-Suche normal funktioniert.

const CACHE = 'songtext-analyse-v1';
const DATEIEN = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Nur eigene App-Dateien (gleiche Herkunft, GET) bedienen – alles andere
  // (genius.com, Vermittler-Dienste) läuft unverändert übers Netz.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((treffer) => treffer || fetch(req).then((resp) => {
      const kopie = resp.clone();
      caches.open(CACHE).then((c) => c.put(req, kopie)).catch(() => {});
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
