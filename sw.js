/*
 * Service worker: makes the app installable and quick to reopen.
 *  - page: network first, cached copy when offline
 *  - our hashed assets, data and icons: cache first (they never change under the same URL)
 *  - OpenFreeMap tiles / fonts: stale-while-revalidate, trimmed to a few hundred entries
 * Live data (Nominatim, Open-Meteo) is never cached here.
 */
const APP = 'app-v1';
const TILES = 'tiles-v1';
const MAX_TILES = 600;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== APP && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    );
    return;
  }

  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
              const copy = res.clone();
              caches.open(APP).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (url.hostname === 'tiles.openfreemap.org') {
    e.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone()).then(() => trim(TILES, MAX_TILES));
            return res;
          })
          .catch(() => hit || Response.error());
        return hit || net;
      }),
    );
  }
});
