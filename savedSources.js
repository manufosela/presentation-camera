/**
 * Presentaciones guardadas: cómo se muestran en la pantalla inicial y qué
 * ficheros locales (OPFS) quedan huérfanos cuando se quitan o reemplazan.
 */

import { hostnameOf } from './urlUtils.js';

/** Título y tipo legibles de una source guardada. */
export function sourceLabel(source) {
  if (source.type === 'html') {
    return { title: source.title || 'Presentación sin título', kind: source.bundle ? 'Carpeta' : 'HTML local' };
  }
  const host = hostnameOf(source.url);
  return { title: source.title || host, kind: host };
}

const fileKey = s => `${s.bundle === true ? 'bundle' : 'html'}:${s.localRef}`;

/**
 * Ficheros locales de `prevList` que ya no referencia ninguna entrada de
 * `nextList` (source quitada, o reemplazada por un fichero nuevo).
 */
export function removedLocalFiles(prevList, nextList) {
  const stillUsed = new Set(nextList.filter(s => s.type === 'html').map(fileKey));
  const seen = new Set();
  return prevList
    .filter(s => s.type === 'html' && !stillUsed.has(fileKey(s)))
    .filter(s => !seen.has(fileKey(s)) && seen.add(fileKey(s)))
    .map(s => ({ localRef: s.localRef, bundle: s.bundle === true }));
}
