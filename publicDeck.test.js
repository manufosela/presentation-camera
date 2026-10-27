import { describe, expect, it, vi } from 'vitest';
import { loadPublishedDeck, parseDeckPath } from './publicDeck.js';

const USERNAME_URL = 'https://firestore.googleapis.com/v1/projects/precam-app/databases/(default)/documents/usernames/ana';
const DECK_URL = 'https://firebasestorage.googleapis.com/v0/b/precam-app.firebasestorage.app/o/decks%2Fuid-ana%2Fmi-charla.html?alt=media';

const response = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const fakeFetch = routes => vi.fn(async url => routes[url] ?? response(404, {}));

describe('ruta pública de un deck (CAM-TSK-0176)', () => {
  it('lee usuario y deck de /<usuario>/<deck>, con o sin barra final', () => {
    expect(parseDeckPath('/ana/mi-charla')).toEqual({ username: 'ana', deck: 'mi-charla' });
    expect(parseDeckPath('/ana/mi-charla/')).toEqual({ username: 'ana', deck: 'mi-charla' });
  });

  it('descarta rutas que no son de un deck publicado', () => {
    for (const path of ['/', '/ana', '/ana/mi-charla/otra', '/Ana/mi-charla', '/ana/mi_charla', '/vendor/x1', '/ana/%2e%2e']) {
      expect(parseDeckPath(path)).toBeNull();
    }
  });
});

describe('carga del deck publicado', () => {
  it('resuelve el dueño del nombre y descarga su deck como texto', async () => {
    const fetchImpl = fakeFetch({
      [USERNAME_URL]: response(200, { fields: { uid: { stringValue: 'uid-ana' } } }),
      [DECK_URL]: response(200, '<h1>Hola</h1>'),
    });
    expect(await loadPublishedDeck({ username: 'ana', deck: 'mi-charla' }, fetchImpl)).toBe('<h1>Hola</h1>');
  });

  it('da null si el usuario o el deck no existen', async () => {
    expect(await loadPublishedDeck({ username: 'ana', deck: 'mi-charla' }, fakeFetch({}))).toBeNull();
    const fetchImpl = fakeFetch({ [USERNAME_URL]: response(200, { fields: { uid: { stringValue: 'uid-ana' } } }) });
    expect(await loadPublishedDeck({ username: 'ana', deck: 'mi-charla' }, fetchImpl)).toBeNull();
  });

  it('cualquier otro fallo se propaga, sin confundirlo con no encontrado', async () => {
    await expect(loadPublishedDeck({ username: 'ana', deck: 'mi-charla' }, fakeFetch({ [USERNAME_URL]: response(503, {}) })))
      .rejects.toThrow('503');
    const fetchImpl = fakeFetch({
      [USERNAME_URL]: response(200, { fields: { uid: { stringValue: 'uid-ana' } } }),
      [DECK_URL]: response(403, {}),
    });
    await expect(loadPublishedDeck({ username: 'ana', deck: 'mi-charla' }, fetchImpl)).rejects.toThrow('403');
  });
});
