/**
 * Presentaciones guardadas: cómo se muestran en la pantalla inicial y qué
 * ficheros locales (OPFS) quedan huérfanos cuando se quitan o reemplazan.
 */

import { hostnameOf } from './urlUtils.js';
import { t } from './i18n.js';

/** Título y tipo legibles de una source guardada (en el idioma actual). */
export function sourceLabel(source) {
  if (source.type === 'html') {
    return { title: source.title || t('saved.untitled'), kind: t(source.bundle ? 'saved.kindFolder' : 'saved.kindHtml') };
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
