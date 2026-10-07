// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Estructura del setup en una sola pantalla (CAM-TSK-0081): barra fina, vista
// previa a la izquierda y panel de configuración a la derecha.
const html = readFileSync(join(import.meta.dirname, 'index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const setup = doc.getElementById('setup');

describe('setup en una pantalla', () => {
  it('barra superior: logo, frase y, a la derecha, ayuda, idioma, tema y GitHub', () => {
    const topbar = setup.querySelector('.topbar');
    expect(topbar.querySelector('.wordmark-text').textContent.trim()).toBe('onslide');
    expect(topbar.querySelector('[data-i18n="topbar.tagline"]')).not.toBeNull();
    const nav = topbar.querySelector('nav');
    expect([...nav.children].map(el => el.id || el.getAttribute('href'))).toEqual([
      'helpBtn', 'langBtn', 'themeBtn', 'https://github.com/manufosela/presentation-camera',
    ]);
  });

  it('dos columnas: vista previa y panel lateral con el botón de empezar', () => {
    const grid = setup.querySelector('.setup-grid');
    const [stage, panel] = grid.children;
    expect(stage.matches('section.setup-stage')).toBe(true);
    expect(panel.matches('aside.setup-panel')).toBe(true);
    expect(stage.querySelector('.stage-mock')).not.toBeNull();
    expect(panel.querySelector('#startButton')).not.toBeNull();
    expect(panel.getAttribute('data-i18n-attr')).toBe('aria-label:setup.panelLabel');
  });

  it('las cuatro esquinas se eligen en la propia vista previa (CAM-TSK-0082)', () => {
    const stage = setup.querySelector('.setup-stage .stage-mock');
    const corners = [...stage.querySelectorAll('input[type="radio"][name="position"]')];
    expect(corners.map(input => input.value)).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    for (const input of corners) {
      expect(input.closest('label').querySelector('[data-i18n]').textContent.trim()).not.toBe('');
    }
    expect(stage.querySelector('fieldset legend[data-i18n="camera.cornerGroup"]')).not.toBeNull();
    expect(setup.querySelectorAll('input[name="position"]')).toHaveLength(4);
    expect(setup.querySelector('.corner-pad')).toBeNull();
    expect(setup.querySelector('.setup-stage [data-i18n="setup.cornerHint"]')).not.toBeNull();
  });

  it.each(['.hero', '.status-pill', '.legend', '.footnote'])('sin ruido: no hay %s', selector => {
    expect(setup.querySelector(selector)).toBeNull();
  });
});
