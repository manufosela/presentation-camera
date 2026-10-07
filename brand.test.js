import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';

// La app se llama onslide (onsli.de) desde CAM-TSK-0080.
const BRAND = 'onslide';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('marca: onslide', () => {
  it('el manifest de la PWA', () => {
    const manifest = JSON.parse(read('./manifest.webmanifest'));
    expect(manifest.name).toBe(BRAND);
    expect(manifest.short_name).toBe(BRAND);
  });

  it.each(['doc.title', 'panel.docTitle'])('el título de pestaña %s, en los dos idiomas', key => {
    expect(MESSAGES[key].es).toContain(BRAND);
    expect(MESSAGES[key].en).toContain(BRAND);
  });

  it('el logo del setup y los títulos de respaldo del HTML', () => {
    const index = read('./index.html');
    expect(index).toMatch(/class="wordmark-text">\s*onslide\s*</);
    expect(index).toMatch(/<title data-i18n="doc.title">onslide/);
    expect(read('./panel.html')).toMatch(/<title data-i18n="panel.docTitle">[^<]*onslide/);
  });

  it('no queda el nombre antiguo en lo que ve el usuario', () => {
    for (const text of [read('./index.html'), read('./panel.html'), read('./manifest.webmanifest'), read('./messages.js')]) {
      expect(text).not.toMatch(/presentation[ ·]camera/i);
    }
  });
});
