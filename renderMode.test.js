import { describe, expect, it } from 'vitest';
import { needsCanvasLoop } from './renderMode.js';

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
});
