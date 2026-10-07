// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runCountdown } from './countdown.js';

describe('runCountdown — 3, 2, 1 antes de grabar (CAM-TSK-0099)', () => {
  it('muestra cada número un segundo y al terminar se oculta', async () => {
    const el = document.createElement('div');
    el.hidden = true;
    const seen = [];
    await runCountdown(el, 3, {
      wait: async ms => { seen.push([el.hidden, el.textContent, ms]); },
      nextFrame: async () => { seen.push(['frame', el.hidden]); },
    });
    expect(seen).toEqual([
      [false, '3', 1000],
      [false, '2', 1000],
      [false, '1', 1000],
      ['frame', true], // oculto y pintado antes de devolver: no sale en el vídeo
    ]);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe('');
  });
});
