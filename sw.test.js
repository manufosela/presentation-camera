import { beforeAll, describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://app.example';

let fetchHandler;
beforeAll(async () => {
  const listeners = {};
  vi.stubGlobal('self', {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  });
  await import('./sw.js');
  fetchHandler = listeners.fetch;
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
