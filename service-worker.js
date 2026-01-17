// Simple service worker: cache shell and fallback
const CACHE = "planttrack-shell-v2";
const urls = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/ai.js",
  "/notion.js",
  "/storage.js",
  "/ui.js",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(urls)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // Clean old caches
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  
  // Network-first for API calls, cache-first for static assets
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
