/* 中国传统色彩 · Service Worker（GitHub Pages 生效，file:// 注册失败时静默降级）
 * 策略：核心文件 network-first（始终拿最新，避免缓存旧 JS），图片 cache-first（离线友好） */
const CACHE = 'cc-v3';
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
  const path = url.pathname;
  const isCore = path.endsWith('/') || path.endsWith('index.html') || /\.(html|js|json|svg)$/.test(path);
  const isImage = /\.(webp|jpg)$/.test(path);

  if (isCore) {
    /* network-first：核心资源始终优先取最新，失败回退缓存（离线可用） */
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else if (isImage) {
    /* cache-first：图片内容稳定，离线友好 */
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
