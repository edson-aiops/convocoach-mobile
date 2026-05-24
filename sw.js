const CACHE_NAME = 'convocoach-v1.7.4';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './prompts.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)));
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (url.hostname === 'api.groq.com') {
    e.respondWith(fetch(request));
    return;
  }
  e.respondWith(
    caches.match(request).then((res) => res || fetch(request))
  );
});
