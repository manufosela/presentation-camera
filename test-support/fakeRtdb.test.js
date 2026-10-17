import { describe, expect, it, vi } from 'vitest';
import { fakeRtdb } from './fakeRtdb.js';

describe('fakeRtdb', () => {
  it('lee un nodo como árbol a partir de lo escrito debajo', async () => {
    const server = fakeRtdb();
    const { api } = server.client();
    await api.set({ path: 'a' }, { b: { c: 1 }, d: true });
    await api.set({ path: 'a/b/e' }, 'x');
    expect(server.read('a')).toEqual({ b: { c: 1, e: 'x' }, d: true });
    await api.remove({ path: 'a/b' });
    expect(server.read('a')).toEqual({ d: true });
  });

  it('escribir debajo de un valor simple lo sustituye por un objeto', async () => {
    const server = fakeRtdb();
    const { api } = server.client();
    await api.set({ path: 'a/b' }, 1);
    await api.set({ path: 'a/b/c' }, 2);
    expect(server.read('a')).toEqual({ b: { c: 2 } });
  });

  it('falla en vez de imitar mal una referencia a la raíz', () => {
    const { api } = fakeRtdb().client();
    expect(() => api.ref(api.db)).toThrow(/raíz/);
  });

  it('onValue avisa al suscribirse y con cada cambio del camino o de debajo', async () => {
    const { api } = fakeRtdb().client();
    const seen = vi.fn();
    const stop = api.onValue({ path: 'a' }, snapshot => seen(snapshot.val()));
    await api.set({ path: 'a/b' }, 1);
    stop();
    await api.set({ path: 'a/b' }, 2);
    expect(seen.mock.calls).toEqual([[null], [{ b: 1 }]]);
  });

  it('solo el cliente que se desconecta aplica sus onDisconnect', async () => {
    const server = fakeRtdb();
    const [one, two] = [server.client(), server.client()];
    await one.api.onDisconnect({ path: 'one' }).set(false);
    await two.api.onDisconnect({ path: 'two' }).set(false);
    await two.api.onDisconnect({ path: 'two' }).cancel();
    one.disconnect();
    two.disconnect();
    expect(server.read('one')).toBe(false);
    expect(server.read('two')).toBeNull();
  });
});
