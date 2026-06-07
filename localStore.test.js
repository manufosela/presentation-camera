// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHtmlBlobUrl, removeHtml, saveHtml } from './localStore.js';

// Mock en memoria de OPFS (navigator.storage.getDirectory).
function makeOPFS() {
  const files = new Map(); // name -> Uint8Array
  const fileHandle = name => ({
    async createWritable() {
      const parts = [];
      return {
        async write(data) { parts.push(data); },
        async close() {
          const buf = await new Blob(parts).arrayBuffer();
          files.set(name, new Uint8Array(buf));
        },
      };
    },
    async getFile() {
      const bytes = files.get(name);
      return { async arrayBuffer() { return bytes.buffer; } };
    },
  });
  const dirHandle = {
    async getFileHandle(name, opts) {
      if (!files.has(name)) {
        if (!opts?.create) throw new Error('NotFoundError');
        files.set(name, new Uint8Array());
      }
      return fileHandle(name);
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw new Error('NotFoundError');
    },
  };
  return {
    files,
    getDirectory: async () => ({ getDirectoryHandle: async () => dirHandle }),
  };
}

let opfs;
beforeEach(() => {
  opfs = makeOPFS();
  vi.stubGlobal('navigator', { storage: { getDirectory: opfs.getDirectory } });
  let n = 0;
  vi.stubGlobal('URL', { createObjectURL: () => `blob:mock-${++n}`, revokeObjectURL() {} });
});
afterEach(() => vi.unstubAllGlobals());

const htmlFile = (content = '<!doctype html><h1>hi</h1>', name = 'deck.html') =>
  new File([content], name, { type: 'text/html' });

describe('localStore (OPFS)', () => {
  it('saveHtml guarda el fichero y devuelve un id', async () => {
    const id = await saveHtml(htmlFile());
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(opfs.files.has(`${id}.html`)).toBe(true);
  });

  it('getHtmlBlobUrl devuelve un blob URL para un id existente', async () => {
    const id = await saveHtml(htmlFile());
    const url = await getHtmlBlobUrl(id);
    expect(url).toMatch(/^blob:/);
  });

  it('getHtmlBlobUrl devuelve null si el contenido no existe', async () => {
    expect(await getHtmlBlobUrl('inexistente')).toBeNull();
  });

  it('getHtmlBlobUrl devuelve null con id vacío', async () => {
    expect(await getHtmlBlobUrl('')).toBeNull();
  });

  it('removeHtml borra el contenido y luego get devuelve null', async () => {
    const id = await saveHtml(htmlFile());
    expect(await removeHtml(id)).toBe(true);
    expect(await getHtmlBlobUrl(id)).toBeNull();
  });

  it('saveHtml lanza con un fichero no válido', async () => {
    await expect(saveHtml(null)).rejects.toThrow();
  });
});

// Mock OPFS jerárquico (con subdirectorios) para saveBundle
function fileNode(name, content = '') {
  let data = content;
  return {
    kind: 'file',
    async getFile() { return new File([data], name); },
    async createWritable() { return { async write(d) { data = d; }, async close() {} }; },
  };
}
function dirNode() {
  const files = new Map();
  const dirs = new Map();
  return {
    kind: 'directory',
    files, dirs,
    async *entries() {
      for (const e of files) yield e;
      for (const e of dirs) yield e;
    },
    async getDirectoryHandle(name, opts) {
      if (!dirs.has(name)) {
        if (!opts?.create) throw new Error('NotFound');
        dirs.set(name, dirNode());
      }
      return dirs.get(name);
    },
    async getFileHandle(name, opts) {
      if (!files.has(name)) {
        if (!opts?.create) throw new Error('NotFound');
        files.set(name, fileNode(name));
      }
      return files.get(name);
    },
    async removeEntry(name) { dirs.delete(name); files.delete(name); },
  };
}

describe('saveBundle', () => {
  let root;
  beforeEach(() => {
    root = dirNode();
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('copia un bundle con index.html a OPFS y devuelve un id', async () => {
    const src = dirNode();
    src.files.set('index.html', fileNode('index.html', '<h1>deck</h1>'));
    const sub = dirNode();
    sub.files.set('app.css', fileNode('app.css', 'body{}'));
    src.dirs.set('css', sub);

    const { saveBundle } = await import('./localStore.js');
    const id = await saveBundle(src);
    expect(typeof id).toBe('string');
    const bundles = root.dirs.get('local-bundles');
    expect(bundles.dirs.has(id)).toBe(true);
    expect(bundles.dirs.get(id).files.has('index.html')).toBe(true);
    expect(bundles.dirs.get(id).dirs.get('css').files.has('app.css')).toBe(true);
  });

  it('rechaza una carpeta sin index.html', async () => {
    const src = dirNode();
    src.files.set('readme.txt', fileNode('readme.txt', 'x'));
    const { saveBundle } = await import('./localStore.js');
    await expect(saveBundle(src)).rejects.toThrow(/index\.html/);
  });
});
