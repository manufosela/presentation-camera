import { describe, expect, it } from 'vitest';
import { droppedEntry } from './dropImport.js';

// DataTransfer falso: un elemento con getAsFileSystemHandle (Chrome) o sin él.
const item = ({ handle, file }) => ({
  kind: 'file',
  getAsFileSystemHandle: handle === undefined ? undefined : async () => handle,
  getAsFile: () => file ?? null,
});
const transfer = items => ({ items });

describe('droppedEntry — qué se ha soltado en la vista previa (CAM-TSK-0091)', () => {
  it('una carpeta: su handle, para guardarla como carpeta exportada', async () => {
    const dir = { kind: 'directory', name: 'taller' };
    expect(await droppedEntry(transfer([item({ handle: dir })]))).toEqual({ kind: 'directory', handle: dir });
  });

  it('un fichero: el File, para detectar si es HTML o PDF', async () => {
    const file = new File(['%PDF'], 'charla.pdf');
    expect(await droppedEntry(transfer([item({ handle: { kind: 'file' }, file })]))).toEqual({ kind: 'file', file });
  });

  it('sin la API de handles (otros navegadores) usa el fichero', async () => {
    const file = new File(['<html>'], 'deck.html');
    expect(await droppedEntry(transfer([item({ file })]))).toEqual({ kind: 'file', file });
  });

  it('nada que importar (texto arrastrado, vacío)', async () => {
    expect(await droppedEntry(transfer([{ kind: 'string' }]))).toBeNull();
    expect(await droppedEntry(transfer([]))).toBeNull();
    expect(await droppedEntry(null)).toBeNull();
  });
});
