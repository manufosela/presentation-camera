/**
 * Service Worker de onslide (PWA).
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
 * Los decks de carpeta ya no pasan por aquí: se sirven como blob URLs en un
 * iframe aislado (bundleBlobs.js).
 */

const CACHE = 'cam-shell-v25';

// Rutas relativas al scope del SW (funciona también en subruta /presentation-camera/).
const SHELL = [
  './',
  'index.html',
  'precam.css',
  'precam.js',
  'sources.js',
  'localStore.js',
  'recorder.js',
  'deckKeys.js',
  'frameSandbox.js',
  'frameGuard.js',
  'presence.js',
  'renderMode.js',
  'appPrefs.js',
  'urlUtils.js',
  'constants.js',
  'queryState.js',
  'linkChannel.js',
  'webcamLoop.js',
  'deckNotes.js',
  'deckBridge.js',
  'savedSources.js',
  'appVersion.js',
  'streamSwitch.js',
  // TensorFlow y BodyPix no se precachean: se cargan solo al usar el recorte y
  // quedan cacheados en ese primer uso (stale-while-revalidate).
  'segmentationLoader.js',
  'bundleRewrite.js',
  'bundleBlobs.js',
  // pdf.js (vendor-dl/pdfjs) tampoco: se cachea al importar el primer PDF.
  'pdfDeck.js',
  'pdfRender.js',
  'pdfImport.js',
  'setupPreview.js',
  'fileKind.js',
  'emptyState.js',
  'dropImport.js',
  'unloadGuard.js',
  'recordingStore.js',
  'recoveryNotice.js',
  'webmDuration.js',
  'chapterTrack.js',
  'recordingClock.js',
  'countdown.js',
  'recordingFlow.js',
  'backgroundStore.js',
  'backgroundPicker.js',
  'theme.js',
  'themeToggle.js',
  'i18n.js',
  'messages.js',
  'panel.html',
  'panel.css',
  'panel.js',
  'manifest.webmanifest',
  'icon.svg',
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

  // version.json (lo genera el workflow de Pages): network-first, para que el pie
  // muestre la publicación actual y no la que había al instalar el SW.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
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
