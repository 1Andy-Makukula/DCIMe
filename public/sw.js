// DCIMe service worker.
//
// v2 rewrite. The v1 worker could permanently break styling on a device:
// it cached ANY 200 response opportunistically, and Vercel's SPA fallback
// answers a missing hashed asset (e.g. /assets/index-OLDHASH.css, gone after
// a redeploy) with index.html at status 200 rather than a 404. That HTML got
// stored under the stylesheet's URL, the browser refused to apply HTML as CSS,
// and the app rendered permanently unstyled. Because CACHE_NAME never changed
// between deploys, the activate handler never purged it, so no amount of
// refreshing or redeploying cleared it.
//
// Bumping CACHE_VERSION below is the recovery mechanism: the activate handler
// deletes every cache whose name doesn't match, so affected devices self-heal
// as soon as this worker activates. Bump it any time you need to force one.

const CACHE_VERSION = 'v3';
const CACHE_NAME = `dcime-app-shell-${CACHE_VERSION}`;

// Only genuinely static, unhashed files belong here. Hashed build output is
// handled on demand by the fetch handler below.
const PRECACHE_ASSETS = [
  // '/Logo.jpg',  <- logo hidden, and the file is absent. cache.addAll() is
  // atomic: one 404 rejects the whole install, which silently killed offline
  // mode. Uncomment only alongside restoring public/Logo.jpg.
  '/manifest.json',
  '/template_commercial_logbook.xlsx',
  '/template_daily_canvas.xlsx'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Guards against storing a response under a URL whose type it doesn't match —
// the exact failure that poisoned v1. A stylesheet request must come back as
// CSS, a script as JavaScript, or we don't keep it.
function contentTypeMatchesRequest(request, response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  switch (request.destination) {
    case 'style':  return contentType.includes('text/css');
    case 'script': return contentType.includes('javascript');
    case 'image':  return contentType.startsWith('image/');
    case 'font':   return contentType.includes('font');
    default:       return false;
  }
}

function isCacheable(request, response) {
  return Boolean(response)
    && response.ok
    && response.type === 'basic'
    && contentTypeMatchesRequest(request, response);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept cross-origin traffic (Supabase REST, realtime, storage).
  if (url.origin !== self.location.origin) return;

  // Navigations are network-first: the HTML shell must always reference the
  // current build's hashed assets. Falling back to a stale shell would point
  // at files that no longer exist. Cache only as an offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first (build output is content-hashed, so a cache hit
  // is always correct for that URL), but validate what we serve as well as what
  // we store — a device poisoned by v1 may still hold a bad entry.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        if (contentTypeMatchesRequest(request, cached) || request.destination === '') {
          return cached;
        }
        // Poisoned entry: drop it and fall through to the network.
        caches.open(CACHE_NAME).then((cache) => cache.delete(request));
      }

      return fetch(request).then((response) => {
        if (isCacheable(request, response)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
