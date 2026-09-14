// sw.js - Service Worker Offline
const CACHE_NAME = 'yugen-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js'
];

// Instalar y guardar archivos base
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activar
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Servir archivos desde caché cuando no haya red
self.addEventListener('fetch', (e) => {
  // Ignorar peticiones a RapidAPI cuando hay red
  if (e.request.url.includes('rapidapi.com')) return;

  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});