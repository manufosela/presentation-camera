import { beforeEach, describe, expect, it } from 'vitest';
import { loadBodyPixLibrary, loadScriptOnce } from './segmentationLoader.js';

// Documento mínimo: los <script> no se descargan; el test dispara load/error.
let document;
function fakeDocument() {
  const head = [];
  return {
    head: { append: node => head.push(node) },
    createElement: () => {
      const node = new EventTarget();
      node.remove = () => head.splice(head.indexOf(node), 1);
      return node;
    },
    scripts: head,
  };
}

const scriptsFor = src => document.scripts.filter(s => s.src === src);

beforeEach(() => {
  document = fakeDocument();
});

describe('loadScriptOnce — scripts bajo demanda', () => {
  it('inyecta el script y resuelve al cargar', async () => {
    const loading = loadScriptOnce('vendor/a.js', document);
    const [script] = scriptsFor('vendor/a.js');
    script.dispatchEvent(new Event('load'));
    await expect(loading).resolves.toBeUndefined();
  });

  it('dos peticiones del mismo script comparten una sola descarga', () => {
    const first = loadScriptOnce('vendor/b.js', document);
    const second = loadScriptOnce('vendor/b.js', document);
    expect(second).toBe(first);
    expect(scriptsFor('vendor/b.js')).toHaveLength(1);
  });

  it('si falla, rechaza y permite reintentar con una descarga nueva', async () => {
    const failing = loadScriptOnce('vendor/c.js', document);
    scriptsFor('vendor/c.js')[0].dispatchEvent(new Event('error'));
    await expect(failing).rejects.toThrow('vendor/c.js');
    loadScriptOnce('vendor/c.js', document);
    expect(scriptsFor('vendor/c.js')).toHaveLength(1); // el fallido se retiró
  });
});

describe('loadBodyPixLibrary — TensorFlow antes que BodyPix', () => {
  it('carga en orden y devuelve la API (expuesta como window["body-pix"])', async () => {
    const loaded = [];
    const api = { load: () => {} };
    const win = {};
    const load = async src => {
      loaded.push(src);
      if (src.includes('body-pix')) win['body-pix'] = api;
    };
    await expect(loadBodyPixLibrary(win, load)).resolves.toBe(api);
    expect(loaded).toEqual(['vendor/tf.min.js', 'vendor/body-pix.min.js']);
  });

  it('falla de forma visible si el script no expone la API', async () => {
    await expect(loadBodyPixLibrary({}, async () => {})).rejects.toThrow(/BodyPix/);
  });
});
