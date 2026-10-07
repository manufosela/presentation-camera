/**
 * Subtítulos mientras se presenta (CAM-TSK-0121): une el motor, la capa en
 * pantalla, el traductor y el panel. Arranca en el idioma hablado y, si se
 * pidió traducir y el traductor está listo, traduce; si no lo está (hay que
 * descargarlo desde el setup), subtitula sin traducir y lo avisa. Cada
 * instantánea se pinta y las frases finales van al panel una vez por cambio.
 */

import { captionsMessage, CAPTIONS_CLEAR } from './captionsPanel.js';

export function createCaptionsSession({ createEngine, createTranslator, render, publish, onError }) {
  let on = false;
  let translator = null;
  let lastError = null;
  const published = new Map(); // id → última versión enviada al panel

  const engine = createEngine(snapshot => {
    render(snapshot, { translated: translator !== null });
    if (snapshot.status === 'error' && snapshot.error !== lastError) onError(snapshot.error);
    lastError = snapshot.error;
    for (const line of snapshot.lines.filter(item => item.final)) {
      const version = `${line.text}\u0000${line.translation ?? ''}`;
      if (published.get(line.id) === version) continue;
      published.set(line.id, version);
      publish(captionsMessage(line));
    }
  });

  let turn = 0; // un start/stop posterior invalida el arranque que aún prepara el traductor

  async function start({ spoken, translateTo }) {
    stop();
    on = true;
    const mine = ++turn;
    let ready = null;
    if (translateTo) {
      try {
        ready = await createTranslator(spoken, translateTo);
      } catch {
        if (mine === turn) onError('translator-unavailable');
      }
    }
    if (mine !== turn) { // se paró o se volvió a arrancar mientras tanto
      ready?.destroy();
      return;
    }
    translator = ready;
    engine.start(spoken, { translator });
  }

  function stop() {
    turn += 1;
    if (!on) return;
    on = false;
    engine.stop();
    translator?.destroy();
    translator = null;
    lastError = null;
    published.clear();
    publish({ type: CAPTIONS_CLEAR });
  }

  return {
    start,
    stop,
    isOn: () => on,
    toggle: prefs => (on ? stop() : start(prefs)),
  };
}
