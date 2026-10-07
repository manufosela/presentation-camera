import { describe, expect, it, vi } from 'vitest';
import { createInkLayer, nextInkMode, trailAt } from './inkLayer.js';

describe('nextInkMode — atajos L, D y Esc (CAM-TSK-0130)', () => {
  it('L y D encienden su modo o lo apagan; Esc apaga; lo demás no es de la tinta', () => {
    expect(nextInkMode('off', 'l')).toBe('laser');
    expect(nextInkMode('laser', 'L')).toBe('off');
    expect(nextInkMode('laser', 'd')).toBe('draw');
    expect(nextInkMode('draw', 'D')).toBe('off');
    expect(nextInkMode('draw', 'Escape')).toBe('off');
    expect(nextInkMode('off', 'Escape')).toBeNull(); // Esc sigue siendo del deck
    expect(nextInkMode('laser', 'x')).toBeNull();
  });
});

// Canvas falso: registra lo que se pinta; los frames se lanzan a mano.
function fakeCanvas() {
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn() };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, ctx };
}

function setup() {
  const { canvas, ctx } = fakeCanvas();
  let time = 1000;
  let pending = null;
  const ink = createInkLayer({ canvas, now: () => time, requestFrame: cb => { pending = cb; return 1; }, pixelRatio: () => 2 });
  const frame = () => { const run = pending; pending = null; run?.(); };
  return { ink, ctx, canvas, frame, at: ms => { time = ms; }, hasFrame: () => pending !== null };
}

describe('trailAt — estela del láser', () => {
  it('se queda con los puntos de los últimos 400 ms', () => {
    const points = [{ x: 0, y: 0, t: 100 }, { x: 1, y: 1, t: 700 }, { x: 2, y: 2, t: 1000 }];
    expect(trailAt(points, 1000)).toEqual(points.slice(1));
  });
});

describe('createInkLayer — láser y dibujo sobre la diapositiva (CAM-TSK-0112)', () => {
  it('ajusta el canvas a la pantalla con la densidad de píxeles', () => {
    const { ink, canvas, ctx } = setup();
    ink.resize(800, 450);
    expect([canvas.width, canvas.height]).toEqual([1600, 900]);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('apagada no pinta nada', () => {
    const { ink, ctx, hasFrame } = setup();
    ink.pointerDown(10, 10);
    ink.pointerMove(20, 20);
    expect(hasFrame()).toBe(false);
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('el láser pinta un punto con estela; la estela se apaga y el punto se queda', () => {
    const { ink, ctx, frame, at, hasFrame } = setup();
    ink.setMode('laser');
    ink.pointerMove(10, 10);
    at(1100);
    ink.pointerMove(30, 40);
    frame();
    expect(ctx.lineTo).toHaveBeenCalledWith(30, 40); // estela
    expect(ctx.arc).toHaveBeenLastCalledWith(30, 40, expect.any(Number), 0, Math.PI * 2); // punto
    expect(hasFrame()).toBe(true); // sigue animando mientras se desvanece
    at(2000);
    ctx.lineTo.mockClear();
    frame();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenLastCalledWith(30, 40, expect.any(Number), 0, Math.PI * 2);
    expect(hasFrame()).toBe(false); // sin estela, no gasta frames
  });

  it('dibujar deja trazos; al salir del modo se borran', () => {
    const { ink, ctx, frame } = setup();
    ink.setMode('draw');
    ink.pointerDown(0, 0);
    ink.pointerMove(5, 5);
    ink.pointerMove(9, 3);
    ink.pointerUp();
    ink.pointerMove(50, 50); // sin pulsar: no dibuja
    frame();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo.mock.calls).toEqual([[5, 5], [9, 3]]);
    expect(ink.mode()).toBe('draw');
    ink.setMode('off');
    ctx.lineTo.mockClear();
    frame();
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it('clear borra los trazos sin salir del modo', () => {
    const { ink, ctx, frame } = setup();
    ink.setMode('draw');
    ink.pointerDown(0, 0);
    ink.pointerMove(5, 5);
    ink.clear();
    frame();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ink.mode()).toBe('draw');
  });

  it('un modo desconocido es un error', () => {
    expect(() => setup().ink.setMode('pincel')).toThrow(/modo/);
  });
});
