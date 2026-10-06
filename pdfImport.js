/**
 * Un PDF convertido en una presentación .html local (CAM-TSK-0078).
 *
 * Une pdfRender.js (páginas → imágenes) y pdfDeck.js (imágenes → deck): el
 * resultado se guarda como cualquier otro HTML local y se navega con las
 * flechas igual que un reveal.
 */

import { buildPdfDeck } from './pdfDeck.js';
import { loadPdfJs, renderPdfPages } from './pdfRender.js';

export { isPdf } from './pdfRender.js';

const defaultRenderPages = async (file, options) => renderPdfPages(file, { ...options, pdfjs: await loadPdfJs() });

export async function pdfToDeckFile(file, { renderPages = defaultRenderPages, onProgress = () => {} } = {}) {
  const pages = await renderPages(file, { onProgress });
  const title = file.name.replace(/\.pdf$/i, '');
  return new File([buildPdfDeck({ title, pages })], `${title}.html`, { type: 'text/html' });
}
