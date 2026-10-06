// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isPdf, pdfToDeckFile } from './pdfImport.js';

const PAGE = { src: 'data:image/webp;base64,QUJD', width: 1920, height: 1080 };

describe('pdfToDeckFile — un PDF convertido en una presentación .html', () => {
  it('devuelve un .html con el nombre del PDF y una sección por página', async () => {
    const seen = [];
    const renderPages = async (file, { onProgress }) => {
      seen.push(file.name);
      onProgress(1, 2);
      onProgress(2, 2);
      return [PAGE, PAGE];
    };
    const progress = [];
    const deck = await pdfToDeckFile(new File(['%PDF'], 'Charla final.PDF'), {
      renderPages, onProgress: (done, total) => progress.push(`${done}/${total}`),
    });
    expect(seen).toEqual(['Charla final.PDF']);
    expect(progress).toEqual(['1/2', '2/2']);
    expect(deck.name).toBe('Charla final.html');
    expect(deck.type).toBe('text/html');
    const html = await deck.text();
    expect(html.match(/<section/g)).toHaveLength(2);
    expect(html).toContain('<title>Charla final</title>');
  });

  it('reconoce un PDF por su extensión o por su tipo MIME', () => {
    expect(isPdf(new File(['%PDF'], 'charla.PDF'))).toBe(true);
    expect(isPdf(new File(['%PDF'], 'charla', { type: 'application/pdf' }))).toBe(true);
    expect(isPdf(new File(['x'], 'notas.txt', { type: 'text/plain' }))).toBe(false);
  });

  it('deja pasar el error de render tal cual', async () => {
    const renderPages = async () => { throw new Error('El fichero no es un PDF.'); };
    await expect(pdfToDeckFile(new File(['x'], 'a.txt'), { renderPages }))
      .rejects.toThrow('El fichero no es un PDF.');
  });
});
