// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { trapTabKey } from './focusTrap.js';

let dialog;
let first;
let last;
beforeEach(() => {
  document.body.innerHTML = `
    <button id="outside">fuera</button>
    <div id="dialog">
      <button id="first">cerrar</button>
      <a id="link" href="#x">enlace</a>
      <button id="disabled" disabled>no</button>
      <button id="last">hecho</button>
    </div>`;
  dialog = document.getElementById('dialog');
  first = document.getElementById('first');
  last = document.getElementById('last');
});

const tab = (shiftKey = false) => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true });
  return event;
};

describe('trapTabKey — el foco no sale del diálogo modal', () => {
  it('Tab en el último elemento vuelve al primero', () => {
    last.focus();
    const event = tab();
    trapTabKey(dialog, event);
    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Shift+Tab en el primero va al último', () => {
    first.focus();
    const event = tab(true);
    trapTabKey(dialog, event);
    expect(document.activeElement).toBe(last);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Tab en medio: deja actuar al navegador', () => {
    document.getElementById('link').focus();
    const event = tab();
    trapTabKey(dialog, event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('foco fuera del diálogo: lo trae al primero', () => {
    document.getElementById('outside').focus();
    const event = tab();
    trapTabKey(dialog, event);
    expect(document.activeElement).toBe(first);
  });

  it('otras teclas: no hace nada', () => {
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    trapTabKey(dialog, event);
    expect(document.activeElement).toBe(last);
    expect(event.defaultPrevented).toBe(false);
  });
});
