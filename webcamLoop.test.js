import { describe, expect, it, vi } from 'vitest';
import { coverRect, createCutoutRenderer, createFrameLoop } from './webcamLoop.js';

// requestAnimationFrame manual: los frames solo avanzan con tick().
function fakeFrames() {
  let pending = new Map();
  let nextId = 1;
  return {
    request: cb => { const id = nextId++; pending.set(id, cb); return id; },
    cancel: id => pending.delete(id),
    tick() { const due = pending; pending = new Map(); due.forEach(cb => cb()); },
    pendingCount: () => pending.size,
  };
}

describe('createFrameLoop — ciclo de requestAnimationFrame', () => {
  it('llama a step en cada frame mientras devuelva true', () => {
    const frames = fakeFrames();
    const step = vi.fn(() => true);
    const loop = createFrameLoop({ step, requestFrame: frames.request, cancelFrame: frames.cancel });
    loop.start();
    frames.tick();
    frames.tick();
    expect(step).toHaveBeenCalledTimes(3);
    expect(loop.isRunning()).toBe(true);
  });

  it('se detiene solo cuando step devuelve false', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop({ step: () => false, requestFrame: frames.request, cancelFrame: frames.cancel });
    loop.start();
    expect(loop.isRunning()).toBe(false);
    expect(frames.pendingCount()).toBe(0);
  });

  it('start con el bucle ya en marcha no crea un segundo bucle', () => {
    const frames = fakeFrames();
    const step = vi.fn(() => true);
    const loop = createFrameLoop({ step, requestFrame: frames.request, cancelFrame: frames.cancel });
    loop.start();
    loop.start();
    expect(frames.pendingCount()).toBe(1);
  });

  it('stop cancela el frame pendiente', () => {
    const frames = fakeFrames();
    const step = vi.fn(() => true);
    const loop = createFrameLoop({ step, requestFrame: frames.request, cancelFrame: frames.cancel });
    loop.start();
    loop.stop();
    frames.tick();
    expect(step).toHaveBeenCalledTimes(1);
    expect(loop.isRunning()).toBe(false);
  });
});

// Canvas falso que registra las operaciones de dibujo.
function fakeCanvas() {
  const ops = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    clearRect: () => ops.push('clear'),
    drawImage: () => ops.push(`draw:${ctx.globalCompositeOperation}`),
    putImageData: () => ops.push('mask'),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    translate: (x, y) => ops.push(`translate:${x},${y}`),
    scale: (x, y) => ops.push(`scale:${x},${y}`),
  };
  return { width: 0, height: 0, getContext: () => ctx, ops };
}

const video = { videoWidth: 640, videoHeight: 480 };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('coverRect — la imagen cubre el recuadro sin deformarse', () => {
  it('más ancha que el recuadro: recorta los lados', () => {
    expect(coverRect(1600, 900, 640, 480)).toEqual({ sx: 200, sy: 0, sw: 1200, sh: 900 });
  });

  it('más alta que el recuadro: recorta arriba y abajo', () => {
    expect(coverRect(800, 1200, 640, 480)).toEqual({ sx: 0, sy: 300, sw: 800, sh: 600 });
  });

  it('misma proporción: la imagen entera', () => {
    expect(coverRect(1280, 960, 640, 480)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 960 });
  });
});

