const CACHE_NAME = 'cth-v1';
const urlsToCache = [
  '/',
  '/css/styles.css',
  '/css/responsive.css',
  '/js/firebase-config.js',
  '/assets/images/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});