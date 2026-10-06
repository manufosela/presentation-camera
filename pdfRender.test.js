// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_PAGE_WIDTH, renderPdfPages } from './pdfRender.js';
import { setLang } from './i18n.js';

beforeEach(() => setLang('es', null));

// pdf.js falso: páginas de 800×600 (o lo que se pida) que «pintan» en el canvas.
function fakePdfjs({ pageSizes = [[800, 600], [800, 600]], fail = false } = {}) {
  const calls = { destroyed: false, rendered: [] };
  const lib = {
    // pdf.js 6 libera el documento desde la tarea de carga, no desde el documento.
    getDocument: ({ data }) => ({
      destroy: async () => { calls.destroyed = true; },
      promise: fail
        ? Promise.reject(new Error('Invalid PDF structure'))
        : Promise.resolve({
          numPages: pageSizes.length,
          getPage: async number => {
            const [width, height] = pageSizes[number - 1];
            return {
              getViewport: ({ scale }) => ({ width: width * scale, height: height * scale }),
              render: ({ viewport }) => {
                calls.rendered.push({ number, width: viewport.width, bytes: data.length });
                return { promise: Promise.resolve() };
              },
              cleanup: () => {},
            };
          },
        }),
    }),
  };
  return { lib, calls };
}

const createCanvas = (width, height) => ({
  width, height, getContext: () => ({}), toDataURL: type => `data:${type};base64,QUJD`,
});
const pdfFile = (name = 'charla.pdf', type = 'application/pdf') => new File(['%PDF-1.7'], name, { type });

describe('renderPdfPages — páginas del PDF como imágenes', () => {
  it('pinta cada página a como mucho MAX_PAGE_WIDTH de ancho, en WebP', async () => {
    const { lib, calls } = fakePdfjs({ pageSizes: [[800, 600], [3000, 2000]] });
    const pages = await renderPdfPages(pdfFile(), { pdfjs: lib, createCanvas });
    expect(pages).toEqual([
      { src: 'data:image/webp;base64,QUJD', width: MAX_PAGE_WIDTH, height: 1440 },
      { src: 'data:image/webp;base64,QUJD', width: MAX_PAGE_WIDTH, height: 1280 },
    ]);
    expect(calls.rendered.map(r => r.width)).toEqual([MAX_PAGE_WIDTH, MAX_PAGE_WIDTH]);
    expect(calls.destroyed).toBe(true);
  });

  it('avisa del progreso página a página', async () => {
    const progress = [];
    await renderPdfPages(pdfFile(), { pdfjs: fakePdfjs().lib, createCanvas, onProgress: (done, total) => progress.push(`${done}/${total}`) });
    expect(progress).toEqual(['1/2', '2/2']);
  });

  it('un fichero que no es PDF falla con un mensaje claro, sin cargar nada', async () => {
    await expect(renderPdfPages(pdfFile('notas.txt', 'text/plain'), { pdfjs: fakePdfjs().lib, createCanvas }))
      .rejects.toThrow('El fichero no es un PDF.');
  });

  it('un PDF dañado falla con un mensaje claro', async () => {
    const { lib, calls } = fakePdfjs({ fail: true });
    await expect(renderPdfPages(pdfFile(), { pdfjs: lib, createCanvas }))
      .rejects.toThrow('No se pudo leer el PDF: puede estar dañado o protegido.');
    expect(calls.destroyed).toBe(true);
  });

  it('en inglés', async () => {
    setLang('en', null);
    await expect(renderPdfPages(pdfFile('a.txt', 'text/plain'), { pdfjs: fakePdfjs().lib, createCanvas }))
      .rejects.toThrow('The file is not a PDF.');
  });
});
