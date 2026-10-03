import { describe, expect, it } from 'vitest';
import { assertTopLevel } from './frameGuard.js';

describe('assertTopLevel — la app no se ejecuta dentro de un iframe', () => {
  it('ventana de nivel superior: no lanza', () => {
    const win = {};
    win.top = win;
    win.self = win;
    expect(() => assertTopLevel(win)).not.toThrow();
  });

  it('enmarcada (p.ej. un deck remoto navegó su iframe a una página de la app): lanza', () => {
    const top = {};
    const win = { top, self: {} };
    expect(() => assertTopLevel(win)).toThrow(/iframe/);
  });
});
