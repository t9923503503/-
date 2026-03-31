const CACHE_VERSION = 'volley-static-v65';
const CORE_ASSETS = [
  './',
  './index.html',
  './register.html',
  './admin.html',
  './admin-init.js',
  './admin.css',
  './shared/qr-gen.js',
  './profile.html',
  './player-card.html',
  './manifest.webmanifest',
  './icon.svg',
  './assets/favicon.png',
  './assets/app.css',
  './assets/js/main.js',
  './assets/js/init-helpers.js',
  './assets/js/ui/error-handler.js',
  './assets/js/state/app-state.js',
  './assets/js/domain/players.js',
  './assets/js/domain/tournaments.js',
  './assets/js/domain/timers.js',
  './assets/js/integrations/config.js',
  './assets/js/ui/stats-recalc.js',
  './assets/js/ui/players-controls.js',
  './assets/js/ui/roster-db-ui.js',
  './assets/js/ui/results-form.js',
  './assets/js/ui/tournament-form.js',
  './assets/js/ui/participants-modal.js',
  './assets/js/ui/tournament-details.js',
  './assets/js/ui/ipt-format.js',
  './assets/js/screens/ipt.js',
  './assets/js/registration.js',
  './assets/js/screens/core-render.js',
  './assets/js/screens/core-lifecycle.js',
  './assets/js/screens/core-navigation.js',
  './assets/js/screens/roster-format-launcher.js',
  './assets/js/screens/roster-edit.js',
  './assets/js/screens/roster-list.js',
  './assets/js/screens/courts.js',
  './assets/js/screens/components.js',
  './assets/js/screens/svod.js',
  './assets/js/screens/players.js',
  './assets/js/screens/home.js',
  './assets/js/screens/stats.js',
  './assets/js/integrations.js',
  './assets/js/ui/kotc-sync.js',
  './assets/js/ui/roster-auth.js',
  './assets/js/runtime.js',
  './formats/kotc/kotc.html',
  './formats/kotc/kotc.js',
  './formats/kotc/kotc-format.js',
  './formats/kotc/kotc.css',
  './formats/thai/thai.html',
  './formats/thai/thai-boot.js',
  './formats/thai/thai-format.js',
  './formats/thai/thai-roster.js',
  './formats/thai/thai.css',
  './formats/ipt/ipt.html',
  './formats/ipt/ipt-adapters.js',
  './formats/ipt/ipt-boot.js',
  './formats/ipt/ipt.css',
  './shared/export-utils.js',
  './shared/i18n.js',
  './shared/realtime.js',
  './shared/ratings.js',
  './locales/ru.json',
  './locales/en.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => {
          const path = url.pathname;
          if (path.includes('/formats/ipt/')) return caches.match('./formats/ipt/ipt.html');
          if (path.includes('/formats/thai/')) return caches.match('./formats/thai/thai.html');
          if (path.includes('/formats/kotc/')) return caches.match('./formats/kotc/kotc.html');
          return caches.match('./index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
