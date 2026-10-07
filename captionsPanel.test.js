// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { captionsMessage, createTranscript, parseCaptionsMessage } from './captionsPanel.js';

describe('mensajes de subtítulos entre la ventana y el panel (CAM-TSK-0119)', () => {
  it('la ventana publica cada frase final con su traducción', () => {
    expect(captionsMessage({ id: 3, text: 'hola', final: true, translation: 'hello' }))
      .toEqual({ type: 'captions:line', id: 3, text: 'hola', translation: 'hello' });
  });

  it('el panel valida lo que recibe antes de pintarlo', () => {
    expect(parseCaptionsMessage({ type: 'captions:line', id: 3, text: ' hola ', translation: null }))
      .toEqual({ id: 3, text: 'hola', translation: null });
    for (const bad of [
      null,
      { type: 'otra', id: 1, text: 'x' },
      { type: 'captions:line', id: -1, text: 'x' },
      { type: 'captions:line', id: 1.5, text: 'x' },
      { type: 'captions:line', id: 1, text: 42 },
      { type: 'captions:line', id: 1, text: '' },
      { type: 'captions:line', id: 1, text: 'x'.repeat(1001) },
      { type: 'captions:line', id: 1, text: 'x', translation: 7 },
    ]) expect(parseCaptionsMessage(bad)).toBeNull();
  });
});

describe('createTranscript — transcripción en el panel', () => {
  let list;
  beforeEach(() => {
    document.body.innerHTML = '<ol id="transcript"></ol>';
    list = document.getElementById('transcript');
  });
  const entries = () => [...list.children].map(item => item.textContent);

  it('acumula las frases en orden y pone la traducción cuando llega, en su frase', () => {
    const transcript = createTranscript(list);
    transcript.add({ id: 1, text: 'hola', translation: null });
    transcript.add({ id: 2, text: 'adiós', translation: null });
    transcript.add({ id: 1, text: 'hola', translation: 'hello' });
    expect(entries()).toEqual(['hola hello', 'adiós']);
    expect(list.querySelector('.transcript-translation').textContent).toBe('hello');
  });

  it('se pinta como texto, nunca como HTML', () => {
    createTranscript(list).add({ id: 1, text: '<b>hola</b>', translation: null });
    expect(list.querySelector('b')).toBeNull();
  });

  it('guarda como mucho las últimas entradas y se puede vaciar', () => {
    const transcript = createTranscript(list, { maxEntries: 2 });
    for (const id of [1, 2, 3]) transcript.add({ id, text: `frase ${id}`, translation: null });
    expect(entries()).toEqual(['frase 2', 'frase 3']);
    transcript.clear();
    expect(entries()).toEqual([]);
  });
});
