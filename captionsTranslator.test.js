import { describe, expect, it, vi } from 'vitest';
import { createCaptionTranslator, translatorSupport } from './captionsTranslator.js';

// Translator falso: create() avisa del progreso de descarga por el monitor.
function fakeTranslator({ availability = 'available', progress = [] } = {}) {
  return {
    availability: vi.fn(async () => availability),
    create: vi.fn(async ({ monitor }) => {
      const listeners = [];
      monitor?.({ addEventListener: (type, listener) => type === 'downloadprogress' && listeners.push(listener) });
      for (const loaded of progress) listeners.forEach(listener => listener({ loaded }));
      return { translate: vi.fn(async text => `[en] ${text}`), destroy: vi.fn() };
    }),
  };
}

describe('translatorSupport — traductor integrado (CAM-TSK-0115)', () => {
  it('pregunta por el par de idiomas y devuelve su estado', async () => {
    const Translator = fakeTranslator({ availability: 'downloadable' });
    expect(await translatorSupport('es', 'en', { Translator })).toBe('downloadable');
    expect(Translator.availability).toHaveBeenCalledWith({ sourceLanguage: 'es', targetLanguage: 'en' });
  });

  it('sin la API no está soportado', async () => {
    expect(await translatorSupport('es', 'en', { Translator: undefined })).toBe('unsupported');
  });
});

describe('createCaptionTranslator', () => {
  it('avisa del progreso de la descarga (0..1) y después traduce', async () => {
    const Translator = fakeTranslator({ progress: [0, 0.5, 1] });
    const onProgress = vi.fn();
    const translator = await createCaptionTranslator('es', 'en', { Translator, onProgress });
    expect(Translator.create).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: 'es', targetLanguage: 'en' }));
    expect(onProgress.mock.calls.map(([loaded]) => loaded)).toEqual([0, 0.5, 1]);
    expect(await translator.translate('hola')).toBe('[en] hola');
  });

  it('una frase vacía no se traduce', async () => {
    const translator = await createCaptionTranslator('es', 'en', { Translator: fakeTranslator() });
    expect(await translator.translate('  ')).toBe('');
  });

  it('al soltarlo libera el modelo', async () => {
    const Translator = fakeTranslator();
    const translator = await createCaptionTranslator('es', 'en', { Translator });
    const model = await Translator.create.mock.results[0].value;
    translator.destroy();
    expect(model.destroy).toHaveBeenCalled();
  });

  it('sin la API o con un par no disponible es un error claro', async () => {
    await expect(createCaptionTranslator('es', 'en', { Translator: undefined })).rejects.toThrow(/traductor/);
    await expect(createCaptionTranslator('es', 'en', { Translator: fakeTranslator({ availability: 'unavailable' }) }))
      .rejects.toThrow(/es→en/);
  });
});
