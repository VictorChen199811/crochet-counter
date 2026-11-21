const CACHE = 'crochet-v2';
const FILES = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
const NET_TIMEOUT = 3000; // 網路太慢時，3 秒後改用快取，避免開啟時卡住

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// 從網路抓並更新快取（只存成功的同源回應）
function fetchAndCache(req) {
  return fetch(req).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  if (req.mode === 'navigate') {
    // 頁面：先抓網路（拿最新版），逾時或離線就用快取
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(req, { ignoreSearch: true })
        .then(r => r || caches.match('./index.html'));
      const timer = setTimeout(() => fallback().then(r => {
        if (r && !done) { done = true; resolve(r); }
      }), NET_TIMEOUT);
      fetchAndCache(req)
        .then(res => { if (!done) { done = true; clearTimeout(timer); resolve(res); } })
        .catch(() => fallback().then(r => {
          if (!done) { done = true; clearTimeout(timer); resolve(r || Response.error()); }
        }));
    }));
    return;
  }

  // 圖示、manifest 等：先用快取（快），同時在背景更新
  const net = fetchAndCache(req).catch(() => null);
  e.waitUntil(net);
  e.respondWith(caches.match(req).then(cached => cached || net.then(r => r || Response.error())));
});
