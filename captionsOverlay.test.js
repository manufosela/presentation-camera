// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { renderCaptions } from './captionsOverlay.js';

let overlay;
beforeEach(() => {
  document.body.innerHTML = '<div id="captionsOverlay" hidden></div>';
  overlay = document.getElementById('captionsOverlay');
});

const snap = (lines, status = 'listening') => ({ status, error: null, translationError: null, lines });
const shown = () => [...overlay.querySelectorAll('.caption-line')].map(line => ({
  text: line.textContent,
  pending: line.classList.contains('is-pending'),
}));

describe('renderCaptions — subtítulos sobre la presentación (CAM-TSK-0118)', () => {
  it('pinta las líneas en orden; la provisional se marca', () => {
    renderCaptions(overlay, snap([{ id: 1, text: 'hola a todos', final: true }, { id: 2, text: 'bienve', final: false }]));
    expect(overlay.hidden).toBe(false);
    expect(shown()).toEqual([{ text: 'hola a todos', pending: false }, { text: 'bienve', pending: true }]);
  });

  it('traduciendo, muestra la traducción y, mientras llega, el original como pendiente', () => {
    renderCaptions(overlay, snap([
      { id: 1, text: 'hola', final: true, translation: 'hello' },
      { id: 2, text: 'adiós', final: true, translation: null },
    ]), { translated: true });
    expect(shown()).toEqual([{ text: 'hello', pending: false }, { text: 'adiós', pending: true }]);
  });

  it('traduciendo, la traducción de una frase aún provisional se marca como pendiente (CAM-TSK-0159)', () => {
    renderCaptions(overlay, snap([{ id: 1, text: 'hola a to', final: false, translation: 'hello' }]), { translated: true });
    expect(shown()).toEqual([{ text: 'hello', pending: true }]);
  });

  it('el texto se pinta como texto, nunca como HTML', () => {
    renderCaptions(overlay, snap([{ id: 1, text: '<img src=x onerror=alert(1)>', final: true }]));
    expect(overlay.querySelector('img')).toBeNull();
    expect(shown()[0].text).toBe('<img src=x onerror=alert(1)>');
  });

  it('parado, en error o sin líneas, se oculta', () => {
    renderCaptions(overlay, snap([{ id: 1, text: 'hola', final: true }]));
    renderCaptions(overlay, snap([], 'listening'));
    expect(overlay.hidden).toBe(true);
    renderCaptions(overlay, snap([{ id: 1, text: 'hola', final: true }], 'error'));
    expect(overlay.hidden).toBe(true);
  });
});
