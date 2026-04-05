/* Custom PWA helper worker.
 * Flutter build also generates flutter_service_worker.js.
 * Keep this file for explicit root-level registration requirements.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
