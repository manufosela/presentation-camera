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

const CACHE = 'cam-shell-v3';

const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  txt: 'text/plain',
};
function mimeFor(name) {
  const ext = name.split('.').pop().toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

// Sirve un fichero de un bundle HTML local guardado en OPFS:
// ruta .../_local/<id>/<path...>  →  OPFS local-bundles/<id>/<path...>
async function serveLocalBundle(rest) {
  try {
    const parts = rest.split('/').filter(Boolean);
    const id = parts.shift();
    if (!id) return new Response('Not found', { status: 404 });
    const fileName = parts.length ? parts.pop() : 'index.html';
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle('local-bundles');
    dir = await dir.getDirectoryHandle(id);
    for (const segment of parts) dir = await dir.getDirectoryHandle(segment);
    const handle = await dir.getFileHandle(fileName);
    const file = await handle.getFile();
    return new Response(file, { headers: { 'Content-Type': mimeFor(fileName) } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

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

  // Bundles HTML locales servidos desde OPFS.
  const localIdx = url.pathname.indexOf('/_local/');
  if (localIdx !== -1) {
    event.respondWith(serveLocalBundle(url.pathname.slice(localIdx + '/_local/'.length)));
    return;
  }

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

  // stale-while-revalidate para el resto de estáticos same-origin: responde al
  // instante desde caché (rápido y offline) y refresca en segundo plano, para
  // que los cambios de JS/CSS se propaguen sin depender de subir la versión.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then(fresh => {
      if (fresh.ok && fresh.type === 'basic') cache.put(request, fresh.clone()).catch(() => {});
      return fresh;
    }).catch(() => null);
    try {
      return cached || (await network) || Response.error();
    } catch {
      return Response.error();
    }
  })());
});
