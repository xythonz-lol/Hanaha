// service-worker.js - caches every file on first load so the app works offline.
//
// Strategy:
//   - App files (HTML/CSS/JS/images): network-first, falling back to cache when offline.
//     This means you never need to bump CACHE when you edit a file - online users
//     always get the latest, offline users get the last successful version.
//   - Web fonts (typekit / Google Fonts): network-first + cache, same pattern.
//   - Bump CACHE once (this deploy) so devices install this new worker; after that
//     CACHE can stay the same across app edits.
const CACHE = "hirakana-v29";
const FILES = [
  "./", "index.html", "style.css", "data.js", "strokes.js", "drill.js", "app.js",
  "manifest.json", 
  "logo.svg",
  "pronunciation/a.mp3", "pronunciation/chi.mp3", "pronunciation/e.mp3", "pronunciation/fu.mp3",
  "pronunciation/ha.mp3", "pronunciation/he.mp3", "pronunciation/hi.mp3", "pronunciation/ho.mp3",
  "pronunciation/i.mp3", "pronunciation/ka.mp3", "pronunciation/ke.mp3", "pronunciation/ki.mp3",
  "pronunciation/ko.mp3", "pronunciation/ku.mp3", "pronunciation/ma.mp3", "pronunciation/me.mp3",
  "pronunciation/mi.mp3", "pronunciation/mo.mp3", "pronunciation/mu.mp3", "pronunciation/n.mp3",
  "pronunciation/na.mp3", "pronunciation/ne.mp3", "pronunciation/ni.mp3", "pronunciation/no.mp3",
  "pronunciation/nu.mp3", "pronunciation/o.mp3", "pronunciation/ra.mp3", "pronunciation/re.mp3",
  "pronunciation/ri.mp3", "pronunciation/ro.mp3", "pronunciation/ru.mp3", "pronunciation/sa.mp3",
  "pronunciation/se.mp3", "pronunciation/shi.mp3", "pronunciation/so.mp3", "pronunciation/su.mp3",
  "pronunciation/ta.mp3", "pronunciation/te.mp3", "pronunciation/to.mp3", "pronunciation/tsu.mp3",
  "pronunciation/u.mp3", "pronunciation/wa.mp3", "pronunciation/wo.mp3", "pronunciation/ya.mp3",
  "pronunciation/yo.mp3", "pronunciation/yu.mp3"
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