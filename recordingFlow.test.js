// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordingFlow } from './recordingFlow.js';
import { setLang } from './i18n.js';

beforeEach(() => setLang('es', null));

// Grabación falsa: startRecording resuelve un controlador cuyo stop() dispara
// el onStop que la app le pasó, como hace recorder.js.
// La descarga llega tras el diálogo de recorte (asíncrono, CAM-TSK-0129).
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function setup({ startFails = false, chapters, countdown, micId = null, review, trim, discardSaved } = {}) {
  const calls = { chrome: [], status: [], downloads: [], blobs: [], changes: 0 };
  let options = null;
  const startRecording = vi.fn(async opts => {
    if (startFails) throw new Error('cancelado');
    options = opts;
    await opts.beforeStart?.(); // como recorder.js: tras aceptar la captura
    let paused = false;
    return {
      stop: () => options.onStop(new Blob(['vídeo']), 'video/webm'),
      pause: () => { paused = true; },
      resume: () => { paused = false; },
      get paused() { return paused; },
      elapsed: () => 1234,
    };
  });
  const flow = createRecordingFlow({
    startRecording,
    download: (blob, filename) => { calls.downloads.push(filename); calls.blobs.push(blob); },
    now: () => new Date(2026, 9, 4, 22, 30, 15),
    setChromeHidden: hidden => calls.chrome.push(hidden),
    showStatus: (message, isError = false) => calls.status.push([message, isError]),
    onChange: () => { calls.changes += 1; },
    logger: { warn() {}, error() {} },
    chapters,
    countdown,
    getMicId: () => micId,
    review,
    trim,
    discardSaved,
  });
  return { flow, calls, startRecording, emitError: error => options.onError(error) };
}

