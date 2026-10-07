// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecordingFlow } from './recordingFlow.js';
import { setLang } from './i18n.js';

beforeEach(() => setLang('es', null));

// Grabación falsa: startRecording resuelve un controlador cuyo stop() dispara
// el onStop que la app le pasó, como hace recorder.js.
function setup({ startFails = false, chapters } = {}) {
  const calls = { chrome: [], status: [], downloads: [], changes: 0 };
  let options = null;
  const startRecording = vi.fn(async opts => {
    if (startFails) throw new Error('cancelado');
    options = opts;
    return { stop: () => options.onStop(new Blob(['vídeo']), 'video/webm') };
  });
  const flow = createRecordingFlow({
    startRecording,
    download: (blob, filename) => calls.downloads.push(filename),
    now: () => new Date(2026, 9, 4, 22, 30, 15),
    setChromeHidden: hidden => calls.chrome.push(hidden),
    showStatus: (message, isError = false) => calls.status.push([message, isError]),
    onChange: () => { calls.changes += 1; },
    logger: { warn() {}, error() {} },
    chapters,
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
    expect(calls.downloads).toEqual([expect.stringMatching(/2026-10-04.*\.webm$/)]);
    expect(calls.chrome).toEqual([true, false]);
    expect(calls.changes).toBe(2);
  });

  it('con capítulos: los arranca con la diapositiva actual y al parar descarga también el .vtt (CAM-TSK-0097)', async () => {
    const chapters = { start: vi.fn(), finish: vi.fn(() => 'WEBVTT\n') };
    const { flow, calls } = setup({ chapters: { track: chapters, current: () => 'Diapositiva 3' } });
    await flow.start();
    expect(chapters.start).toHaveBeenCalledWith('Diapositiva 3');
    flow.stop();
    expect(calls.downloads).toEqual([expect.stringMatching(/2026-10-04.*\.webm$/), expect.stringMatching(/2026-10-04.*\.vtt$/)]);
  });

  it('sin capítulos (el deck no avisó) solo se descarga el vídeo', async () => {
    const { flow, calls } = setup({ chapters: { track: { start() {}, finish: () => null }, current: () => null } });
    await flow.start();
    flow.stop();
    expect(calls.downloads).toEqual([expect.stringMatching(/\.webm$/)]);
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

  it('parar sin grabar no hace nada', () => {
    const { flow, calls } = setup();
    flow.stop();
    expect(calls.downloads).toEqual([]);
  });

  it('un error durante la grabación se avisa como error', async () => {
    const { flow, calls, emitError } = setup();
    await flow.start();
    emitError(new Error('disco lleno'));
    expect(calls.status.at(-1)).toEqual(['disco lleno', true]);
  });
});
