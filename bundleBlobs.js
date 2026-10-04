/**
 * Deck de carpeta servido como blob URLs (CAM-TSK-0055).
 *
 * Con blob URLs el deck puede ir en un iframe de origin opaco (sandbox
 * allow-scripts): no lee el OPFS (grabaciones) ni el localStorage de la app.
 * Solo se crean blobs de lo que el deck referencia; los CSS se reescriben en
 * cascada. `files` es un Map ruta → Blob con las rutas desde la raíz.
 */

import { rewriteCssRefs, rewriteHtmlRefs } from './bundleRewrite.js';

// Sin el tipo correcto el navegador ignora una hoja de estilos (y un SVG no se pinta).
const MIME = {
  css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
};
const mimeFor = path => MIME[path.split('.').pop().toLowerCase()] ?? '';
const dirOf = path => path.slice(0, path.lastIndexOf('/') + 1);

export async function buildBundleBlobs(files, { createUrl, wrapIndex = html => html }) {
  const index = files.get('index.html');
  if (!index) throw new Error('La carpeta no contiene un index.html en su raíz.');

  // Los CSS se leen antes: la reescritura (y su lookup) es síncrona.
  const cssTexts = new Map();
  for (const [path, file] of files) {
    if (path.endsWith('.css')) cssTexts.set(path, await file.text());
  }

  const urls = [];
  const unresolved = [];
  const created = new Map();
  const inProgress = new Set();
  const noteMissing = paths => paths.forEach(path => { if (!unresolved.includes(path)) unresolved.push(path); });

  const lookup = path => {
    if (created.has(path)) return created.get(path);
    const file = files.get(path);
    if (!file || inProgress.has(path)) return null; // falta, o @import circular
    let blob;
    if (cssTexts.has(path)) {
      inProgress.add(path);
      const { css, unresolved: missing } = rewriteCssRefs(cssTexts.get(path), dirOf(path), lookup);
      inProgress.delete(path);
      noteMissing(missing);
      blob = new Blob([css], { type: 'text/css' });
    } else {
      blob = new Blob([file], { type: mimeFor(path) });
    }
    const url = createUrl(blob);
    urls.push(url);
    created.set(path, url);
    return url;
  };

  const { html, unresolved: missing } = rewriteHtmlRefs(await index.text(), lookup);
  noteMissing(missing);
  const indexUrl = createUrl(new Blob([wrapIndex(html)], { type: 'text/html;charset=utf-8' }));
  urls.push(indexUrl);
  return { indexUrl, urls, unresolved };
}
