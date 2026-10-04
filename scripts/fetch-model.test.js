import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MODEL_FILES, MODEL_URL, fetchModel } from './fetch-model.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// fetch falso: sirve `bodies[name]` para cada fichero del modelo.
function fakeFetch(bodies) {
  return async url => {
    const name = url.slice(MODEL_URL.length);
    if (!(name in bodies)) return new Response('missing', { status: 404 });
    return new Response(bodies[name]);
  };
}

describe('fetchModel — pesos de BodyPix con integridad verificada', () => {
  it('el modelo es el que usa la app (MobileNetV1 0.75, stride 16, quant 2)', () => {
    expect(MODEL_URL).toBe('https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/');
    expect(MODEL_FILES.map(f => f.name)).toEqual(['model-stride16.json', 'group1-shard1of1.bin']);
  });

  it('descarga y guarda cada fichero cuyo hash coincide', async () => {
    const bodies = { 'model-stride16.json': 'json', 'group1-shard1of1.bin': 'bin' };
    const files = MODEL_FILES.map(f => ({ ...f, sha256: sha256(bodies[f.name]) }));
    const written = {};
    await fetchModel({
      dir: 'out',
      files,
      fetchFn: fakeFetch(bodies),
      writeFile: async (path, data) => { written[path] = Buffer.from(data).toString(); },
    });
    expect(written).toEqual({ 'out/model-stride16.json': 'json', 'out/group1-shard1of1.bin': 'bin' });
  });

  it('un hash distinto falla y no escribe ese fichero', async () => {
    const written = [];
    await expect(fetchModel({
      dir: 'out',
      files: [{ name: 'model-stride16.json', sha256: sha256('esperado') }],
      fetchFn: fakeFetch({ 'model-stride16.json': 'alterado' }),
      writeFile: async path => { written.push(path); },
    })).rejects.toThrow(/sha256/);
    expect(written).toEqual([]);
  });

  it('una respuesta HTTP de error falla', async () => {
    await expect(fetchModel({
      dir: 'out',
      files: [{ name: 'model-stride16.json', sha256: 'x' }],
      fetchFn: fakeFetch({}),
      writeFile: async () => {},
    })).rejects.toThrow(/404/);
  });
});
