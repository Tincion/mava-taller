// MAVA Taller — Service Worker
// Cachea los archivos estáticos de la app (HTML/CSS/JS) para que:
// 1) el navegador pueda ofrecer "Instalar app" / "Agregar a inicio".
// 2) si te quedás sin señal un instante, la app abra igual (aunque
//    los datos del taller necesitan internet para Supabase).

const CACHE_NAME = 'mava-taller-v1';
const ARCHIVOS_BASICOS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_BASICOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: "network first, cache fallback" — siempre intenta traer la
// versión más nueva de internet; si no hay señal, muestra la última
// versión guardada en caché en vez de una pantalla de error en blanco.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});
