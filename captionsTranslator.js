/**
 * Traducción de los subtítulos con el traductor integrado de Chrome
 * (CAM-TSK-0115): todo en el dispositivo, sin servicios de pago. La primera vez
 * se descarga el paquete del par de idiomas y se informa del progreso; luego
 * traduce sin conexión. Sin la API, los subtítulos siguen sin traducir.
 */

const defaultTranslator = () => globalThis.Translator;

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'. */
export async function translatorSupport(from, to, { Translator = defaultTranslator() } = {}) {
  if (typeof Translator?.availability !== 'function') return 'unsupported';
  return Translator.availability({ sourceLanguage: from, targetLanguage: to });
}

/**
 * Traductor listo para usar; `onProgress(0..1)` mientras se descarga el paquete.
 * Si hay que descargar, Chrome exige que se llame tras un gesto del usuario.
 */
export async function createCaptionTranslator(from, to, { Translator = defaultTranslator(), onProgress = () => {} } = {}) {
  const support = await translatorSupport(from, to, { Translator });
  if (support === 'unsupported') throw new Error('este navegador no tiene traductor integrado');
  if (support === 'unavailable') throw new Error(`el traductor integrado no traduce ${from}→${to}`);
  const model = await Translator.create({
    sourceLanguage: from,
    targetLanguage: to,
    monitor: monitor => monitor.addEventListener('downloadprogress', event => onProgress(event.loaded)),
  });
  return {
    async translate(text) {
      const phrase = text.trim();
      return phrase ? model.translate(phrase) : '';
    },
    destroy: () => model.destroy(),
  };
}
