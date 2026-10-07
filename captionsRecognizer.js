/**
 * Reconocimiento de voz en el propio ordenador (CAM-TSK-0114).
 *
 * SpeechRecognition con processLocally: la voz no sale del equipo y nunca se usa la
 * nube. Si Chrome corta el reconocimiento, se reinicia como mucho 5 veces por minuto.
 */

export const SPEECH_TAGS = Object.freeze({ es: 'es-ES', en: 'en-US' });
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000;
const HARMLESS_ERRORS = new Set(['no-speech', 'aborted']); // silencio o parada propia

const defaultRecognition = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
const optionsFor = lang => ({ langs: [SPEECH_TAGS[lang]], processLocally: true });

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'. */
export async function recognizerSupport(lang, { Recognition = defaultRecognition() } = {}) {
  if (typeof Recognition?.available !== 'function') return 'unsupported';
  return Recognition.available(optionsFor(lang));
}

/** Descarga el paquete de idioma para reconocer en el dispositivo. */
export async function installLanguage(lang, { Recognition = defaultRecognition() } = {}) {
  const installed = await Recognition.install(optionsFor(lang));
  if (!installed) throw new Error(`no se pudo instalar el idioma ${lang} para reconocer en el dispositivo`);
}

const recognizerError = (code, message) => Object.assign(new Error(message), { code });

export function createRecognizer({
  lang,
  Recognition = defaultRecognition(),
  onInterim,
  onFinal,
  onError,
  now = () => Date.now(),
}) {
  // Sin available() el navegador no sabe reconocer en el dispositivo: ignoraría
  // processLocally y mandaría la voz a la nube. Entonces no se arranca.
  if (typeof Recognition?.available !== 'function') throw new Error('este navegador no tiene reconocimiento de voz en el dispositivo');
  const recognition = new Recognition();
  Object.assign(recognition, { lang: SPEECH_TAGS[lang], continuous: true, interimResults: true, processLocally: true });
  let active = false;
  let restarts = [];
  const halt = error => { active = false; onError(error); };

  recognition.onresult = event => {
    let interim = '';
    for (const result of Array.from(event.results).slice(event.resultIndex)) {
      const text = result[0].transcript.trim();
      if (result.isFinal) onFinal(text);
      else interim = `${interim} ${text}`.trim();
    }
    if (interim) onInterim(interim);
  };

  recognition.onerror = event => {
    if (!HARMLESS_ERRORS.has(event.error)) halt(recognizerError(event.error, `reconocimiento de voz: ${event.error}`));
  };

  recognition.onend = () => {
    if (!active) return;
    const time = now();
    restarts = restarts.filter(at => time - at < RESTART_WINDOW_MS);
    if (restarts.length >= MAX_RESTARTS) {
      halt(recognizerError('restart-limit', 'el reconocimiento de voz se corta una y otra vez'));
      return;
    }
    restarts.push(time);
    recognition.start();
  };

  return {
    start() {
      active = true;
      restarts = [];
      recognition.start();
    },
    stop() {
      active = false;
      recognition.stop();
    },
  };
}
