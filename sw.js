/**
 * Service Worker — Insumos TMT1
 * Estrategia: Cache First para assets, Network First para datos
 * Versión: tmt1-v4
 */

const CACHE_VERSION = 'tmt1-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

/** Assets que se cachean en el install */
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Agrega aquí tus CSS/JS locales adicionales:
  // '/css/main.css',
  // '/js/app.js',
];

/** Dominios que NUNCA se interceptan (Firebase, Google Auth) */
const BYPASS_ORIGINS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
];

const shouldBypass = (url) => {
  try {
    const { hostname } = new URL(url);
    return BYPASS_ORIGINS.some((origin) => hostname.includes(origin));
  } catch {
    return false;
  }
};

// ─── INSTALL ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log(`[SW] Install — ${CACHE_VERSION}`);
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Cache install error:', err))
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activate — ${CACHE_VERSION}`);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('tmt1-') && key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => {
              console.log(`[SW] Eliminando caché antigua: ${key}`);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 1. Ignorar no-GET y Firebase
  if (request.method !== 'GET' || shouldBypass(url)) return;

  // 2. Ignorar extensiones de Chrome
  if (url.startsWith('chrome-extension://')) return;

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  // Cache First para assets estáticos conocidos
  const isStaticAsset = STATIC_ASSETS.some((asset) => request.url.endsWith(asset));

  if (isStaticAsset) {
    const cached = await caches.match(request);
    if (cached) return cached;
  }

  try {
    // Network con timeout de 5s para evitar cuelgues
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);

    // Cachear respuestas válidas en caché dinámica
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    // Fallback: buscar en cualquier caché
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback final: servir index.html para navegación
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }

    // Sin respuesta disponible
    return new Response(
      JSON.stringify({ error: 'Sin conexión y sin caché disponible' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ─── MENSAJES DESDE LA APP ──────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});
