// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildBundleBlobs } from './bundleBlobs.js';

// createUrl falso: guarda cada Blob creado y devuelve "blob:<n>".
function urlFactory() {
  const created = new Map();
  const createUrl = blob => {
    const url = `blob:${created.size}`;
    created.set(url, blob);
    return url;
  };
  return { created, createUrl };
}

const bundle = () => new Map([
  ['index.html', new Blob(['<!DOCTYPE html><html><head><link rel="stylesheet" href="css/theme.css"></head><body><img src="img/logo.png"><script src="js/missing.js"></script></body></html>'])],
  ['css/theme.css', new Blob(['@import "base.css"; .x { background: url(../img/bg.png) }'])],
  ['css/base.css', new Blob(['body { color: red }'])],
  ['img/logo.png', new Blob(['png'])],
  ['img/bg.png', new Blob(['bg'])],
  ['img/unused.png', new Blob(['nadie lo usa'])],
]);

describe('buildBundleBlobs — un deck de carpeta servido como blob URLs', () => {
  it('el index apunta a los blobs de sus recursos, con el script puente aplicado', async () => {
    const { created, createUrl } = urlFactory();
    const { indexUrl } = await buildBundleBlobs(bundle(), { createUrl, wrapIndex: html => `${html}<!--bridge-->` });
    const indexHtml = await created.get(indexUrl).text();
    expect(created.get(indexUrl).type).toBe('text/html;charset=utf-8');
    expect(indexHtml.endsWith('<!--bridge-->')).toBe(true);
    const cssUrl = indexHtml.match(/href="(blob:\d+)"/)[1];
    expect(created.get(cssUrl).type).toBe('text/css'); // sin text/css el navegador ignora la hoja
  });

  it('los CSS se reescriben en cascada (@import y url() relativas a su carpeta)', async () => {
    const { created, createUrl } = urlFactory();
    const { indexUrl } = await buildBundleBlobs(bundle(), { createUrl });
    const cssUrl = (await created.get(indexUrl).text()).match(/href="(blob:\d+)"/)[1];
    const css = await created.get(cssUrl).text();
    const [, baseUrl] = css.match(/@import "(blob:\d+)"/);
    const [, bgUrl] = css.match(/url\("(blob:\d+)"\)/);
    expect(await created.get(baseUrl).text()).toBe('body { color: red }');
    expect(await created.get(bgUrl).text()).toBe('bg');
    expect(created.get(bgUrl).type).toBe('image/png');
  });

  it('solo crea blobs de lo referenciado, devuelve todas las URLs para revocarlas y lo que falta', async () => {
    const { created, createUrl } = urlFactory();
    const { urls, unresolved } = await buildBundleBlobs(bundle(), { createUrl });
    expect(urls.toSorted()).toEqual([...created.keys()].toSorted());
    expect(urls).toHaveLength(5); // index, theme.css, base.css, logo.png, bg.png
    expect(unresolved).toEqual(['js/missing.js']);
  });

  it('sin index.html en la raíz falla de forma visible', async () => {
    await expect(buildBundleBlobs(new Map(), urlFactory())).rejects.toThrow(/index\.html/);
  });

  it('un @import circular no cuelga: se apunta como no resuelto', async () => {
    const files = new Map([
      ['index.html', new Blob(['<link rel="stylesheet" href="a.css">'])],
      ['a.css', new Blob(['@import "b.css";'])],
      ['b.css', new Blob(['@import "a.css";'])],
    ]);
    const { unresolved } = await buildBundleBlobs(files, urlFactory());
    expect(unresolved).toEqual(['a.css']);
  });
});
