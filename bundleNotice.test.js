// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { missingResourcesMessage } from './bundleBlobs.js';
import { setLang } from './i18n.js';

beforeEach(() => setLang('es', null));

describe('missingResourcesMessage — aviso visible de recursos que faltan', () => {
  it('en inglés', () => {
    setLang('en', null);
    expect(missingResourcesMessage(['a.css', 'b.js', 'c.png', 'd.png'])).toBe('The folder deck is missing 4 resources: a.css, b.js, c.png and 1 more. It may look incomplete.');
  });

  it('sin recursos que falten, no hay aviso', () => {
    expect(missingResourcesMessage([])).toBeNull();
  });

  it('nombra los que faltan', () => {
    expect(missingResourcesMessage(['js/plugin.js'])).toBe('Al deck de la carpeta le falta 1 recurso: js/plugin.js. Puede verse incompleto.');
  });

  it('con muchos, nombra los primeros y cuenta el resto', () => {
    const missing = ['a.css', 'b.js', 'c.png', 'd.png', 'e.png'];
    expect(missingResourcesMessage(missing)).toBe('Al deck de la carpeta le faltan 5 recursos: a.css, b.js, c.png y 2 más. Puede verse incompleto.');
  });
});
