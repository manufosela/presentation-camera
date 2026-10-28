/**
 * Service Worker de onslide (PWA).
 *
 * Cachea el "shell" same-origin para arranque rápido y uso offline del setup.
 * Reglas:
 *   - Solo intercepta peticiones GET del MISMO origin. Las cross-origin
 *     (iframes de presentaciones remotas, modelos de BodyPix desde CDN, etc.)
 *     se dejan pasar sin tocar — getUserMedia/getDisplayMedia no pasan por fetch.
 *   - Shell (index.html incluido): cache-first, todo de la misma publicación.
 *   - Otros documentos: red, con la app como fallback offline.
 *   - Resto de estáticos: stale-while-revalidate.
 *
 * Los decks de carpeta ya no pasan por aquí: se sirven como blob URLs en un
 * iframe aislado (bundleBlobs.js).
 */

const CACHE = 'cam-shell-v33';

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
  'remoteSession.js',
  'remoteChannel.js',
  'remoteHost.js',
  'withTimeout.js',
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
  'deckLoadNotice.js',
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
  'imageImport.js',
  'setupPreview.js',
  'fileKind.js',
  'emptyState.js',
  'dropImport.js',
  'unloadGuard.js',
  'recordingStore.js',
  'recoveryNotice.js',
  'webmDuration.js',
  'mp4Trim.js',
  'webmTrim.js',
  'recordingTrim.js',
  'trimDialog.js',
  'inkLayer.js',
  'captionsRecognizer.js',
  'captionsTranslator.js',
  'captionsEngine.js',
  'captionsOverlay.js',
  'captionsPanel.js',
  'captionsSetup.js',
  'captionsSession.js',
  'enterpriseLink.js',
  'enterpriseMode.js',
  'chunkUploader.js',
  'cameraBubble.js',
  'cameraBubble.css',
  'screenSession.js',
  'chapterTrack.js',
  'recordingClock.js',
  'countdown.js',
  'deviceSelect.js',
  'micTest.js',
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

const SHELL_PATHS = new Set(SHELL.map(url => new URL(url, self.location.href).pathname));

async function fromShell(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(request, { cache: 'no-cache' }); // revalida con el servidor, no con la caché HTTP
    if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return Response.error();
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falla entero si un recurso no existe; añadimos uno a uno tolerando fallos.
    // 'reload' se salta la caché HTTP (max-age=600 en Pages): si no, una
    // publicación nueva podría guardar ficheros de la anterior (CAM-BUG-0025).
    await Promise.allSettled(SHELL.map(url => cache.add(new Request(new URL(url, self.location.href), { cache: 'reload' }))));
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

  // El shell (HTML incluido) sale entero de la caché de esta publicación: un HTML
  // nuevo con módulos viejos aborta el arranque (CAM-BUG-0029). Cada publicación
  // cambia sw.js (CACHE lleva el commit), así que la nueva se instala aparte y
  // entra al recargar, con el aviso de versión nueva.
  if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(fromShell(request));
    return;
  }

  const isDocument = request.mode === 'navigate' || request.destination === 'document';

  if (isDocument) {
    // Fuera del shell (visor 404.html, condiciones...): red, con la app offline.
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // stale-while-revalidate para el resto de estáticos same-origin (vendor, módulos
  // que se cargan al usarlos): responde al instante desde caché y refresca en
  // segundo plano.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request, { cache: 'no-cache' }).then(fresh => { // revalida con el servidor, no con la caché HTTP
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
