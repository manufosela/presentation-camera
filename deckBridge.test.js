// @vitest-environment happy-dom
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { BRIDGE_NAMESPACE, bridgeRequestFromMessage, injectDeckBridge } from './deckBridge.js';

describe('injectDeckBridge — script puente en el HTML local', () => {
  it('añade el script al final del documento sin tocar el original', () => {
    const original = '<html><body><p>deck</p></body></html>';
    const html = injectDeckBridge(original);
    expect(html.startsWith(original)).toBe(true);
    expect(html.endsWith('</script>')).toBe(true);
    expect(html).toContain(BRIDGE_NAMESPACE);
  });

  it('no parte scripts del deck que contienen "</body>" dentro de un string (plugin de notas incrustado)', () => {
    const inlinePlugin = '<script>var view = "<html><body>notas<\\/body></html>"; var raw = \'</body>\';</script>';
    const original = `<html><body><div class="reveal"></div>${inlinePlugin}`; // sin </body> real al final
    const html = injectDeckBridge(original);
    expect(html.startsWith(original)).toBe(true); // el script del deck queda intacto
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = [...doc.querySelectorAll('script')].map(s => s.textContent);
    expect(scripts[0]).toBe('var view = "<html><body>notas<\\/body></html>"; var raw = \'</body>\';');
    expect(scripts.at(-1)).toContain(BRIDGE_NAMESPACE);
  });

  it('el script, ejecutado en el deck, convierte S en un aviso a la app y frena el atajo del deck', () => {
    const html = injectDeckBridge('<html><body></body></html>');
    const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
    const posted = [];
    const fakeWindow = {
      listeners: [],
      addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture }); },
      parent: { postMessage: (data, target) => posted.push([data, target]) },
    };
    runInNewContext(code, { window: fakeWindow, JSON });
    const [listener] = fakeWindow.listeners;
    expect(listener).toMatchObject({ type: 'keydown', capture: true });
    let stopped = false;
    let prevented = false;
    listener.fn({ key: 's', ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
    expect(stopped && prevented).toBe(true);
    expect(bridgeRequestFromMessage(posted[0][0])).toBe('open-notes');
  });

  it('convierte H en la petición de mostrar/ocultar los controles y deja pasar las demás teclas', () => {
    const html = injectDeckBridge('<html><body></body></html>');
    const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
    const posted = [];
    const fakeWindow = {
      listeners: [],
      addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture }); },
      parent: { postMessage: data => posted.push(data) },
    };
    runInNewContext(code, { window: fakeWindow, JSON });
    const [listener] = fakeWindow.listeners;
    const press = key => listener.fn({ key, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopImmediatePropagation() {} });
    press('H');
    press('ArrowRight');
    expect(posted.map(bridgeRequestFromMessage)).toEqual(['toggle-chrome']);
  });
});

describe('bridgeRequestFromMessage — mensajes del script puente', () => {
  it('reconoce la petición de notas', () => {
    expect(bridgeRequestFromMessage(JSON.stringify({ namespace: BRIDGE_NAMESPACE, type: 'open-notes' }))).toBe('open-notes');
  });

  it('reconoce la petición de mostrar/ocultar los controles', () => {
    expect(bridgeRequestFromMessage(JSON.stringify({ namespace: BRIDGE_NAMESPACE, type: 'toggle-chrome' }))).toBe('toggle-chrome');
  });

  it('ignora tipos desconocidos, otros namespaces y basura', () => {
    expect(bridgeRequestFromMessage(JSON.stringify({ namespace: BRIDGE_NAMESPACE, type: 'otro' }))).toBeNull();
    expect(bridgeRequestFromMessage(JSON.stringify({ namespace: 'reveal', eventName: 'ready' }))).toBeNull();
    expect(bridgeRequestFromMessage('no json')).toBeNull();
    expect(bridgeRequestFromMessage({ type: 'open-notes' })).toBeNull();
  });
});
