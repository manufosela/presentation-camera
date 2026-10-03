import { beforeAll, describe, expect, it, vi } from 'vitest';

// OPFS en memoria con directorios anidados: { 'local-bundles': { id: { ... } } }.
function makeDir(tree) {
  return {
    async getDirectoryHandle(name) {
      const node = tree[name];
      if (!node || node instanceof Blob) throw new DOMException('not found', 'NotFoundError');
      return makeDir(node);
    },
    async getFileHandle(name) {
      const node = tree[name];
      if (!(node instanceof Blob)) throw new DOMException('not found', 'NotFoundError');
      return { getFile: async () => node };
    },
  };
}

const ORIGIN = 'https://app.example';
const opfs = {
  'local-bundles': {
    deck1: {
      'index.html': new Blob(['<h1>deck</h1>']),
      img: { 'mi imagen ñandú.png': new Blob(['png-bytes']) },
    },
  },
};

let fetchHandler;
beforeAll(async () => {
  const listeners = {};
  vi.stubGlobal('self', {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  });
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => makeDir(opfs) } });
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

describe('sw.js — bundles HTML locales servidos desde OPFS', () => {
  it('sirve index.html del bundle', async () => {
    const res = await swFetch('/_local/deck1/index.html');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>deck</h1>');
  });

  it('decodifica espacios y acentos codificados en la URL', async () => {
    const res = await swFetch('/_local/deck1/img/mi%20imagen%20%C3%B1and%C3%BA.png');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('png-bytes');
  });

  // `..` y `%2E%2E` los normaliza el parser de URL antes de llegar al SW; `%2F`
  // no: decodificado metería una barra dentro de un nombre de segmento.
  it('rechaza una barra codificada dentro de un segmento', async () => {
    const res = await swFetch('/_local/deck1/img%2Fmi%20imagen%20%C3%B1and%C3%BA.png');
    expect(res.status).toBe(404);
  });

  it('codificación inválida → 404, no excepción', async () => {
    const res = await swFetch('/_local/deck1/img/%E0%A4%A.png');
    expect(res.status).toBe(404);
  });
});
