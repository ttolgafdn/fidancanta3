const CACHE_NAME = "fidan-canta-cache-v3";
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

// 1. Kurulum: Tüm yeni dosyaları hemen önbelleğe al ve beklemeden aktif et
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Aktivasyon: Eski cache sürümlerini temizle ve kontrolü hemen devral
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

// 3. İstekleri Yakalama: Ağdan getirmeye çalış, ağ yoksa veya hata verirse önbellekten ver
self.addEventListener("fetch", (e) => {
  // Sadece GET isteklerini yönet
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  // Parametresiz temiz URL (Örn: musteri.html?id=1 -> musteri.html)
  const cleanUrl = url.origin + url.pathname;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Ağdan başarılı cevap geldiyse önbelleği güncelle
        if (networkResponse && networkResponse.status === 200) {
          const respClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(cleanUrl, respClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Ağ kapalıysa (PWA çevrimdışı) önce doğrudan eşleşeni, bulamazsa temiz URL'yi ver
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          return caches.match(cleanUrl).then((matchedClean) => {
            if (matchedClean) return matchedClean;
            // Hiçbiri yoksa index.html ver
            return caches.match("./index.html");
          });
        });
      })
  );
});
