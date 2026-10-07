// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyEmptyState } from './emptyState.js';

function setupDom() {
  document.body.innerHTML = `
    <main id="setup"><button id="startButton"></button><p id="startHint" hidden></p></main>`;
  return {
    setup: document.getElementById('setup'),
    startButton: document.getElementById('startButton'),
    startHint: document.getElementById('startHint'),
  };
}

describe('applyEmptyState — primera visita sin presentaciones (CAM-TSK-0085)', () => {
  it('sin presentaciones: estado vacío, botón desactivado y pista visible', () => {
    const dom = setupDom();
    applyEmptyState(dom, true);
    expect(dom.setup.classList.contains('is-empty')).toBe(true);
    expect(dom.startButton.disabled).toBe(true);
    expect(dom.startHint.hidden).toBe(false);
  });

  it('con alguna presentación: todo vuelve a la normalidad', () => {
    const dom = setupDom();
    applyEmptyState(dom, true);
    applyEmptyState(dom, false);
    expect(dom.setup.classList.contains('is-empty')).toBe(false);
    expect(dom.startButton.disabled).toBe(false);
    expect(dom.startHint.hidden).toBe(true);
  });
});
