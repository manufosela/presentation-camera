import { describe, expect, it, vi } from 'vitest';
import { createRecognizer, installLanguage, recognizerSupport } from './captionsRecognizer.js';

// SpeechRecognition falso: guarda la última instancia para emitir eventos.
function fakeRecognition({ availability = 'available', installs = true } = {}) {
  const created = [];
  class Recognition {
    static available = vi.fn(async () => availability);
    static install = vi.fn(async () => installs);
    constructor() { this.starts = 0; this.stopped = false; created.push(this); }
    start() { this.starts += 1; }
    stop() { this.stopped = true; }
    emit(type, event = {}) { this[`on${type}`]?.(event); }
  }
  return { Recognition, last: () => created.at(-1) };
}

// Evento result como el de Chrome: lista de resultados con isFinal y transcript.
const results = (resultIndex, ...items) => ({
  resultIndex,
  results: items.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
});

describe('recognizerSupport — solo en el dispositivo (CAM-TSK-0114)', () => {
  it('pregunta por el idioma con processLocally y devuelve su estado', async () => {
    const { Recognition } = fakeRecognition({ availability: 'downloadable' });
    expect(await recognizerSupport('es', { Recognition })).toBe('downloadable');
    expect(Recognition.available).toHaveBeenCalledWith({ langs: ['es-ES'], processLocally: true });
  });

  it('sin la API, o sin modo en el dispositivo, no está soportado (nunca la nube); sin API no arranca', async () => {
    expect(() => createRecognizer({ lang: 'es', Recognition: undefined })).toThrow(/reconocimiento/);
    expect(() => createRecognizer({ lang: 'es', Recognition: class {} })).toThrow(/dispositivo/); // ignoraría processLocally
    expect(await recognizerSupport('en', { Recognition: undefined })).toBe('unsupported');
    expect(await recognizerSupport('en', { Recognition: class {} })).toBe('unsupported');
  });

  it('instalar el idioma descarga su paquete; si no se puede, es un error', async () => {
    const ok = fakeRecognition();
    await installLanguage('en', { Recognition: ok.Recognition });
    expect(ok.Recognition.install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
    await expect(installLanguage('en', fakeRecognition({ installs: false }))).rejects.toThrow(/idioma/);
  });
});

function setup(options = {}) {
  const fake = fakeRecognition();
  const calls = { interim: [], final: [], errors: [] };
  let time = 0;
  const recognizer = createRecognizer({
    lang: 'es',
    Recognition: fake.Recognition,
    now: () => time,
    onInterim: text => calls.interim.push(text),
    onFinal: text => calls.final.push(text),
    onError: error => calls.errors.push(error.code),
    ...options,
  });
  return { recognizer, calls, rec: fake.last, at: ms => { time = ms; } };
}

describe('createRecognizer — frases provisionales y finales', () => {
  it('configura el reconocimiento continuo, provisional y en el dispositivo', () => {
    const { recognizer, rec } = setup();
    recognizer.start();
    expect(rec()).toMatchObject({ lang: 'es-ES', continuous: true, interimResults: true, processLocally: true, starts: 1 });
  });

  it('entrega lo provisional y lo final, sin espacios sobrantes', () => {
    const { recognizer, rec, calls } = setup();
    recognizer.start();
    rec().emit('result', results(0, ['hola ', false]));
    rec().emit('result', results(0, [' hola a todos', true], ['y bienvenidos', false]));
    expect(calls.interim).toEqual(['hola', 'y bienvenidos']);
    expect(calls.final).toEqual(['hola a todos']);
  });

  it('si el navegador corta el reconocimiento, se reinicia; al pararlo yo, no', () => {
    const { recognizer, rec } = setup();
    recognizer.start();
    rec().emit('end');
    expect(rec().starts).toBe(2);
    recognizer.stop();
    expect(rec().stopped).toBe(true);
    rec().emit('end');
    expect(rec().starts).toBe(2);
  });

  it('el reinicio está acotado: más de 5 cortes en un minuto para y avisa', () => {
    const { recognizer, rec, calls, at } = setup();
    recognizer.start();
    for (let i = 1; i <= 5; i += 1) { at(i * 1000); rec().emit('end'); }
    expect(calls.errors).toEqual([]);
    at(6000);
    rec().emit('end');
    expect(calls.errors).toEqual(['restart-limit']);
    expect(rec().starts).toBe(6);
    at(120_000); // pasado el minuto vuelve a poder reiniciarse si se arranca de nuevo
    recognizer.start();
    rec().emit('end');
    expect(rec().starts).toBe(8);
  });

  it('silencio o cancelación no son errores; sin permiso o sin idioma sí, y para', () => {
    const { recognizer, rec, calls } = setup();
    recognizer.start();
    rec().emit('error', { error: 'no-speech' });
    rec().emit('error', { error: 'aborted' });
    expect(calls.errors).toEqual([]);
    rec().emit('error', { error: 'not-allowed' });
    expect(calls.errors).toEqual(['not-allowed']);
    rec().emit('end');
    expect(rec().starts).toBe(1); // tras un error de verdad no se reinicia
  });
});
