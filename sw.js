/**
 * Service Worker de Presentation Camera (PWA).
 *
 * Cachea el "shell" same-origin para arranque rápido y uso offline del setup.
 * Reglas:
 *   - Solo intercepta peticiones GET del MISMO origin. Las cross-origin
 *     (iframes de presentaciones remotas, modelos de BodyPix desde CDN, etc.)
 *     se dejan pasar sin tocar — getUserMedia/getDisplayMedia no pasan por fetch.
 *   - index.html: network-first (para recibir actualizaciones), con fallback a
 *     caché si no hay red.
 *   - Resto de estáticos: cache-first (rápido y offline).
 *
 * Diseñado para que CAM-TSK-0022 reutilice este SW sirviendo bundles HTML
 * locales desde OPFS en rutas /_local/<id>/* (aún no implementado aquí).
 */

const CACHE = 'cam-shell-v1';

// Rutas relativas al scope del SW (funciona también en subruta /presentation-camera/).
const SHELL = [
  './',
  'index.html',
  'precam.css',
  'precam.js',
  'sources.js',
  'localStore.js',
  'recorder.js',
  'manifest.webmanifest',
  'icon.svg',
  'vendor/tf.min.js',
  'vendor/body-pix.min.js',
  'vendor/fonts/fraunces-latin.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falla entero si un recurso no existe; añadimos uno a uno tolerando fallos.
    await Promise.allSettled(SHELL.map(url => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // No tocar peticiones cross-origin (iframes remotos, CDNs, etc.).
  if (url.origin !== self.location.origin) return;

  const isDocument = request.mode === 'navigate'
    || (request.destination === 'document')
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('index.html');

  if (isDocument) {
    // network-first para el HTML, con fallback a caché offline.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // cache-first para el resto de estáticos same-origin.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
