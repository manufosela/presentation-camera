// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { imagesToDeckFile } from './imageImport.js';

const image = name => new File(['img'], name, { type: 'image/png' });
const readImage = async file => {
  if (file.name.startsWith('rota')) throw new Error('no se puede decodificar');
  return `data:image/png;base64,${btoa(file.name)}`;
};

describe('imagesToDeckFile — varias imágenes como un deck navegable (CAM-TSK-0014)', () => {
  it('ordena por nombre con números naturales y crea una sección por imagen', async () => {
    const { deck, skipped } = await imagesToDeckFile(
      [image('slide-10.png'), image('slide-2.png'), image('slide-1.png')], { readImage });
    const html = await deck.text();
    const order = [...html.matchAll(/base64,([^"]+)"/g)].map(([, b64]) => atob(b64));
    expect(order).toEqual(['slide-1.png', 'slide-2.png', 'slide-10.png']);
    expect(skipped).toEqual([]);
    expect(deck.name).toBe('slide-1.html');
    expect(deck.type).toBe('text/html');
  });

  it('omite las imágenes que no cargan y dice cuáles', async () => {
    const { deck, skipped } = await imagesToDeckFile([image('a.png'), image('rota.png')], { readImage });
    expect((await deck.text()).match(/<section/g)).toHaveLength(1);
    expect(skipped).toEqual(['rota.png']);
  });

  it('falla si ninguna imagen carga', async () => {
    await expect(imagesToDeckFile([image('rota.png')], { readImage })).rejects.toThrow('rota.png');
  });
});
