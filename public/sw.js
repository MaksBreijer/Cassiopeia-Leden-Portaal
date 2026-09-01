const CACHE_NAME = "cassiopeia-pwa-v4";
const APP_SHELL = [
  "/",
  "/offline.html",
  "/offline.css?v=20260831-logo",
  "/manifest.webmanifest",
  "/styles.css?v=20260901-agenda",
  "/app.js?v=20260901-agenda",
  "/assets/app-icon-192.png?v=20260831-logo",
  "/assets/app-icon-512.png?v=20260831-logo",
  "/assets/cassiopeia-embleem.png?v=20260831-logo",
  "/assets/lustrum-patroon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || caches.match("/offline.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkResponse = fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
      return cached || networkResponse;
    })
  );
});
