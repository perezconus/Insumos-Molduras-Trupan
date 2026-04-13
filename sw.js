const CACHE = 'tmt1-v5';
const ASSETS = [
  './index.html',
  './manifest.json'
];

// Dominios que NUNCA se interceptan (Firebase, Google APIs)
const BYPASS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
  'google.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Dejar pasar todo lo que sea de Firebase o Google sin interceptar
  if (BYPASS.some(domain => url.includes(domain))) return;

  // Solo manejar peticiones GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request)
        .then(response => {
          // Cachear solo respuestas válidas de nuestros propios archivos
          if (response && response.status === 200 && e.request.url.includes(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sin conexión: servir index.html para navegación
          if (e.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
