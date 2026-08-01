// 双色球工具 Service Worker
// 策略：
//  - 应用外壳静态资源（图标/清单）走 cache-first（离线可用）
//  - HTML（/ 与 /index.html）走 network-first：在线永远取最新，离线回退缓存
//    （避免改了 index.html 后 PWA 一直显示旧缓存）
//  - API 请求直连网络不缓存
const CACHE = 'ssq-shell-v2';
const SHELL = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
];
// HTML 路由：network-first，保证内容更新即时生效
const HTML_ROUTES = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 接口请求不缓存，始终走网络（保证数据实时）
  if (url.pathname.startsWith('/api/')) return;
  // 仅处理同源资源
  if (url.origin !== self.location.origin) return;

  // HTML：network-first，在线取最新，离线回退缓存
  if (HTML_ROUTES.includes(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 其他同源静态资源：cache-first（命中即返回，未命中回源并补缓存）
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return resp;
          })
          .catch(() => cached)
    )
  );
});
