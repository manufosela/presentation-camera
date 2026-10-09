// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { onActiveDeckLoaded } from './deckLoadNotice.js';

function frameWith({ src = 'https://decks.test/charla/', active = true } = {}) {
  const frame = document.createElement('iframe');
  if (src) frame.setAttribute('src', src);
  frame.classList.toggle('is-active', active);
  return frame;
}

describe('onActiveDeckLoaded — quitar «Cargando presentación…» (CAM-BUG-0023)', () => {
  it('avisa cuando el deck activo termina de cargar', () => {
    const frame = frameWith();
    const done = vi.fn();
    onActiveDeckLoaded(frame, done);
    frame.dispatchEvent(new Event('load'));
    expect(done).toHaveBeenCalledOnce();
  });

  it('no avisa por un deck que no es el activo', () => {
    const frame = frameWith({ active: false });
    const done = vi.fn();
    onActiveDeckLoaded(frame, done);
    frame.dispatchEvent(new Event('load'));
    expect(done).not.toHaveBeenCalled();
  });

  it('no avisa por el about:blank de un iframe que aún no tiene src (deck local)', () => {
    const frame = frameWith({ src: null });
    const done = vi.fn();
    onActiveDeckLoaded(frame, done);
    frame.dispatchEvent(new Event('load'));
    expect(done).not.toHaveBeenCalled();
  });
});
