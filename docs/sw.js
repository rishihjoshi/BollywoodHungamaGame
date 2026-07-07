// Bump CACHE_NAME on every release so clients pick up fresh assets.
// Keep the trailing version in sync with APP_VERSION (app.js) and version.json.
const CACHE_NAME = 'bollywood-hungama-v9';

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './pabh.js',
  './pabh.css',
  './manifest.json',
  './version.json',
  './data/words.json',
  './data/pabh-data.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512.png',
  './images/AppIcon.png',
  './images/AppHeroImage.png',
  './images/KaunHaiGabbar_HeroImage.png',
  './images/PictureAbhiBakiHai_HeroImage.png'
];

self.addEventListener('install', event => {
  // NOTE: we intentionally do NOT call skipWaiting() here. When an updated
  // service worker is found it stays in the "waiting" state so the page can
  // show a "Refresh to update" prompt and let the user choose when to apply
  // it (see app.js). skipWaiting() is triggered on demand via a message.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page posts this when the user taps "Refresh" so the waiting worker
// activates immediately; the page then reloads on 'controllerchange'.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // version.json is the update signal — always try the network first so the
  // app compares against the freshly-deployed version, not a cached copy.
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else: cache-first, falling back to the network.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
