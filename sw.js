// Kill stale caches from older PWA builds (they served outdated script.js).
const SW_VERSION = "ingush-phrasebook-v2-nocache";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request));
});
