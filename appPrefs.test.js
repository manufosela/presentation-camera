import { describe, expect, it } from 'vitest';
import {
  CAMERA_KEY,
  isDebugEnabled,
  loadBackgroundId,
  loadCameraId,
  saveBackgroundId,
  loadSingleKeyShortcuts,
  loadMicId,
  loadMirror,
  saveCameraId,
  saveMicId,
  saveMirror,
  saveSingleKeyShortcuts,
  loadCaptionPrefs,
  saveCaptionPrefs,
} from './appPrefs.js';
import { STORAGE_KEYS } from './constants.js';

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

describe('micrófono elegido (CAM-TSK-0101)', () => {
  it('sin elegir: el automático (null)', () => {
    expect(loadMicId(memoryStorage())).toBeNull();
  });

  it('se recuerda y null vuelve al automático', () => {
    const storage = memoryStorage();
    saveMicId(storage, 'mic-1');
    expect(loadMicId(storage)).toBe('mic-1');
    saveMicId(storage, null);
    expect(loadMicId(storage)).toBeNull();
  });
});

describe('subtítulos (CAM-TSK-0113)', () => {
  it('por defecto: apagados, hablo en el idioma de la interfaz y sin traducir', () => {
    expect(loadCaptionPrefs(memoryStorage(), 'en')).toEqual({ enabled: false, spoken: 'en', translateTo: null });
  });

  it('se recuerdan validadas', () => {
    const storage = memoryStorage();
    saveCaptionPrefs(storage, { enabled: true, spoken: 'es', translateTo: 'en' });
    expect(loadCaptionPrefs(storage, 'en')).toEqual({ enabled: true, spoken: 'es', translateTo: 'en' });
  });

  it('valores desconocidos o rotos vuelven al valor por defecto, campo a campo', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEYS.captions, JSON.stringify({ enabled: 'sí', spoken: 'fr', translateTo: 'de' }));
    expect(loadCaptionPrefs(storage, 'es')).toEqual({ enabled: false, spoken: 'es', translateTo: null });
    storage.setItem(STORAGE_KEYS.captions, '{roto');
    expect(loadCaptionPrefs(storage, 'es')).toEqual({ enabled: false, spoken: 'es', translateTo: null });
  });

  it('traducir al mismo idioma en que hablo es no traducir', () => {
    const storage = memoryStorage();
    saveCaptionPrefs(storage, { enabled: true, spoken: 'es', translateTo: 'es' });
    expect(loadCaptionPrefs(storage, 'es').translateTo).toBeNull();
  });

  it('guardar algo no válido es un error, no se guarda en silencio', () => {
    expect(() => saveCaptionPrefs(memoryStorage(), { enabled: true, spoken: 'fr', translateTo: null })).toThrow(/idioma/);
  });
});

describe('cámara en espejo (CAM-TSK-0079)', () => {
  it('en espejo por defecto, como hasta ahora', () => {
    expect(loadMirror(memoryStorage())).toBe(true);
  });

  it('se recuerda la elección', () => {
    const storage = memoryStorage();
    saveMirror(storage, false);
    expect(loadMirror(storage)).toBe(false);
    saveMirror(storage, true);
    expect(loadMirror(storage)).toBe(true);
  });
});
