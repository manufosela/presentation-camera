/**
 * Deck de carpeta preparado para un iframe de origin opaco (CAM-TSK-0055).
 *
 * En un iframe sandbox=allow-scripts el deck no lee el OPFS (grabaciones) ni el
 * localStorage de la app. El index va como blob URL (la navegación sí se
 * permite), pero sus recursos no pueden ser blob URLs: están ligadas al origin
 * de la app y el iframe opaco no puede cargarlas (CAM-BUG-0018). Van como
 * data: URIs. Solo se codifica lo que el deck referencia; los CSS se reescriben
 * en cascada. `files` es un Map ruta → Blob con las rutas desde la raíz.
 */

import { rewriteCssRefs, rewriteHtmlRefs } from './bundleRewrite.js';

// Sin el tipo correcto el navegador ignora una hoja de estilos (y un SVG no se pinta).
const MIME = {
  css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
};
const mimeFor = path => MIME[path.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
const dirOf = path => path.slice(0, path.lastIndexOf('/') + 1);

/**
 * Aviso para el usuario si el deck de carpeta referencia ficheros que no están
 * (o que solo se cargan dinámicamente, que no se cubren), o null si no falta nada.
 */
export function missingResourcesMessage(unresolved) {
  if (unresolved.length === 0) return null;
  const SHOWN = 3;
  const names = unresolved.slice(0, SHOWN).join(', ');
  const rest = unresolved.length > SHOWN ? ` y ${unresolved.length - SHOWN} más` : '';
  const count = unresolved.length === 1 ? 'le falta 1 recurso' : `le faltan ${unresolved.length} recursos`;
  return `Al deck de la carpeta ${count}: ${names}${rest}. Puede verse incompleto.`;
}

/** data: URI en base64 de un Blob. */
export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // String.fromCharCode con demasiados argumentos desborda la pila
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function buildBundleBlobs(files, { createIndexUrl, wrapIndex = html => html, toDataUrl = blobToDataUrl }) {
  const index = files.get('index.html');
  if (!index) throw new Error('La carpeta no contiene un index.html en su raíz.');

  // Los CSS se leen antes: la reescritura (y su lookup) es síncrona.
  const cssTexts = new Map();
  for (const [path, file] of files) {
    if (path.endsWith('.css')) cssTexts.set(path, await file.text());
  }
  const indexText = await index.text();

  // 1) Qué ficheros (no CSS) referencia el deck, recorriendo los CSS en cascada.
  const referenced = new Set();
  const visitedCss = new Set();
  const record = path => {
    if (!files.has(path)) return null;
    if (!cssTexts.has(path)) referenced.add(path);
    else if (!visitedCss.has(path)) {
      visitedCss.add(path);
      rewriteCssRefs(cssTexts.get(path), dirOf(path), record);
    }
    return 'data:,';
  };
  rewriteHtmlRefs(indexText, record);

  // 2) Solo esos se codifican (es lo único asíncrono).
  const encoded = new Map();
  for (const path of referenced) {
    encoded.set(path, await toDataUrl(new Blob([files.get(path)], { type: mimeFor(path) })));
  }

  // 3) Reescritura real: los CSS embeben ya las data: URIs de lo que importan.
  const unresolved = [];
  const cssUrls = new Map();
  const inProgress = new Set();
  const noteMissing = paths => paths.forEach(path => { if (!unresolved.includes(path)) unresolved.push(path); });
  const lookup = path => {
    if (encoded.has(path)) return encoded.get(path);
    if (cssUrls.has(path)) return cssUrls.get(path);
    if (!cssTexts.has(path) || inProgress.has(path)) return null; // falta, o @import circular
    inProgress.add(path);
    const { css, unresolved: missing } = rewriteCssRefs(cssTexts.get(path), dirOf(path), lookup);
    inProgress.delete(path);
    noteMissing(missing);
    const url = `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;
    cssUrls.set(path, url);
    return url;
  };

  const { html, unresolved: missing } = rewriteHtmlRefs(indexText, lookup);
  noteMissing(missing);
  const indexUrl = createIndexUrl(new Blob([wrapIndex(html)], { type: 'text/html;charset=utf-8' }));
  return { indexUrl, urls: [indexUrl], unresolved };
}
