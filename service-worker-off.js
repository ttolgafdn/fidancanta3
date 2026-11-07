const CACHE_NAME = "fidan-canta-cache-v2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./musteri.html",
  "./toptanci.html",
  "./aylik.html",
  "./yillik.html",
  "./style.css",
  "./common.js",
  "./app.js",
  "./musteri.js",
  "./toptanci.js",
  "./manifest.json",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png"
];

// 1. Kurulum (Dosyaları Önbelleğe Al ve beklemeden aktif et)
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Eski cache'leri temizle
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 2. Fetch (Ağ öncelikli veya cache fallback)
self.addEventListener("fetch", (e) => {
  // URL parametreli istekleri (örn: musteri.html?id=1) baz sayfayla eşleştir
  const url = new URL(e.request.url);
  const cleanUrl = url.origin + url.pathname;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          return caches.match(cleanUrl);
        });
      })
  );
});
