// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildBundleBlobs } from './bundleBlobs.js';

// createIndexUrl falso: guarda el Blob del index y devuelve "blob:index".
function indexFactory() {
  const created = new Map();
  const createIndexUrl = blob => {
    created.set('blob:index', blob);
    return 'blob:index';
  };
  return { created, createIndexUrl };
}

// Contenido de un data: URI (base64 o texto codificado).
function decodeDataUrl(url) {
  const comma = url.indexOf(',');
  const [header, payload] = [url.slice(0, comma), url.slice(comma + 1)];
  return header.endsWith(';base64') ? atob(payload) : decodeURIComponent(payload);
}

const bundle = () => new Map([
  ['index.html', new Blob(['<!DOCTYPE html><html><head><link rel="stylesheet" href="css/theme.css"></head><body><img src="img/logo.png"><script src="js/missing.js"></script></body></html>'])],
  ['css/theme.css', new Blob(['@import "base.css"; .x { background: url(../img/bg.png) }'])],
  ['css/base.css', new Blob(['body { color: red }'])],
  ['img/logo.png', new Blob(['png'])],
  ['img/bg.png', new Blob(['bg'])],
  ['img/unused.png', new Blob(['nadie lo usa'])],
]);

async function build(files, options = {}) {
  const { created, createIndexUrl } = indexFactory();
  const result = await buildBundleBlobs(files, { createIndexUrl, ...options });
  const indexBlob = created.get(result.indexUrl);
  const doc = new DOMParser().parseFromString(await indexBlob.text(), 'text/html');
  return { ...result, indexBlob, doc };
}

// Un iframe de origin opaco no puede cargar blob URLs de la app; data: URIs sí.
describe('buildBundleBlobs — deck de carpeta para un iframe de origin opaco', () => {
  it('el index es una blob URL con el script puente aplicado; es lo único a revocar', async () => {
    const { indexBlob, urls } = await build(bundle(), { wrapIndex: html => `${html}<!--bridge-->` });
    expect(indexBlob.type).toBe('text/html;charset=utf-8');
    expect((await indexBlob.text()).endsWith('<!--bridge-->')).toBe(true);
    expect(urls).toEqual(['blob:index']);
  });

  it('los recursos van como data: URIs con su tipo MIME', async () => {
    const { doc } = await build(bundle());
    const logo = doc.querySelector('img').getAttribute('src');
    expect(logo.startsWith('data:image/png;base64,')).toBe(true);
    expect(decodeDataUrl(logo)).toBe('png');
    // sin text/css el navegador ignora la hoja
    expect(doc.querySelector('link').getAttribute('href').startsWith('data:text/css;charset=utf-8,')).toBe(true);
  });

  it('los CSS se reescriben en cascada (@import y url() relativas a su carpeta)', async () => {
    const { doc } = await build(bundle());
    const css = decodeDataUrl(doc.querySelector('link').getAttribute('href'));
    expect(decodeDataUrl(css.match(/@import "(data:[^"]+)"/)[1])).toBe('body { color: red }');
    expect(decodeDataUrl(css.match(/url\("(data:[^"]+)"\)/)[1])).toBe('bg');
  });

  it('solo codifica lo referenciado y devuelve lo que falta', async () => {
    const encoded = [];
    const { unresolved } = await build(bundle(), {
      toDataUrl: async blob => { encoded.push(await blob.text()); return 'data:x,'; },
    });
    expect(encoded.toSorted()).toEqual(['bg', 'png']);
    expect(unresolved).toEqual(['js/missing.js']);
  });

  it('sin index.html en la raíz falla de forma visible', async () => {
    await expect(buildBundleBlobs(new Map(), indexFactory())).rejects.toThrow(/index\.html/);
  });

  it('un @import circular no cuelga: se apunta como no resuelto', async () => {
    const files = new Map([
      ['index.html', new Blob(['<link rel="stylesheet" href="a.css">'])],
      ['a.css', new Blob(['@import "b.css";'])],
      ['b.css', new Blob(['@import "a.css";'])],
    ]);
    const { unresolved } = await build(files);
    expect(unresolved).toEqual(['a.css']);
  });
});
