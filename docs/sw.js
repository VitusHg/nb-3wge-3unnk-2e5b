// Service Worker – Einsatztagebuch (statisch, GitHub Pages)
//
// Auf vitushg.github.io laufen mehrere Apps (z. B. RKTel) unter derselben
// Herkunft. Dieser Worker räumt deshalb NUR seine eigenen Caches
// (Präfix „etb-cache-“) auf und fasst fremde Caches nie an.
const CACHE_PREFIX = 'etb-cache-';
const CACHE_NAME = CACHE_PREFIX + 'v21';

// Alle Pfade relativ → funktioniert unter /<repo>/ genauso wie unter /
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './vendor/ical.min.js',
  './vendor/rk-dienstplan.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Antwort aus dem Netz mit Zeitlimit – bei schlechtem Empfang nicht ewig warten
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

// Liegt die Anfrage im Bereich dieser App (Scope)? Andere Apps derselben
// Domain (z. B. /rktel/) werden nicht angefasst.
function inScope(url) {
  return url.origin === self.location.origin && url.href.startsWith(self.registration.scope);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Fremde Herkunft (Cloudflare Worker, Fahrzeug-Icons …) immer direkt ans Netz
  if (!inScope(url)) return;

  // Seitenaufruf: Netzwerk zuerst mit kurzem Zeitlimit (Updates kommen an),
  // offline bzw. im Funkloch sofort aus dem Cache.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetchWithTimeout(event.request, 3000)
          .then((res) => {
            if (res && res.ok) cache.put('./index.html', res.clone());
            return res;
          })
          .catch(() => cache.match('./index.html').then((c) => c || cache.match('./')))
      )
    );
    return;
  }

  // App-Dateien: Stale-while-revalidate – sofort aus dem Cache, im
  // Hintergrund aktualisieren.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request, { ignoreSearch: true }).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            if (res && res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached || Response.error());
        if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
        return network;
      })
    )
  );
});
