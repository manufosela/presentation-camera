// @vitest-environment happy-dom
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { BRIDGE_NAMESPACE, bridgeRequestFromMessage, injectDeckBridge } from './deckBridge.js';

describe('injectDeckBridge — script puente en el HTML local', () => {
  it('añade el script antes de </body>', () => {
    const html = injectDeckBridge('<html><body><p>deck</p></body></html>');
    expect(html).toMatch(/<script>[\s\S]*<\/script><\/body>/);
    expect(html).toContain(BRIDGE_NAMESPACE);
  });

  it('sin </body> (HTML abreviado): lo añade al final', () => {
    expect(injectDeckBridge('<p>deck</p>').endsWith('</script>')).toBe(true);
  });

  it('respeta mayúsculas en </BODY>', () => {
    expect(injectDeckBridge('<BODY>x</BODY>')).toMatch(/<\/script><\/BODY>$/);
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
});

describe('bridgeRequestFromMessage — mensajes del script puente', () => {
  it('reconoce la petición de notas', () => {
    expect(bridgeRequestFromMessage(JSON.stringify({ namespace: BRIDGE_NAMESPACE, type: 'open-notes' }))).toBe('open-notes');
  });

  it('ignora tipos desconocidos, otros namespaces y basura', () => {
    expect(bridgeRequestFromMessage(JSON.stringify({ namespace: BRIDGE_NAMESPACE, type: 'otro' }))).toBeNull();
    expect(bridgeRequestFromMessage(JSON.stringify({ namespace: 'reveal', eventName: 'ready' }))).toBeNull();
    expect(bridgeRequestFromMessage('no json')).toBeNull();
    expect(bridgeRequestFromMessage({ type: 'open-notes' })).toBeNull();
  });
});
