// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

// Contrato de precam.css: la maqueta «Camera stage» del setup refleja el
// tratamiento elegido; con «No camera» no se dibuja el recuadro (CAM-BUG-0019).
const css = readFileSync('precam.css', 'utf8');

function renderSetup(style) {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = `<section class="setup">
    <input type="radio" name="webcam-style" value="frame" ${style === 'frame' ? 'checked' : ''}>
    <input type="radio" name="webcam-style" value="none" ${style === 'none' ? 'checked' : ''}>
    <div class="stage-mock"><div class="stage-mock-cam"></div></div>
  </section>`;
}

const camDisplay = () => getComputedStyle(document.querySelector('.stage-mock-cam')).display;

describe('maqueta del setup', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('con marco se ve el recuadro de la cámara', () => {
    renderSetup('frame');
    expect(camDisplay()).not.toBe('none');
  });

  it('con «No camera» no se dibuja el recuadro', () => {
    renderSetup('none');
    expect(camDisplay()).toBe('none');
  });
});
