/**
 * Tipo de un fichero elegido con el botón único «Subir archivo» (CAM-TSK-0083):
 * 'pdf', 'html' o null si no se admite. Las carpetas van por su propio camino.
 */

import { isPdf } from './pdfRender.js';

const isHtml = file => file.type === 'text/html' || /\.html?$/i.test(file.name);

export function fileKind(file) {
  if (!file) return null;
  if (isPdf(file)) return 'pdf';
  return isHtml(file) ? 'html' : null;
}
