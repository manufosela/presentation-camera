import { describe, expect, it } from 'vitest';
import { deriveSourceTitle, hostnameOf, normalizeEmbeddableUrl, sanitizePresentationUrl } from './urlUtils.js';

const BASE = 'https://app.example/presentation-camera/';
const SLIDES = 'https://docs.google.com/presentation/d/ABC123';

describe('sanitizePresentationUrl — solo http(s), normalizada para embeber', () => {
  it('acepta https y devuelve la URL tal cual si no hay que normalizar', () => {
    expect(sanitizePresentationUrl('https://slides.example/deck', BASE)).toBe('https://slides.example/deck');
  });

  it.each([
    `${SLIDES}/edit`,
    `${SLIDES}/edit?usp=sharing`,
    `${SLIDES}/edit#slide=id.p1`,
    `${SLIDES}/present`,
  ])('Google Slides %s → /preview (la de editor o /present no se puede embeber)', raw => {
    expect(sanitizePresentationUrl(raw, BASE)).toBe(`${SLIDES}/preview`);
  });

  // Canva responde X-Frame-Options: deny en /view; solo /view?embed se deja embeber.
  const CANVA = 'https://www.canva.com/design/DAGi7rMbwQI/DL_b2qdGHZhErapcUnzRlQ';
  it.each([
    `${CANVA}/view`,
    `${CANVA}/view?utm_content=DAGi7rMbwQI&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks`,
    `${CANVA}/edit?utm_content=x`,
    `${CANVA}/watch`,
    `${CANVA}/view?embed`,
  ])('Canva %s → /view?embed', raw => {
    expect(sanitizePresentationUrl(raw, BASE)).toBe(`${CANVA}/view?embed`);
  });

  it('Canva sin token de compartir (enlace público corto) → /view?embed', () => {
    expect(sanitizePresentationUrl('https://www.canva.com/design/DACSWFLr08k/view', BASE))
      .toBe('https://www.canva.com/design/DACSWFLr08k/view?embed');
  });

  it('otras páginas de Canva se dejan como están', () => {
    expect(sanitizePresentationUrl('https://www.canva.com/templates/', BASE)).toBe('https://www.canva.com/templates/');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'ftp://x.example/'])(
    'rechaza protocolos no http(s): %s',
    raw => {
      expect(sanitizePresentationUrl(raw, BASE)).toBeNull();
    },
  );

  it('vacía o nula → null', () => {
    expect(sanitizePresentationUrl('', BASE)).toBeNull();
    expect(sanitizePresentationUrl(null, BASE)).toBeNull();
  });

  it('relativa: se resuelve contra la base', () => {
    expect(sanitizePresentationUrl('decks/a.html', BASE)).toBe('https://app.example/presentation-camera/decks/a.html');
  });
});

describe('normalizeEmbeddableUrl', () => {
  it('no toca URLs de otros servicios', () => {
    const url = new URL('https://view.genially.com/abc');
    expect(normalizeEmbeddableUrl(url)).toBe(url);
  });

  it('Google Docs que no son presentaciones: sin cambios', () => {
    const url = new URL('https://docs.google.com/document/d/X/edit');
    expect(normalizeEmbeddableUrl(url).toString()).toBe('https://docs.google.com/document/d/X/edit');
  });
});

describe('deriveSourceTitle', () => {
  it.each([
    [`${SLIDES}/preview`, 'Google Slides'],
    ['https://view.genially.com/abc', 'Genially'],
    ['https://genial.ly/abc', 'Genially'],
    ['https://www.canva.com/design/x', 'Canva'],
    ['https://www.slides.example/deck', 'slides.example'],
  ])('%s → %s', (url, title) => {
    expect(deriveSourceTitle(url)).toBe(title);
  });

  it('URL inválida → null', () => {
    expect(deriveSourceTitle('no es url')).toBeNull();
  });
});

describe('hostnameOf', () => {
  it('quita www.', () => {
    expect(hostnameOf('https://www.example.com/x')).toBe('example.com');
  });

  it('no parseable: devuelve el texto tal cual (es solo una etiqueta visible)', () => {
    expect(hostnameOf('deck local')).toBe('deck local');
  });
});