describe('createRecordingFlow — grabar la sesión', () => {
  it('al empezar: graba con micrófono y audio del sistema, oculta los controles y no deja avisos', async () => {
    const { flow, calls, startRecording } = setup();
    await flow.start();
    expect(flow.isRecording()).toBe(true);
    expect(startRecording).toHaveBeenCalledWith(expect.objectContaining({ withMic: true, withSystemAudio: true }));
    expect(calls.chrome).toEqual([true]);
    expect(calls.status).toEqual([['', false]]);
    expect(calls.changes).toBe(1);
  });

  it('al parar: descarga con nombre fechado y vuelve a mostrar los controles', async () => {
    const { flow, calls } = setup();
    await flow.start();
    flow.stop();
    expect(flow.isRecording()).toBe(false);
    await settle();
    expect(calls.downloads).toEqual([expect.stringMatching(/2026-10-04.*\.webm$/)]);
    expect(calls.chrome).toEqual([true, false]);
    expect(calls.changes).toBe(2);
  });

  it('con capítulos: los arranca con la diapositiva actual y al parar descarga también el .vtt (CAM-TSK-0097)', async () => {
    const chapters = { start: vi.fn(), finish: vi.fn(() => ({ toVtt: () => 'WEBVTT\n' })) };
    const { flow, calls } = setup({ chapters: { track: chapters, current: () => 'Diapositiva 3' } });
    await flow.start();
    expect(chapters.start).toHaveBeenCalledWith('Diapositiva 3');
    flow.stop();
    await settle();
    expect(calls.downloads).toEqual([expect.stringMatching(/2026-10-04.*\.webm$/), expect.stringMatching(/2026-10-04.*\.vtt$/)]);
  });

  it('al parar se elige el recorte: se descargan el vídeo y los capítulos recortados (CAM-TSK-0129)', async () => {
    const toVtt = vi.fn(() => 'WEBVTT\n');
    const trimmed = new Blob(['recortado']);
    const review = vi.fn(async () => ({ startSec: 2.5, endSec: 9 }));
    const trim = vi.fn(async () => ({ blob: trimmed, startSec: 2 }));
    const { flow, calls } = setup({ review, trim, chapters: { track: { start() {}, finish: () => ({ toVtt }) }, current: () => 'Diapositiva 1' } });
    await flow.start();
    flow.stop();
    expect(calls.chrome).toEqual([true, false]); // los controles vuelven antes del diálogo
    await settle();
    expect(review).toHaveBeenCalledWith({ blob: expect.any(Blob), durationSec: 1.234 });
    expect(trim).toHaveBeenCalledWith(expect.any(Blob), { startSec: 2.5, endSec: 9 });
    expect(calls.blobs[0]).toBe(trimmed);
    expect(toVtt).toHaveBeenCalledWith({ fromMs: 2000, toMs: 9000 });
    expect(calls.downloads).toHaveLength(2);
  });

  it('si el recorte falla, lo avisa y descarga la grabación entera: nunca se pierde', async () => {
    const trim = vi.fn(async () => { throw new Error('formato raro'); });
    const { flow, calls } = setup({ review: async () => ({ startSec: 1, endSec: 2 }), trim });
    await flow.start();
    flow.stop();
    await settle();
    expect(calls.status.at(-1)).toEqual(['No se pudo recortar: se descarga entera.', true]);
    expect(await calls.blobs[0].text()).toBe('vídeo');
  });

  it('si se descarta (confirmado dos veces) no se descarga nada y se borra la copia (CAM-TSK-0139)', async () => {
    const discardSaved = vi.fn(async () => {});
    const trim = vi.fn();
    const { flow, calls } = setup({ review: async () => ({ discard: true }), trim, discardSaved,
      chapters: { track: { start() {}, finish: () => ({ toVtt: () => 'WEBVTT\n' }) }, current: () => null } });
    await flow.start();
    flow.stop();
    await settle();
    expect(calls.downloads).toEqual([]);
    expect(trim).not.toHaveBeenCalled();
    expect(discardSaved).toHaveBeenCalledOnce();
    expect(calls.status.at(-1)).toEqual(['Grabación descartada.', false]);
  });

  it('si no se puede borrar la copia, no se descarga y se avisa como error', async () => {
    const { flow, calls } = setup({ review: async () => ({ discard: true }), discardSaved: async () => { throw new Error('opfs'); } });
    await flow.start();
    flow.stop();
    await settle();
    expect(calls.downloads).toEqual([]);
    expect(calls.status.at(-1)).toEqual([expect.stringContaining('no se pudo borrar'), true]);
  });

  it('sin capítulos (el deck no avisó) solo se descarga el vídeo', async () => {
    const { flow, calls } = setup({ chapters: { track: { start() {}, finish: () => null }, current: () => null } });
    await flow.start();
    flow.stop();
    await settle();
    expect(calls.downloads).toEqual([expect.stringMatching(/\.webm$/)]);
  });

  it('tras aceptar la captura: oculta controles y avisos y hace la cuenta atrás antes de grabar (CAM-TSK-0099)', async () => {
    const order = [];
    const countdown = vi.fn(async () => order.push('cuenta atrás'));
    const { flow, calls } = setup({ countdown });
    await flow.start();
    expect(countdown).toHaveBeenCalledOnce();
    expect(calls.chrome[0]).toBe(true); // controles ocultos ya durante la cuenta atrás
    expect(calls.status[0]).toEqual(['', false]);
    expect(order).toEqual(['cuenta atrás']);
  });

  it('si falla tras la cuenta atrás (se dejó de compartir), vuelven los controles', async () => {
    const { flow, calls, startRecording } = setup();
    startRecording.mockImplementationOnce(async opts => {
      await opts.beforeStart();
      throw new Error('se dejó de compartir');
    });
    await flow.start();
    expect(flow.isRecording()).toBe(false);
    expect(calls.chrome).toEqual([true, false]);
  });

  it('si se cancela el selector, no hay cuenta atrás', async () => {
    const countdown = vi.fn(async () => {});
    const { flow } = setup({ startFails: true, countdown });
    await flow.start();
    expect(countdown).not.toHaveBeenCalled();
  });

  it('graba con el micrófono elegido en el setup (CAM-TSK-0101)', async () => {
    const { flow, startRecording } = setup({ micId: 'mic-2' });
    await flow.start();
    expect(startRecording).toHaveBeenCalledWith(expect.objectContaining({ micDeviceId: 'mic-2' }));
  });

  it('pausa y reanuda la grabación en curso y avisa del cambio (CAM-TSK-0098)', async () => {
    const { flow, calls } = setup();
    expect(flow.togglePause()).toBe(false); // sin grabar no hay nada que pausar
    await flow.start();
    flow.togglePause();
    expect(flow.isPaused()).toBe(true);
    expect(flow.elapsed()).toBe(1234);
    flow.togglePause();
    expect(flow.isPaused()).toBe(false);
    expect(calls.changes).toBe(3); // empezar, pausar, reanudar
    flow.stop();
    expect(flow.isPaused()).toBe(false);
    expect(flow.elapsed()).toBe(0);
  });

  it('si se cancela el selector, sigue sin grabar y lo dice (sin tono de error)', async () => {
    const { flow, calls } = setup({ startFails: true });
    await flow.start();
    expect(flow.isRecording()).toBe(false);
    expect(calls.status).toEqual([['Grabación no iniciada. Puedes activarla con el botón REC.', false]]);
    expect(calls.chrome).toEqual([]);
  });

  it('toggle alterna, y empezar dos veces no abre otra grabación', async () => {
    const { flow, startRecording } = setup();
    await flow.toggle();
    await flow.start();
    expect(startRecording).toHaveBeenCalledTimes(1);
    await flow.toggle();
    expect(flow.isRecording()).toBe(false);
  });

  it('parar sin grabar no hace nada', async () => {
    const { flow, calls } = setup();
    flow.stop();
    await settle();
    expect(calls.downloads).toEqual([]);
  });

  it('un error durante la grabación se avisa como error', async () => {
    const { flow, calls, emitError } = setup();
    await flow.start();
    emitError(new Error('disco lleno'));
    expect(calls.status.at(-1)).toEqual(['disco lleno', true]);
  });
});
