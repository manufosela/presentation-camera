/**
 * Reescritura de las referencias estáticas de un deck cargado como carpeta
 * (CAM-TSK-0038, paso 1).
 *
 * Para aislar el deck en un iframe de origin opaco, cada fichero de la carpeta
 * se sirve como blob URL y el HTML/CSS se reescribe para apuntar a ellas.
 * `lookup(path)` devuelve la URL de un fichero del bundle (ruta normalizada
 * desde la raíz) o null si no existe; lo que no se encuentra se devuelve en
 * `unresolved` para avisar (las cargas dinámicas, como fetch, no se cubren).
 */

const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;

/** Ruta normalizada dentro del bundle, o null si la referencia no es del bundle. */
export function resolveBundlePath(fromDir, ref) {
  const clean = ref.trim().split(/[?#]/)[0];
  if (!clean || EXTERNAL.test(ref.trim())) return null;
  const parts = clean.startsWith('/') ? [] : fromDir.split('/').filter(Boolean);
  for (const raw of clean.split('/')) {
    let segment;
    try { segment = decodeURIComponent(raw); } catch { return null; }
    if (segment.includes('/') || segment.includes('\\')) return null; // barra codificada
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null; // saldría de la carpeta
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

export function createResolver(fromDir, lookup) {
  const unresolved = [];
  const resolve = ref => {
    const path = resolveBundlePath(fromDir, ref);
    if (path === null) return null;
    const url = lookup(path);
    if (url === null) {
      if (!unresolved.includes(path)) unresolved.push(path);
      return null;
    }
    // El fragmento selecciona dentro del recurso (p. ej. un sprite SVG); la
    // query no tiene sentido en una blob URL.
    const hashAt = ref.indexOf('#');
    return hashAt === -1 ? url : `${url}${ref.slice(hashAt).trim()}`;
  };
  return { resolve, unresolved };
}

const CSS_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/g;
const CSS_IMPORT = /@import\s+(['"])([^'"]+)\1/g;

/** Reescribe url() e @import con `resolve(ref)` (null = se deja como estaba). */
export function rewriteCss(css, resolve) {
  return css
    .replaceAll(CSS_URL, (match, _quote, ref) => {
      const url = resolve(ref);
      return url === null ? match : `url("${url}")`;
    })
    .replaceAll(CSS_IMPORT, (match, _quote, ref) => {
      const url = resolve(ref);
      return url === null ? match : `@import "${url}"`;
    });
}

/** Reescribe url() e @import de un CSS que vive en `fromDir`. */
export function rewriteCssRefs(css, fromDir, lookup) {
  const { resolve, unresolved } = createResolver(fromDir, lookup);
  return { css: rewriteCss(css, resolve), unresolved };
}
