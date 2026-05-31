const CACHE_NAME = 'convocoach-v1.7.5';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './prompts.js',
  './mastery.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-icon-512.png',
  './icons/apple-touch-icon.png'
];

// Hosts que NUNCA devem ser cacheados (APIs externas).
// Mantenha em sincronia com MASTERY_API_URL em mastery.js.
// Em producao, adicione o host do HF Space aqui.
const NO_CACHE_HOSTS = ['api.groq.com', 'localhost:8000'];

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
  const hostPort = url.host; // inclui porta, ex: localhost:8000
  // Bypass: nunca cachear chamadas de API externas (Groq + mastery)
  if (NO_CACHE_HOSTS.includes(url.hostname) || NO_CACHE_HOSTS.includes(hostPort)) {
    e.respondWith(fetch(request));
    return;
  }
  e.respondWith(
    caches.match(request).then((res) => res || fetch(request))
  );
});
