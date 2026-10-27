import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';
import { deckNameError, publicDeckUrl, suggestDeckName, usernameError } from './publishNames.js';

describe('nombres para publicar (CAM-TSK-0174)', () => {
  it('acepta minúsculas, cifras y guiones de 2 a 30 caracteres', () => {
    for (const name of ['ab', 'ana', 'mi-charla-2026', 'a'.repeat(30)]) {
      expect(usernameError(name)).toBeNull();
      expect(deckNameError(name)).toBeNull();
    }
  });

  it('rechaza mayúsculas, extremos con guion, otros signos y longitudes fuera de rango', () => {
    for (const name of ['', 'a', 'Ana', '-ana', 'ana-', 'ana_b', 'año', 'mi charla', 'a'.repeat(31)]) {
      expect(usernameError(name)).toBe('publish.invalidName');
      expect(deckNameError(name)).toBe('publish.invalidName');
    }
  });

  it('reserva como usuario los nombres que taparían rutas del sitio, no como deck', () => {
    for (const name of ['vendor', 'poc', 'remote', 'panel', 'terms']) {
      expect(usernameError(name)).toBe('publish.reservedName');
      expect(deckNameError(name)).toBeNull();
    }
  });

  it('cada error es un mensaje del catálogo, en español e inglés', () => {
    for (const key of [usernameError('A'), usernameError('vendor')]) {
      expect(MESSAGES[key]).toEqual({ es: expect.any(String), en: expect.any(String) });
    }
  });

  it('sugiere un nombre de deck a partir del título', () => {
    expect(suggestDeckName('Mi Charla: ¿Qué es la Web?')).toBe('mi-charla-que-es-la-web');
    expect(suggestDeckName('  Año 2026 — Ñandú  ')).toBe('ano-2026-nandu');
    expect(suggestDeckName('x'.repeat(40))).toBe('x'.repeat(30));
    expect(suggestDeckName('a'.repeat(29) + ' b')).toBe('a'.repeat(29));
    expect(suggestDeckName('???')).toBe('');
  });

  it('forma la URL pública', () => {
    expect(publicDeckUrl('https://onsli.de', 'ana', 'mi-charla')).toBe('https://onsli.de/ana/mi-charla');
  });
});
