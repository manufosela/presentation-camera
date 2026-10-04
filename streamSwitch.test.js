import { describe, expect, it } from 'vitest';
import { createStreamSwitcher } from './streamSwitch.js';

// Petición de cámara controlable: cada llamada devuelve una promesa que el
// test resuelve cuando quiere, para reproducir respuestas fuera de orden.
function deferredRequests() {
  const pending = [];
  const request = () => {
    const { promise, resolve } = Promise.withResolvers();
    pending.push(resolve);
    return promise;
  };
  return { request, pending };
}

describe('createStreamSwitcher — solo la última petición de cámara gana', () => {
  it('entrega el stream cuando no hay otra petición por medio', async () => {
    const { request, pending } = deferredRequests();
    const released = [];
    const switcher = createStreamSwitcher({ request, release: s => released.push(s) });
    const result = switcher.acquire();
    pending[0]('cam-a');
    expect(await result).toBe('cam-a');
    expect(released).toEqual([]);
  });

  it('dos cambios seguidos: la respuesta antigua que llega tarde se libera y no se entrega', async () => {
    const { request, pending } = deferredRequests();
    const released = [];
    const switcher = createStreamSwitcher({ request, release: s => released.push(s) });
    const first = switcher.acquire();
    const second = switcher.acquire();
    pending[1]('cam-b');
    pending[0]('cam-a'); // llega después
    expect(await second).toBe('cam-b');
    expect(await first).toBeNull();
    expect(released).toEqual(['cam-a']);
  });

  it('cancelar (volver al setup) libera el stream que aún estaba en camino', async () => {
    const { request, pending } = deferredRequests();
    const released = [];
    const switcher = createStreamSwitcher({ request, release: s => released.push(s) });
    const result = switcher.acquire();
    switcher.cancel();
    pending[0]('cam-a');
    expect(await result).toBeNull();
    expect(released).toEqual(['cam-a']);
  });

  it('isCurrent distingue el stream vigente de uno ya sustituido', async () => {
    const { request, pending } = deferredRequests();
    const switcher = createStreamSwitcher({ request, release: () => {} });
    const first = switcher.acquire();
    pending[0]('cam-a');
    const stream = await first;
    expect(switcher.isCurrent(stream)).toBe(true);
    switcher.acquire();
    expect(switcher.isCurrent(stream)).toBe(false);
  });

  it('una petición nueva o cancelar liberan el stream ya entregado', async () => {
    const { request, pending } = deferredRequests();
    const released = [];
    const switcher = createStreamSwitcher({ request, release: s => released.push(s) });
    const first = switcher.acquire();
    pending[0]('cam-a');
    await first;
    switcher.acquire(); // p. ej. mientras el primero aún esperaba a video.play()
    expect(released).toEqual(['cam-a']);
    const second = switcher.acquire();
    pending[2]('cam-c');
    await second;
    switcher.cancel();
    expect(released).toEqual(['cam-a', 'cam-c']);
  });

  it('un error de la petición vigente se propaga', async () => {
    const switcher = createStreamSwitcher({
      request: () => Promise.reject(new Error('denied')),
      release: () => {},
    });
    await expect(switcher.acquire()).rejects.toThrow('denied');
  });
});
