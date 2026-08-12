/* 中国传统色彩 · Service Worker（GitHub Pages 生效，file:// 注册失败时静默降级） */
const CACHE = 'cc-v2';
const CORE = [
  './',
  './index.html',
  './data.js',
  './app.js',
  './manifest.json',
  './favicon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  /* 图片与核心资源：缓存优先，网络回填 */
  if (url.pathname.match(/\.(webp|jpg|svg|js|json|css)$/) || url.pathname.endsWith('/')) {
    e.respondWith(
      caches.match(e.request).then(hit =>
        hit || fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        }).catch(() => hit)
      )
    );
  }
});
