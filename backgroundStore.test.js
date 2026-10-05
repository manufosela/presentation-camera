import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BACKGROUND_BYTES,
  listBackgrounds,
  readBackground,
  removeBackground,
  saveBackground,
} from './backgroundStore.js';

// OPFS en memoria: un directorio con ficheros (File) y subdirectorios.
function memoryDir() {
  const files = new Map();
  const dirs = new Map();
  return {
    kind: 'directory',
    async getDirectoryHandle(name, opts) {
      if (!dirs.has(name)) {
        if (!opts?.create) throw new DOMException('not found', 'NotFoundError');
        dirs.set(name, memoryDir());
      }
      return dirs.get(name);
    },
    async getFileHandle(name, opts) {
      if (!files.has(name) && !opts?.create) throw new DOMException('not found', 'NotFoundError');
      return {
        kind: 'file',
        getFile: async () => files.get(name),
        createWritable: async () => ({
          // Todas con la misma fecha: el orden no puede depender de lastModified.
          write: async data => { files.set(name, new File([data], name, { type: data.type, lastModified: 0 })); },
          close: async () => {},
        }),
      };
    },
    async *entries() {
      // Orden inverso: OPFS no garantiza el orden de creación.
      for (const name of [...files.keys()].toReversed()) yield [name, await this.getFileHandle(name)];
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw new DOMException('not found', 'NotFoundError');
    },
  };
}

let root;
const getRoot = async () => root;
const image = (name, type = 'image/png', size = 10) => new File([new Uint8Array(size)], name, { type });

beforeEach(() => {
  root = memoryDir();
});
afterEach(() => vi.restoreAllMocks());

describe('backgroundStore — imágenes de fondo guardadas en el navegador', () => {
  it('guarda una imagen y la lista con su nombre, en orden de subida', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(2_000).mockReturnValueOnce(10_000);
    const first = await saveBackground(image('playa.png'), getRoot);
    const second = await saveBackground(image('oficina.jpg', 'image/jpeg'), getRoot);
    const list = await listBackgrounds(getRoot);
    expect(list.map(b => b.name)).toEqual(['playa', 'oficina']);
    expect(list.map(b => b.id)).toEqual([first.id, second.id]);
  });

  it('lee la imagen guardada por su id', async () => {
    const { id } = await saveBackground(image('playa.webp', 'image/webp', 42), getRoot);
    const file = await readBackground(id, getRoot);
    expect(file.size).toBe(42);
    expect(file.type).toBe('image/webp');
  });

  it('borra una imagen; borrar o leer una que no existe no rompe', async () => {
    const { id } = await saveBackground(image('playa.png'), getRoot);
    expect(await removeBackground(id, getRoot)).toBe(true);
    expect(await listBackgrounds(getRoot)).toEqual([]);
    expect(await removeBackground(id, getRoot)).toBe(false);
    expect(await readBackground(id, getRoot)).toBeNull();
  });

  it('sin fondos guardados, la lista está vacía', async () => {
    expect(await listBackgrounds(getRoot)).toEqual([]);
  });

  it('rechaza lo que no es PNG, JPEG o WebP', async () => {
    await expect(saveBackground(image('doc.pdf', 'application/pdf'), getRoot)).rejects.toThrow(/PNG, JPEG o WebP/);
    await expect(saveBackground(image('anim.gif', 'image/gif'), getRoot)).rejects.toThrow(/PNG, JPEG o WebP/);
  });

  it('rechaza imágenes demasiado grandes', async () => {
    const huge = image('enorme.png', 'image/png', MAX_BACKGROUND_BYTES + 1);
    await expect(saveBackground(huge, getRoot)).rejects.toThrow(/15 MB/);
  });

  it('un fallo del almacenamiento que no es «no existe» se propaga, no se disfraza de vacío', async () => {
    const broken = async () => { throw new DOMException('denegado', 'SecurityError'); };
    await expect(listBackgrounds(broken)).rejects.toThrow('denegado');
    const { id } = await saveBackground(image('playa.png'), getRoot);
    await expect(readBackground(id, broken)).rejects.toThrow('denegado');
    await expect(removeBackground(id, broken)).rejects.toThrow('denegado');
  });

  it('un id que intenta salir de la carpeta no se lee ni se borra', async () => {
    expect(await readBackground('../local-html/x.html', getRoot)).toBeNull();
    expect(await removeBackground('../local-html/x.html', getRoot)).toBe(false);
  });
});
