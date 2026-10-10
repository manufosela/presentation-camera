import { describe, expect, it, vi } from 'vitest';
import { CHUNK_BYTES, createChunkUploader } from './chunkUploader.js';

const bytes = (n, from = 0) => new Blob([Uint8Array.from({ length: n }, (_, i) => (from + i) % 256)]);
const response = (status, body = {}, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: name => headers[name.toLowerCase()] ?? null },
  json: async () => body,
});

// Drive falso: guarda los bytes en orden y responde como la API resumable.
function fakeDrive({ failCalls = [], loseResponseOf = [], acceptAtMost = Infinity } = {}) {
  let stored = new Uint8Array(0);
  let done = false;
  const ranges = [];
  let calls = 0;
  const fetch = vi.fn(async (_url, { headers, body }) => {
    calls += 1;
    if (failCalls.includes(calls)) throw new TypeError('Failed to fetch');
    const result = await answer(headers['Content-Range'], body);
    if (loseResponseOf.includes(calls)) throw new TypeError('Failed to fetch'); // Drive lo procesó
    return result;
  });
  async function answer(range, body) {
    ranges.push(range);
    if (done) return response(200, { id: 'file1' });
    const [, start, , total] = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+|\*)$/.exec(range);
    if (start !== undefined) {
      if (Number(start) !== stored.length) return response(400);
      const sent = new Uint8Array(await body.arrayBuffer()).slice(0, acceptAtMost);
      stored = Uint8Array.from([...stored, ...sent]);
    }
    if (total !== '*' && stored.length === Number(total)) {
      done = true;
      return response(200, { id: 'file1' });
    }
    return response(308, {}, stored.length ? { range: `bytes=0-${stored.length - 1}` } : {});
  }
  return { fetch, ranges, stored: () => stored };
}

const wait = vi.fn(async () => {});

describe('createChunkUploader — subir mientras se graba (CAM-TSK-0157)', () => {
  it('sube bloques completos en orden (múltiplos de 256 KiB) y al cerrar el resto con el total', async () => {
    expect(CHUNK_BYTES % (256 * 1024)).toBe(0); // lo exige Drive
    const drive = fakeDrive();
    const uploader = createChunkUploader({ sessionUri: 'https://up.test/s', fetch: drive.fetch, wait, chunkBytes: 4 });
    uploader.append(bytes(3));
    uploader.append(bytes(6, 3)); // 9 acumulados → se suben 8
    expect(await uploader.finish()).toEqual({ id: 'file1' });
    expect(drive.ranges).toEqual(['bytes 0-7/*', 'bytes 8-8/9']);
    expect([...drive.stored()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('si el total cae justo en un bloque, cierra con un PUT vacío con el total', async () => {
    const drive = fakeDrive();
    const uploader = createChunkUploader({ sessionUri: 'https://up.test/s', fetch: drive.fetch, wait, chunkBytes: 4 });
    uploader.append(bytes(8));
    expect(await uploader.finish()).toEqual({ id: 'file1' });
    expect(drive.ranges).toEqual(['bytes 0-7/*', 'bytes */8']);
  });

  it('ante un fallo de red pregunta cuánto tiene Drive y sigue desde ahí', async () => {
    const drive = fakeDrive({ failCalls: [2] });
    const uploader = createChunkUploader({ sessionUri: 'https://up.test/s', fetch: drive.fetch, wait, chunkBytes: 4 });
    uploader.append(bytes(4));
    uploader.append(bytes(4, 4)); // el 2.º bloque falla una vez
    expect(await uploader.finish()).toEqual({ id: 'file1' });
    expect(drive.ranges).toEqual(['bytes 0-3/*', 'bytes */*', 'bytes 4-7/*', 'bytes */8']);
    expect([...drive.stored()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(wait).toHaveBeenCalled();
  });

  it('si Drive confirma menos de lo enviado, reenvía desde lo confirmado', async () => {
    const drive = fakeDrive({ acceptAtMost: 3 });
    const uploader = createChunkUploader({ sessionUri: 'https://up.test/s', fetch: drive.fetch, wait, chunkBytes: 4 });
    uploader.append(bytes(4));
    expect(await uploader.finish()).toEqual({ id: 'file1' });
    expect([...drive.stored()]).toEqual([0, 1, 2, 3]);
  });

  it('si se pierde una respuesta (bloque o cierre), la consulta de estado sigue sin repetir nada', async () => {
    const drive = fakeDrive({ loseResponseOf: [1, 3] });
    const uploader = createChunkUploader({ sessionUri: 'https://up.test/s', fetch: drive.fetch, wait, chunkBytes: 4 });
    uploader.append(bytes(6));
    expect(await uploader.finish()).toEqual({ id: 'file1' });
    expect(drive.ranges).toEqual(['bytes 0-3/*', 'bytes */*', 'bytes 4-5/6', 'bytes */*']);
  });

  it('un error que no se arregla reintentando hace fallar el cierre', async () => {
    const fetch = vi.fn(async () => response(403, { error: { message: 'forbidden' } }));
    const uploader = createChunkUploader({ sessionUri: 'https://up.test/s', fetch, wait, chunkBytes: 4 });
    uploader.append(bytes(4));
    await expect(uploader.finish()).rejects.toThrow('403');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
