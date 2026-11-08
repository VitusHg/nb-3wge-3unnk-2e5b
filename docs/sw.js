// Service Worker – Einsatztagebuch (statisch, GitHub Pages)
//
// Auf vitushg.github.io laufen mehrere Apps (z. B. RKTel) unter derselben
// Herkunft. Dieser Worker räumt deshalb NUR seine eigenen Caches
// (Präfix „etb-cache-“) auf und fasst fremde Caches nie an.
const CACHE_PREFIX = 'etb-cache-';
const CACHE_NAME = CACHE_PREFIX + 'v98'; // = APP_VERSION in app.js
// Fahrzeuggrafiken (fremde Adressen) dauerhaft auf dem Gerät – eigener Cache,
// der bei App-Updates NICHT geleert wird. Aufräumen übernimmt die App.
const ICON_CACHE = 'etb-icons';

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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

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

// Einstellung „Fahrzeuggrafiken offline speichern“ (von der App in etb-meta abgelegt)
async function iconsOffline() {
  try {
    const hit = await (await caches.open('etb-meta')).match('./__prefs');
    if (!hit) return true;
    const p = await hit.json();
    return p.iconsOffline !== false;
  } catch (_) { return true; }
}

// Liegt die Anfrage im Bereich dieser App (Scope)? Andere Apps derselben
// Domain (z. B. /rktel/) werden nicht angefasst.
function inScope(url) {
  return url.origin === self.location.origin && url.href.startsWith(self.registration.scope);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Fahrzeuggrafiken: zuerst vom Gerät, nur beim ersten Mal aus dem Netz
  if (event.request.destination === 'image' && !inScope(url) && /^https?:$/.test(url.protocol)) {
    event.respondWith(iconsOffline().then(async (keep) => {
      if (!keep) return fetch(event.request); // ausgelagert: nichts auf dem Gerät ablegen
      const cache = await caches.open(ICON_CACHE);
      const hit = await cache.match(event.request.url);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res && (res.ok || res.type === 'opaque')) cache.put(event.request.url, res.clone()).catch(() => {});
      return res;
    }).catch(() => fetch(event.request)));
    return;
  }
  // Übrige fremde Herkunft (Cloudflare Worker …) immer direkt ans Netz
  if (!inScope(url)) return;
  // Update-Prüfung und erzwungenes Neuladen: immer direkt vom Server
  if (url.pathname.endsWith('/sw.js') || event.request.cache === 'no-store' || event.request.cache === 'reload') return;

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

// ── Mitteilungen bei Dienstplan-Änderungen (vom Cloudflare Worker) ─────────
// iOS verlangt, dass jede Push-Nachricht sichtbar angezeigt wird.
self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch (_) { msg = { body: event.data ? event.data.text() : '' }; }
  const title = msg.title || 'Dienstplan geändert';
  event.waitUntil(Promise.all([bumpBadge(msg), self.registration.showNotification(title, {
    body: msg.body || '',
    tag: msg.tag || undefined,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    silent: !!msg.silent, // ohne Ton/Vibration (wenn das System es unterstützt)
    data: { url: msg.url || './#dienstplan', until: msg.until || 0, silent: !!msg.silent },
  })]));
});

// Zahl am App-Symbol: ungelesene Dienste (die App schreibt den genauen Stand,
// bei eingehenden Mitteilungen zählt der Service Worker weiter).
async function bumpBadge(msg) {
  try {
    const tag = String(msg.tag || '');
    if (tag === 'etb-test' || tag === 'etb-quick') return; // kein Dienstplan-Ereignis
    const keys = Array.isArray(msg.keys) ? msg.keys.map(String)
      : tag.startsWith('etb-') && tag !== 'etb-summary' ? [tag.slice(4)] : ['summary-' + Date.now()];
    const cache = await caches.open('etb-meta');
    const hit = await cache.match('./__badge');
    const cur = hit ? await hit.json() : { keys: [] };
    const set = new Set(cur.keys || []);
    keys.forEach((k) => set.add(k));
    const all = [...set];
    await cache.put('./__badge', new Response(JSON.stringify({ keys: all, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
    if (self.navigator.setAppBadge) await self.navigator.setAppBadge(all.length);
  } catch (_) { /* nur ein Zusatz */ }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || './#dienstplan', self.registration.scope).href;
  // Schnell-Einsatz: sofort die nächste Mitteilung bereitlegen, solange der Dienst läuft
  if (event.notification.tag === 'etb-quick' && data.until > Date.now()) {
    event.waitUntil(self.registration.showNotification(event.notification.title, {
      body: event.notification.body, tag: 'etb-quick', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
      silent: data.silent !== false, data,
    }).catch(() => {}));
  }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) {
      win.postMessage({ type: 'open-url', hash: new URL(target).hash || '#dienstplan' });
      return win.focus();
    }
    return self.clients.openWindow(target);
  })());
});
