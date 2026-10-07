// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

// Contrato de precam.css: con body.chrome-hidden (H, el ojo o al empezar a
// grabar) no queda nada de la app encima de la presentación, ni siquiera los
// avisos de estado, porque saldrían en la grabación (CAM-BUG-0009).
const css = readFileSync('precam.css', 'utf8');

beforeEach(() => {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.className = '';
  document.body.innerHTML = '<div id="statusMessage" class="toast" role="status">Aviso</div>';
});

const toastDisplay = () => getComputedStyle(document.getElementById('statusMessage')).display;

describe('controles ocultos', () => {
  it('el aviso de estado se ve con los controles visibles', () => {
    expect(toastDisplay()).not.toBe('none');
  });

  it('el aviso de estado se oculta con los controles ocultos', () => {
    document.body.classList.add('chrome-hidden');
    expect(toastDisplay()).toBe('none');
  });

  it('los subtítulos no se ocultan: son parte de lo que se graba (CAM-TSK-0118)', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="captionsOverlay" class="captions-overlay"><p class="caption-line">hola</p></div>');
    document.body.classList.add('chrome-hidden');
    expect(getComputedStyle(document.getElementById('captionsOverlay')).display).not.toBe('none');
  });
});
