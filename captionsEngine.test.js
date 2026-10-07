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
    expect(engine.snapshot()).toEqual({ status: 'stopped', error: null, lines: [] });
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
    expect(engine.snapshot()).toEqual({ status: 'stopped', error: null, lines: [] });
    final('tarde');
    expect(engine.snapshot().lines).toEqual([]);
  });

  it('arrancar de nuevo para el reconocedor anterior', () => {
    const { engine, recognizer } = setup();
    engine.start('es');
    engine.start('en');
    expect(recognizer.stop).toHaveBeenCalledTimes(1);
  });

  it('si el reconocedor no puede crearse, queda en error y no escucha', () => {
    const { engine, createRecognizer } = setup();
    createRecognizer.mockImplementationOnce(() => { throw new Error('sin API'); });
    engine.start('es');
    expect(engine.snapshot()).toMatchObject({ status: 'error', error: 'unsupported' });
  });
});
