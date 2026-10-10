import { beforeAll, describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://app.example';

let fetchHandler;
let installHandler;
beforeAll(async () => {
  const listeners = {};
  vi.stubGlobal('self', {
    location: { origin: ORIGIN, href: `${ORIGIN}/sw.js` },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
  });
  await import('./sw.js');
  fetchHandler = listeners.fetch;
  installHandler = listeners.install;
});

// Ejecuta el handler fetch del SW real y devuelve la Response que entrega.
async function swFetch(path) {
  let responsePromise = null;
  fetchHandler({
    request: { method: 'GET', url: `${ORIGIN}${path}`, mode: 'no-cors', destination: 'image' },
    respondWith: p => { responsePromise = p; },
  });
  return responsePromise;
}

// La caché del shell sobrevive entre publicaciones; version.json no puede salir
// de ella mientras haya red, o el pie mostraría la versión de la instalación.
describe('sw.js — version.json siempre fresco', () => {
  const VERSION_URL = `${ORIGIN}/version.json`;

  function stubCache(stored) {
    const keyOf = key => String(key.url ?? key);
    const cache = {
      match: async key => stored.get(keyOf(key)),
      put: async (key, res) => { stored.set(keyOf(key), res); },
    };
    vi.stubGlobal('caches', { open: async () => cache, match: cache.match });
  }

  it('prefiere la red a la copia en caché de una publicación anterior', async () => {
    stubCache(new Map([[VERSION_URL, new Response('{"commit":"old"}')]]));
    vi.stubGlobal('fetch', async () => new Response('{"commit":"new"}'));
    const res = await swFetch('/version.json');
    expect(await res.text()).toBe('{"commit":"new"}');
  });

  it('sin red, usa la última copia guardada', async () => {
    stubCache(new Map([[VERSION_URL, new Response('{"commit":"old"}')]]));
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    const res = await swFetch('/version.json');
    expect(await res.text()).toBe('{"commit":"old"}');
  });
});

// GitHub Pages manda max-age=600: si el SW lee de la caché HTTP, una publicación
// nueva puede guardar un precam.js nuevo junto a un messages.js viejo y la app
// no arranca (CAM-BUG-0025).
describe('sw.js — nunca mezcla ficheros de dos publicaciones', () => {
  it('al instalarse pide cada fichero del shell a la red, saltándose la caché HTTP', async () => {
    const added = [];
    vi.stubGlobal('caches', { open: async () => ({ add: async request => { added.push(request); } }) });
    let installing;
    installHandler({ waitUntil: promise => { installing = promise; } });
    await installing;
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(request => request.cache === 'reload')).toBe(true);
    expect(added.map(request => request.url)).toContain(`${ORIGIN}/messages.js`);
  });

  it('al refrescar un estático en segundo plano revalida con el servidor', async () => {
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }) });
    const fetchMock = vi.fn(async () => new Response('nuevo'));
    vi.stubGlobal('fetch', fetchMock);
    await swFetch('/messages.js');
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: 'no-cache' });
  });
});
