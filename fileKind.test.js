import { describe, expect, it } from 'vitest';
import { fileKind } from './fileKind.js';

const file = (name, type = '') => new File(['x'], name, { type });

describe('fileKind — qué se ha subido con el botón único (CAM-TSK-0083)', () => {
  it.each([
    [file('charla.pdf'), 'pdf'],
    [file('charla', 'application/pdf'), 'pdf'],
    [file('deck.html'), 'html'],
    [file('deck.HTM'), 'html'],
    [file('deck', 'text/html'), 'html'],
  ])('%s → %s', (picked, kind) => {
    expect(fileKind(picked)).toBe(kind);
  });

  it.each([file('notas.txt', 'text/plain'), file('foto.png', 'image/png'), null])('no admitido: %s', picked => {
    expect(fileKind(picked)).toBeNull();
  });
});
