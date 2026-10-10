import { describe, expect, it, vi } from 'vitest';
import { createCaptionsEngine } from './captionsEngine.js';

// Reconocedor falso: guarda los callbacks para emitir frases y errores.
function setup({ maxLines = 2 } = {}) {
  let callbacks = null;
  const recognizer = { start: vi.fn(), stop: vi.fn() };
  const createRecognizer = vi.fn(options => { callbacks = options; return recognizer; });
  const snapshots = [];
  const engine = createCaptionsEngine({ createRecognizer, maxLines, onChange: snapshot => snapshots.push(snapshot) });
  return {
    engine, recognizer, createRecognizer, snapshots,
    interim: text => callbacks.onInterim(text),
    final: text => callbacks.onFinal(text),
    fail: code => callbacks.onError(Object.assign(new Error(code), { code })),
    texts: () => engine.snapshot().lines.map(line => `${line.text}${line.final ? '' : '…'}`),
  };
}

describe('createCaptionsEngine — subtítulos estables (CAM-TSK-0116)', () => {
  it('parado al principio; al empezar crea el reconocedor del idioma y escucha', () => {
    const { engine, createRecognizer, recognizer } = setup();
    expect(engine.snapshot()).toEqual({ status: 'stopped', error: null, translationError: null, lines: [] });
    engine.start('es');
    expect(createRecognizer).toHaveBeenCalledWith(expect.objectContaining({ lang: 'es' }));
    expect(recognizer.start).toHaveBeenCalled();
    expect(engine.snapshot().status).toBe('listening');
  });

  it('la frase provisional ocupa la última línea y la final la sustituye', () => {
    const { engine, interim, final, texts } = setup();
    engine.start('es');
    interim('hola');
    interim('hola a');
    expect(texts()).toEqual(['hola a…']);
    final('hola a todos');
    expect(texts()).toEqual(['hola a todos']);
    interim('bienvenidos');
    expect(texts()).toEqual(['hola a todos', 'bienvenidos…']);
  });

  it('solo se quedan las últimas líneas, cada una con su id', () => {
    const { engine, final, texts } = setup({ maxLines: 2 });
    engine.start('es');
    final('uno');
    final('dos');
    final('tres');
    expect(texts()).toEqual(['dos', 'tres']);
    const ids = engine.snapshot().lines.map(line => line.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('cada cambio avisa con una instantánea que no se puede modificar', () => {
    const { engine, final, snapshots } = setup();
    engine.start('es');
    final('hola');
    const last = snapshots.at(-1);
    expect(last.lines[0].text).toBe('hola');
    expect(Object.isFrozen(last) && Object.isFrozen(last.lines) && Object.isFrozen(last.lines[0])).toBe(true);
  });

  it('un error del reconocedor pasa a error con su código', () => {
    const { engine, fail } = setup();
    engine.start('es');
    fail('not-allowed');
    expect(engine.snapshot()).toMatchObject({ status: 'error', error: 'not-allowed' });
  });

  it('parar detiene el reconocedor y limpia; lo que llegue después se ignora', () => {
    const { engine, recognizer, final } = setup();
    engine.start('es');
    final('hola');
    engine.stop();
    expect(recognizer.stop).toHaveBeenCalled();
    expect(engine.snapshot()).toEqual({ status: 'stopped', error: null, translationError: null, lines: [] });
    final('tarde');
    expect(engine.snapshot().lines).toEqual([]);
  });

  it('arrancar de nuevo para el reconocedor anterior', () => {
    const { engine, recognizer } = setup();
    engine.start('es');
    engine.start('en');
    expect(recognizer.stop).toHaveBeenCalledTimes(1);
  });

  it('con traductor, cada frase final se traduce en orden aunque las respuestas lleguen desordenadas (CAM-TSK-0117)', async () => {
    const { engine, final, interim } = setup({ maxLines: 3 });
    const pending = new Map();
    const translator = { translate: vi.fn(text => new Promise(resolve => pending.set(text, resolve))) };
    engine.start('es', { translator });
    final('hola');
    final('adiós');
    await Promise.resolve();
    expect(translator.translate.mock.calls.map(([text]) => text)).toEqual(['hola']); // de una en una
    pending.get('hola')('hello');
    await vi.waitFor(() => expect(translator.translate).toHaveBeenCalledTimes(2));
    pending.get('adiós')('bye');
    await vi.waitFor(() => expect(engine.snapshot().lines.map(line => line.translation)).toEqual(['hello', 'bye']));
  });

  it('mientras se habla traduce lo provisional, solo la última versión y sin pisar la final (CAM-TSK-0159)', async () => {
    const { engine, final, interim } = setup();
    const pending = new Map();
    const translator = { translate: vi.fn(text => new Promise(resolve => pending.set(text, resolve))) };
    engine.start('es', { translator });
    interim('hola');
    interim('hola a');
    interim('hola a todos');
    expect(translator.translate.mock.calls.map(([text]) => text)).toEqual(['hola']);
    pending.get('hola')('hello');
    await vi.waitFor(() => expect(translator.translate.mock.calls.map(([text]) => text)).toEqual(['hola', 'hola a todos']));
    expect(engine.snapshot().lines[0]).toMatchObject({ text: 'hola a todos', final: false, translation: 'hello' });
    final('hola a todos');
    await vi.waitFor(() => expect(translator.translate).toHaveBeenCalledTimes(3));
    pending.get('hola a todos')('hello everyone');
    await vi.waitFor(() => expect(engine.snapshot().lines[0]).toMatchObject({ final: true, translation: 'hello everyone' }));
  });

  it('una traducción provisional tardía no pisa la de la frase final', async () => {
    const { engine, final, interim } = setup();
    let lateInterim;
    const translator = { translate: vi.fn(text => (text === 'hol' ? new Promise(r => { lateInterim = r; }) : Promise.resolve('hello'))) };
    engine.start('es', { translator });
    interim('hol');
    final('hola');
    await vi.waitFor(() => expect(engine.snapshot().lines[0].translation).toBe('hello'));
    lateInterim('hol-en');
    await new Promise(r => setTimeout(r, 0));
    expect(engine.snapshot().lines[0].translation).toBe('hello');
  });

  it('una traducción provisional colgada no bloquea la sesión siguiente', async () => {
    const { engine, interim } = setup();
    engine.start('es', { translator: { translate: () => new Promise(() => {}) } });
    interim('hola');
    engine.stop();
    engine.start('es', { translator: { translate: async text => `[en] ${text}` } });
    interim('adiós');
    await vi.waitFor(() => expect(engine.snapshot().lines[0].translation).toBe('[en] adiós'));
  });

  it('al parar, las traducciones pendientes se descartan', async () => {
    const { engine, final } = setup();
    let resolve;
    engine.start('es', { translator: { translate: () => new Promise(r => { resolve = r; }) } });
    final('hola');
    await Promise.resolve();
    engine.stop();
    engine.start('es');
    final('otra');
    resolve('hello');
    await new Promise(r => setTimeout(r, 0));
    expect(engine.snapshot().lines.map(line => line.translation ?? null)).toEqual([null]);
  });

  it('una traducción colgada de una sesión parada no bloquea la siguiente', async () => {
    const { engine, final } = setup();
    engine.start('es', { translator: { translate: () => new Promise(() => {}) } });
    final('hola');
    engine.stop();
    engine.start('es', { translator: { translate: async text => `[en] ${text}` } });
    final('adiós');
    await vi.waitFor(() => expect(engine.snapshot().lines[0].translation).toBe('[en] adiós'));
  });

  it('si una traducción falla, se avisa y la frase queda sin traducir', async () => {
    const { engine, final } = setup();
    engine.start('es', { translator: { translate: async () => { throw new Error('modelo caído'); } } });
    final('hola');
    await vi.waitFor(() => expect(engine.snapshot().translationError).toBe('modelo caído'));
    expect(engine.snapshot().lines[0]).toMatchObject({ text: 'hola', translation: null });
  });

  it('si el reconocedor no puede crearse, queda en error y no escucha', () => {
    const { engine, createRecognizer } = setup();
    createRecognizer.mockImplementationOnce(() => { throw new Error('sin API'); });
    engine.start('es');
    expect(engine.snapshot()).toMatchObject({ status: 'error', error: 'unsupported' });
  });
});
