/**
 * Varias imágenes convertidas en una presentación .html local (CAM-TSK-0014).
 *
 * Mismo deck que un PDF (pdfDeck.js): una imagen por slide, navegable con las
 * flechas igual que un reveal. Las imágenes van en orden de nombre con números
 * naturales (slide-2 antes que slide-10); las que no se pueden decodificar se
 * omiten y se devuelven en `skipped` para avisar.
 */

import { buildPdfDeck } from './pdfDeck.js';

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const extension = name => name.split('.').at(-1).toLowerCase();

export const isImage = file => Object.values(IMAGE_TYPES).includes(file.type) || Object.hasOwn(IMAGE_TYPES, extension(file.name));

/** data:image en base64, después de comprobar que el navegador la decodifica. */
async function defaultReadImage(file) {
  (await createImageBitmap(file)).close();
  const typed = new Blob([file], { type: IMAGE_TYPES[extension(file.name)] ?? file.type });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(typed);
  });
}

export async function imagesToDeckFile(files, { readImage = defaultReadImage } = {}) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const ordered = [...files].toSorted((a, b) => collator.compare(a.name, b.name));
  const pages = [];
  const skipped = [];
  for (const file of ordered) {
    try {
      pages.push({ src: await readImage(file) });
    } catch (error) {
      console.warn(`Imagen omitida: ${file.name}`, error);
      skipped.push(file.name);
    }
  }
  if (!pages.length) throw new Error(`No se pudo cargar ninguna imagen: ${skipped.join(', ')}`);
  const title = ordered[0].name.replace(/\.[^.]+$/, '');
  return { deck: new File([buildPdfDeck({ title, pages })], `${title}.html`, { type: 'text/html' }), skipped };
}
