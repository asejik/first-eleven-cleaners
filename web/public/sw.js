// =================================================================
// FIRST ELEVEN CLEANERS — SERVICE WORKER (PWA)
// Cache-first for assets, Network-first for dynamic navigation
// =================================================================

// v2: stop caching private pages; activating v2 deletes v1 caches that may hold them (PR-28)
const CACHE_NAME = 'f11-cleaners-v2';

// Pages with personal or staff data: always from the network, never stored on the device
const PRIVATE_PATH_PREFIXES = [
  '/dashboard', '/track', '/claim', '/mission-control', '/staff', '/driver',
  '/portal', '/admin', '/auth', '/reset-password',
];
const isPrivatePath = (pathname) =>
  PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.png',
  '/icon.webp',
  '/icon-192.png',
  '/logo.png',
  '/logo.webp',
];

// Install Event — Pre-cache critical application shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('PWA Pre-cache non-fatal warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event — Purge stale cache versions and claim immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Strategic caching based on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Bypass non-GET requests and external third-party origins (e.g. Supabase, Stripe, Square)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // 2. Bypass API routes — Always fetch fresh network data
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. Static assets (JS, CSS, images, fonts) — Stale-While-Revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|woff2?|css|js)$/i)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const networkFetch = fetch(request).then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
    );
    return;
  }

  // 4a. Private pages — network only; offline shows the cached home page
  if (request.mode === 'navigate' && isPrivatePath(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // 4b. Public HTML Navigation Pages — Network-First with Offline Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return cached root page as offline fallback
          return caches.match('/');
        })
    );
  }
});
