/**
 * Tipo de un fichero elegido con el botón único «Subir archivo» (CAM-TSK-0083):
 * 'pdf', 'html', 'image' o null si no se admite. Las carpetas van por su propio camino.
 */

import { isImage } from './imageImport.js';
import { isPdf } from './pdfRender.js';

const isHtml = file => file.type === 'text/html' || /\.html?$/i.test(file.name);

export function fileKind(file) {
  if (!file) return null;
  if (isPdf(file)) return 'pdf';
  if (isImage(file)) return 'image';
  return isHtml(file) ? 'html' : null;
}