describe('createCutoutRenderer — un frame del modo recorte', () => {
  it('ajusta el canvas al vídeo y pide una segmentación', async () => {
    const canvas = fakeCanvas();
    const segment = vi.fn(async () => ({ data: Uint8Array.from([1, 1, 0, 0]), mask: {} }));
    const renderer = createCutoutRenderer({ video, canvas, segment, now: () => 0 });
    renderer.drawFrame();
    expect([canvas.width, canvas.height]).toEqual([640, 480]);
    expect(segment).toHaveBeenCalledTimes(1);
  });

  it('con persona y máscara: compone vídeo dentro de la máscara', async () => {
    const canvas = fakeCanvas();
    const segment = async () => ({ data: Uint8Array.from([1, 1, 0, 0]), mask: {} });
    const renderer = createCutoutRenderer({ video, canvas, segment, now: () => 0 });
    renderer.drawFrame();
    await flush();
    canvas.ops.length = 0;
    renderer.drawFrame();
    expect(canvas.ops).toEqual(['clear', 'mask', 'draw:source-in']);
    expect(canvas.getContext().globalCompositeOperation).toBe('source-over');
  });

  it('con fondo elegido: lo pinta detrás de la persona, recortado para cubrir el recuadro', async () => {
    const canvas = fakeCanvas();
    const background = { width: 1600, height: 900 }; // 16:9 sobre un recuadro 4:3
    const segment = async () => ({ data: Uint8Array.from([1, 1, 0, 0]), mask: {} });
    const renderer = createCutoutRenderer({ video, canvas, segment, now: () => 0, getBackground: () => background });
    renderer.drawFrame();
    await flush();
    canvas.ops.length = 0;
    const draw = vi.spyOn(canvas.getContext(), 'drawImage');
    renderer.drawFrame();
    // La cámara se muestra en espejo (CSS scaleX(-1)): el fondo se pinta volteado
    // para que, tras el espejo, se lea al derecho (CAM-BUG-0020).
    expect(canvas.ops).toEqual([
      'clear', 'mask', 'draw:source-in',
      'save', 'translate:640,0', 'scale:-1,1', 'draw:destination-over', 'restore',
    ]);
    expect(draw).toHaveBeenLastCalledWith(background, 200, 0, 1200, 900, 0, 0, 640, 480);
    expect(canvas.getContext().globalCompositeOperation).toBe('source-over');
  });

  it('no solapa segmentaciones ni repite antes del intervalo', async () => {
    let time = 0;
    let resolveSeg;
    const segment = vi.fn(() => new Promise(resolve => { resolveSeg = resolve; }));
    const renderer = createCutoutRenderer({ video, canvas: fakeCanvas(), segment, now: () => time, intervalMs: 50 });
    renderer.drawFrame();
    renderer.drawFrame(); // la primera sigue en curso
    expect(segment).toHaveBeenCalledTimes(1);
    resolveSeg({ data: Uint8Array.from([1]), mask: {} });
    await flush();
    time = 20;
    renderer.drawFrame(); // antes de 50 ms
    expect(segment).toHaveBeenCalledTimes(1);
    time = 60;
    renderer.drawFrame();
    expect(segment).toHaveBeenCalledTimes(2);
  });

  it('sin persona durante 1,5 s: dibuja la cámara completa y lo indica', async () => {
    let time = 0;
    const canvas = fakeCanvas();
    const segment = async () => ({ data: new Uint8Array(4), mask: {} });
    const renderer = createCutoutRenderer({ video, canvas, segment, now: () => time });
    for (time = 0; time <= 1600; time += 100) {
      renderer.drawFrame();
      await flush();
    }
    expect(renderer.isPersonPresent()).toBe(false);
    canvas.ops.length = 0;
    renderer.drawFrame();
    expect(canvas.ops).toEqual(['clear', 'draw:source-over']);
  });

  it('reset descarta una segmentación en curso de la cámara anterior y no bloquea la nueva', async () => {
    const canvas = fakeCanvas();
    const pending = [];
    const segment = vi.fn(() => new Promise(resolve => pending.push(resolve)));
    const renderer = createCutoutRenderer({ video, canvas, segment, now: () => 0 });
    renderer.drawFrame(); // segmentación de la cámara vieja, colgada
    renderer.reset(); // cambio de cámara
    renderer.drawFrame(); // la nueva segmenta enseguida, sin esperar a la vieja
    expect(segment).toHaveBeenCalledTimes(2);
    pending[0]({ data: new Uint8Array(4), mask: { old: true } }); // la vieja llega tarde
    await flush();
    canvas.ops.length = 0;
    renderer.drawFrame();
    expect(canvas.ops).toEqual(['clear']); // su máscara no se usa
  });

  it('reset olvida la ausencia anterior (p. ej. al cambiar de cámara)', async () => {
    let time = 0;
    const segment = async () => ({ data: new Uint8Array(4), mask: {} });
    const renderer = createCutoutRenderer({ video, canvas: fakeCanvas(), segment, now: () => time });
    for (time = 0; time <= 1600; time += 100) {
      renderer.drawFrame();
      await flush();
    }
    renderer.reset();
    expect(renderer.isPersonPresent()).toBe(true);
  });
});
