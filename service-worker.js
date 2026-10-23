// service-worker.js - caches every file on first load so the app works offline.
//
// Strategy:
//   - App files (HTML/CSS/JS/images): network-first, falling back to cache when offline.
//     This means you never need to bump CACHE when you edit a file - online users
//     always get the latest, offline users get the last successful version.
//   - Web fonts (typekit / Google Fonts): network-first + cache, same pattern.
//   - Bump CACHE once (this deploy) so devices install this new worker; after that
//     CACHE can stay the same across app edits.
const CACHE = "hirakana-v31";
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
  "pronunciation/yo.mp3", "pronunciation/yu.mp3",
  "pronunciation/ba.mp3", "pronunciation/be.mp3", "pronunciation/bi.mp3",
  "pronunciation/bo.mp3", "pronunciation/bu.mp3", "pronunciation/da.mp3",
  "pronunciation/de.mp3", "pronunciation/do.mp3", "pronunciation/ga.mp3",
  "pronunciation/ge.mp3", "pronunciation/gi.mp3", "pronunciation/go.mp3",
  "pronunciation/gu.mp3", "pronunciation/ji.mp3", "pronunciation/pa.mp3",
  "pronunciation/pe.mp3", "pronunciation/pi.mp3", "pronunciation/po.mp3",
  "pronunciation/pu.mp3", "pronunciation/za.mp3", "pronunciation/ze.mp3",
  "pronunciation/zo.mp3", "pronunciation/zu.mp3",
  "pronunciation/bya.mp3", "pronunciation/byo.mp3", "pronunciation/byu.mp3",
  "pronunciation/cha.mp3", "pronunciation/cho.mp3", "pronunciation/chu.mp3",
  "pronunciation/gya.mp3", "pronunciation/gyo.mp3", "pronunciation/gyu.mp3",
  "pronunciation/hya.mp3", "pronunciation/hyo.mp3", "pronunciation/hyu.mp3",
  "pronunciation/ja.mp3", "pronunciation/jo.mp3", "pronunciation/ju.mp3",
  "pronunciation/kya.mp3", "pronunciation/kyo.mp3", "pronunciation/kyu.mp3",
  "pronunciation/mya.mp3", "pronunciation/myo.mp3", "pronunciation/myu.mp3",
  "pronunciation/nya.mp3", "pronunciation/nyo.mp3", "pronunciation/nyu.mp3",
  "pronunciation/pya.mp3", "pronunciation/pyo.mp3", "pronunciation/pyu.mp3",
  "pronunciation/rya.mp3", "pronunciation/ryo.mp3", "pronunciation/ryu.mp3",
  "pronunciation/sha.mp3", "pronunciation/sho.mp3", "pronunciation/shu.mp3"
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