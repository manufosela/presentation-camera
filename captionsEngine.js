/**
 * Motor de subtítulos (CAM-TSK-0116): convierte las frases del reconocedor en
 * las últimas líneas que se muestran. La frase provisional ocupa la última
 * línea y la final la sustituye, para que el texto no salte. Estados:
 * 'stopped', 'listening' y 'error' (con el código del reconocedor). Cada
 * cambio se avisa con una instantánea inmutable que pintan overlay y panel.
 */

export function createCaptionsEngine({ createRecognizer, maxLines = 2, onChange = () => {} }) {
  let status = 'stopped';
  let error = null;
  let lines = [];
  let recognizer = null;
  let session = 0; // lo que llegue de una sesión ya parada se ignora
  let nextId = 1;

  const snapshot = () => Object.freeze({ status, error, lines: Object.freeze(lines.map(line => Object.freeze({ ...line }))) });
  const changed = () => onChange(snapshot());

  function put(text, final) {
    const last = lines.at(-1);
    if (last && !last.final) lines = [...lines.slice(0, -1), { ...last, text, final }];
    else lines = [...lines, { id: nextId++, text, final }];
    lines = lines.slice(-maxLines);
    changed();
  }

  function fail(code) {
    status = 'error';
    error = code;
    recognizer = null;
    changed();
  }

  return {
    snapshot,
    start(lang) {
      recognizer?.stop(); // arrancar de nuevo (p. ej. otro idioma) no deja el anterior encendido
      session += 1;
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
      lines = [];
      changed();
    },
  };
}
