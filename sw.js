// SpyBot service worker — basic offline shell cache
const CACHE_NAME = 'spybot-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/api.js',
  './js/storage.js',
  './js/research.js',
  './js/vision.js',
  './js/render.js',
  './js/jobs.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Never intercept Anthropic API — always go straight to network
  if (e.request.url.includes('api.anthropic.com')) return;
  // App shell: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
