/**
 * Estado de la app en la query string: presentación, esquina, estilo y tamaño
 * de la cámara. Permite recargar o compartir el enlace y volver al mismo punto.
 * Funciones puras: la página aplica el resultado al DOM.
 */

import { sanitizePresentationUrl } from './urlUtils.js';

/** Esquinas en el orden en que rota la cámara (C / Shift+C). */
export const POSITIONS = Object.freeze(['bottom-right', 'bottom-left', 'top-left', 'top-right']);
export const STYLES = Object.freeze(['frame', 'cutout', 'none']);
export const SIZES = Object.freeze(['s', 'm', 'l']);

/**
 * Devuelve la nueva query (sin '?') a partir de la actual (`search`) y del
 * estado. Solo escribe valores válidos, conserva parámetros ajenos (debug…) y
 * quita `camera`, que vive en localStorage.
 */
export function buildQuery(search, { url, position, style, size }) {
  const params = new URLSearchParams(search);
  if (url) params.set('presentation', url);
  else params.delete('presentation');
  if (POSITIONS.includes(position)) params.set('position', position);
  if (STYLES.includes(style)) params.set('style', style);
  if (SIZES.includes(size)) params.set('size', size);
  params.delete('camera');
  return params.toString();
}

/**
 * Lee el estado de la query. Cada campo es el valor válido o null (la página
 * usa entonces lo marcado por defecto). `legacyCameraId` viene de enlaces
 * antiguos con ?camera= y se migra a localStorage.
 */
export function parseQuery(search, base) {
  const params = new URLSearchParams(search);
  const pick = (name, allowed) => (allowed.includes(params.get(name)) ? params.get(name) : null);
  return {
    presentationUrl: sanitizePresentationUrl(params.get('presentation'), base),
    position: pick('position', POSITIONS),
    style: pick('style', STYLES),
    size: pick('size', SIZES),
    legacyCameraId: params.get('camera') || null,
  };
}
