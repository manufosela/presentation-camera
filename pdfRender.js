/**
 * Páginas de un PDF como imágenes, en el navegador (CAM-TSK-0077).
 *
 * pdf.js (1,7 MB) solo se carga cuando se importa un PDF; lo sirve el propio
 * sitio desde vendor-dl/pdfjs (scripts/fetch-assets.js). Cada página se pinta
 * a MAX_PAGE_WIDTH de ancho y se guarda como WebP: así el deck se ve nítido a
 * pantalla completa sin pesar demasiado. El PDF no sale del navegador.
 */

import { t } from './i18n.js';

export const MAX_PAGE_WIDTH = 1920;
const PDFJS_DIR = 'vendor-dl/pdfjs/';

let pdfjsPromise = null;

/** Carga pdf.js (módulo ES) y su worker desde el propio sitio, una sola vez. */
export function loadPdfJs(importModule = url => import(url), base = document.baseURI) {
  pdfjsPromise ??= importModule(new URL(`${PDFJS_DIR}pdf.min.mjs`, base).href).then(lib => {
    lib.GlobalWorkerOptions.workerSrc = new URL(`${PDFJS_DIR}pdf.worker.min.mjs`, base).href;
    return lib;
  }).catch(error => {
    pdfjsPromise = null; // permitir reintentar
    throw error;
  });
  return pdfjsPromise;
}

const isPdf = file => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '');

const defaultCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

/**
 * [{ src, width, height }] de cada página, en orden. Lanza con un mensaje
 * claro si el fichero no es un PDF o no se puede leer.
 */
export async function renderPdfPages(file, { pdfjs, createCanvas = defaultCanvas, onProgress = () => {} }) {
  if (!isPdf(file)) throw new Error(t('error.notPdf'));
  // pdf.js 6 libera worker y memoria desde la tarea de carga (el documento ya no tiene destroy).
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    let doc;
    try {
      doc = await loadingTask.promise;
    } catch (error) {
      console.warn('[pdf] no se pudo abrir', error);
      throw new Error(t('error.badPdf'));
    }
    const pages = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const scale = MAX_PAGE_WIDTH / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);
      const canvas = createCanvas(width, height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      pages.push({ src: canvas.toDataURL('image/webp', 0.85), width, height });
      page.cleanup();
      onProgress(number, doc.numPages);
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}
