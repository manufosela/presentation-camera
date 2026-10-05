import { describe, expect, it } from 'vitest';
import {
  CAMERA_KEY,
  isDebugEnabled,
  loadBackgroundId,
  loadCameraId,
  saveBackgroundId,
  loadSingleKeyShortcuts,
  saveCameraId,
  saveSingleKeyShortcuts,
} from './appPrefs.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
}

describe('isDebugEnabled — window.__cam solo en modo depuración', () => {
  it('?debug=1 activa', () => {
    expect(isDebugEnabled('?debug=1')).toBe(true);
  });

  it('sin el flag o con otro valor, no', () => {
    expect(isDebugEnabled('')).toBe(false);
    expect(isDebugEnabled('?debug=0')).toBe(false);
    expect(isDebugEnabled('?presentation=x')).toBe(false);
  });
});

describe('cámara elegida — en almacenamiento local, no en la URL', () => {
  it('guarda y lee el deviceId', () => {
    const storage = memoryStorage();
    saveCameraId(storage, 'abc');
    expect(storage.getItem(CAMERA_KEY)).toBe('abc');
    expect(loadCameraId(storage)).toBe('abc');
  });

  it('null borra la preferencia (cámara automática)', () => {
    const storage = memoryStorage();
    saveCameraId(storage, 'abc');
    saveCameraId(storage, null);
    expect(loadCameraId(storage)).toBeNull();
  });

  it('sin preferencia guardada → null', () => {
    expect(loadCameraId(memoryStorage())).toBeNull();
  });
});

describe('fondo elegido para el recorte', () => {
  it('sin elección guardada → null (sin fondo)', () => {
    expect(loadBackgroundId(memoryStorage())).toBeNull();
  });

  it('guarda y lee el id; null lo borra', () => {
    const storage = memoryStorage();
    saveBackgroundId(storage, 'a.png');
    expect(loadBackgroundId(storage)).toBe('a.png');
    saveBackgroundId(storage, null);
    expect(loadBackgroundId(storage)).toBeNull();
  });
});

describe('atajos de una tecla — desactivables (WCAG 2.1.4)', () => {
  it('activados por defecto', () => {
    expect(loadSingleKeyShortcuts(memoryStorage())).toBe(true);
  });

  it('se recuerda la elección', () => {
    const storage = memoryStorage();
    saveSingleKeyShortcuts(storage, false);
    expect(loadSingleKeyShortcuts(storage)).toBe(false);
    saveSingleKeyShortcuts(storage, true);
    expect(loadSingleKeyShortcuts(storage)).toBe(true);
  });
});
