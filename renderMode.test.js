import { describe, expect, it } from 'vitest';
import { needsCanvasLoop, toggledStyle, usesCamera } from './renderMode.js';

describe('needsCanvasLoop — solo el recorte necesita dibujar en canvas', () => {
  it('cutout: sí (máscara de BodyPix por frame)', () => {
    expect(needsCanvasLoop('cutout')).toBe(true);
  });

  it('frame: no (el <video> se muestra directamente)', () => {
    expect(needsCanvasLoop('frame')).toBe(false);
  });

  it('estilo desconocido: lanza en vez de elegir en silencio', () => {
    expect(() => needsCanvasLoop('otro')).toThrow(/otro/);
  });

  it('sin cámara: no', () => {
    expect(needsCanvasLoop('none')).toBe(false);
  });
});

describe('usesCamera — «sin cámara» no pide la cámara', () => {
  it('marco y recorte la usan; sin cámara, no', () => {
    expect(usesCamera('frame')).toBe(true);
    expect(usesCamera('cutout')).toBe(true);
    expect(usesCamera('none')).toBe(false);
  });

  it('estilo desconocido: lanza', () => {
    expect(() => usesCamera('otro')).toThrow(/otro/);
  });
});

describe('toggledStyle — la tecla M alterna marco y recorte', () => {
  it('marco ↔ recorte', () => {
    expect(toggledStyle('frame')).toBe('cutout');
    expect(toggledStyle('cutout')).toBe('frame');
  });

  it('sin cámara se queda igual: M no enciende la cámara por accidente', () => {
    expect(toggledStyle('none')).toBe('none');
  });
});
