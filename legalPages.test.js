// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { showLegalLang } from './legal.js';

const load = file => new DOMParser().parseFromString(readFileSync(new URL(file, import.meta.url), 'utf8'), 'text/html');

describe('política de privacidad (CAM-TSK-0137)', () => {
  const doc = load('./privacy.html');

  it('está en español e inglés, con responsable y contacto públicos', () => {
    for (const lang of ['es', 'en']) {
      const article = doc.querySelector(`article[lang="${lang}"]`);
      expect(article.textContent).toContain('manufosela');
      expect(article.querySelector('a[href="mailto:privacidad@onsli.de"]')).not.toBeNull();
      expect(article.querySelector('a[href="https://developers.google.com/terms/api-services-user-data-policy"]')).not.toBeNull();
      expect(article.textContent).toContain('drive.file');
    }
  });

  it('no publica correos personales', () => {
    expect(doc.documentElement.outerHTML).not.toMatch(/@gmail\.com/);
  });
});

describe('condiciones de uso (CAM-TSK-0138)', () => {
  const doc = load('./terms.html');

  it('están en español e inglés, con responsable, contacto y enlace a la privacidad', () => {
    for (const lang of ['es', 'en']) {
      const article = doc.querySelector(`article[lang="${lang}"]`);
      expect(article.textContent).toContain('manufosela');
      expect(article.querySelector('a[href="mailto:privacidad@onsli.de"]')).not.toBeNull();
      expect(article.querySelector('a[href="privacy.html"]')).not.toBeNull();
    }
    expect(doc.documentElement.outerHTML).not.toMatch(/@gmail\.com/);
  });
});

describe('showLegalLang — un idioma a la vista', () => {
  it('muestra el artículo del idioma pedido y oculta el otro', () => {
    document.body.innerHTML = '<article lang="es"></article><article lang="en"></article>';
    showLegalLang(document, 'en');
    expect(document.querySelector('[lang="en"]').hidden).toBe(false);
    expect(document.querySelector('[lang="es"]').hidden).toBe(true);
    expect(document.documentElement.lang).toBe('en');
  });
});
