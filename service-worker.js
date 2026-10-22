// service-worker.js - caches every file on first load so the app works offline.
//
// Strategy:
//   - App files (HTML/CSS/JS/images): network-first, falling back to cache when offline.
//     This means you never need to bump CACHE when you edit a file - online users
//     always get the latest, offline users get the last successful version.
//   - Web fonts (typekit / Google Fonts): network-first + cache, same pattern.
//   - Bump CACHE once (this deploy) so devices install this new worker; after that
//     CACHE can stay the same across app edits.
const CACHE = "hirakana-v27";
const FILES = [
  "./", "index.html", "style.css", "data.js", "strokes.js", "drill.js", "app.js",
  "manifest.json", 
  "logo.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => { // delete old cache versions
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const host = new URL(e.request.url).hostname;

  // Fonts: fetch, cache the response, fall back to cache when offline.
  if (host.endsWith("typekit.net") || host.endsWith("googleapis.com") || host.endsWith("gstatic.com")) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App files: network-first, fall back to cache when the network fails.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});