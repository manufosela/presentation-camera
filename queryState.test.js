import { describe, expect, it } from 'vitest';
import { buildQuery, parseQuery, POSITIONS, SIZES, STYLES } from './queryState.js';

const BASE = 'https://app.example/';

describe('buildQuery — estado de la app en la query string', () => {
  it('guarda presentación, posición, estilo y tamaño válidos', () => {
    const query = new URLSearchParams(buildQuery('', {
      url: 'https://deck.example/', position: 'top-left', style: 'cutout', size: 'l',
    }));
    expect(Object.fromEntries(query)).toEqual({
      presentation: 'https://deck.example/', position: 'top-left', style: 'cutout', size: 'l',
    });
  });

  it('sin URL quita presentation; conserva otros parámetros ajenos (p. ej. debug)', () => {
    const query = new URLSearchParams(buildQuery('?presentation=https://old.example/&debug=1', {
      url: '', position: 'bottom-right', style: 'frame', size: 'm',
    }));
    expect(query.has('presentation')).toBe(false);
    expect(query.get('debug')).toBe('1');
  });

  it('valores no válidos no se escriben (se mantiene lo que hubiera)', () => {
    const query = new URLSearchParams(buildQuery('?position=top-right', {
      url: '', position: 'centro', style: 'neón', size: 'xl',
    }));
    expect(query.get('position')).toBe('top-right');
    expect(query.has('style')).toBe(false);
    expect(query.has('size')).toBe(false);
  });

  it('quita siempre camera (vive en localStorage)', () => {
    const query = new URLSearchParams(buildQuery('?camera=abc', {
      url: '', position: 'bottom-right', style: 'frame', size: 'm',
    }));
    expect(query.has('camera')).toBe(false);
  });
});

describe('parseQuery — restaurar el estado desde la URL', () => {
  it('devuelve los valores válidos y la URL saneada', () => {
    const state = parseQuery(
      '?presentation=https%3A%2F%2Fdocs.google.com%2Fpresentation%2Fd%2FX%2Fedit&position=top-left&style=cutout&size=s&camera=dev1',
      BASE,
    );
    expect(state).toEqual({
      presentationUrl: 'https://docs.google.com/presentation/d/X/preview',
      position: 'top-left',
      style: 'cutout',
      size: 's',
      legacyCameraId: 'dev1',
    });
  });

  it('valores ausentes o no válidos → null (la página usa los marcados por defecto)', () => {
    expect(parseQuery('?presentation=javascript:alert(1)&position=centro&style=x&size=xl', BASE)).toEqual({
      presentationUrl: null, position: null, style: null, size: null, legacyCameraId: null,
    });
  });
});

describe('listas de valores válidos', () => {
  it('posiciones en el orden de rotación de la cámara', () => {
    expect(POSITIONS).toEqual(['bottom-right', 'bottom-left', 'top-left', 'top-right']);
  });

  it('estilos y tamaños', () => {
    expect(STYLES).toEqual(['frame', 'cutout', 'none']);
    expect(SIZES).toEqual(['s', 'm', 'l']);
  });
});
