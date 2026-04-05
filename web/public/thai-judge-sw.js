const swUrl = new URL(self.location.href);
const pin = swUrl.searchParams.get('pin') || '';
const shellPath = pin ? `/court/${encodeURIComponent(pin)}` : '/court';
const cacheName = `thai-judge-v2-${pin || 'global'}`;
const precacheUrls = [
  shellPath,
  `${shellPath}/manifest.webmanifest`,
  '/kotc/assets/logo_lp_192.png',
  '/kotc/assets/logo_lp_512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(precacheUrls))
      .catch(() => null),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('thai-judge-') && key !== cacheName)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

async function networkFirst(request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cache.match(request);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Только shell + manifest. Не перехватываем /_next/static/* (CSS/JS Next) — на iPad/WebKit
  // staleWhileRevalidate давал устаревший/битый кэш и «страница без стилей».
  if (url.pathname === shellPath || url.pathname === `${shellPath}/manifest.webmanifest`) {
    event.respondWith(networkFirst(request));
  }
});
