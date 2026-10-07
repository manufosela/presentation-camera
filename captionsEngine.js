/**
 * Motor de subtítulos (CAM-TSK-0116): convierte las frases del reconocedor en
 * las últimas líneas que se muestran. La frase provisional ocupa la última
 * línea y la final la sustituye, para que el texto no salte. Estados:
 * 'stopped', 'listening' y 'error' (con el código del reconocedor). Cada
 * cambio se avisa con una instantánea inmutable que pintan overlay y panel.
 *
 * Con traductor (CAM-TSK-0117), cada frase final se traduce en cola, de una en
 * una y en orden; al parar, lo pendiente se descarta. Un fallo se avisa en
 * translationError y la frase queda sin traducir.
 */

export function createCaptionsEngine({ createRecognizer, maxLines = 2, onChange = () => {} }) {
  let status = 'stopped';
  let error = null;
  let lines = [];
  let recognizer = null;
  let session = 0; // lo que llegue de una sesión ya parada se ignora
  let nextId = 1;
  let translator = null;
  let translationError = null;
  let queue = Promise.resolve();

  const snapshot = () => Object.freeze({
    status, error, translationError, lines: Object.freeze(lines.map(line => Object.freeze({ ...line }))),
  });
  const changed = () => onChange(snapshot());

  const setTranslation = (id, translation) => {
    lines = lines.map(line => (line.id === id ? { ...line, translation } : line));
  };

  async function translateLine(current, id, text) {
    if (current !== session) return; // sesión parada: se descarta
    try {
      const translation = await translator.translate(text);
      if (current === session) setTranslation(id, translation);
    } catch (error_) {
      if (current === session) translationError = error_.message;
    }
    if (current === session) changed();
  }

  function translate(id, text) {
    const current = session;
    queue = queue.then(() => translateLine(current, id, text));
  }

  function put(text, final) {
    const last = lines.at(-1);
    let id = nextId;
    if (last && !last.final) {
      id = last.id;
      lines = [...lines.slice(0, -1), { ...last, text, final }];
    } else {
      lines = [...lines, { id: nextId++, text, final, translation: null }];
    }
    lines = lines.slice(-maxLines);
    changed();
    if (final && translator) translate(id, text);
  }

  function fail(code) {
    status = 'error';
    error = code;
    recognizer = null;
    changed();
  }

  return {
    snapshot,
    /** `translator` (captionsTranslator) traduce las frases finales; sin él, solo se transcribe. */
    start(lang, { translator: lineTranslator = null } = {}) {
      recognizer?.stop(); // arrancar de nuevo (p. ej. otro idioma) no deja el anterior encendido
      session += 1;
      translator = lineTranslator;
      translationError = null;
      queue = Promise.resolve(); // cola propia: lo colgado de otra sesión no la bloquea
      const current = session;
      const live = handler => (...args) => { if (current === session && status === 'listening') handler(...args); };
      lines = [];
      error = null;
      status = 'listening';
      try {
        recognizer = createRecognizer({
          lang,
          onInterim: live(text => put(text, false)),
          onFinal: live(text => put(text, true)),
          onError: live(failure => fail(failure.code ?? 'unknown')),
        });
        recognizer.start();
      } catch {
        fail('unsupported'); // el navegador no puede reconocer en el dispositivo
        return;
      }
      changed();
    },
    stop() {
      session += 1;
      recognizer?.stop();
      recognizer = null;
      status = 'stopped';
      error = null;
      translationError = null;
      translator = null;
      lines = [];
      changed();
    },
  };
}
