import { describe, expect, it, vi } from 'vitest';
import { deckCommandForKey, sendDeckCommand } from './deckKeys.js';

const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('deckCommandForKey — teclas de navegación del deck (API postMessage de reveal.js)', () => {
  it.each([
    ['ArrowRight', 'right'],
    ['ArrowLeft', 'left'],
    ['ArrowDown', 'down'],
    ['ArrowUp', 'up'],
    ['PageDown', 'next'],
    ['PageUp', 'prev'],
    [' ', 'next'],
    ['b', 'togglePause'],
    ['B', 'togglePause'],
    ['.', 'togglePause'],
    ['Escape', 'toggleOverview'],
  ])('%j → %s', (k, method) => {
    expect(deckCommandForKey(key(k))).toEqual({ method, args: [] });
  });

  it('S abre las notas del ponente: se simula la tecla dentro del deck (triggerKey)', () => {
    expect(deckCommandForKey(key('s'))).toEqual({ method: 'triggerKey', args: [83] });
    expect(deckCommandForKey(key('S'))).toEqual({ method: 'triggerKey', args: [83] });
  });

  it('Home y End van a la primera y última slide', () => {
    expect(deckCommandForKey(key('Home'))).toEqual({ method: 'slide', args: [0] });
    expect(deckCommandForKey(key('End'))).toEqual({ method: 'slide', args: [Number.MAX_SAFE_INTEGER] });
  });

  it('Shift+Espacio retrocede', () => {
    expect(deckCommandForKey(key(' ', { shiftKey: true }))).toEqual({ method: 'prev', args: [] });
  });

  it('no captura combinaciones con Ctrl/Meta/Alt (atajos del navegador)', () => {
    expect(deckCommandForKey(key('ArrowRight', { altKey: true }))).toBeNull();
    expect(deckCommandForKey(key('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(deckCommandForKey(key('b', { metaKey: true }))).toBeNull();
  });

  it('las teclas de la app no son del deck', () => {
    for (const k of ['c', 'm', 'r', 'f', 'h', '1', '\\']) {
      expect(deckCommandForKey(key(k))).toBeNull();
    }
  });
});

describe('sendDeckCommand', () => {
  it('envía el comando como JSON (formato reveal.js) al contentWindow del iframe', () => {
    const postMessage = vi.fn();
    const sent = sendDeckCommand({ contentWindow: { postMessage } }, { method: 'next', args: [] });
    expect(sent).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ method: 'next', args: [] }), '*');
  });

  it('devuelve false si no hay iframe o aún no tiene ventana', () => {
    expect(sendDeckCommand(null, { method: 'next', args: [] })).toBe(false);
    expect(sendDeckCommand({ contentWindow: null }, { method: 'next', args: [] })).toBe(false);
  });
});
