import { describe, expect, it, vi } from 'vitest';
import { createCaptionsSession } from './captionsSession.js';

// Motor falso: guarda onChange para emitir instantáneas como captionsEngine.
function setup({ translatorFails = false } = {}) {
  let emit = null;
  const engine = { start: vi.fn(), stop: vi.fn() };
  const translator = { destroy: vi.fn() };
  const calls = { renders: [], published: [] };
  const onError = vi.fn();
  const session = createCaptionsSession({
    createEngine: onChange => { emit = onChange; return engine; },
    createTranslator: vi.fn(async () => { if (translatorFails) throw new Error('falta descargar'); return translator; }),
    render: (snapshot, options) => calls.renders.push({ snapshot, options }),
    publish: message => calls.published.push(message),
    onError,
  });
  const snap = (lines, status = 'listening', error = null) => emit({ status, error, translationError: null, lines });
  return { session, engine, translator, calls, snap, onError };
}

describe('createCaptionsSession — subtítulos al presentar (CAM-TSK-0121)', () => {
  it('arranca en el idioma hablado y, si se pidió, con traductor', async () => {
    const { session, engine, translator } = setup();
    await session.start({ spoken: 'es', translateTo: 'en' });
    expect(engine.start).toHaveBeenCalledWith('es', { translator });
    expect(session.isOn()).toBe(true);
  });

  it('si el traductor no está listo, subtitula sin traducir y lo avisa', async () => {
    const { session, engine, onError } = setup({ translatorFails: true });
    await session.start({ spoken: 'es', translateTo: 'en' });
    expect(engine.start).toHaveBeenCalledWith('es', { translator: null });
    expect(onError).toHaveBeenCalledWith('translator-unavailable');
  });

  it('cada instantánea se pinta (traducida si hay traductor) y las finales van al panel una vez por cambio', async () => {
    const { session, calls, snap } = setup();
    await session.start({ spoken: 'es', translateTo: 'en' });
    snap([{ id: 1, text: 'ho', final: false, translation: null }]);
    snap([{ id: 1, text: 'hola', final: true, translation: null }]);
    snap([{ id: 1, text: 'hola', final: true, translation: null }]);
    snap([{ id: 1, text: 'hola', final: true, translation: 'hello' }]);
    expect(calls.renders.at(-1).options).toEqual({ translated: true });
    expect(calls.published).toEqual([
      { type: 'captions:line', id: 1, text: 'hola', translation: null },
      { type: 'captions:line', id: 1, text: 'hola', translation: 'hello' },
    ]);
  });

  it('un error del motor se avisa', async () => {
    const { session, snap, onError } = setup();
    await session.start({ spoken: 'es', translateTo: null });
    snap([], 'error', 'not-allowed');
    snap([], 'error', 'not-allowed'); // el mismo error no se repite
    expect(onError).toHaveBeenCalledExactlyOnceWith('not-allowed');
  });

  it('si se para mientras se prepara el traductor, no arranca y lo suelta', async () => {
    const { session, engine, translator } = setup();
    const starting = session.start({ spoken: 'es', translateTo: 'en' });
    session.stop();
    await starting;
    expect(engine.start).not.toHaveBeenCalled();
    expect(translator.destroy).toHaveBeenCalled();
  });

  it('parar detiene el motor, suelta el traductor y vacía el panel; alternar enciende y apaga', async () => {
    const { session, engine, translator, calls } = setup();
    await session.toggle({ spoken: 'es', translateTo: 'en' });
    await session.toggle({ spoken: 'es', translateTo: 'en' });
    expect(engine.stop).toHaveBeenCalled();
    expect(translator.destroy).toHaveBeenCalled();
    expect(calls.published.at(-1)).toEqual({ type: 'captions:clear' });
    expect(session.isOn()).toBe(false);
  });
});
