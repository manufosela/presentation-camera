import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ASSETS, fetchAsset } from './fetch-assets.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assetNamed = name => ASSETS.find(asset => asset.name === name);

// fetch falso: sirve `bodies[url]`.
function fakeFetch(bodies) {
  return async url => (url in bodies ? new Response(bodies[url]) : new Response('missing', { status: 404 }));
}

const noopMkdir = async () => {};

describe('ASSETS — lo que se descarga al publicar (y en local con npm)', () => {
  it('el modelo de BodyPix que usa la app (MobileNetV1 0.75, stride 16, quant 2) en models/bodypix', () => {
    const bodypix = assetNamed('bodypix');
    expect(bodypix.url).toBe('https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/');
    expect(bodypix.dir).toBe('models/bodypix');
    expect(bodypix.files.map(f => f.name)).toEqual(['model-stride16.json', 'group1-shard1of1.bin']);
  });

  it('pdf.js con versión fijada en vendor-dl/pdfjs', () => {
    const pdfjs = assetNamed('pdfjs');
    expect(pdfjs.url).toBe('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/');
    expect(pdfjs.dir).toBe('vendor-dl/pdfjs');
    expect(pdfjs.files.map(f => f.name)).toEqual(['pdf.min.mjs', 'pdf.worker.min.mjs']);
  });

  it('todo fichero lleva su sha256', () => {
    expect(ASSETS.flatMap(asset => asset.files).every(file => /^[\da-f]{64}$/.test(file.sha256))).toBe(true);
  });
});

describe('fetchAsset — descarga con integridad verificada', () => {
  const asset = { name: 'demo', url: 'https://cdn.example/x/', dir: 'lib/x', files: [] };

  it('descarga y guarda cada fichero cuyo hash coincide, en <raíz>/<carpeta>', async () => {
    const files = [{ name: 'a.js', sha256: sha256('a') }, { name: 'b.js', sha256: sha256('b') }];
    const written = {};
    await fetchAsset({
      asset: { ...asset, files },
      root: 'out',
      fetchFn: fakeFetch({ 'https://cdn.example/x/a.js': 'a', 'https://cdn.example/x/b.js': 'b' }),
      writeFile: async (path, data) => { written[path] = Buffer.from(data).toString(); },
      mkdir: noopMkdir,
    });
    expect(written).toEqual({ 'out/lib/x/a.js': 'a', 'out/lib/x/b.js': 'b' });
  });

  it('un hash distinto falla y no escribe ese fichero', async () => {
    const written = [];
    await expect(fetchAsset({
      asset: { ...asset, files: [{ name: 'a.js', sha256: sha256('esperado') }] },
      root: 'out',
      fetchFn: fakeFetch({ 'https://cdn.example/x/a.js': 'alterado' }),
      writeFile: async path => { written.push(path); },
      mkdir: noopMkdir,
    })).rejects.toThrow(/sha256/);
    expect(written).toEqual([]);
  });

  it('una respuesta HTTP de error falla', async () => {
    await expect(fetchAsset({
      asset: { ...asset, files: [{ name: 'a.js', sha256: 'x' }] },
      root: 'out',
      fetchFn: fakeFetch({}),
      writeFile: async () => {},
      mkdir: noopMkdir,
    })).rejects.toThrow(/404/);
  });
});
